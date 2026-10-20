import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '../../../lib/server';
import {ferroModels,effectiveLimits,limitReason} from '../../../lib/ferroai-models.mjs';
import {searchSources,liveSearchQuery,generationMessages} from '../../../lib/ferroai-search.mjs';
import {FerroError,ferroIdentity,ferroSettings,countsFor,ferroFailure,checkOrigin,providerKey,encryptKey,settingsSchema} from '../../../lib/ferroai';
export const dynamic='force-dynamic';
export const maxDuration=120;
const endpoint='https://ai.hackclub.com/proxy/v1';
export async function GET(){try{
 const user=await ferroIdentity(),{settings,cipher}=await ferroSettings();
 const counts=await countsFor(user.id),limits=effectiveLimits(settings,user);
 const response:Record<string,unknown>={user:{id:user.id,name:user.name,role:user.role},enabled:settings.enabled,access:settings.allowedRoles.includes(user.role),models:ferroModels.filter(model=>settings.allowedModels.includes(model.id)),limits,counts,keyConfigured:!!cipher||!!process.env.HC_AI_API_KEY};
 if(user.role==='admin'){response.settings=settings;response.users=await db()`SELECT id,name,email,role FROM fw_users WHERE active=true ORDER BY name`;response.usage=await db()`SELECT u.name,u.role,count(r.id)::int AS requests,coalesce(sum(r.tokens),0)::int AS tokens FROM fw_users u LEFT JOIN fw_ai_requests r ON r.user_id=u.id AND r.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' GROUP BY u.id ORDER BY requests DESC`;}
 return Response.json(response,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return ferroFailure(error)}}
const requestSchema=z.object({action:z.literal('generate'),model:z.string().max(150),chatId:z.uuid().optional(),message:z.string().trim().min(1).max(64000)});
export async function POST(request:Request){let requestId:string|undefined,savedChatId:string|undefined,savedModel:string|undefined;try{
 checkOrigin(request);const user=await ferroIdentity();
 const raw=await request.text();if(raw.length>150000)throw new FerroError('Request is too large.',413);
 const input=requestSchema.parse(JSON.parse(raw));
 const model=ferroModels.find(item=>item.id===input.model);if(!model)throw new FerroError('Choose a supported FerroAI model.');
 if(model.kind==='embedding'&&Buffer.byteLength(input.message,'utf8')>480)throw new FerroError('This embedding model has a 512-token context. Use a short text of up to 480 UTF-8 bytes.');
 const {settings,cipher}=await ferroSettings();
 if(!settings.enabled)throw new FerroError('FerroAI has been paused by an administrator.',403);
 if(!settings.allowedRoles.includes(user.role)||!settings.allowedModels.includes(model.id))throw new FerroError('Your role or this model is disabled by an administrator.',403);
 const key=providerKey(cipher);if(!key)throw new FerroError('An administrator needs to connect the shared HC AI key in Settings.',503);
 const limits=effectiveLimits(settings,user),reservedId=randomUUID(),chatId=input.chatId||randomUUID();
 let context:{role:string;content:string}[]=[];
 await db().begin(async sql=>{
  await sql`SELECT id FROM fw_users WHERE id=${user.id} FOR UPDATE`;
  if(input.chatId){const [chat]=await sql`SELECT id FROM fw_ai_chats WHERE id=${chatId} AND user_id=${user.id} FOR UPDATE`;if(!chat)throw new FerroError('Conversation not found.',404);}
  if(input.chatId&&model.kind==='chat'){const history=await sql`SELECT role,content FROM fw_ai_messages WHERE chat_id=${chatId} AND failed=false AND model<>'liquid/lfm-2.5-embedding-350m:free' ORDER BY id DESC LIMIT 49`;context=history.reverse().map(message=>({role:message.role,content:message.content}));}
  context.push({role:'user',content:input.message});
  const inputChars=context.reduce((total,message)=>total+message.content.length,0);
  const [counts]=await sql`SELECT count(*) FILTER (WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily,count(*) FILTER (WHERE created_at>now()-interval '1 minute')::int AS minute,count(*) FILTER (WHERE status='pending' AND created_at>now()-interval '110 seconds')::int AS pending FROM fw_ai_requests WHERE user_id=${user.id} AND created_at>now()-interval '1 day'`;
  const reason=limitReason(limits,counts,inputChars);if(reason)throw new FerroError(reason,429);
  if(counts.pending)throw new FerroError('Wait for your current response to finish.',429);
  if(!input.chatId)await sql`INSERT INTO fw_ai_chats(id,user_id,title,model) VALUES (${chatId},${user.id},${input.message.slice(0,80)},${model.id})`;
  await sql`INSERT INTO fw_ai_requests(id,user_id,model,status,chat_id) VALUES (${reservedId},${user.id},${model.id},'pending',${chatId})`;
  await sql`INSERT INTO fw_ai_messages(chat_id,role,content,model) VALUES (${chatId},'user',${input.message},${model.id})`;
  await sql`UPDATE fw_ai_chats SET model=${model.id},updated_at=now() WHERE id=${chatId}`;
 });requestId=reservedId;savedChatId=chatId;savedModel=model.id;
 const signal=AbortSignal.timeout(95000);
 let sources:ReturnType<typeof searchSources>=[];
 if(model.live){
  const search=await fetch(`${endpoint}/exa/search`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:liveSearchQuery(context),type:'auto',numResults:5,contents:{text:{maxCharacters:1800}}}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),cache:'no-store'}).catch(()=>{throw new FerroError('Live web search timed out. Please retry or choose a model without the Live tag.',502)});
  if(!search.ok)throw new FerroError(search.status===402?'Live search has reached the shared HC allowance. Choose a model without the Live tag or retry after reset.':search.status===429?'Live web search is rate limited. Please retry shortly.':'Live web search is unavailable. Please retry or choose a model without the Live tag.',search.status===429?429:502);
  sources=searchSources(await search.json());
  if(!sources.length)throw new FerroError('Live search returned no usable sources. Try a more specific question or a model without the Live tag.',502);
 }
 const upstream=await fetch(`${endpoint}/${model.kind==='embedding'?'embeddings':'chat/completions'}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(model.kind==='embedding'?{model:model.apiModel,input:input.message}:{model:model.apiModel,messages:generationMessages(context,sources,model.live),max_tokens:limits.maxOutputTokens,stream:false}),signal,cache:'no-store'});
 if(!upstream.ok){const status=upstream.status;throw new FerroError(status===401?'The shared HC AI key was rejected. Ask an administrator to replace it.':status===402?'The shared HC AI account has reached its daily allowance. Try after its reset.':status===429?'HC AI is rate limiting requests. Please try again shortly.':[400,404].includes(status)?'HC AI could not serve this model. It may be unavailable; choose another model.':status===403?'HC AI denied this request. Check account eligibility and provider rules.':'HC AI is temporarily unavailable. Try another model or retry.',status===429?429:502)}
 const result=await upstream.json();
 const embedding=model.kind==='embedding'?result.data?.[0]?.embedding:undefined;
 const content=model.kind==='chat'?result.choices?.[0]?.message?.content:undefined;
 if(model.kind==='embedding'?!Array.isArray(embedding):typeof content!=='string'||!content.trim())throw new FerroError('The model returned no usable response. Try another model.',502);
 const tokens=Number.isSafeInteger(result.usage?.total_tokens)&&result.usage.total_tokens>=0?Math.min(result.usage.total_tokens,2147483647):0;
 const reply=model.kind==='embedding'?`Generated a ${embedding.length.toLocaleString()}-dimension embedding. Download the vector as JSON to use it for search, clustering or similarity matching.`:content;
 await db().begin(async sql=>{
  await sql`INSERT INTO fw_ai_messages(chat_id,role,content,model,embedding,sources) VALUES (${chatId},'assistant',${reply},${model.id},${embedding?sql.json(embedding):null},${sql.json(sources)})`;
  await sql`UPDATE fw_ai_requests SET status='complete',tokens=${tokens} WHERE id=${reservedId}`;
  await sql`UPDATE fw_ai_chats SET updated_at=now() WHERE id=${chatId}`;
 });
 return Response.json({chatId,content:reply,embedding,tokens,model:model.id,kind:model.kind,counts:await countsFor(user.id)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(requestId)await db().begin(async sql=>{await sql`UPDATE fw_ai_requests SET status='failed' WHERE id=${requestId!}`;if(savedChatId)await sql`INSERT INTO fw_ai_messages(chat_id,role,content,model,failed) VALUES (${savedChatId},'assistant',${error instanceof FerroError?error.message:'Generation failed. Please try again.'},${savedModel!},true)`;}).catch(()=>{});return ferroFailure(error,savedChatId?{chatId:savedChatId}:{})}}
export async function PUT(request:Request){try{
 checkOrigin(request);const user=await ferroIdentity();if(user.role!=='admin')throw new FerroError('Administrator access is required.',403);
 const raw=await request.text();if(raw.length>100000)throw new FerroError('Settings are too large.',413);
 const input=z.object({settings:settingsSchema,key:z.string().trim().max(500).optional(),removeKey:z.boolean().default(false)}).parse(JSON.parse(raw));
 if(input.settings.allowedModels.some(id=>!ferroModels.some(model=>model.id===id)))throw new FerroError('Unknown model in settings.');
 if(Object.keys(input.settings.roleLimits).some(role=>!['admin','manager','member','finance','viewer'].includes(role)))throw new FerroError('Unknown role in settings.');
 if(input.key&&!input.key.startsWith('sk-'))throw new FerroError('Enter a valid HC AI API key.');
 await db().begin(async sql=>{
  await sql`UPDATE fw_ai_settings SET config=${sql.json(input.settings)},updated_at=now() WHERE id=1`;
  if(input.key)await sql`UPDATE fw_ai_settings SET key_cipher=${encryptKey(input.key)} WHERE id=1`;
  else if(input.removeKey)await sql`UPDATE fw_ai_settings SET key_cipher=null WHERE id=1`;
  await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${user.id},'ferroai.settings.update','ferroai')`;
 });return Response.json({ok:true});
 }catch(error){return ferroFailure(error)}}
