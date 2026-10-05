function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
export default async req=>{
  if(req.method!=='POST') return json({error:'Méthode non autorisée'},405);
  let body;try{body=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {email,name,pseudo,status,orderId}=body||{};
  if(!email||!name||!status||!orderId)return json({error:'Informations de notification incomplètes'},400);
  const user=process.env.BREVO_SMTP_USER,pass=process.env.BREVO_SMTP_PASS,from=process.env.SHOP_FROM_EMAIL||process.env.REPORT_FROM_EMAIL;
  if(!user||!pass||!from)return json({error:'Email de statut non configuré'},200);
  const labels={awaiting_payment:'💳 En attente de paiement',paid:'💰 Payée',preparing:'📦 En préparation',shipped:'🚚 Expédiée',delivered:'✅ Livrée',cancelled:'❌ Annulée',pending:'💳 En attente de paiement',repair:'📦 En préparation',validated:'✅ Livrée'};
  const label=labels[status]||status;
  try{
    const nodemailer=(await import('nodemailer')).default;
    const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user,pass}});
    await transporter.sendMail({from,to:email,subject:`🍵 Mise à jour de ta commande Schutz Tea — ${label}`,html:`<h2>🍵 Mise à jour de ta commande</h2><p>Bonjour ${String(name).replace(/[<>]/g,'')},</p><p>Ta commande <b>${String(orderId).replace(/[<>]/g,'')}</b> est maintenant : <b>${label}</b>.</p><p>Merci pour ta commande 🍵</p>`,text:`Ta commande ${orderId} est maintenant : ${label}.`});
    return json({ok:true});
  }catch(e){return json({error:'Brevo : '+(e?.message||'erreur inconnue')},200)}
};
