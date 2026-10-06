import nodemailer from 'nodemailer';
import { parseSender, sendBrevoTemplate, getBrevoTemplateId } from './brevo-template.mjs';
function json(body,status=200){return {status,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}}
export default async (req)=>{
  if(req.method!=='POST') return json({error:'Méthode non autorisée'},405);
  let body; try{body=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {email,name,status,orderId}=body||{};
  if(!email||!name||!status||!orderId) return json({error:'Informations de notification incomplètes'},400);
  const user=process.env.BREVO_SMTP_USER, pass=process.env.BREVO_SMTP_PASS, fromRaw=process.env.SHOP_FROM_EMAIL||process.env.REPORT_FROM_EMAIL, apiKey=process.env.BREVO_API_KEY;
  if(!fromRaw||(!apiKey&&(!user||!pass)))return json({error:'Service email non configuré'},500);
  const labels={awaiting_payment:'💳 En attente de paiement',paid:'💰 Payée',preparing:'📦 En préparation',shipped:'🚚 Expédiée',delivered:'✅ Livrée',cancelled:'❌ Annulée',pending:'💳 En attente de paiement',repair:'📦 En préparation',validated:'✅ Livrée'};
  const label=labels[status]||String(status); const subject=`🍵 Mise à jour de ta commande Schutz Tea — ${label}`; const ref=String(orderId).slice(0,8);
  try{
    if(apiKey){
      await sendBrevoTemplate({apiKey,sender:parseSender(fromRaw),to:email,subject,templateId:getBrevoTemplateId(),params:{SUBJECT:subject,TYPE:'COMMANDE',TITLE:'Mise à jour de ta commande',REFERENCE:ref,INTRO:`Bonjour ${name}, ta commande vient d’être mise à jour.`,HIGHLIGHT_LABEL:'STATUT DE LA COMMANDE',HIGHLIGHT_TITLE:label,HIGHLIGHT:`La commande #${ref} est maintenant au statut « ${label} ».`,BODY:'Tu recevras un nouvel e-mail à chaque changement important de statut.',ACTION_LABEL:'Accéder à Schutz App',ACTION_URL:'https://schutz-app.fr',SECONDARY_TITLE:'À retenir',SECONDARY:'Aucune action supplémentaire n’est nécessaire pour cette mise à jour.',CLOSING:'Merci pour ta commande 🍵',FOOTER_TEXT:'Notification de commande envoyée par Schutz App.'}});
    }else{
      const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user,pass}});
      const html=`<h2>🍵 Mise à jour de ta commande</h2><p>Bonjour ${name},</p><p>Ta commande <b>${orderId}</b> est maintenant : <b>${label}</b>.</p><p>Merci pour ta commande 🍵</p>`;
      await transporter.sendMail({from:fromRaw,to:email,subject,html,text:html.replace(/<[^>]+>/g,' ')});
    }
    return json({ok:true,templateId:apiKey?getBrevoTemplateId():null});
  }catch(e){console.error('[send-order-status]',e);return json({error:'Brevo : '+(e?.message||'erreur inconnue')},500)}
};
