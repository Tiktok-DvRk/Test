import nodemailer from 'nodemailer';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

async function sendWithBrevoApi({apiKey,from,to,replyTo,subject,html}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4500);
  try{
    const res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':apiKey},body:JSON.stringify({sender:{email:from},to:[{email:to}],replyTo:replyTo?{email:replyTo}:undefined,subject,htmlContent:html}),signal:controller.signal});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(`Brevo API ${res.status}: ${data.message||data.code||'erreur inconnue'}`);
    return data;
  }finally{clearTimeout(timer)}
}

async function sendWithSmtp({user,pass,from,to,replyTo,subject,html}){
  const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,connectionTimeout:4500,greetingTimeout:4500,socketTimeout:4500,auth:{user,pass}});
  return transporter.sendMail({from,to,replyTo,subject,html});
}

export default async req=>{
  if(req.method!=='POST')return json({error:'Méthode non autorisée'},405);
  let b;try{b=await req.json()}catch{return json({error:'JSON invalide'},400)}
  const {name,email,address,city,note,items,total,pseudo,orderId}=b||{};
  if(!name||!email||!address||!city||!Array.isArray(items)||!items.length||!orderId)return json({error:'Commande incomplète.'},400);

  const from=process.env.SHOP_FROM_EMAIL,owner=process.env.SHOP_OWNER_EMAIL;
  const apiKey=process.env.BREVO_API_KEY;
  const smtpUser=process.env.BREVO_SMTP_USER,smtpPass=process.env.BREVO_SMTP_PASS;
  if(!from||!owner||(!apiKey&&(!smtpUser||!smtpPass)))return json({ok:false,error:'Brevo non configuré : vérifie SHOP_FROM_EMAIL, SHOP_OWNER_EMAIL et les identifiants Brevo.'},503);

  const safeTotal=Number(total)||0;
  const rows=items.map(i=>`<li>${esc(i.name)} — ${Number(i.qty)||0} × ${(Number(i.unitPrice)||0).toFixed(2)} €</li>`).join('');
  const send=args=>apiKey?sendWithBrevoApi({apiKey,...args}):sendWithSmtp({user:smtpUser,pass:smtpPass,...args});
  const common={from};

  // Les deux mails sont indépendants. Une panne de l'un ne bloque jamais l'autre.
  const [adminResult,customerResult]=await Promise.allSettled([
    send({...common,to:owner,replyTo:email,subject:`🍵 Nouvelle commande Schutz Tea — ${name}`,html:`<h2>🍵 Nouvelle commande</h2><p><b>ID :</b> ${esc(orderId)}</p><p><b>Client :</b> ${esc(name)}<br><b>Pseudo :</b> ${esc(pseudo||'-')}<br><b>Email :</b> ${esc(email)}<br><b>Livraison :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>${esc(note||'')}</p>`}),
    send({...common,to:email,subject:`🍵 Confirmation de ta commande Schutz Tea — ${orderId}`,html:`<h2>Commande envoyée ✅</h2><p>Bonjour ${esc(name)},</p><p>Nous avons bien reçu ta commande.</p><p><b>Adresse :</b> ${esc(address)}, ${esc(city)}</p><ul>${rows}</ul><p><b>Total : ${safeTotal.toFixed(2)} €</b></p><p>Ta commande est en attente de traitement. Tu recevras un email à chaque changement de statut.</p><p>Merci 🍵</p>`})
  ]);

  const ownerSent=adminResult.status==='fulfilled';
  const customerSent=customerResult.status==='fulfilled';
  const warnings=[];
  if(!ownerSent)warnings.push('Email admin : '+(adminResult.reason?.message||'échec'));
  if(!customerSent)warnings.push('Email client : '+(customerResult.reason?.message||'échec'));

  // IMPORTANT : ne touche pas à shop_orders ici. La commande a déjà été validée par Supabase.
  if(ownerSent||customerSent)return json({ok:true,ownerSent,customerSent,warning:warnings.join(' | ')||null});
  return json({ok:false,error:'Commande enregistrée, mais Brevo n’a envoyé aucun email. '+warnings.join(' | ')},200);
};
