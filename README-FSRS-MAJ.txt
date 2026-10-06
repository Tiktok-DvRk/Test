MAJ Révision / FSRS

- Correction du compteur : chaque session de révision utilise maintenant un snapshot fixe des cartes sélectionnées. Le total X / N ne diminue plus pendant la session.
- Ajout du mélange aléatoire des cartes pour un deck.
- Ajout de « FSRS + ordre mélangé » pour la révision FSRS d'un deck.
- La notation Oublié / Moyen / Correct / Parfait met à jour la planification de la carte (stabilité, difficulté, état, prochaine échéance et historique).
- Le moteur principal utilise ts-fsrs 5.4.2 via CDN, basé sur FSRS-6, avec rétention cible 90 %, intervalle max 36500 jours et fuzz désactivé.
- Le mode d'apprentissage d'un deck applique lui aussi le scheduler FSRS lors de chaque notation.

Important : le CDN ts-fsrs doit être accessible au navigateur pour utiliser le moteur officiel. Un moteur local de secours est inclus pour éviter une session sans planification si le CDN est indisponible.
