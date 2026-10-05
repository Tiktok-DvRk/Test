import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

export default async req=>{
  if(req.method!=='POST') return json({error:'Méthode non autorisée'},405);
  let b; try{b=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {name,email,address,city,note,items,total,pseudo,orderId}=b||{};
  if(!name||!email||!address||!city||!Array.isArray(items)||!items.length||!orderId)return json({error:'Commande incomplète.'},400);
  const missing=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BREVO_SMTP_USER','BREVO_SMTP_PASS','SHOP_OWNER_EMAIL','SHOP_FROM_EMAIL'].filter(k=>!process.env[k]);
  if(missing.length)return json({ok:false,error:`Commande enregistrée, mais email non configuré : ${missing.join(', ')}`},503);
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const claim=await sb.from('shop_orders').update({status_email_sent_at:new Date().toISOString(),status_email_sent_status:'order_confirmation_sending'}).eq('id',orderId).is('status_email_sent_at',null).select('id').maybeSingle();
  if(claim.error)return json({ok:false,error:'Commande enregistrée, mais verrou email impossible : '+claim.error.message},503);
  if(!claim.data)return json({ok:true,duplicate:true},200);
  const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,auth:{user:process.env.BREVO_SMTP_USER,pass:process.env.BREVO_SMTP_PASS}});
  const safeTotal=Number(total)||0;
  const rows=items.map(i=>`<li>${esc(i.name)} — ${Number(i.qty)||0} × ${(Number(i.unitPrice)||0).toFixed(2)} €</li>`).join('');
  try{
    await transporter.sendMail({from:process.env.SHOP_FROM_EMAIL,to:process.env.SHOP_OWNER_EMAIL,replyTo:email,subject:`🍵 Nouvelle commande Schutz Tea — ${name}`,html:`<h2>🍵 Nouvelle commande</h2><p><b>ID :</b> ${esc(orderId)}</p><p><b>Client :</b> ${esc(name)}<br><b>Pseudo :</b> ${esc(pseudo||'-')}<br><b>Email :</b> ${esc(email)}<br><b>Livraison :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>${esc(note||'')}</p>`});
    await transporter.sendMail({from:process.env.SHOP_FROM_EMAIL,to:email,subject:`🍵 Confirmation de ta commande Schutz Tea — ${orderId}`,html:`<h2>Commande envoyée ✅</h2><p>Bonjour ${esc(name)},</p><p>Nous avons bien reçu ta commande.</p><p><b>Adresse de livraison :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>Ta commande est en attente de traitement. Tu recevras un email à chaque changement de statut.</p><p>Merci 🍵</p>`});
    await sb.from('shop_orders').update({status_email_sent_status:'order_confirmation_sent'}).eq('id',orderId);
    return json({ok:true});
  }catch(e){await sb.from('shop_orders').update({status_email_sent_at:null,status_email_sent_status:'order_confirmation_failed'}).eq('id',orderId).eq('status_email_sent_status','order_confirmation_sending');return json({ok:false,error:'Commande enregistrée, mais email non envoyé : '+(e?.message||'')},502)}
};
