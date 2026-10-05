SCHUTZ APP — V27 UPGRADE

Cette version ajoute :
- Révision FSRS ciblée par cours (matière) ou chapitre (deck), avec mode dû ou libre.
- Mode autonomie plein écran pour un deck.
- Validation par swipe : gauche = Oublié, bas = Moyen, haut = Correct, droite = Parfait.
- QR code de partage ré-affiché automatiquement après chaque rendu de l'interface.
- Partage d'un cours complet (cours + chapitres + cartes), en plus du partage d'un deck.
- Images sur le recto/verso d'une carte.
- Dessin de schémas directement sur une carte (ex. SI / schémas-blocs).
- Administration de la boutique : ajout, modification et retrait d'articles.
- Les produits de boutique sont désormais stockés dans Supabase.

À faire avant déploiement :
1. Dans Supabase SQL Editor, exécuter SUPABASE_V27_UPGRADE.sql une seule fois.
2. Vérifier l'aperçu du site et tester les fonctions sur un compte de test.
3. Déployer le ZIP seulement après validation.

IMPORTANT : cette version n'a PAS été déployée sur Netlify.
