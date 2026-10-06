FIX FSRS / BOUTONS DE NOTATION

- Correction des boutons Oublié / Moyen / Correct / Parfait dans les sessions d'apprentissage d'un deck.
- Les boutons arrêtent explicitement la propagation des pointer events et restent cliquables.
- rateDeckLearning et rateCard sont protégés par try/catch pour qu'une erreur du scheduler ne bloque pas toute la session.
- Le planificateur ts-fsrs officiel reste prioritaire quand il est chargé.
- Si le module officiel échoue ponctuellement, le moteur FSRS-6 local de secours est utilisé.
- Les réponses sont sauvegardées dans l'état de la carte et dans reviewLogs.
- Le mélange des cartes et le compteur de session sont conservés.
