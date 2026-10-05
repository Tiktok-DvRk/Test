-- ============================================================
-- SCHUTZ APP — LIENS COURTS POUR LES DECKS
-- À exécuter une seule fois dans Supabase > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deck_shares (
  code text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deck_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deck_shares_owner_select" ON public.deck_shares;
DROP POLICY IF EXISTS "deck_shares_owner_insert" ON public.deck_shares;
DROP POLICY IF EXISTS "deck_shares_owner_delete" ON public.deck_shares;

CREATE POLICY "deck_shares_owner_select"
ON public.deck_shares
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "deck_shares_owner_insert"
ON public.deck_shares
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "deck_shares_owner_delete"
ON public.deck_shares
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Création d'un code court aléatoire de 8 caractères.
-- CORRECTION LIENS COURTS V26
-- Remplace les fonctions de création/récupération.

DROP FUNCTION IF EXISTS public.create_deck_share(text, jsonb);

CREATE OR REPLACE FUNCTION public.create_deck_share(
  p_name text,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Deck invalide';
  END IF;

  IF jsonb_typeof(COALESCE(p_payload->'cards', 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Cartes invalides';
  END IF;

  IF jsonb_array_length(p_payload->'cards') > 5000 THEN
    RAISE EXCEPTION 'Deck trop volumineux';
  END IF;

  LOOP
    -- 8 caractères hexadécimaux, simples et fiables.
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.deck_shares WHERE code = v_code
    );
  END LOOP;

  INSERT INTO public.deck_shares(
    code,
    owner_id,
    deck_name,
    payload
  )
  VALUES(
    v_code,
    auth.uid(),
    left(COALESCE(NULLIF(trim(p_name), ''), 'Paquet partagé'), 120),
    p_payload
  );

  RETURN v_code;
END;
$$;

GRANT EXECUTE
ON FUNCTION public.create_deck_share(text, jsonb)
TO authenticated;

DROP FUNCTION IF EXISTS public.get_deck_share(text);

CREATE OR REPLACE FUNCTION public.get_deck_share(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT payload
  INTO v_payload
  FROM public.deck_shares
  WHERE code = upper(trim(p_code));

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Lien de deck introuvable';
  END IF;

  RETURN v_payload;
END;
$$;

GRANT EXECUTE
ON FUNCTION public.get_deck_share(text)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIN
-- ============================================================
