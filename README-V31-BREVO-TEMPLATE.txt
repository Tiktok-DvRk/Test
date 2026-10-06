SCHUTZ APP — V31 — TEMPLATE BREVO UNIVERSEL

Cette version utilise le template transactionnel Brevo #4 comme template maître.

VARIABLE D'ENVIRONNEMENT OPTIONNELLE :
BREVO_TEMPLATE_ID=4

Si BREVO_TEMPLATE_ID n'est pas défini, le code utilise automatiquement le template #4.

Quand BREVO_API_KEY est configurée, les emails suivants utilisent le template Brevo :
- confirmation de commande
- notification de changement de statut
- signalement envoyé à l'administration
- rappel quotidien d'étude (si le script de rappel est utilisé)

Les données variables sont envoyées via `params` :
SUBJECT, TYPE, TITLE, REFERENCE, INTRO, HIGHLIGHT_LABEL,
HIGHLIGHT_TITLE, HIGHLIGHT, BODY, ACTION_LABEL, ACTION_URL,
SECONDARY_TITLE, SECONDARY, CLOSING, FOOTER_TEXT.

SECURITE :
La clé BREVO_API_KEY reste côté serveur et ne doit jamais être placée dans index.html.

FALLBACK :
Si BREVO_API_KEY n'est pas disponible, les routes de commande/statut/signalement
conservent leur envoi SMTP Brevo existant.
