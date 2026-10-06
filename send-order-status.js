import { parseSender, sendBrevoTemplate, getBrevoTemplateId } from '../brevo-template.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const clean=s=>String(s??'').replace(/[<>]/g,'');
const labels={awaiting_payment:'💳 En attente de paiement',paid:'💰 Payée',preparing:'📦 En préparation',shipped:'🚚 Expédiée',delivered:'✅ Livrée',cancelled:'❌ Annulée',pending:'💳 En attente de paiement',repair:'📦 En préparation',validated:'✅ Livrée'};

async function sendSmtp({from,to,subject,html,user,pass}){
  const nodemailer=(await import('nodemailer')).default;
  const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user,pass}});
  return transporter.sendMail({from,to,subject,html,text:html.replace(/<[^>]+>/g,' ')});
}

const web = async req=>{
  if(req.method!=='POST')return json({error:'Méthode non autorisée'},405);
  let body;try{body=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {email,name,status,orderId}=body||{};
  if(!email||!name||!status||!orderId)return json({error:'Informations de notification incomplètes'},400);

  const fromRaw=process.env.SHOP_FROM_EMAIL;
  const apiKey=process.env.BREVO_API_KEY;
  const user=process.env.BREVO_SMTP_USER;
  const pass=process.env.BREVO_SMTP_PASS;
  if(!fromRaw||(!apiKey&&(!user||!pass)))return json({error:'Brevo non configuré : SHOP_FROM_EMAIL + BREVO_API_KEY ou identifiants SMTP requis.'},200);

  const label=labels[status]||clean(status);
  const subject=`🍵 Mise à jour de ta commande Schutz Tea — ${label}`;
  const ref=String(orderId).slice(0,8);
  const params={
    SUBJECT:subject,
    TYPE:'COMMANDE',
    TITLE:'Mise à jour de ta commande',
    REFERENCE:ref,
    INTRO:`Bonjour ${clean(name)}, ta commande vient d’être mise à jour.`,
    HIGHLIGHT_LABEL:'STATUT DE LA COMMANDE',
    HIGHLIGHT_TITLE:label,
    HIGHLIGHT:`La commande #${ref} est maintenant au statut « ${label} ».`,
    BODY:'Tu recevras un nouvel e-mail à chaque changement important de statut.',
    ACTION_LABEL:'Accéder à Schutz App',
    ACTION_URL:'https://schutz-app.fr',
    SECONDARY_TITLE:'À retenir',
    SECONDARY:'Aucune action supplémentaire n’est nécessaire pour cette mise à jour.',
    CLOSING:'Merci pour ta commande 🍵',
    FOOTER_TEXT:'Notification de commande envoyée par Schutz App.'
  };

  try{
    if(apiKey){
      await sendBrevoTemplate({apiKey,sender:parseSender(fromRaw),to:email,subject,params,templateId:getBrevoTemplateId()});
    }else{
      await sendSmtp({from:fromRaw,to:email,subject,html:`<h2>🍵 Mise à jour de ta commande</h2><p>Bonjour ${clean(name)},</p><p>Ta commande <b>${clean(orderId)}</b> est maintenant : <b>${label}</b>.</p><p>Merci pour ta commande 🍵</p>`,user,pass});
    }
    return json({ok:true,templateId:apiKey?getBrevoTemplateId():null});
  }catch(e){return json({error:'Brevo : '+(e?.message||'erreur inconnue')},200)}
};

export default async function handler(req,res){
  try{
    const method=req.method||'GET';
    let body;
    if(method!=='GET'&&method!=='HEAD')body=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body??{});
    const request=new Request('https://'+(req.headers?.host||'localhost')+(req.url||'/'),{method,headers:{'content-type':'application/json'},body});
    const r=await web(request);
    res.status(r.status).setHeader('content-type',r.headers.get('content-type')||'application/json');
    res.send(await r.text());
  }catch(e){console.error('[api]',e);res.status(500).json({ok:false,error:'Erreur serveur : '+(e?.message||'inconnue')});}
}
