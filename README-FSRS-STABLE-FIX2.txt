SCHUTZ-APP — FSRS STABLE FIX 2

Correctifs appliqués dans index.html :
1. Suppression du flash de code JavaScript au démarrage : le préchargement FSRS était placé après </html> et pouvait être affiché comme texte pendant le chargement.
2. Sauvegarde des notes FSRS rendue tolérante aux cartes historiques/incomplètes.
3. Si ts-fsrs rencontre une erreur (CDN, carte invalide, valeur inattendue), le calcul local FSRS-fallback est utilisé au lieu d'annuler la notation.
4. Validation des dates et valeurs FSRS avant enregistrement.
5. En cas d'échec de sauvegarde locale, la carte et le score sont restaurés pour éviter un état partiellement modifié.
6. Vérification de syntaxe JavaScript effectuée avec Node.js.

Fichier principal à déployer : index.html
