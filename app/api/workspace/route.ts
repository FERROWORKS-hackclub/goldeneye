import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {auth,configured} from '../../../lib/auth';
import {db,management} from '../../../lib/server';
import {operationSchemas} from '../../../lib/operation-schemas';
import {jobCost} from '../../../lib/operations.mjs';
import {can,cents} from '../../../lib/policy.mjs';
import {isTrustedOrigin} from '../../../lib/trusted-origins.mjs';
export const dynamic='force-dynamic';
const roles=z.enum(['admin','manager','member','finance','viewer']);
const text=z.string().trim().min(1).max(200);
const schemas={
 ...operationSchemas,
 projects:z.object({name:text,description:z.string().max(3000).default(''),status:z.enum(['Planning','In progress','Completed']),due:z.iso.date(),owner:text,budget:z.number().min(0).max(1000000000),budgetUsd:z.number().min(0).max(1000000000).default(0)}),
 tasks:z.object({name:text,projectId:z.uuid(),status:z.enum(['To do','In progress','Done']),priority:z.enum(['Low','Medium','High']),assignee:text,due:z.iso.date()}),
 transactions:z.object({name:text,type:z.enum(['Income','Expense']),amount:z.number().positive().max(1000000000),category:text,date:z.iso.date(),status:z.enum(['Pending','Paid']),reference:z.string().max(200).default(''),projectId:z.union([z.uuid(),z.literal('')]).default('')}),
 links:z.object({name:text,url:z.url().refine(v=>new URL(v).protocol==='https:','Use an HTTPS address'),category:text,description:z.string().max(500).default('')})
};
async function identity(){
 if(!configured) throw new Error('SETUP');
 const session=await auth().getSession(); if(!session) throw new Error('UNAUTHORIZED');
 const [user]=await db()`SELECT id,email,name,role,active,onboarding_completed,invited_at FROM fw_users WHERE id=${session.user.sub}`;
 if(!user?.active){if(user){const [request]=await db()`SELECT status FROM fw_join_requests WHERE user_id=${user.id}`;if(request?.status==='Pending')throw new Error('PENDING');if(request?.status==='Denied')throw new Error('DENIED');}throw new Error('FORBIDDEN');} return user;
}
function failure(e:unknown){const message=e instanceof Error?e.message:'Request failed'; const status=message==='UNAUTHORIZED'?401:['FORBIDDEN','PENDING','DENIED'].includes(message)?403:message==='SETUP'?503:e instanceof z.ZodError?400:message.startsWith('Invalid')||message.startsWith('Cannot')?400:500; console.error('Workspace request:',status, e instanceof z.ZodError?'validation failed':message);return NextResponse.json({error:message==='PENDING'?'Your signup is awaiting approval from an admin or manager.':message==='DENIED'?'Your signup request was denied. Contact an admin or manager.':status===500?'Operation failed. Check server configuration and try again.':message},{status});}
export async function GET(){try{const u=await identity();const records=await db()`SELECT id,kind,data,updated_at FROM fw_records ORDER BY created_at DESC`;const result:Record<string,unknown>={me:u,projects:[],tasks:[],transactions:[],links:[]};for(const kind of Object.keys(schemas)) if(can(u.role,kind))result[kind]=records.filter(r=>r.kind===kind).map(r=>({id:r.id,...r.data}));
 if(['admin','manager'].includes(u.role)){result.users=await db()`SELECT u.id,u.email,u.name,u.role,u.active,u.onboarding_completed,u.invited_at FROM fw_users u WHERE NOT EXISTS (SELECT 1 FROM fw_join_requests r WHERE r.user_id=u.id AND r.status IN ('Pending','Denied')) ORDER BY u.name`;}if(u.role==='admin')result.audit=await db()`SELECT * FROM fw_audit ORDER BY id DESC LIMIT 100`;
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 if(!isTrustedOrigin(req.headers.get('origin'))) return NextResponse.json({error:'Invalid request origin'},{status:403});
 const u=await identity();const input=z.object({kind:z.enum(['projects','tasks','transactions','links','users','filament','jobs','quotes','orders','allocations','bom','changes','firmware','test_runs','issues']),action:z.enum(['create','update','delete','convert','invite','onboard','consume']),id:z.string().max(200).optional(),data:z.record(z.string(),z.unknown()).default({})}).parse(await req.json());
 const {kind,action,id}=input;if(action==='onboard'){if(kind!=='users'||id!==u.id)throw new Error('FORBIDDEN');await db()`UPDATE fw_users SET onboarding_completed=true WHERE id=${u.id}`;return NextResponse.json({ok:true});}if(!can(u.role,kind,true))throw new Error('FORBIDDEN'); if(action!=='create'&&!id)throw new Error('Invalid record ID');
 if(kind==='users'){
  if(action==='invite'){const [target]=await db()`SELECT email,active FROM fw_users WHERE id=${id!}`;if(!target?.active)throw new Error('Invalid active user');const [recent]=await db()`SELECT id FROM fw_users WHERE id=${id!} AND invited_at>now()-interval '60 seconds'`;if(recent)throw new Error('Cannot resend yet; wait one minute');await sendInvite(target.email);await db()`UPDATE fw_users SET invited_at=now() WHERE id=${id!}`;await db()`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},'users.invite',${id!})`;return NextResponse.json({ok:true,notice:'Password setup email requested. Ask the user to check their inbox and spam folder.'});}
  if(action==='delete')throw new Error('Cannot delete users; deactivate the account instead');
  if(action==='create'){
   const data=z.object({email:z.email(),name:text,role:roles}).parse(input.data);const password=randomBytes(24).toString('base64url')+'aA1!';
   const remote=await management('users','POST',{email:data.email,name:data.name,password,connection:process.env.AUTH0_CONNECTION||'Username-Password-Authentication',email_verified:false,verify_email:false});
   try{await db().begin(async sql=>{await sql`INSERT INTO fw_users (id,email,name,role) VALUES (${remote.user_id},${data.email.toLowerCase()},${data.name},${data.role})`;await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},'users.create',${remote.user_id})`;});}catch(e){await management(`users/${encodeURIComponent(remote.user_id)}`,'DELETE');throw e;}
   let notice='';try{await sendInvite(data.email);await db()`UPDATE fw_users SET invited_at=now() WHERE id=${remote.user_id}`;notice='Password setup email requested.';}catch{notice='Account created, but the setup email failed. Use Send setup email to retry, or share the temporary password securely.';}return NextResponse.json({ok:true,temporaryPassword:password,email:data.email,notice});
  }
  const data=z.object({role:roles,active:z.boolean()}).parse(input.data);
  await db().begin(async sql=>{await sql`SELECT pg_advisory_xact_lock(749183)`;const [target]=await sql`SELECT * FROM fw_users WHERE id=${id!}`;if(!target)throw new Error('Invalid user');if(id===u.id&&(!data.active||data.role!=='admin'))throw new Error('Cannot remove your own administrator access');const [count]=await sql`SELECT count(*)::int AS n FROM fw_users WHERE role='admin' AND active=true`;if(target.role==='admin'&&target.active&&count.n<=1&&(!data.active||data.role!=='admin'))throw new Error('Cannot remove the last administrator');await sql`UPDATE fw_users SET role=${data.role},active=${data.active} WHERE id=${id!}`;await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},'users.update',${id!})`;});return NextResponse.json({ok:true});
 }
 if(action==='consume'){
  if(kind!=='orders')throw new Error('Invalid stock action');
  await db().begin(async sql=>{
   const [order]=await sql`SELECT data FROM fw_records WHERE id=${id!} AND kind='orders' FOR UPDATE`;
   if(!order||order.data.status==='Cancelled')throw new Error('Invalid active order');
   if(order.data.stockUsed)throw new Error('Cannot deduct filament twice');
   const [job]=await sql`SELECT data FROM fw_records WHERE id=${order.data.jobId} AND kind='jobs' FOR SHARE`;
   if(!job?.data.filamentId)throw new Error('Cannot deduct: choose a filament spool on the job first');
   const [spool]=await sql`SELECT data FROM fw_records WHERE id=${job.data.filamentId} AND kind='filament' FOR UPDATE`;
   const grams=Math.round(job.data.grams*order.data.quantity*100)/100;
   if(!spool||!Number.isFinite(grams)||grams<=0||spool.data.remainingGrams<grams)throw new Error('Cannot deduct: insufficient filament stock');
   await sql`UPDATE fw_records SET data=data || ${sql.json({remainingGrams:Math.round((spool.data.remainingGrams-grams)*100)/100})},updated_at=now() WHERE id=${job.data.filamentId}`;
   await sql`UPDATE fw_records SET data=data || ${sql.json({stockUsed:{filamentId:job.data.filamentId,grams,at:new Date().toISOString()}})},updated_at=now() WHERE id=${id!}`;
   await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},'orders.consume',${id!})`;
  });return NextResponse.json({ok:true,notice:'Filament deducted from stock.'});
 }
 if(action==='convert'){if(kind!=='quotes')throw new Error('Invalid conversion');const orderId=randomUUID();await db().begin(async sql=>{const [quote]=await sql`SELECT data FROM fw_records WHERE id=${id!} AND kind='quotes' FOR UPDATE`;if(!quote||quote.data.status!=='Accepted')throw new Error('Cannot convert: accept the quote first');if(quote.data.orderId)throw new Error('Cannot convert this quote twice');const data={...quote.data,status:'New',quoteId:id};await sql`INSERT INTO fw_records(id,kind,data,created_by) VALUES (${orderId},'orders',${sql.json(data)},${u.id})`;await sql`UPDATE fw_records SET data=data || ${sql.json({orderId})},updated_at=now() WHERE id=${id!}`;await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},'quotes.convert',${id!})`;});return NextResponse.json({ok:true});}
 if(!['create','update','delete'].includes(action))throw new Error('Invalid action');
 const recordId=action==='create'?randomUUID():z.uuid().parse(id);
 let data:Record<string,unknown>={}; if(action!=='delete'){data=schemas[kind].parse(input.data);if(kind==='jobs')Object.assign(data,jobCost(data));if(kind==='quotes'||kind==='orders'){data.totalCents=Math.round(Number(data.unitPrice)*100)*Number(data.quantity);if(!Number.isSafeInteger(data.totalCents))throw new Error('Invalid total');}if(kind==='allocations'){const response=await fetch(`https://hcb.hackclub.com/api/v3/transactions/${data.transactionId}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Invalid HCB transaction');const remote=await response.json();if(remote.organization?.id!=='org_mqupky'||!Number.isSafeInteger(remote.amount_cents))throw new Error('Invalid HCB organization');Object.assign(data,{amountCents:remote.amount_cents,date:remote.date,currency:'USD',syncedAt:new Date().toISOString()});}if(kind==='transactions'){data.amountCents=cents(data.amount);delete data.amount;}}
 await db().begin(async sql=>{
 if(action!=='delete'&&data.projectId){const [project]=await sql`SELECT id FROM fw_records WHERE kind='projects' AND id=${data.projectId as string} FOR SHARE`;if(!project)throw new Error('Invalid project');}
 if(action!=='delete'&&data.filamentId){const [spool]=await sql`SELECT id FROM fw_records WHERE kind='filament' AND id=${data.filamentId as string} FOR SHARE`;if(!spool)throw new Error('Invalid filament');}
 if(action!=='delete'&&data.jobId){const [job]=await sql`SELECT id FROM fw_records WHERE kind='jobs' AND id=${data.jobId as string} FOR SHARE`;if(!job)throw new Error('Invalid job');}
 if(kind==='allocations'&&action!=='delete'){await sql`SELECT pg_advisory_xact_lock(749184)`;const [duplicate]=await sql`SELECT id FROM fw_records WHERE kind='allocations' AND data->>'transactionId'=${data.transactionId as string} AND id<>${recordId}`;if(duplicate)throw new Error('Cannot allocate an HCB transaction twice');}
 if(kind==='tasks'&&action!=='delete'){const [p]=await sql`SELECT id FROM fw_records WHERE id=${data.projectId as string} AND kind='projects' FOR SHARE`;if(!p)throw new Error('Invalid project');}
 if(action==='create')await sql`INSERT INTO fw_records(id,kind,data,created_by) VALUES (${recordId},${kind},${sql.json(data as never)},${u.id})`;
 else {const [r]=await sql`SELECT id,data FROM fw_records WHERE id=${recordId} AND kind=${kind} FOR UPDATE`;if(!r)throw new Error('Invalid record');if(action==='update'&&kind==='quotes'&&r.data.orderId)throw new Error('Cannot edit a converted quote');if(action==='update'&&kind==='orders'){if(r.data.quoteId)data.quoteId=r.data.quoteId;if(r.data.stockUsed){if(data.jobId!==r.data.jobId||data.quantity!==r.data.quantity)throw new Error('Cannot change the job or quantity after deducting stock');data.stockUsed=r.data.stockUsed;}}if(action==='delete'){const [linked]=await sql`SELECT id FROM fw_records WHERE (data->>'projectId'=${recordId} OR data->>'jobId'=${recordId} OR data->>'filamentId'=${recordId} OR data->>'quoteId'=${recordId} OR data->>'orderId'=${recordId}) LIMIT 1`;if(linked)throw new Error('Cannot delete a record with linked records');if(kind==='projects'){const [dependent]=await sql`SELECT id FROM fw_records WHERE kind='tasks' AND data->>'projectId'=${recordId} LIMIT 1`;if(dependent)throw new Error('Cannot delete a project with tasks');}await sql`DELETE FROM fw_records WHERE id=${recordId}`;}else await sql`UPDATE fw_records SET data=${sql.json(data as never)},updated_at=now() WHERE id=${recordId}`;}
 await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${u.id},${kind+'.'+action},${recordId})`;
 });return NextResponse.json({ok:true});
 }catch(e){return failure(e);}}

async function sendInvite(email:string){const domain=process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//,'').replace(/\/$/,'');if(!domain)throw new Error('SETUP');const response=await fetch(`https://${domain}/dbconnections/change_password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.AUTH0_CLIENT_ID,email,connection:process.env.AUTH0_CONNECTION||'Ferrowork-Users'}),signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('Setup email unavailable');}
