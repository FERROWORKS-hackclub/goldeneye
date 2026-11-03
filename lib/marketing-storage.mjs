import { applyCampaignOperation,operationKey,operationSchema } from './marketing-validation.mjs';
import { z } from 'zod';
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export async function applyStoredCampaignOperation(sql,userId,id,input){
 const operation=operationSchema.parse(input.operation),opId=z.uuid().parse(input.operationId),base=z.number().int().min(0).parse(input.baseVersion);
 return sql.begin(async tx=>{
  const [campaign]=await tx`SELECT * FROM fw_marketing_campaigns WHERE id=${id} FOR UPDATE`;
  if(!campaign)throw problem('Campaign not found.',404);
  const [previous]=await tx`SELECT revision FROM fw_marketing_campaign_ops WHERE campaign_id=${id} AND operation_id=${opId}`;
  if(previous)return {campaign};
  if(campaign.status!=='draft')throw problem('This campaign is locked for sending. Duplicate it to make changes.',409);
  const key=operationKey(operation);
  if(Number(campaign.field_versions[key]||0)>base)return {conflict:true,campaign,key};
  let changed;try{changed=applyCampaignOperation(campaign,operation);}catch(error){throw problem(error.message,400);}
  const version=campaign.version+1,fieldVersions={...campaign.field_versions,[key]:version};
  const [updated]=await tx`UPDATE fw_marketing_campaigns SET name=${changed.name},subject=${changed.subject},preheader=${changed.preheader},blocks=${tx.json(changed.blocks)},version=${version},field_versions=${tx.json(fieldVersions)},updated_by=${userId},updated_at=now() WHERE id=${id} RETURNING *`;
  await tx`INSERT INTO fw_marketing_campaign_ops(campaign_id,operation_id,user_id,revision) VALUES(${id},${opId},${userId},${version})`;
  return {campaign:updated};
 });
}
export async function storedAudience(sql,listIds,customEmails){
 const rows=listIds.length?await sql`SELECT DISTINCT c.id,c.email,c.name,c.status,EXISTS(SELECT 1 FROM fw_marketing_suppressions s WHERE s.email=c.email) AS suppressed FROM fw_marketing_contacts c JOIN fw_marketing_memberships m ON m.contact_id=c.id WHERE m.list_id IN ${sql(listIds)}`:[];
 const custom=customEmails.length?await sql`SELECT c.id,c.email,c.name,c.status,EXISTS(SELECT 1 FROM fw_marketing_suppressions s WHERE s.email=c.email) AS suppressed FROM fw_marketing_contacts c WHERE c.email IN ${sql(customEmails)}`:[];
 const map=new Map([...rows,...custom].map(r=>[r.email,r]));
 for(const email of customEmails)if(!map.has(email)){const [s]=await sql`SELECT email FROM fw_marketing_suppressions WHERE email=${email}`;map.set(email,{email,id:null,name:'',status:'custom',suppressed:!!s});}
 return [...map.values()].sort((a,b)=>a.email.localeCompare(b.email));
}
