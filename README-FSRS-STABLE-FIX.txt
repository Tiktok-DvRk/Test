SCHUTZ-APP — FSRS STABLE FIX

Base: Schutz-App-Brevo-Template4 2.zip (version qui fonctionnait avant le correctif écran blanc).

1. Les quatre boutons de notation du mode Apprendre et du mode Révision FSRS sont gérés par pointerup + click en délégation, avec verrou anti-double-clic.
2. La zone du swipe ne capture plus les boutons de notation.
3. Le plein écran d’apprentissage reste scrollable sur mobile afin que les boutons restent accessibles.
4. Une session d’apprentissage utilise un snapshot des cartes : le compteur reste fixe.
5. Une session FSRS ciblée utilise aussi un snapshot : la liste et le dénominateur ne diminuent pas quand une carte est notée.
6. Mélange Fisher-Yates disponible pour un deck, et pour FSRS + ordre mélangé.
7. Le scheduler officiel ts-fsrs@5.4.2 est chargé avec import() de façon non bloquante. Un échec réseau ne peut donc plus rendre toute la page blanche.
8. Quand le scheduler officiel est chargé, la notation appelle scheduler.next(card, now, Rating.Again/Hard/Good/Easy), conformément à l’API officielle ts-fsrs. Sinon le fallback FSRS embarqué garde la fonction de révision utilisable.
