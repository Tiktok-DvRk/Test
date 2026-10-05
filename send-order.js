import nodemailer from 'nodemailer';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

async function sendWithBrevoApi({apiKey,from,to,replyTo,subject,html}){
  const res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'accept':'application/json','content-type':'application/json','api-key':apiKey},body:JSON.stringify({sender:{email:from},to:[{email:to}],replyTo:replyTo?{email:replyTo}:undefined,subject,htmlContent:html})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`Brevo API ${res.status}: ${data.message||data.code||'erreur inconnue'}`);
  return data;
}
async function sendWithSmtp({user,pass,from,to,replyTo,subject,html}){
  const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,auth:{user,pass}});
  return transporter.sendMail({from,to,replyTo,subject,html});
}

export default async req=>{
  if(req.method!=='POST') return json({error:'Méthode non autorisée'},405);
  let b; try{b=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {name,email,address,city,note,items,total,pseudo,orderId}=b||{};
  if(!name||!email||!address||!city||!Array.isArray(items)||!items.length||!orderId)return json({error:'Commande incomplète.'},400);
  const from=process.env.SHOP_FROM_EMAIL, owner=process.env.SHOP_OWNER_EMAIL;
  const apiKey=process.env.BREVO_API_KEY;
  const smtpUser=process.env.BREVO_SMTP_USER,smtpPass=process.env.BREVO_SMTP_PASS;
  if(!from||!owner||(!apiKey&&(!smtpUser||!smtpPass)))return json({ok:false,error:'Brevo non configuré : il faut SHOP_FROM_EMAIL + SHOP_OWNER_EMAIL et soit BREVO_API_KEY, soit BREVO_SMTP_USER/BREVO_SMTP_PASS.'},503);
  const {createClient}=await import('@supabase/supabase-js');
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({ok:false,error:'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant sur Vercel.'},503);
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const claim=await sb.from('shop_orders').update({status_email_sent_at:new Date().toISOString(),status_email_sent_status:'order_confirmation_sending'}).eq('id',orderId).is('status_email_sent_at',null).select('id').maybeSingle();
  if(claim.error)return json({ok:false,error:'Commande enregistrée, mais verrou email impossible : '+claim.error.message},503);
  if(!claim.data)return json({ok:true,duplicate:true,warning:'Confirmation déjà traitée pour cette commande.'},200);
  const safeTotal=Number(total)||0;
  const rows=items.map(i=>`<li>${esc(i.name)} — ${Number(i.qty)||0} × ${(Number(i.unitPrice)||0).toFixed(2)} €</li>`).join('');
  const send=async args=>apiKey?sendWithBrevoApi({apiKey,...args}):sendWithSmtp({user:smtpUser,pass:smtpPass,...args});
  let ownerSent=false,customerSent=false,warnings=[];
  const common={from,replyTo:email};
  try{await send({...common,to:owner,subject:`🍵 Nouvelle commande Schutz Tea — ${name}`,html:`<h2>🍵 Nouvelle commande</h2><p><b>ID :</b> ${esc(orderId)}</p><p><b>Client :</b> ${esc(name)}<br><b>Pseudo :</b> ${esc(pseudo||'-')}<br><b>Email :</b> ${esc(email)}<br><b>Livraison :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>${esc(note||'')}</p>`});ownerSent=true}catch(e){warnings.push('Email admin : '+(e?.message||'erreur inconnue'))}
  try{await send({...common,to:email,replyTo:undefined,subject:`🍵 Confirmation de ta commande Schutz Tea — ${orderId}`,html:`<h2>Commande envoyée ✅</h2><p>Bonjour ${esc(name)},</p><p>Nous avons bien reçu ta commande.</p><p><b>Adresse :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>Ta commande est en attente de traitement. Tu recevras un email à chaque changement de statut.</p><p>Merci 🍵</p>`});customerSent=true}catch(e){warnings.push('Email client : '+(e?.message||'erreur inconnue'))}
  if(ownerSent||customerSent){await sb.from('shop_orders').update({status_email_sent_status:ownerSent&&customerSent?'order_confirmation_sent':'order_confirmation_partial'}).eq('id',orderId);return json({ok:true,ownerSent,customerSent,warning:warnings.join(' | ')||null});}
  await sb.from('shop_orders').update({status_email_sent_at:null,status_email_sent_status:'order_confirmation_failed'}).eq('id',orderId).eq('status_email_sent_status','order_confirmation_sending');
  return json({ok:false,error:'Brevo n’a accepté aucun email. '+warnings.join(' | ')},502);
};
