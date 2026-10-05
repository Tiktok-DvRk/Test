SCHUTZ-APP V28 — UPGRADE COMPLET

Utilise SUPABASE_SCHUTZ_V28_COMPLETE.sql pour la migration Supabase.
Cette version corrige les commandes, le suivi client, les statuts et les cartes de révision longues.
Le logo est dans assets/schutz-app-logo.jpeg.
Le projet peut être déployé sur Netlify ou Vercel.


FIX STABLE V28 (5 octobre 2026)
--------------------------------
1. Exécuter d'abord SUPABASE_SCHUTZ_V28_COMPLETE.sql.
2. Puis exécuter SUPABASE_V28_STABLE_FIX.sql.
3. Déployer le contenu du dossier schutz sur Vercel.
4. Les variables serveur Vercel restent les mêmes :
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   BREVO_SMTP_USER
   BREVO_SMTP_PASS
   SHOP_OWNER_EMAIL
   SHOP_FROM_EMAIL

Le correctif frontend évite une course entre le chargement des produits/fidélité
et le chargement des commandes/avis. Il empêche ainsi les sections « Chargement… »
de rester bloquées après un rerender. La création de commande ne fait plus de
fallback INSERT risquant de masquer une erreur RPC. L'envoi d'e-mail est découplé :
une panne Brevo ne supprime pas la commande.
