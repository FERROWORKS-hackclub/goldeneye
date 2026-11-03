import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/server';
import { marketingUser,json,marketingFailure,MarketingError,sameMarketingOrigin,readMarketingBody,editCampaign,researchSummary,auditMarketing,newsletterListId } from '../../../lib/marketing';
import { campaignSchema,newEmailBlock,parseEmailAudience,parseContactsCsv,renderCampaignEmail } from '../../../lib/marketing-validation.mjs';
import { campaignAudience,queueCampaign,runMarketingWorker,marketingTransport,newsletterFrom,deliveryProgress,drainMarketingQueue } from '../../../lib/marketing-mail';

export const dynamic='force-dynamic';
export const maxDuration=300;
const idSchema=z.uuid();
const audienceSchema=z.object({campaignId:z.uuid(),listIds:z.array(z.uuid()).max(50),customEmails:z.string().max(40000).default(''),customConsent:z.boolean().default(false),version:z.number().int().min(0),audienceHash:z.string().optional()});
async function lists(){return db()`SELECT l.*,(SELECT count(*)::int FROM fw_marketing_memberships m JOIN fw_marketing_contacts c ON c.id=m.contact_id WHERE m.list_id=l.id AND c.status='subscribed') AS subscribed_count,(SELECT count(*)::int FROM fw_marketing_memberships m WHERE m.list_id=l.id) AS contact_count FROM fw_marketing_lists l ORDER BY l.created_at`;}

export async function GET(request:Request){
 try{
  const user=await marketingUser(),p=new URL(request.url).searchParams;
  if(p.get('resource')==='campaign'){
   const id=idSchema.parse(p.get('id'));
   const [campaign]=await db()`SELECT c.*,u.name AS editor_name FROM fw_marketing_campaigns c LEFT JOIN fw_users u ON u.id=c.updated_by WHERE c.id=${id}`;
   if(!campaign)throw new MarketingError('Campaign not found.',404);
   const presence=await db()`SELECT p.client_id,p.user_id,p.field,u.name FROM fw_marketing_presence p JOIN fw_users u ON u.id=p.user_id WHERE p.campaign_id=${id} AND p.seen_at>now()-interval '25 seconds' AND u.active=true`;
   return json({campaign,presence,deliveries:await deliveryProgress(id)});
  }
  if(p.get('resource')==='contacts'){
   const list=p.get('list'),search=(p.get('search')||'').slice(0,160),page=Math.max(0,Math.min(100000,Number(p.get('page'))||0)),pattern=`%${search}%`;
   if(list)idSchema.parse(list);
   const contacts=list?await db()`SELECT c.*,(SELECT jsonb_agg(m.list_id) FROM fw_marketing_memberships m WHERE m.contact_id=c.id) AS list_ids FROM fw_marketing_contacts c JOIN fw_marketing_memberships m ON m.contact_id=c.id WHERE m.list_id=${list} AND (c.email ILIKE ${pattern} OR c.name ILIKE ${pattern}) ORDER BY c.created_at DESC LIMIT 100 OFFSET ${page*100}`:await db()`SELECT c.*,(SELECT jsonb_agg(m.list_id) FROM fw_marketing_memberships m WHERE m.contact_id=c.id) AS list_ids FROM fw_marketing_contacts c WHERE c.email ILIKE ${pattern} OR c.name ILIKE ${pattern} ORDER BY c.created_at DESC LIMIT 100 OFFSET ${page*100}`;
   return json({contacts,lists:await lists(),page,hasMore:contacts.length===100});
  }
  if(p.get('resource')==='research'){
   const page=Math.max(0,Math.min(100000,Number(p.get('page'))||0)),search=(p.get('search')||'').slice(0,160),pattern=`%${search}%`;
   const responses=await db()`SELECT * FROM fw_research_responses WHERE name ILIKE ${pattern} OR email ILIKE ${pattern} ORDER BY created_at DESC LIMIT 100 OFFSET ${page*100}`;
   return json({responses,summary:await researchSummary(),page,hasMore:responses.length===100});
  }
  const campaigns=await db()`SELECT c.id,c.name,c.subject,c.preheader,c.status,c.version,c.updated_at,c.created_at,c.audience,u.name AS editor_name,(SELECT count(*)::int FROM fw_marketing_deliveries d WHERE d.campaign_id=c.id AND d.status='sent') AS sent_count FROM fw_marketing_campaigns c LEFT JOIN fw_users u ON u.id=c.updated_by ORDER BY c.updated_at DESC LIMIT 200`;
  const [counts]=await db()`SELECT count(*)::int AS contacts,count(*) FILTER(WHERE status='subscribed')::int AS subscribed,count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE status='unsubscribed')::int AS unsubscribed FROM fw_marketing_contacts`;
  const [settings]=await db()`SELECT settings FROM fw_marketing_settings WHERE id=1`;
  const [research]=await db()`SELECT count(*)::int AS count FROM fw_research_responses`;
  const [queue]=await db()`SELECT count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE status='unknown')::int AS uncertain,count(*) FILTER(WHERE status='failed')::int AS failed FROM fw_marketing_deliveries`;
  return json({user,campaigns,lists:await lists(),counts,research:research.count,queue,settings:settings?.settings||{},sender:newsletterFrom,smtpConfigured:!!((process.env.MARKETING_SMTP_PASSWORD||process.env.SMTP_PASSWORD)&&(process.env.MARKETING_SMTP_HOST||process.env.SMTP_HOST))});
 }catch(error){return marketingFailure(error);}
}

export async function POST(request:Request){
 try{
  if(!sameMarketingOrigin(request))throw new MarketingError('Invalid request origin.',403);
  const user=await marketingUser(),input=await readMarketingBody(request);
  const action=z.string().parse(input.action);
  if(action==='create-campaign'){
   const name=z.string().trim().min(1).max(160).parse(input.name||'Untitled campaign'),id=randomUUID();
   const source=input.duplicateId?(await db()`SELECT * FROM fw_marketing_campaigns WHERE id=${idSchema.parse(input.duplicateId)}`)[0]:null;
   const blocks=source?.blocks||[newEmailBlock('heading',randomUUID()),newEmailBlock('text',randomUUID()),newEmailBlock('button',randomUUID())];
   const [campaign]=await db()`INSERT INTO fw_marketing_campaigns(id,name,subject,preheader,blocks,created_by,updated_by) VALUES(${id},${name},${source?.subject||''},${source?.preheader||''},${db().json(blocks)},${user.id},${user.id}) RETURNING *`;
   await auditMarketing(db(),user.id,'campaign.created',id);return json({campaign});
  }
  if(action==='edit-campaign'){
   const result=await editCampaign(user,idSchema.parse(input.campaignId),input);return json(result,result.conflict?409:200);
  }
  if(action==='presence'){
   const id=idSchema.parse(input.campaignId),clientId=idSchema.parse(input.clientId),field=z.string().max(180).parse(input.field||'');
   await db()`INSERT INTO fw_marketing_presence(campaign_id,client_id,user_id,field) VALUES(${id},${clientId},${user.id},${field}) ON CONFLICT(campaign_id,client_id) DO UPDATE SET user_id=EXCLUDED.user_id,field=EXCLUDED.field,seen_at=now()`;
   return json({ok:true});
  }
  if(action==='save-list'){
   const data=z.object({id:z.uuid().optional(),name:z.string().trim().min(1).max(100),description:z.string().trim().max(500).default('')}).parse(input);
   const id=data.id||randomUUID();
   if(data.id)await db()`UPDATE fw_marketing_lists SET name=${data.name},description=${data.description} WHERE id=${id}`;
   else await db()`INSERT INTO fw_marketing_lists(id,name,description,created_by) VALUES(${id},${data.name},${data.description},${user.id})`;
   await auditMarketing(db(),user.id,'list.saved',id);return json({id});
  }
  if(action==='save-contact'||action==='import-contacts'){
   const listIds=z.array(z.uuid()).max(50).parse(input.listIds||[]),consent=z.boolean().parse(input.consent||false);
   const source=z.string().trim().max(500).parse(input.consentSource||'');
   if(consent&&!source)throw new MarketingError('Describe where permission to send marketing emails came from.');
   const rows:Array<{id?:string;email:string;name:string}>=action==='import-contacts'?parseContactsCsv(z.string().parse(input.csv)):[z.object({id:z.uuid().optional(),email:z.email().trim().toLowerCase().max(254),name:z.string().trim().max(160).default('')}).parse(input)];
   await db().begin(async tx=>{
    for(const row of rows){
     const [suppressed]=await tx`SELECT email FROM fw_marketing_suppressions WHERE email=${row.email}`;
     let [contact]=row.id?await tx`SELECT * FROM fw_marketing_contacts WHERE id=${row.id} FOR UPDATE`:await tx`SELECT * FROM fw_marketing_contacts WHERE email=${row.email} FOR UPDATE`;
     if(row.id&&!contact)throw new MarketingError('Contact not found.',404);
       if(row.id&&input.expectedUpdatedAt&&new Date(String(input.expectedUpdatedAt)).getTime()!==new Date(contact.updated_at).getTime())throw new MarketingError('This contact was changed by another staff member. Refresh before saving.',409);
     const id=contact?.id||randomUUID();
     const status=suppressed||contact?.status==='unsubscribed'?'unsubscribed':consent?'subscribed':contact?.status||'pending';
     if(contact)await tx`UPDATE fw_marketing_contacts SET email=${row.email},name=${row.name},status=${status},consent_source=${consent?source:contact.consent_source},consent_at=${consent?new Date():contact.consent_at},updated_at=now() WHERE id=${id}`;
     else await tx`INSERT INTO fw_marketing_contacts(id,email,name,status,consent_source,consent_at) VALUES(${id},${row.email},${row.name},${status},${consent?source:''},${consent?new Date():null})`;
     if(row.id)await tx`DELETE FROM fw_marketing_memberships WHERE contact_id=${id}`;
     for(const listId of listIds)await tx`INSERT INTO fw_marketing_memberships(list_id,contact_id) VALUES(${listId},${id}) ON CONFLICT DO NOTHING`;
     await auditMarketing(tx,user.id,'contact.saved',id,{consent,source});
    }
   });return json({saved:rows.length});
  }
  if(action==='remove-membership'){
   const id=idSchema.parse(input.contactId),listId=idSchema.parse(input.listId);await db()`DELETE FROM fw_marketing_memberships WHERE contact_id=${id} AND list_id=${listId}`;
   await auditMarketing(db(),user.id,'list.contact_removed',listId,{contactId:id});return json({ok:true});
  }
  if(action==='review-audience'){
   const data=audienceSchema.parse(input);const [campaign]=await db()`SELECT * FROM fw_marketing_campaigns WHERE id=${data.campaignId}`;
   if(!campaign||campaign.status!=='draft'||campaign.version!==data.version)throw new MarketingError('Save the latest draft before reviewing recipients.',409);
   if(!campaign.subject.trim()||!campaign.blocks.length)throw new MarketingError('Add a subject and email content first.');
   const custom=parseEmailAudience(data.customEmails);if(custom.length&&!data.customConsent)throw new MarketingError('Confirm permission to email custom recipients.');
   const audience=await campaignAudience(db(),data.listIds,custom);
   return json({eligible:audience.eligible.length,excluded:audience.excluded,total:audience.total,hash:audience.hash,version:campaign.version,sender:newsletterFrom,subject:campaign.subject});
  }
  if(action==='send-campaign'){
   const data=audienceSchema.extend({audienceHash:z.string().length(64)}).parse(input);
   // Check configuration before freezing a draft or creating delivery jobs.
   const transport=marketingTransport();transport.close();
   const result=await queueCampaign(user,data.campaignId,data);after(()=>runMarketingWorker(data.campaignId).catch(()=>console.error('Marketing worker continuation failed')));
   return json(result,202);
  }
  if(action==='pause'||action==='resume'||action==='retry-failed'){
   const id=idSchema.parse(input.campaignId);
   await db().begin(async tx=>{
    const [c]=await tx`SELECT * FROM fw_marketing_campaigns WHERE id=${id} FOR UPDATE`;if(!c)throw new MarketingError('Campaign not found.',404);
    if(action==='pause'&&['queued','sending'].includes(c.status))await tx`UPDATE fw_marketing_campaigns SET status='paused' WHERE id=${id}`;
    if(action==='resume'&&c.status==='paused')await tx`UPDATE fw_marketing_campaigns SET status='queued' WHERE id=${id}`;
    if(action==='retry-failed'&&c.status==='needs_attention'){
     await tx`UPDATE fw_marketing_deliveries SET status='pending',error='' WHERE campaign_id=${id} AND status='failed' AND attempts<3`;
     await tx`UPDATE fw_marketing_campaigns SET status='queued' WHERE id=${id}`;
    }
    await auditMarketing(tx,user.id,`campaign.${action}`,id);
   });if(action!=='pause')after(()=>runMarketingWorker(id).catch(()=>console.error('Marketing worker continuation failed')));return json({ok:true});
  }
  if(action==='test-campaign'){
   const id=idSchema.parse(input.campaignId);const [campaign]=await db()`SELECT * FROM fw_marketing_campaigns WHERE id=${id}`;
   if(!campaign)throw new MarketingError('Campaign not found.',404);const snapshot=campaignSchema.parse(campaign);if(!snapshot.subject.trim())throw new MarketingError('Add a subject first.');
   const [settings]=await db()`SELECT settings FROM fw_marketing_settings WHERE id=1`;
   // Tests go only to the authenticated staff member, never an arbitrary address.
   const [contact]=await db()`INSERT INTO fw_marketing_contacts(id,email,name,status,consent_source) VALUES(${randomUUID()},${user.email.toLowerCase()},${user.name},'pending','Staff preview only; not subscribed') ON CONFLICT(email) DO UPDATE SET updated_at=fw_marketing_contacts.updated_at RETURNING *`;
   const deliveryId=randomUUID();await db()`INSERT INTO fw_marketing_deliveries(id,contact_id,email,name,kind,payload) VALUES(${deliveryId},${contact.id},${user.email},${user.name},'test',${db().json({...snapshot,footer:settings?.settings?.footer})})`;
   await drainMarketingQueue({deliveryId,limit:1});
   const [delivery]=await db()`SELECT status,error FROM fw_marketing_deliveries WHERE id=${deliveryId}`;
   if(delivery.status!=='sent')throw new MarketingError(delivery.error||'The test could not be delivered.',502);
   return json({ok:true,email:user.email});
  }
  if(action==='save-settings'){
   const settings=z.object({footer:z.string().trim().min(5).max(500)}).parse(input.settings);
   await db()`UPDATE fw_marketing_settings SET settings=${db().json(settings)},updated_at=now() WHERE id=1`;
   await auditMarketing(db(),user.id,'settings.saved','1');return json({ok:true});
  }
  if(action==='verify-smtp'){const transport=marketingTransport();try{await transport.verify();}finally{transport.close();}return json({ok:true,sender:newsletterFrom});}
  throw new MarketingError('Unknown marketing action.');
 }catch(error:any){if(error?.code==='23505')return json({error:'This email or record already exists.'},409);return marketingFailure(error);}
}
