
V31 NOTES
- Brevo contacts export/import is unrelated to transactional sending.
- Optional Vercel env: BREVO_API_KEY. If set, V31 uses Brevo transactional API; otherwise it falls back to SMTP.
- SHOP_FROM_EMAIL must be a verified/authenticated Brevo sender.
- Navigation no longer re-animates the whole page on every render.
- Admin panel reorganized into dashboard tabs and stays open after updates.
