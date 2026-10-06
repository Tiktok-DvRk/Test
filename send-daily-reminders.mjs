import {createClient} from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { parseSender, sendBrevoTemplate, getBrevoTemplateId } from './brevo-template.mjs';

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
function partsFor(now,tz){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
  const get=k=>parts.find(x=>x.type===k)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}

export default async()=>{
  try{
    const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const missing=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SHOP_FROM_EMAIL'].filter(k=>!process.env[k]);
    if(missing.length)return json({error:`Configuration manquante : ${missing.join(', ')}`},500);

    const {data:rows,error}=await sb.from('player_data').select('user_id,pseudo,data,reminder_enabled,reminder_time,reminder_timezone,reminder_last_sent').limit(1000);
    if(error)throw error;
    const {data:users,error:ue}=await sb.auth.admin.listUsers({page:1,perPage:1000});
    if(ue)throw ue;
    const emails=new Map((users.users||[]).map(u=>[u.id,u.email]));
    const transporter=nodemailer.createTransport({host:'smtp-relay.brevo.com',port:587,secure:false,requireTLS:true,auth:{user:process.env.BREVO_SMTP_USER,pass:process.env.BREVO_SMTP_PASS}});
    const now=new Date(); let sent=0;

    for(const row of rows||[]){
      const legacy=row.data?.dailyReminder||{};
      const cfg={enabled: row.reminder_enabled ?? legacy.enabled ?? false, time: row.reminder_time || legacy.time || '18:00', timezone: row.reminder_timezone || legacy.timezone || 'Europe/Paris', lastSentKey: legacy.lastSentKey || (row.reminder_last_sent ? String(row.reminder_last_sent) : '')};
      if(!cfg.enabled || !cfg.time)continue;
      const tz=cfg.timezone||'Europe/Paris';
      const local=partsFor(now,tz);
      if(local.time!==String(cfg.time))continue;
      const key=`${local.date} ${local.time}`;
      if(cfg.lastSentKey===key)continue;
      const to=emails.get(row.user_id);
      if(!to)continue;

      const subject='📚 C’est l’heure de travailler — Schutz app';
      if(process.env.BREVO_API_KEY){
        await sendBrevoTemplate({
          apiKey:process.env.BREVO_API_KEY,
          sender:parseSender(process.env.SHOP_FROM_EMAIL),
          to,
          subject,
          templateId:getBrevoTemplateId(),
          params:{
            SUBJECT:subject,
            TYPE:'RAPPEL',
            TITLE:'C’est l’heure de travailler',
            REFERENCE:key,
            INTRO:`Salut ${row.pseudo||'Champion'} 👋`,
            HIGHLIGHT_LABEL:'RAPPEL QUOTIDIEN',
            HIGHLIGHT_TITLE:'Ta session t’attend',
            HIGHLIGHT:'Un petit rappel pour garder ton rythme.',
            BODY:'Ouvre Schutz App et fais tes cartes du jour. 🚀',
            ACTION_LABEL:'Ouvrir Schutz App',
            ACTION_URL:'https://schutz-app.fr',
            SECONDARY_TITLE:'Petit rappel',
            SECONDARY:'Quelques minutes aujourd’hui valent mieux que tout remettre à demain.',
            CLOSING:'Bon courage 💪',
            FOOTER_TEXT:'Rappel quotidien envoyé par Schutz App.'
          }
        });
      }else{
        if(!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_PASS) throw new Error('BREVO_API_KEY ou identifiants SMTP manquants.');
        await transporter.sendMail({
          from:process.env.SHOP_FROM_EMAIL,
          to,
          subject,
          text:`Salut ${row.pseudo||'Champion'} !\n\nPetit rappel : ta session de travail Schutz app t’attend. 🚀\n\nTu peux ouvrir schutz-app.fr et faire tes cartes du jour.`,
          html:`<h2>📚 C’est l’heure de travailler !</h2><p>Salut ${row.pseudo||'Champion'} 👋</p><p>Petit rappel : ta session de travail <b>Schutz app</b> t’attend. 🚀</p><p>Ouvre schutz-app.fr et fais tes cartes du jour.</p>`
        });
      }

      const newData={...(row.data||{}),dailyReminder:{...legacy,enabled:cfg.enabled,time:cfg.time,timezone:cfg.timezone,lastSentKey:key}};
      await sb.from('player_data').update({data:newData,reminder_last_sent:local.date,updated_at:new Date().toISOString()}).eq('user_id',row.user_id);
      sent++;
    }
    return json({ok:true,sent});
  }catch(e){console.error('[send-daily-reminders]',e);return json({error:e?.message||'Erreur rappel'},500)}
};

export const config={schedule:'* * * * *'};
