-- ============================================================
-- SCHUTZ APP V27 — REVISION CIBLEE / COURS PARTAGES / BOUTIQUE
-- / IMAGES + DESSINS SUR CARTES / QR STABLE
-- À exécuter une fois dans Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) Produits de boutique gérés par l'admin
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
ON public.shop_products
FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "shop_products_admin_insert"
ON public.shop_products
FOR INSERT
TO authenticated
WITH CHECK (public.is_shop_admin());

CREATE POLICY "shop_products_admin_update"
ON public.shop_products
FOR UPDATE
TO authenticated
USING (public.is_shop_admin())
WITH CHECK (public.is_shop_admin());

CREATE POLICY "shop_products_admin_delete"
ON public.shop_products
FOR DELETE
TO authenticated
USING (public.is_shop_admin());

INSERT INTO public.shop_products(id,name,description,price,emoji,active)
VALUES
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
ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS public.admin_list_shop_products();
CREATE OR REPLACE FUNCTION public.admin_list_shop_products()
RETURNS SETOF public.shop_products
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.shop_products
  WHERE public.is_shop_admin()
  ORDER BY created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_shop_products() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_add_shop_product(text,text,numeric,text);
CREATE OR REPLACE FUNCTION public.admin_add_shop_product(
  p_name text,
  p_description text,
  p_price numeric,
  p_emoji text
)
RETURNS public.shop_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.shop_products;
BEGIN
  IF NOT public.is_shop_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF NULLIF(btrim(p_name),'') IS NULL THEN
    RAISE EXCEPTION 'Nom du produit obligatoire';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Prix invalide';
  END IF;

  INSERT INTO public.shop_products(id,name,description,price,emoji,active)
  VALUES (
    'custom-' || substr(md5(gen_random_uuid()::text),1,18),
    left(btrim(p_name),120),
    left(COALESCE(p_description,''),300),
    round(p_price::numeric,2),
    left(COALESCE(NULLIF(btrim(p_emoji),''),'🛍️'),8),
    true
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_shop_product(text,text,numeric,text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_shop_product(text,text,text,numeric,text,boolean);
CREATE OR REPLACE FUNCTION public.admin_update_shop_product(
  p_id text,
  p_name text,
  p_description text,
  p_price numeric,
  p_emoji text,
  p_active boolean
)
RETURNS public.shop_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.shop_products;
BEGIN
  IF NOT public.is_shop_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  UPDATE public.shop_products
  SET
    name = left(btrim(p_name),120),
    description = left(COALESCE(p_description,''),300),
    price = round(p_price::numeric,2),
    emoji = left(COALESCE(NULLIF(btrim(p_emoji),''),'🛍️'),8),
    active = COALESCE(p_active,true),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_shop_product(text,text,text,numeric,text,boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_delete_shop_product(text);
CREATE OR REPLACE FUNCTION public.admin_delete_shop_product(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_shop_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  UPDATE public.shop_products
  SET active = false, updated_at = now()
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_shop_product(text) TO authenticated;

-- ------------------------------------------------------------
-- 2) Partage d'un cours complet (cours + chapitres + cartes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_shares (
  code text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_shares_owner_select" ON public.course_shares;
DROP POLICY IF EXISTS "course_shares_owner_insert" ON public.course_shares;
DROP POLICY IF EXISTS "course_shares_owner_delete" ON public.course_shares;

CREATE POLICY "course_shares_owner_select"
ON public.course_shares
FOR SELECT TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "course_shares_owner_insert"
ON public.course_shares
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "course_shares_owner_delete"
ON public.course_shares
FOR DELETE TO authenticated
USING (owner_id = auth.uid());

DROP FUNCTION IF EXISTS public.create_course_share(text,jsonb);
CREATE OR REPLACE FUNCTION public.create_course_share(
  p_name text,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text;
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Cours invalide';
  END IF;
  IF jsonb_typeof(COALESCE(p_payload->'decks','null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Chapitres invalides';
  END IF;

  SELECT COALESCE(SUM(jsonb_array_length(value->'cards')),0)::integer
  INTO v_count
  FROM jsonb_array_elements(p_payload->'decks') AS value;

  IF v_count > 10000 THEN
    RAISE EXCEPTION 'Cours trop volumineux';
  END IF;

  LOOP
    v_code := upper(substr(md5(gen_random_uuid()::text),1,8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.course_shares WHERE code = v_code
    );
  END LOOP;

  INSERT INTO public.course_shares(code,owner_id,course_name,payload)
  VALUES(
    v_code,
    auth.uid(),
    left(COALESCE(NULLIF(btrim(p_name),''),'Cours partagé'),120),
    p_payload
  );

  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_course_share(text,jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_course_share(text);
CREATE OR REPLACE FUNCTION public.get_course_share(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_payload jsonb;
BEGIN
  SELECT payload INTO v_payload
  FROM public.course_shares
  WHERE code = upper(trim(p_code));

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Lien de cours introuvable';
  END IF;
  RETURN v_payload;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_share(text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) Stockage des images / dessins de cartes
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'card-media',
  'card-media',
  true,
  8388608,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'];

DROP POLICY IF EXISTS "card_media_select_public" ON storage.objects;
DROP POLICY IF EXISTS "card_media_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "card_media_update_own" ON storage.objects;
DROP POLICY IF EXISTS "card_media_delete_own" ON storage.objects;

CREATE POLICY "card_media_select_public"
ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'card-media');

CREATE POLICY "card_media_insert_own"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "card_media_update_own"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "card_media_delete_own"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'card-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ------------------------------------------------------------
-- 4) Rafraîchir le schéma PostgREST
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIN V27
-- ============================================================
