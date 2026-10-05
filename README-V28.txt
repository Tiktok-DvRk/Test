SCHUTZ-APP V28 — VERSION STABLE

Cette version corrige principalement :
- cartes de révision longues : taille du texte adaptative + débordement maîtrisé ;
- swipe des cartes : déplacement, rotation, étiquettes OUBLIÉ/MOYEN/CORRECT/PARFAIT et animation de sortie ;
- logo SCHUTZ-APP fourni par l'utilisateur : favicon + barre de marque dans le site ;
- boutique : création de commande par RPC Supabase sécurisé ;
- commandes : statuts awaiting_payment -> paid -> preparing -> shipped -> delivered ;
- suppression de commande par le staff ;
- historique automatique des statuts ;
- suivi client automatique (Realtime si disponible + rafraîchissement toutes les 12 secondes) ;
- emails de confirmation/statut Brevo non bloquants pour l'enregistrement de la commande ;
- support Netlify ET Vercel pour les fonctions serveur.

SUPABASE
1. Ouvre Supabase > SQL Editor.
2. Copie-colle TOUT le fichier SUPABASE_SCHUTZ_V28_COMPLETE.sql.
3. Exécute-le une seule fois.
4. Vérifie que ton compte possède bien le rôle admin dans public.user_roles.

VARIABLES SERVEUR (Netlify ou Vercel)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
BREVO_SMTP_USER
BREVO_SMTP_PASS
SHOP_OWNER_EMAIL
SHOP_FROM_EMAIL

Le navigateur utilise seulement supabase-config.js avec l'URL + clé publishable/anon.
NE JAMAIS mettre la service_role_key dans supabase-config.js.

VERCEL
- Le dossier api/ contient les fonctions send-order, send-order-status et send-report.
- vercel.json contient les rewrites utiles.
- Le front détecte automatiquement Vercel et utilise /api/...

NETLIFY
- Les fonctions historiques restent dans netlify/functions/.
- Le front détecte automatiquement Netlify et utilise /.netlify/functions/...

LOGO
Le logo fourni est dans assets/schutz-app-logo.jpeg.

IMPORTANT
L'ancien code SQL V26/V27 peut rester dans le dossier comme archive, mais pour cette version il faut utiliser
SUPABASE_SCHUTZ_V28_COMPLETE.sql en priorité.
