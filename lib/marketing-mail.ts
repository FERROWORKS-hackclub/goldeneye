import nodemailer from 'nodemailer';
import { createHash,randomUUID } from 'node:crypto';
import { db } from './server';
import { campaignSchema,parseEmailAudience,renderCampaignEmail,escapeHtml } from './marketing-validation.mjs';
import { MarketingError,marketingOrigin,marketingSecret,unsubscribeUrl,auditMarketing } from './marketing';
import { marketingToken,verifyMarketingToken } from './marketing-tokens.mjs';
import { storedAudience } from './marketing-storage.mjs';

export const newsletterFrom='Ferroworks <newsletter@ferroworks.org>';
export function marketingTransport(){
 const host=process.env.MARKETING_SMTP_HOST||process.env.SMTP_HOST;
 const user=process.env.MARKETING_SMTP_USER||process.env.SMTP_USER;
 const pass=process.env.MARKETING_SMTP_PASSWORD||process.env.SMTP_PASSWORD;
 if(!host||!user||!pass)throw new MarketingError('The newsletter SMTP sender is not configured.',503);
 const port=Number(process.env.MARKETING_SMTP_PORT||process.env.SMTP_PORT||465);
 return nodemailer.createTransport({host,port,secure:process.env.SMTP_SECURE?process.env.SMTP_SECURE==='true':port===465,auth:{user,pass},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:15000});
}
export async function campaignAudience(sql:any,listIds:string[],customEmails:string[]){
 const recipients=await storedAudience(sql,listIds,customEmails);
 const eligible=recipients.filter(r=>!r.suppressed&&['subscribed','custom'].includes(r.status));
 const hash=createHash('sha256').update(JSON.stringify(recipients.map(r=>[r.id,r.email,r.status,r.suppressed]))).digest('hex');
 return {recipients,eligible,hash,total:recipients.length,excluded:recipients.length-eligible.length};
}
export async function queueCampaign(user:any,campaignId:string,input:any){
 const custom=parseEmailAudience(input.customEmails||'');
 if(custom.length>500||input.listIds.length>50)throw new MarketingError('Use up to 500 custom addresses and 50 lists per campaign.');
 if(custom.length&&!input.customConsent)throw new MarketingError('Confirm you have permission to email the custom recipients.');
 return db().begin(async tx=>{
  const [c]=await tx`SELECT * FROM fw_marketing_campaigns WHERE id=${campaignId} FOR UPDATE`;
  if(!c)throw new MarketingError('Campaign not found.',404);
  if(c.status!=='draft'||c.version!==input.version)throw new MarketingError('The campaign changed. Review the latest version before sending.',409);
  const snapshot=campaignSchema.parse(c);if(!snapshot.subject.trim()||!snapshot.blocks.length)throw new MarketingError('Add a subject and at least one content block.');
  const audience=await campaignAudience(tx,input.listIds,custom);
  if(audience.hash!==input.audienceHash)throw new MarketingError('The audience changed. Review the recipients again.',409);
  if(!audience.eligible.length)throw new MarketingError('There are no subscribed recipients in this audience.');
  const [settings]=await tx`SELECT settings FROM fw_marketing_settings WHERE id=1`;
  const footer=settings?.settings?.footer||'Ferroworks · Brisbane, Queensland, Australia';
  renderCampaignEmail(snapshot,`${marketingOrigin()}/unsubscribe?preview=1`,{footer});
  for(const row of audience.eligible){
   let contact=row;
   if(!contact.id){
    [contact]=await tx`INSERT INTO fw_marketing_contacts(id,email,name,status,consent_source,consent_at,confirmed_at) VALUES(${randomUUID()},${row.email},'','subscribed',${'Custom campaign audience; consent attested by '+user.name},now(),now()) ON CONFLICT(email) DO UPDATE SET updated_at=fw_marketing_contacts.updated_at RETURNING *`;
   }
   if(contact.status!=='subscribed')continue;
   await tx`INSERT INTO fw_marketing_deliveries(id,campaign_id,contact_id,email,name,kind) VALUES(${randomUUID()},${campaignId},${contact.id},${contact.email},${contact.name},'campaign') ON CONFLICT DO NOTHING`;
  }
  const [count]=await tx`SELECT count(*)::int AS count FROM fw_marketing_deliveries WHERE campaign_id=${campaignId}`;
  if(!count.count)throw new MarketingError('The selected contacts are no longer subscribed. Review the audience.');
  await tx`UPDATE fw_marketing_campaigns SET status='queued',snapshot=${tx.json({...snapshot,footer})},audience=${tx.json({listIds:input.listIds,customCount:custom.length,total:count.count,excluded:audience.excluded})},updated_by=${user.id},updated_at=now() WHERE id=${campaignId}`;
  await auditMarketing(tx,user.id,'campaign.queued',campaignId,{recipients:count.count});
  return {queued:count.count,excluded:audience.excluded};
 });
}
export async function deliveryProgress(campaignId:string){return db()`SELECT status,count(*)::int AS count FROM fw_marketing_deliveries WHERE campaign_id=${campaignId} GROUP BY status`;}

export async function drainMarketingQueue({campaignId,deliveryId,limit=8}:{campaignId?:string;deliveryId?:string;limit?:number}={}){
 const sql=db();
 // A process may die after SMTP accepted a message. Never automatically resend
 // expired leases: mark them for review rather than risk duplicate campaigns.
 await sql`UPDATE fw_marketing_deliveries SET status='unknown',error='Delivery interrupted; receipt is uncertain. Review before sending again.' WHERE status='processing' AND lease_until<now()`;
 const transport=marketingTransport();
 for(let i=0;i<limit;i++){
  const job=await sql.begin(async tx=>{
   const rows=campaignId?await tx`SELECT d.* FROM fw_marketing_deliveries d JOIN fw_marketing_campaigns c ON c.id=d.campaign_id WHERE d.status='pending' AND d.campaign_id=${campaignId} AND c.status IN ('queued','sending') ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`:deliveryId?await tx`SELECT * FROM fw_marketing_deliveries WHERE id=${deliveryId} AND status='pending' FOR UPDATE SKIP LOCKED LIMIT 1`:await tx`SELECT d.* FROM fw_marketing_deliveries d LEFT JOIN fw_marketing_campaigns c ON c.id=d.campaign_id WHERE d.status='pending' AND (d.campaign_id IS NULL OR c.status IN ('queued','sending')) ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`;
   const row=rows[0];if(!row)return null;
   await tx`UPDATE fw_marketing_deliveries SET status='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes' WHERE id=${row.id}`;
   if(row.campaign_id)await tx`UPDATE fw_marketing_campaigns SET status='sending' WHERE id=${row.campaign_id} AND status='queued'`;
   return row;
  });
  if(!job)break;
  let accepted=false;
  try{
   await sql.begin(async tx=>{
    const [contact]=await tx`SELECT c.*,EXISTS(SELECT 1 FROM fw_marketing_suppressions s WHERE s.email=c.email) AS suppressed FROM fw_marketing_contacts c WHERE c.id=${job.contact_id} FOR UPDATE OF c`;
    if(!contact||(job.kind==='campaign'&&(contact.status!=='subscribed'||contact.suppressed||contact.email!==job.email))){await tx`UPDATE fw_marketing_deliveries SET status='skipped',error='Contact is no longer subscribed at this address' WHERE id=${job.id}`;return;}
    const unsub=unsubscribeUrl(contact.id);
    let subject,content;
    if(job.kind==='confirmation'){
     if(contact.status==='subscribed'){await tx`UPDATE fw_marketing_deliveries SET status='skipped',error='Already confirmed' WHERE id=${job.id}`;return;}
     const token=String(job.payload.token||'');
     const confirmation=verifyMarketingToken('confirmation',token,marketingSecret());
     if(!confirmation||confirmation.split(':')[2]!==contact.confirmation_nonce||Number(confirmation.split(':')[1])*1000<Date.now()){await tx`UPDATE fw_marketing_deliveries SET status='skipped',error='Confirmation expired or replaced' WHERE id=${job.id}`;return;}
     const confirm=`${marketingOrigin()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
     subject='Confirm your Ferroworks newsletter signup';
     content={text:`Please confirm that you want Ferroworks project updates and marketing emails.\n\nConfirm subscription: ${confirm}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.\n\nUnsubscribe: ${unsub}`,html:`<div style="font:16px/1.7 Arial;color:#193b2c;max-width:600px;margin:auto;padding:30px"><h2>Keep in the loop.</h2><p>Please confirm that you want Ferroworks project updates and marketing emails.</p><p><a href="${escapeHtml(confirm)}">Confirm my subscription</a></p><p>This link expires in 24 hours. If you didn’t sign up, ignore this email.</p><p><a href="${escapeHtml(unsub)}">Unsubscribe from marketing emails</a></p><p>Ferroworks · Brisbane, Queensland, Australia</p></div>`};
    }else{
     const [c]=job.kind==='test'?[{snapshot:job.payload,status:'test'}]:await tx`SELECT snapshot,status FROM fw_marketing_campaigns WHERE id=${job.campaign_id}`;
     if(!c?.snapshot||c.status==='paused'){await tx`UPDATE fw_marketing_deliveries SET status='pending',lease_until=NULL WHERE id=${job.id}`;return;}
     subject=(job.kind==='test'?'[Test] ':'')+c.snapshot.subject;
     content=renderCampaignEmail(c.snapshot,unsub,{name:job.name,footer:c.snapshot.footer});
    }
    const info=await transport.sendMail({from:newsletterFrom,replyTo:'newsletter@ferroworks.org',to:job.email,subject,...content,messageId:`<marketing-${job.id}@ferroworks.org>`,envelope:{from:'newsletter@ferroworks.org',to:job.email},headers:{'List-Unsubscribe':`<${marketingOrigin()}/api/marketing/unsubscribe?token=${encodeURIComponent(marketingToken('unsubscribe',contact.id,marketingSecret()))}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
    if(!info.accepted?.length)throw Error('SMTP_REJECTED');
    accepted=true;
    await tx`UPDATE fw_marketing_deliveries SET status='sent',sent_at=now(),lease_until=NULL,error='' WHERE id=${job.id}`;
   });
  }catch(error:any){
   // Connection failure/rejection can be retried explicitly. Timeouts may have
   // happened after acceptance and are intentionally not retried automatically.
   const uncertain=accepted||['ETIMEDOUT','ESOCKET','ECONNRESET'].includes(error.code);
   await sql`UPDATE fw_marketing_deliveries SET status=${uncertain?'unknown':'failed'},lease_until=NULL,error=${uncertain?'SMTP connection interrupted; delivery may have occurred.':'SMTP delivery failed. Check sender settings, then retry.'} WHERE id=${job.id} AND status='processing'`;
  }
  if(i<limit-1)await new Promise(resolve=>setTimeout(resolve,Math.max(250,Math.min(10000,Number(process.env.MARKETING_SEND_INTERVAL_MS)||1000))));
 }
 transport.close();
 const ids=campaignId?[{id:campaignId}]:await sql`SELECT id FROM fw_marketing_campaigns WHERE status IN ('sending','queued')`;
 for(const c of ids){const counts=await deliveryProgress(c.id);const pending=counts.filter(x=>['pending','processing'].includes(x.status)).reduce((s,r)=>s+r.count,0);if(!pending){const failed=counts.some(x=>['failed','unknown'].includes(x.status));await sql`UPDATE fw_marketing_campaigns SET status=${failed?'needs_attention':'sent'},sent_at=CASE WHEN ${!failed} THEN now() ELSE sent_at END WHERE id=${c.id} AND status IN ('sending','queued')`;}}
 const [remaining]=campaignId?await sql`SELECT count(*)::int AS count FROM fw_marketing_deliveries d JOIN fw_marketing_campaigns c ON c.id=d.campaign_id WHERE d.campaign_id=${campaignId} AND d.status='pending' AND c.status IN ('queued','sending')`:await sql`SELECT count(*)::int AS count FROM fw_marketing_deliveries d LEFT JOIN fw_marketing_campaigns c ON c.id=d.campaign_id WHERE d.status='pending' AND (c.id IS NULL OR c.status IN ('queued','sending'))`;
 return {remaining:remaining.count};
}
export async function runMarketingWorker(campaignId?:string){
 const result=await drainMarketingQueue({campaignId});
 if(result.remaining&&process.env.VERCEL_ENV==='production'){
  const token=marketingToken('worker',`${campaignId||'all'}:${Math.floor(Date.now()/1000)+1800}`,marketingSecret());
  await fetch(`${marketingOrigin()}/api/marketing/worker`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({campaignId})}).then(r=>{if(!r.ok)throw Error('Queue continuation failed');});
 }
 return result;
}
