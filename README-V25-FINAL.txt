SCHUTZ APP — V25 FINAL REPAIRED FROM V24

Base: schutz-app-web-FINAL-V24.zip

Corrections included:
- Password recovery flow with ?reset=1 and PASSWORD_RECOVERY detection.
- Reminder settings persisted through Supabase RPC + player_data JSON.
- Scheduled reminder function reads both reminder columns and legacy JSON.
- Existing V24 features retained: shop, coffee 0.50€, order status emails, profile/avatar, PDFs, shared exercises, leaderboard and +10 review scoring.

Deploy by uploading the ZIP contents to Netlify as usual.
Supabase SQL should be run separately; the SQL changes already applied in the conversation should remain in place.
