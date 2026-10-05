SCHUTZ APP — VERSION FINALE

1) NETLIFY
- Décompresse ce ZIP puis envoie le contenu du dossier sur Netlify.
- Le fichier index.html est à la racine.
- Les fonctions Netlify sont dans netlify/functions/.

2) SUPABASE
- Dans Supabase > SQL Editor, exécute SUPABASE_FINAL.sql en entier.
- Cette migration conserve pseudo/photo/PDF lors des sauvegardes cloud.
- Elle remet les anciens scores à 0 une seule fois et installe le nouveau barème.

3) NOUVEAU BARÈME
- 10 points par carte validée pendant une révision planifiée.
- Une révision libre ne donne pas de points.
- Test Chrono : 10 points par bonne réponse.
- Les anciens scores sont remis à 0 une seule fois par la migration.

4) BOUTIQUE
- Thé : 0,20 € l’unité.
- Café : 0,50 € l’unité.
- Le café apparaît avec les boissons dans la boutique.

5) EMAILS NETLIFY — VARIABLES D’ENVIRONNEMENT
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- BREVO_SMTP_USER
- BREVO_SMTP_PASS
- SHOP_OWNER_EMAIL
- SHOP_FROM_EMAIL

Les mails de changement de statut de commande passent par send-order-status.
Les rappels quotidiens passent par send-daily-reminders et utilisent le fuseau horaire enregistré par chaque utilisateur.

6) RAPPELS
- Profil > Rappel quotidien > choisir l'heure > Enregistrer.
- Le fuseau horaire du téléphone est enregistré automatiquement.
- Le rappel est envoyé une fois par jour à l'heure choisie.

7) PDF / DOCUMENTS
- PDF de cours : ouverture et suppression.
- Documents partagés : ouverture et suppression.
- Les suppressions retirent le fichier du Storage et de la liste locale/cloud quand nécessaire.

8) COMPTE
- Mot de passe oublié : le lien Supabase ouvre maintenant directement l'écran de nouveau mot de passe.
- Modifier l'adresse e-mail : une vraie demande Supabase est envoyée depuis le Profil. La confirmation dépend des réglages Auth de Supabase.
