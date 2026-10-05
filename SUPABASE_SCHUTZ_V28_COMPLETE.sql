-- ============================================================
-- SCHUTZ-APP V28 — COMMANDES STABLES + SUIVI CLIENT + ADMIN
-- + fidélité / avis / historique / produits
--
-- À copier-coller EN ENTIER dans Supabase > SQL Editor.
-- Ce script conserve les données existantes et migre les anciens
-- statuts pending / repair / validated vers le nouveau workflow.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Colonnes nécessaires à l'envoi des emails de commande
-- ------------------------------------------------------------
ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS status_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_email_sent_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Anciens statuts -> nouveaux statuts
UPDATE public.shop_orders SET status='awaiting_payment' WHERE status='pending';
UPDATE public.shop_orders SET status='preparing' WHERE status='repair';
UPDATE public.shop_orders SET status='delivered' WHERE status='validated';

-- Remplace les anciennes contraintes de statut qui bloquent awaiting_payment.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid='public.shop_orders'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.shop_orders DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.shop_orders
  ADD CONSTRAINT shop_orders_status_v28_check
  CHECK (status IN ('awaiting_payment','paid','preparing','shipped','delivered','cancelled'));

CREATE INDEX IF NOT EXISTS shop_orders_user_created_idx
  ON public.shop_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_status_idx
  ON public.shop_orders(status);

-- ------------------------------------------------------------
-- 1) Rôles boutique — compatible avec la table existante
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','moderator','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;
CREATE POLICY "user_roles_self_select"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- SECURITY DEFINER : aucune lecture directe de user_roles n'est nécessaire
-- pour les opérations administratives.
CREATE OR REPLACE FUNCTION public.is_shop_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_shop_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_staff() TO authenticated;

-- ------------------------------------------------------------
-- 2) Produits boutique
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_products (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  emoji text NOT NULL DEFAULT '🛍️',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_products_public_select" ON public.shop_products;
DROP POLICY IF EXISTS "shop_products_admin_insert" ON public.shop_products;
DROP POLICY IF EXISTS "shop_products_admin_update" ON public.shop_products;
DROP POLICY IF EXISTS "shop_products_admin_delete" ON public.shop_products;

CREATE POLICY "shop_products_public_select"
ON public.shop_products FOR SELECT TO anon, authenticated
USING (active = true);
CREATE POLICY "shop_products_admin_insert"
ON public.shop_products FOR INSERT TO authenticated
WITH CHECK (public.is_shop_admin());
CREATE POLICY "shop_products_admin_update"
ON public.shop_products FOR UPDATE TO authenticated
USING (public.is_shop_admin()) WITH CHECK (public.is_shop_admin());
CREATE POLICY "shop_products_admin_delete"
ON public.shop_products FOR DELETE TO authenticated
USING (public.is_shop_admin());

INSERT INTO public.shop_products(id,name,description,price,emoji,active) VALUES
('tea-turkish','Thé turc','Thé turc',0.20,'🫖',true),
('tea-mint','Thé à la menthe','Thé parfumé à la menthe',0.20,'🌿',true),
('tea-green','Thé vert','Thé vert',0.20,'🍃',true),
('tea-black','Thé noir','Thé noir',0.20,'🫖',true),
('tea-apple','Thé à la pomme','Thé parfumé à la pomme',0.20,'🍎',true),
('tea-lemon','Thé au citron','Thé parfumé au citron',0.20,'🍋',true),
('tea-peach','Thé à la pêche','Thé parfumé à la pêche',0.20,'🍑',true),
('tea-berry','Thé fruits rouges','Thé parfumé aux fruits rouges',0.20,'🫐',true),
('tea-rose','Thé à la rose','Thé parfumé à la rose',0.20,'🌹',true),
('tea-chai','Thé chai','Thé épicé',0.20,'☕',true),
('coffee','Café','Café à l’unité',0.50,'☕',true)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  price=EXCLUDED.price,
  emoji=EXCLUDED.emoji,
  active=EXCLUDED.active,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.admin_list_shop_products()
RETURNS SETOF public.shop_products
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.shop_products
  WHERE public.is_shop_admin()
  ORDER BY created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_shop_products() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_shop_product(p_name text,p_description text,p_price numeric,p_emoji text)
RETURNS public.shop_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.shop_products;
BEGIN
  IF NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès réservé aux administrateurs'; END IF;
  IF NULLIF(btrim(p_name),'') IS NULL OR p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'Nom et prix invalides'; END IF;
  INSERT INTO public.shop_products(id,name,description,price,emoji,active)
  VALUES('custom-'||substr(md5(gen_random_uuid()::text),1,18),left(btrim(p_name),120),left(coalesce(p_description,''),300),round(p_price,2),left(coalesce(nullif(btrim(p_emoji),''),'🛍️'),8),true)
  RETURNING * INTO v;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_add_shop_product(text,text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_shop_product(p_id text,p_name text,p_description text,p_price numeric,p_emoji text,p_active boolean)
RETURNS public.shop_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.shop_products;
BEGIN
  IF NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès réservé aux administrateurs'; END IF;
  UPDATE public.shop_products SET name=left(btrim(p_name),120),description=left(coalesce(p_description,''),300),price=round(p_price,2),emoji=left(coalesce(nullif(btrim(p_emoji),''),'🛍️'),8),active=coalesce(p_active,true),updated_at=now() WHERE id=p_id RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_update_shop_product(text,text,text,numeric,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_shop_product(p_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_shop_admin() THEN RAISE EXCEPTION 'Accès réservé aux administrateurs'; END IF;
  UPDATE public.shop_products SET active=false,updated_at=now() WHERE id=p_id;
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_shop_product(text) TO authenticated;

-- ------------------------------------------------------------
-- 3) Création d'une commande via RPC sécurisée
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_shop_order(text,text,text,text,jsonb,numeric,text,text);
CREATE OR REPLACE FUNCTION public.create_shop_order(
  p_customer_name text,
  p_customer_email text,
  p_address text,
  p_city text,
  p_items jsonb,
  p_total numeric,
  p_note text DEFAULT '',
  p_pseudo text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_calc numeric := 0;
  v_item jsonb;
  v_qty numeric;
  v_unit numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Utilisateur non connecté'; END IF;
  IF NULLIF(btrim(p_customer_name),'') IS NULL OR NULLIF(btrim(p_customer_email),'') IS NULL THEN RAISE EXCEPTION 'Nom et email obligatoires'; END IF;
  IF NULLIF(btrim(p_address),'') IS NULL OR NULLIF(btrim(p_city),'') IS NULL THEN RAISE EXCEPTION 'Adresse et ville obligatoires'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Panier vide'; END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'Total invalide'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := coalesce((v_item->>'qty')::numeric,0);
    v_unit := coalesce((v_item->>'unitPrice')::numeric,0);
    IF v_qty <= 0 OR v_qty > 100 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
    IF v_unit < 0 THEN RAISE EXCEPTION 'Prix invalide'; END IF;
    v_calc := v_calc + v_qty*v_unit;
  END LOOP;

  IF abs(v_calc-p_total) > 0.011 THEN RAISE EXCEPTION 'Total de commande incohérent'; END IF;

  INSERT INTO public.shop_orders(user_id,pseudo,customer_name,customer_email,address,city,items,total,note,status,updated_at)
  VALUES(v_uid,left(coalesce(p_pseudo,''),64),left(btrim(p_customer_name),120),left(btrim(p_customer_email),254),left(btrim(p_address),300),left(btrim(p_city),120),p_items,round(p_total,2),left(coalesce(p_note,''),1000),'awaiting_payment',now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_shop_order(text,text,text,text,jsonb,numeric,text,text) TO authenticated;

-- ------------------------------------------------------------
-- 4) Historique automatique
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_order_history (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_order_history_order_id_idx ON public.shop_order_history(order_id,created_at DESC);
ALTER TABLE public.shop_order_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_order_history_select_own" ON public.shop_order_history;
DROP POLICY IF EXISTS "shop_order_history_select_staff" ON public.shop_order_history;
CREATE POLICY "shop_order_history_select_own" ON public.shop_order_history FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.shop_orders o WHERE o.id=shop_order_history.order_id AND o.user_id=auth.uid()));
CREATE POLICY "shop_order_history_select_staff" ON public.shop_order_history FOR SELECT TO authenticated USING (public.is_shop_staff());

CREATE OR REPLACE FUNCTION public.record_shop_order_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.shop_order_history(order_id,status,changed_by) VALUES(NEW.id,NEW.status,auth.uid());
  ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.shop_order_history(order_id,status,changed_by) VALUES(NEW.id,NEW.status,auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_shop_order_history ON public.shop_orders;
CREATE TRIGGER trg_shop_order_history AFTER INSERT OR UPDATE OF status ON public.shop_orders FOR EACH ROW EXECUTE FUNCTION public.record_shop_order_history();

INSERT INTO public.shop_order_history(order_id,status,changed_by,created_at)
SELECT o.id,o.status,NULL,coalesce(o.updated_at,o.created_at,now())
FROM public.shop_orders o
WHERE NOT EXISTS(SELECT 1 FROM public.shop_order_history h WHERE h.order_id=o.id);

-- ------------------------------------------------------------
-- 5) RPC client : commandes + historique
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_shop_orders();
CREATE OR REPLACE FUNCTION public.get_my_shop_orders()
RETURNS SETOF public.shop_orders LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT o.* FROM public.shop_orders o WHERE o.user_id=auth.uid() ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_shop_orders() TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_order_history(uuid);
CREATE OR REPLACE FUNCTION public.get_my_order_history(p_order_id uuid)
RETURNS TABLE(status text,created_at timestamptz) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT h.status,h.created_at FROM public.shop_order_history h JOIN public.shop_orders o ON o.id=h.order_id WHERE h.order_id=p_order_id AND o.user_id=auth.uid() ORDER BY h.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_order_history(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6) Administration des commandes
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_orders();
CREATE OR REPLACE FUNCTION public.admin_list_orders()
RETURNS SETOF public.shop_orders LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT o.* FROM public.shop_orders o WHERE public.is_shop_staff() ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_orders() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_order_status(uuid,text);
CREATE OR REPLACE FUNCTION public.admin_update_order_status(p_order_id uuid,p_status text)
RETURNS SETOF public.shop_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_shop_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
  IF p_status NOT IN ('awaiting_payment','paid','preparing','shipped','delivered','cancelled') THEN RAISE EXCEPTION 'Statut de commande invalide'; END IF;
  RETURN QUERY UPDATE public.shop_orders SET status=p_status,updated_at=now() WHERE id=p_order_id RETURNING *;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_delete_order(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_shop_staff() THEN RAISE EXCEPTION 'Accès réservé au staff'; END IF;
  DELETE FROM public.shop_orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 7) Avis clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_order_reviews (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pseudo text NOT NULL DEFAULT 'Client',
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_order_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_order_reviews_public_select" ON public.shop_order_reviews;
CREATE POLICY "shop_order_reviews_public_select" ON public.shop_order_reviews FOR SELECT TO anon,authenticated USING (true);

DROP FUNCTION IF EXISTS public.get_my_order_review(uuid);
CREATE OR REPLACE FUNCTION public.get_my_order_review(p_order_id uuid)
RETURNS TABLE(rating integer,comment text,pseudo text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT r.rating,r.comment,r.pseudo,r.created_at FROM public.shop_order_reviews r JOIN public.shop_orders o ON o.id=r.order_id WHERE r.order_id=p_order_id AND o.user_id=auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_order_review(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_public_shop_reviews();
CREATE OR REPLACE FUNCTION public.get_public_shop_reviews()
RETURNS TABLE(rating integer,comment text,pseudo text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT r.rating,r.comment,r.pseudo,r.created_at FROM public.shop_order_reviews r ORDER BY r.created_at DESC LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_shop_reviews() TO anon,authenticated;

DROP FUNCTION IF EXISTS public.submit_my_order_review(uuid,integer,text);
CREATE OR REPLACE FUNCTION public.submit_my_order_review(p_order_id uuid,p_rating integer,p_comment text)
RETURNS public.shop_order_reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_order public.shop_orders; v_review public.shop_order_reviews;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Utilisateur non connecté'; END IF;
  IF p_rating<1 OR p_rating>5 THEN RAISE EXCEPTION 'Note invalide'; END IF;
  SELECT * INTO v_order FROM public.shop_orders WHERE id=p_order_id AND user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable ou non autorisée'; END IF;
  IF v_order.status<>'delivered' THEN RAISE EXCEPTION 'La commande doit être livrée avant de pouvoir être notée'; END IF;
  INSERT INTO public.shop_order_reviews(order_id,user_id,pseudo,rating,comment,updated_at)
  VALUES(p_order_id,v_user,coalesce(nullif(left(btrim((SELECT pseudo FROM public.player_data WHERE user_id=v_user)),32),''),'Client'),p_rating,coalesce(p_comment,''),now())
  ON CONFLICT(order_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,pseudo=EXCLUDED.pseudo,updated_at=now()
  RETURNING * INTO v_review;
  RETURN v_review;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_my_order_review(uuid,integer,text) TO authenticated;

-- ------------------------------------------------------------
-- 8) Recharge du schéma API Supabase
-- ------------------------------------------------------------
NOTIFY pgrst,'reload schema';

COMMIT;

-- ============================================================
-- FIN SCHUTZ V28
-- ============================================================
