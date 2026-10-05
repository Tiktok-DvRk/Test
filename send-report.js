import nodemailer from 'nodemailer';

export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Méthode non autorisée'}), {status:405, headers:{'content-type':'application/json'}});
  try {
    const {subject,type,message,pseudo,email} = await req.json();
    if (!message || String(message).trim().length < 3) throw new Error('Signalement vide');
    const owner = process.env.REPORT_OWNER_EMAIL || 'gwschutz88@gmail.com';
    const from = process.env.REPORT_FROM_EMAIL || 'gwschutz88@schutz-app.site';
    const user = process.env.BREVO_SMTP_USER;
    const pass = process.env.BREVO_SMTP_PASS;
    if (!user || !pass) throw new Error('Le service de signalement n’est pas encore configuré.');
    const safe = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const transporter = nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,auth:{user,pass}});
    await transporter.sendMail({
      from,
      to: owner,
      replyTo: email || undefined,
      subject: `🐞 Schutz app — ${type || 'Signalement'}${subject ? ' — '+subject : ''}`,
      text: `Nouveau signalement Schutz app\n\nType : ${type||'-'}\nSujet : ${subject||'-'}\nPseudo : ${pseudo||'-'}\nEmail : ${email||'-'}\n\nMessage :\n${message}`,
      html: `<h2>🐞 Nouveau signalement Schutz app</h2><p><b>Type :</b> ${safe(type)}<br><b>Sujet :</b> ${safe(subject)}<br><b>Pseudo :</b> ${safe(pseudo)}<br><b>Email :</b> ${safe(email)}</p><hr><p>${safe(message).replace(/\n/g,'<br>')}</p>`
    });
    return new Response(JSON.stringify({ok:true}), {status:200, headers:{'content-type':'application/json'}});
  } catch (e) {
    return new Response(JSON.stringify({error:e?.message || 'Erreur serveur'}), {status:400, headers:{'content-type':'application/json'}});
  }
};
