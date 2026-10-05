-- SCHUTZ-APP V29 — FIX ADMIN PANEL
-- À exécuter dans Supabase SQL Editor APRÈS les scripts V28.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_list_players();
CREATE OR REPLACE FUNCTION public.admin_list_players()
RETURNS TABLE(
  user_id uuid,
  email text,
  pseudo text,
  score integer,
  stamps integer,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(NULLIF(left(btrim(pd.pseudo),32),''),'Sans pseudo'),
    COALESCE((pd.data->>'score')::integer,0),
    COALESCE(NULLIF(pd.data->>'loyaltyStamps','')::integer,
             NULLIF(pd.data->>'stamps','')::integer,0),
    COALESCE(NULLIF(pd.data->>'avatarUrl',''),'')
  FROM auth.users u
  LEFT JOIN public.player_data pd ON pd.user_id=u.id
  WHERE public.is_shop_staff()
  ORDER BY COALESCE(NULLIF(pd.pseudo,''),u.email::text);
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_players() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_player(uuid,text,integer);
CREATE OR REPLACE FUNCTION public.admin_update_player(
  p_user_id uuid,
  p_pseudo text,
  p_stamps integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF NOT public.is_shop_admin() THEN
    RAISE EXCEPTION 'Accès réservé à un administrateur';
  END IF;
  IF p_stamps IS NULL OR p_stamps < 0 OR p_stamps > 6 THEN
    RAISE EXCEPTION 'Nombre de tampons invalide (0 à 6)';
  END IF;

  SELECT COALESCE(data,'{}'::jsonb) INTO v_data
  FROM public.player_data
  WHERE user_id=p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.player_data(user_id,pseudo,data)
    VALUES(
      p_user_id,
      COALESCE(NULLIF(left(btrim(p_pseudo),32),''),'Champion'),
      jsonb_build_object('pseudo',COALESCE(NULLIF(left(btrim(p_pseudo),32),''),'Champion'),
                         'loyaltyStamps',p_stamps,
                         'stamps',p_stamps)
    );
  ELSE
    v_data=jsonb_set(v_data,'{pseudo}',to_jsonb(COALESCE(NULLIF(left(btrim(p_pseudo),32),''),'Champion')),true);
    v_data=jsonb_set(v_data,'{loyaltyStamps}',to_jsonb(p_stamps),true);
    v_data=jsonb_set(v_data,'{stamps}',to_jsonb(p_stamps),true);

    UPDATE public.player_data
    SET pseudo=COALESCE(NULLIF(left(btrim(p_pseudo),32),''),'Champion'),
        data=v_data
    WHERE user_id=p_user_id;
  END IF;

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_player(uuid,text,integer) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_roles();
CREATE OR REPLACE FUNCTION public.admin_list_roles()
RETURNS TABLE(
  user_id uuid,
  email text,
  pseudo text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email::text,
    COALESCE(NULLIF(left(btrim(pd.pseudo),32),''),'Sans pseudo'),
    COALESCE(ur.role,'user')
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id=u.id
  LEFT JOIN public.player_data pd ON pd.user_id=u.id
  WHERE public.is_shop_admin()
  ORDER BY COALESCE(NULLIF(pd.pseudo,''),u.email::text);
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_roles() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid,text);
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_shop_admin() THEN
    RAISE EXCEPTION 'Accès réservé à un administrateur';
  END IF;
  IF p_role NOT IN ('user','moderator','admin') THEN
    RAISE EXCEPTION 'Rôle invalide';
  END IF;

  INSERT INTO public.user_roles(user_id,role,updated_at)
  VALUES(p_user_id,p_role,now())
  ON CONFLICT(user_id) DO UPDATE
  SET role=EXCLUDED.role,updated_at=now();

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid,text) TO authenticated;

COMMIT;
