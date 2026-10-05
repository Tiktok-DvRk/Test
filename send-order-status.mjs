function json(body,status=200){return {status,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}}
export default async (req)=>{
  if(req.method!=='POST') return json({error:'Méthode non autorisée'},405);
  let body; try{body=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {email,name,pseudo,status,orderId}=body||{};
  if(!email||!name||!status||!orderId) return json({error:'Informations de notification incomplètes'},400);
  const user=process.env.BREVO_SMTP_USER, pass=process.env.BREVO_SMTP_PASS, from=process.env.SHOP_FROM_EMAIL||process.env.REPORT_FROM_EMAIL;
  const missing=[]; if(!user)missing.push('BREVO_SMTP_USER');if(!pass)missing.push('BREVO_SMTP_PASS');if(!from)missing.push('SHOP_FROM_EMAIL/REPORT_FROM_EMAIL');
  if(missing.length)return json({error:`Service email non configuré : ${missing.join(', ')}`},500);
  const labels={awaiting_payment:'💳 En attente de paiement',paid:'💰 Payée',preparing:'📦 En préparation',shipped:'🚚 Expédiée',delivered:'✅ Livrée',cancelled:'❌ Annulée',pending:'💳 En attente de paiement',repair:'📦 En préparation',validated:'✅ Livrée'};
  const label=labels[status]||status;
  const subject=`🍵 Mise à jour de ta commande Schutz Tea — ${label}`;
  const html=`<h2>🍵 Mise à jour de ta commande</h2><p>Bonjour ${name},</p><p>Ta commande <b>${orderId}</b> est maintenant : <b>${label}</b>.</p><p>Merci pour ta commande 🍵</p>`;
  try{
    const nodemailer=(await import('nodemailer')).default;
    const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user,pass}});
    await transporter.sendMail({from,to:email,subject,html,text:html.replace(/<[^>]+>/g,' ')});
    return json({ok:true});
  }catch(e){console.error('[send-order-status]',e);return json({error:'Brevo : '+(e?.message||'erreur inconnue')},500)}
};
