import nodemailer from 'nodemailer';
import { parseSender, sendBrevoTemplate, getBrevoTemplateId } from './brevo-template.mjs';

const web = async req => {
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Méthode non autorisée'}), {status:405, headers:{'content-type':'application/json'}});
  try {
    const {subject,type,message,pseudo,email} = await req.json();
    if (!message || String(message).trim().length < 3) throw new Error('Signalement vide');
    const owner = process.env.REPORT_OWNER_EMAIL || 'gwschutz88@gmail.com';
    const fromRaw = process.env.REPORT_FROM_EMAIL || 'gwschutz88@schutz-app.site';
    const apiKey = process.env.BREVO_API_KEY;
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    const safe = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const mailSubject = `🐞 Schutz app — ${type || 'Signalement'}${subject ? ' — '+subject : ''}`;

    if (apiKey) {
      await sendBrevoTemplate({
        apiKey,
        sender: parseSender(fromRaw),
        to: owner,
        replyTo: email || undefined,
        subject: mailSubject,
        templateId: getBrevoTemplateId(),
        params: {
          SUBJECT: mailSubject,
          TYPE: 'SIGNALEMENT',
          TITLE: 'Nouveau signalement',
          REFERENCE: subject || 'Signalement',
          INTRO: 'Un nouveau signalement vient d’être envoyé depuis Schutz App.',
          HIGHLIGHT_LABEL: type ? 'TYPE DE SIGNALEMENT' : 'SIGNALEMENT',
          HIGHLIGHT_TITLE: type || 'Signalement',
          HIGHLIGHT: subject || 'Un utilisateur a envoyé un nouveau signalement.',
          BODY: `Pseudo : ${pseudo || '-'}\nEmail : ${email || '-'}\nSujet : ${subject || '-'}\n\nMessage :\n${message}`,
          ACTION_LABEL: 'Ouvrir Schutz App',
          ACTION_URL: 'https://schutz-app.fr',
          SECONDARY_TITLE: 'Informations',
          SECONDARY: 'Ce message a été envoyé depuis le formulaire de signalement de Schutz App.',
          CLOSING: 'Cordialement,',
          FOOTER_TEXT: 'Signalement reçu par Schutz App.'
        }
      });
    } else {
      if (!user || !pass) throw new Error('Le service de signalement n’est pas encore configuré.');
      const transporter = nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,auth:{user,pass}});
      await transporter.sendMail({
        from: fromRaw,
        to: owner,
        replyTo: email || undefined,
        subject: mailSubject,
        text: `Nouveau signalement Schutz app\n\nType : ${type||'-'}\nSujet : ${subject||'-'}\nPseudo : ${pseudo||'-'}\nEmail : ${email||'-'}\n\nMessage :\n${message}`,
        html: `<h2>🐞 Nouveau signalement Schutz app</h2><p><b>Type :</b> ${safe(type)}<br><b>Sujet :</b> ${safe(subject)}<br><b>Pseudo :</b> ${safe(pseudo)}<br><b>Email :</b> ${safe(email)}</p><hr><p>${safe(message).replace(/\n/g,'<br>')}</p>`
      });
    }
    return new Response(JSON.stringify({ok:true,templateId:apiKey?getBrevoTemplateId():null}), {status:200, headers:{'content-type':'application/json'}});
  } catch (e) {
    return new Response(JSON.stringify({error:e?.message || 'Erreur serveur'}), {status:400, headers:{'content-type':'application/json'}});
  }
};

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
