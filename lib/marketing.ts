import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { auth,configured } from './auth';
import { db } from './server';
import { marketingStaff,operationSchema,operationKey,applyCampaignOperation,browserDetails,surveyAnswersSchema } from './marketing-validation.mjs';
import { marketingToken,verifyMarketingToken } from './marketing-tokens.mjs';
import { applyStoredCampaignOperation,unsubscribeStoredContact } from './marketing-storage.mjs';

export const newsletterListId='44b7ce99-d432-4b72-8e90-9c943157f1ac';
export const marketingOrigin=()=> (process.env.MARKETING_BASE_URL||'https://goldeneye.ferroworks.org').replace(/\/$/,'');
export const marketingSecret=()=>process.env.MARKETING_TOKEN_SECRET||process.env.BETTER_AUTH_SECRET||process.env.NEXTAUTH_SECRET||'';
export const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export class MarketingError extends Error {constructor(message:string,public status=400){super(message);}}
export async function marketingUser(){
 if(!configured)throw new MarketingError('Sign-in is not configured.',503);
 const session=await auth().getSession();if(!session)throw new MarketingError('Sign in to Ferrowork to continue.',401);
 const [user]=await db()`SELECT id,email,name,role FROM fw_users WHERE id=${session.user.sub} AND active=true`;
 if(!user||!marketingStaff(user.role))throw new MarketingError('This workspace is available to staff only.',403);
 return user;
}
export function sameMarketingOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&new URL(request.url).origin===origin;}
export function publicCors(request:Request){
 const origin=request.headers.get('origin')||'';
 const origins=['https://ferroworks.org','https://www.ferroworks.org',marketingOrigin()];
 if(process.env.NODE_ENV!=='production')origins.push('http://127.0.0.1:4173','http://127.0.0.1:3000','http://localhost:4173');
 return origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}:null;
}
export async function readMarketingBody(request:Request,max=200000){
 if(Number(request.headers.get('content-length')||0)>max)throw new MarketingError('This request is too large.',413);
 const text=await request.text();if(Buffer.byteLength(text)>max)throw new MarketingError('This request is too large.',413);
 try{return JSON.parse(text);}catch{throw new MarketingError('Send valid JSON.');}
}
export function marketingFailure(error:unknown,headers:Record<string,string>={}){
 if(error instanceof MarketingError)return json({error:error.message},error.status,headers);
 if(error instanceof z.ZodError)return json({error:error.issues[0]?.message||'Check the entered details.'},400,headers);
 console.error('Marketing request failed',error instanceof Error?error.name:'Unknown error');
 return json({error:'The request could not be completed. Please try again.'},500,headers);
}
export async function auditMarketing(sql:any,actor:string|null,event:string,target:string,detail:any={}){await sql`INSERT INTO fw_marketing_audit(actor,event,target,detail) VALUES(${actor},${event},${target},${sql.json(detail)})`;}
export const unsubscribeUrl=(id:string)=>`${marketingOrigin()}/unsubscribe?token=${encodeURIComponent(marketingToken('unsubscribe',id,marketingSecret()))}`;
export function unsubscribeContactId(token:string){const id=verifyMarketingToken('unsubscribe',token,marketingSecret());return id&&z.uuid().safeParse(id).success?id:null;}
export async function unsubscribeContact(token:string){
 const id=unsubscribeContactId(token);if(!id)throw new MarketingError('This unsubscribe link is not valid. Contact newsletter@ferroworks.org for help.',400);
 try{await unsubscribeStoredContact(db(),id);}catch(error:any){if(error.status)throw new MarketingError(error.message,error.status);throw error;}
}
export async function confirmSubscription(token:string){
 const value=verifyMarketingToken('confirmation',token,marketingSecret());if(!value)throw new MarketingError('This confirmation link is invalid. Please sign up again.');
 const [id,expiry,nonce]=value.split(':');
 if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(nonce).success||Number(expiry)*1000<Date.now())throw new MarketingError('This confirmation link has expired. Please sign up again.');
 await db().begin(async tx=>{
  const [c]=await tx`SELECT * FROM fw_marketing_contacts WHERE id=${id} FOR UPDATE`;
  if(!c||c.confirmation_nonce!==nonce)throw new MarketingError('This confirmation link has been replaced. Use the newest email.');
  if(c.confirmed_at&&c.status==='subscribed')return;
  await tx`UPDATE fw_marketing_contacts SET status='subscribed',confirmed_at=now(),consent_at=now(),unsubscribed_at=NULL,updated_at=now() WHERE id=${id}`;
  await tx`DELETE FROM fw_marketing_suppressions WHERE email=${c.email}`;
  await auditMarketing(tx,null,'contact.confirmed',id);
 });
}
export function requestMetadata(request:Request,reported:any={}){
 const h=request.headers;
 const ipRaw=process.env.VERCEL?h.get('x-vercel-forwarded-for')||h.get('x-forwarded-for')||'':'';
 const ip=ipRaw.split(',')[0].trim();
 const decode=(s:string|null)=>{try{return decodeURIComponent(s||'').slice(0,100);}catch{return '';}};
 return {...browserDetails(h.get('user-agent')),ip:isIP(ip)?ip:'',country:process.env.VERCEL?decode(h.get('x-vercel-ip-country')):'',region:process.env.VERCEL?decode(h.get('x-vercel-ip-country-region')):'',city:process.env.VERCEL?decode(h.get('x-vercel-ip-city')):'',timezone:String(reported.timezone||'').slice(0,80),language:String(reported.language||'').slice(0,50),screen:String(reported.screen||'').slice(0,40),locationSource:'IP estimate; may reflect a VPN or shared network'};
}
export async function publicRateLimit(request:Request,browserId:string,kind:string){
 const metadata=requestMetadata(request);const period=Math.floor(Date.now()/3600000);
 // Raw addresses are never used as rate-limit keys or written to application logs.
 const fingerprint=createHash('sha256').update(`${marketingSecret()}:${metadata.ip||browserId}:${kind}:${period}`).digest('hex');
 const [row]=await db()`INSERT INTO fw_marketing_rate_limits(key,expires_at) VALUES(${fingerprint},now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET count=fw_marketing_rate_limits.count+1 RETURNING count`;
 if(row.count>(kind==='survey'?8:6))throw new MarketingError('Too many submissions. Please try again in an hour.',429);
}
export async function pendingSubscriber(sql:any,input:any,source:string){
 let [contact]=await sql`SELECT * FROM fw_marketing_contacts WHERE email=${input.email} FOR UPDATE`;
 if(!contact){const id=randomUUID();[contact]=await sql`INSERT INTO fw_marketing_contacts(id,email,name,consent_source,signup_metadata) VALUES(${id},${input.email},${input.name},${source},${sql.json(input.auditMetadata||{})}) ON CONFLICT(email) DO UPDATE SET updated_at=fw_marketing_contacts.updated_at RETURNING *`;}
 await sql`INSERT INTO fw_marketing_memberships(list_id,contact_id) VALUES(${newsletterListId},${contact.id}) ON CONFLICT DO NOTHING`;
 if(contact.status==='subscribed')return null;
 if(contact.confirmation_expires_at&&new Date(contact.confirmation_expires_at).getTime()>Date.now()+23.75*3600000)return null;
 const nonce=randomUUID(),expires=Math.floor(Date.now()/1000)+86400;
 const token=marketingToken('confirmation',`${contact.id}:${expires}:${nonce}`,marketingSecret());
 await sql`UPDATE fw_marketing_contacts SET name=${input.name},confirmation_nonce=${nonce},confirmation_expires_at=${new Date(expires*1000)},consent_source=${source},updated_at=now() WHERE id=${contact.id}`;
 const id=randomUUID();
 await sql`INSERT INTO fw_marketing_deliveries(id,contact_id,email,name,kind,payload) VALUES(${id},${contact.id},${contact.email},${input.name},'confirmation',${sql.json({token})})`;
 return id;
}
export async function savePublicSurvey(input:any,request:Request){
 return db().begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext(${input.requestId}))`;
  const [existing]=await tx`SELECT id FROM fw_research_responses WHERE request_id=${input.requestId}`;if(existing)return {id:existing.id,confirmation:null};
  const id=randomUUID(),metadata=requestMetadata(request,input.metadata);
  await tx`INSERT INTO fw_research_responses(id,request_id,name,email,answers,newsletter_consent,browser_id,metadata) VALUES(${id},${input.requestId},${input.name},${input.email},${tx.json(surveyAnswersSchema.parse(input.answers))},${input.newsletterConsent},${input.browserId},${tx.json(metadata)})`;
  const confirmation=input.newsletterConsent?await pendingSubscriber(tx,{...input,auditMetadata:{...metadata,browserId:input.browserId}},'Public FERROWORKER survey; explicit opt-in'):null;
  return {id,confirmation};
 });
}
export async function editCampaign(user:any,id:string,input:any){
 try{return await applyStoredCampaignOperation(db(),user.id,id,input);}catch(error:any){if(error.status)throw new MarketingError(error.message,error.status);throw error;}
}
export async function researchSummary(){
 const [total]=await db()`SELECT count(*)::int AS count,count(*) FILTER(WHERE newsletter_consent)::int AS opted_in,avg((answers->>'shippingDays')::numeric) AS average_shipping,avg((answers->>'price')::numeric) AS average_price,count(DISTINCT browser_id)::int AS browsers FROM fw_research_responses`;
 const answers=await db()`SELECT e.key,choice.value AS label,count(*)::int AS count FROM fw_research_responses r CROSS JOIN LATERAL jsonb_each(r.answers) e CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.value)='array' THEN e.value ELSE jsonb_build_array(e.value) END) choice WHERE e.key NOT IN ('make','filamentOther','woodOther') GROUP BY e.key,choice.value ORDER BY count(*) DESC`;
 const metadata=await db()`SELECT e.key,COALESCE(NULLIF(e.value,''),'Unknown') AS label,count(*)::int AS count FROM fw_research_responses r CROSS JOIN LATERAL jsonb_each_text(r.metadata) e WHERE e.key IN ('country','city','region','browser','device','os') GROUP BY e.key,e.value ORDER BY count(*) DESC`;
 const daily=await db()`SELECT (created_at AT TIME ZONE 'Australia/Adelaide')::date::text AS date,count(*)::int AS count FROM fw_research_responses GROUP BY 1 ORDER BY 1`;
 const groups:Record<string,any[]>={};for(const row of [...answers,...metadata]){const entry={label:row.label,count:row.count,percent:total.count?Math.round(row.count/total.count*1000)/10:0};(groups[row.key]??=[]).push(entry);}
 return {count:Number(total.count),opted_in:Number(total.opted_in),browsers:Number(total.browsers),average_shipping:Number(total.average_shipping||0),average_price:Number(total.average_price||0),groups,daily};
}
