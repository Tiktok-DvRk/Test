import nodemailer from 'nodemailer';
import { parseSender as parseBrevoSender, sendBrevoTemplate, getBrevoTemplateId } from './brevo-template.mjs';

const TIMEOUT_MS = 12000;
const withTimeout = (p, ms, label) => { let t; return Promise.race([Promise.resolve(p), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' : délai dépassé (' + ms / 1000 + ' s)')), ms); })]).finally(() => clearTimeout(t)); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';

// SHOP_FROM_EMAIL peut valoir "Schutz Tea <contact@schutz-app.fr>" ou "contact@schutz-app.fr".
function parseSender(raw) { return parseBrevoSender(raw); }

async function sendViaBrevoApi({ apiKey, sender, to, replyTo, subject, params }) {
  return sendBrevoTemplate({
    apiKey,
    sender,
    to,
    replyTo,
    subject,
    params,
    templateId: getBrevoTemplateId()
  });
}

async function sendViaSmtp({ user, pass, sender, to, replyTo, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port: 587, secure: false, requireTLS: true,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    auth: { user, pass }
  });
  return transporter.sendMail({ from: `"${sender.name.replace(/"/g, '')}" <${sender.email}>`, to, replyTo, subject, html });
}

const web = async req => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée' }, 405);
  let b; try { b = await req.json(); } catch { return json({ ok: false, error: 'JSON invalide' }, 400); }
  const { name, email, address, city, note, items, pseudo, orderId } = b || {};
  if (!name || !address || !city || !Array.isArray(items) || !items.length || !orderId) return json({ ok: false, error: 'Commande incomplète.' }, 400);

  const fromRaw = process.env.SHOP_FROM_EMAIL, owner = process.env.SHOP_OWNER_EMAIL;
  const apiKey = process.env.BREVO_API_KEY, smtpUser = process.env.BREVO_SMTP_USER, smtpPass = process.env.BREVO_SMTP_PASS;
  if (!fromRaw || !owner || (!apiKey && (!smtpUser || !smtpPass))) {
    return json({ ok: false, error: 'Brevo non configuré : SHOP_FROM_EMAIL, SHOP_OWNER_EMAIL et BREVO_API_KEY (ou BREVO_SMTP_USER/BREVO_SMTP_PASS) requis.' }, 503);
  }
  const sender = parseSender(fromRaw);
  const customerEmail = String(email || '').trim();
  const customerOk = EMAIL_RE.test(customerEmail);

  // Lignes nettoyées (accents/caractères spéciaux échappés en HTML, nombres forcés).
  const lines = items.slice(0, 50).map(i => {
    const qty = Math.max(0, Math.round(Number(i?.qty) || 0)), unit = Number(i?.unitPrice) || 0;
    return { name: String(i?.name ?? 'Article').slice(0, 120), qty, unit, sum: qty * unit };
  });
  const safeTotal = lines.reduce((s, l) => s + l.sum, 0);
  const rows = lines.map(l => `<li>${esc(l.name)} — ${l.qty} × ${eur(l.unit)} = <b>${eur(l.sum)}</b></li>`).join('');
  const ref = esc(String(orderId).slice(0, 8));

  // Verrou anti-doublon (facultatif : si Supabase est indisponible, on envoie quand même).
  let sb = null, locked = false;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const claim = await withTimeout(sb.from('shop_orders').update({ status_email_sent_at: new Date().toISOString(), status_email_sent_status: 'order_confirmation_sending' })
        .eq('id', orderId).is('status_email_sent_at', null).select('id').maybeSingle(), 4000, 'verrou Supabase');
      if (!claim.error && !claim.data) return json({ ok: true, duplicate: true, warning: 'Confirmation déjà envoyée pour cette commande.' });
      locked = !claim.error && !!claim.data;
    } catch (e) { console.error('[send-order] verrou indisponible', e?.message); sb = null; }
  }
  const setStatus = async (patch, onlyIfSending) => {
    if (!sb) return;
    try { let q = sb.from('shop_orders').update(patch).eq('id', orderId); if (onlyIfSending) q = q.eq('status_email_sent_status', 'order_confirmation_sending'); await q; } catch {}
  };

  const via = apiKey ? 'API Brevo' : 'SMTP Brevo';
  const send = args => withTimeout(apiKey ? sendViaBrevoApi({ apiKey, sender, ...args }) : sendViaSmtp({ user: smtpUser, pass: smtpPass, sender, ...args }), TIMEOUT_MS, via);
  const adminSubject = `🍵 Nouvelle commande Schutz Tea — ${name}`;
  const clientSubject = `🍵 Confirmation de ta commande Schutz Tea — #${ref}`;

  const adminParams = {
    SUBJECT: adminSubject,
    TYPE: 'COMMANDE',
    TITLE: 'Nouvelle commande',
    REFERENCE: String(orderId).slice(0, 8),
    INTRO: 'Une nouvelle commande vient d’être enregistrée sur Schutz App.',
    HIGHLIGHT_LABEL: 'NOUVELLE COMMANDE',
    HIGHLIGHT_TITLE: `Commande #${ref}`,
    HIGHLIGHT: `Total de la commande : ${eur(safeTotal)}.`,
    BODY: `Client : ${name}\nPseudo : ${pseudo || '-'}\nEmail : ${customerEmail || '(non renseigné)'}\nLivraison : ${address}, ${city}\nArticles : ${lines.map(l => `${l.name} × ${l.qty} (${eur(l.sum)})`).join(' ; ')}${note ? `\nNote : ${note}` : ''}`,
    ACTION_LABEL: 'Ouvrir Schutz App',
    ACTION_URL: 'https://schutz-app.fr',
    SECONDARY_TITLE: 'Traitement',
    SECONDARY: 'Cette commande est disponible dans votre espace administrateur.',
    CLOSING: 'Cordialement,',
    FOOTER_TEXT: 'Notification de commande envoyée par Schutz App.'
  };

  const clientParams = {
    SUBJECT: clientSubject,
    TYPE: 'COMMANDE',
    TITLE: 'Commande reçue',
    REFERENCE: String(orderId).slice(0, 8),
    INTRO: `Bonjour ${name}, nous avons bien reçu ta commande.`,
    HIGHLIGHT_LABEL: 'COMMANDE',
    HIGHLIGHT_TITLE: 'Commande enregistrée',
    HIGHLIGHT: `Ta commande #${ref} d’un montant de ${eur(safeTotal)} a bien été enregistrée.`,
    BODY: `Livraison : ${address}, ${city}\nArticles : ${lines.map(l => `${l.name} × ${l.qty} (${eur(l.sum)})`).join(' ; ')}\nElle est en attente de traitement. Tu recevras un e-mail à chaque changement de statut.`,
    ACTION_LABEL: 'Accéder à Schutz App',
    ACTION_URL: 'https://schutz-app.fr',
    SECONDARY_TITLE: 'À retenir',
    SECONDARY: 'Aucune action supplémentaire n’est nécessaire pour le moment.',
    CLOSING: 'Merci pour ta commande 🍵',
    FOOTER_TEXT: 'Notification de commande envoyée par Schutz App.'
  };

  // Deux envois indépendants : la panne de l'un ne bloque jamais l'autre.
  const [a, c] = await Promise.allSettled([
    send({ to: owner, replyTo: customerOk ? customerEmail : undefined, subject: adminSubject, params: adminParams }),
    customerOk ? send({ to: customerEmail, subject: clientSubject, params: clientParams }) : Promise.reject(new Error('adresse e-mail client absente ou invalide'))
  ]);
  const ownerSent = a.status === 'fulfilled', customerSent = c.status === 'fulfilled';
  const warnings = [];
  if (!ownerSent) warnings.push('E-mail admin : ' + (a.reason?.message || 'échec'));
  if (!customerSent) warnings.push('E-mail client : ' + (c.reason?.message || 'échec'));
  warnings.forEach(w => console.error('[send-order]', orderId, w));

  // La commande Supabase n'est JAMAIS modifiée ici hormis le suivi d'envoi d'e-mail.
  if (ownerSent || customerSent) {
    await setStatus({ status_email_sent_status: ownerSent && customerSent ? 'order_confirmation_sent' : 'order_confirmation_partial' });
    return json({ ok: true, via, ownerSent, customerSent, warning: warnings.join(' | ') || null });
  }
  if (locked) await setStatus({ status_email_sent_at: null, status_email_sent_status: 'order_confirmation_failed' }, true);
  return json({ ok: false, via, error: 'Brevo n’a accepté aucun e-mail (' + via + '). ' + warnings.join(' | ') }, 502);
};


// ---- Adaptateur Vercel (format Node req/res) : la logique ci-dessus reste au format Web Request/Response ----
export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    let body;
    if (method !== 'GET' && method !== 'HEAD') body = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    const request = new Request('https://' + (req.headers?.host || 'localhost') + (req.url || '/'), { method, headers: { 'content-type': 'application/json' }, body });
    const r = await web(request);
    res.status(r.status).setHeader('content-type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    res.send(await r.text());
  } catch (e) {
    console.error('[api]', e);
    res.status(500).json({ ok: false, error: 'Erreur serveur : ' + (e?.message || 'inconnue') });
  }
}
