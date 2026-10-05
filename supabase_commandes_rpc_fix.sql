-- ============================================================
-- SCHUTZ APP — FIX COMMANDES CLIENT / AVIS / HISTORIQUE
-- À copier-coller dans Supabase SQL Editor
-- ============================================================

-- Commandes du client connecté
DROP FUNCTION IF EXISTS public.get_my_shop_orders();
CREATE OR REPLACE FUNCTION public.get_my_shop_orders()
RETURNS SETOF public.shop_orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.*
  FROM public.shop_orders o
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_shop_orders() TO authenticated;

-- Historique d'une commande appartenant au client
DROP FUNCTION IF EXISTS public.get_my_order_history(uuid);
CREATE OR REPLACE FUNCTION public.get_my_order_history(p_order_id uuid)
RETURNS TABLE(status text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.status, h.created_at
  FROM public.shop_order_history h
  JOIN public.shop_orders o ON o.id = h.order_id
  WHERE h.order_id = p_order_id
    AND o.user_id = auth.uid()
  ORDER BY h.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_order_history(uuid) TO authenticated;

-- Avis d'une commande appartenant au client
DROP FUNCTION IF EXISTS public.get_my_order_review(uuid);
CREATE OR REPLACE FUNCTION public.get_my_order_review(p_order_id uuid)
RETURNS TABLE(rating integer, comment text, pseudo text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rating, r.comment, r.pseudo, r.created_at
  FROM public.shop_order_reviews r
  JOIN public.shop_orders o ON o.id = r.order_id
  WHERE r.order_id = p_order_id
    AND o.user_id = auth.uid()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_order_review(uuid) TO authenticated;

-- Tous les avis publiés
DROP FUNCTION IF EXISTS public.get_public_shop_reviews();
CREATE OR REPLACE FUNCTION public.get_public_shop_reviews()
RETURNS TABLE(rating integer, comment text, pseudo text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rating, r.comment, r.pseudo, r.created_at
  FROM public.shop_order_reviews r
  ORDER BY r.created_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_shop_reviews() TO anon, authenticated;

-- Création / modification d'un avis, uniquement sur une commande livrée du client
DROP FUNCTION IF EXISTS public.submit_my_order_review(uuid,integer,text);
CREATE OR REPLACE FUNCTION public.submit_my_order_review(
  p_order_id uuid,
  p_rating integer,
  p_comment text
)
RETURNS public.shop_order_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.shop_orders;
  v_review public.shop_order_reviews;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Note invalide';
  END IF;

  SELECT * INTO v_order
  FROM public.shop_orders
  WHERE id = p_order_id
    AND user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable ou non autorisée';
  END IF;

  IF v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'La commande doit être livrée avant de pouvoir être notée';
  END IF;

  INSERT INTO public.shop_order_reviews(order_id,user_id,pseudo,rating,comment,updated_at)
  VALUES (
    p_order_id,
    v_user,
    COALESCE(NULLIF(left(btrim((SELECT pseudo FROM public.player_data WHERE user_id=v_user)),32),''),'Client'),
    p_rating,
    COALESCE(p_comment,''),
    now()
  )
  ON CONFLICT (order_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    pseudo = EXCLUDED.pseudo,
    updated_at = now()
  RETURNING * INTO v_review;

  RETURN v_review;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_my_order_review(uuid,integer,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
