import {z} from 'zod';
import {db} from '../../../../lib/server';
import {ferroIdentity,ferroFailure,FerroError,checkOrigin} from '../../../../lib/ferroai';
import {canReadChat,canDeleteChat} from '../../../../lib/ferroai-policy.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const user=await ferroIdentity(),params=new URL(request.url).searchParams,id=params.get('id'),all=params.get('scope')==='all';
 if(all&&user.role!=='admin')throw new FerroError('Administrator access is required.',403);
 if(id){
  const chatId=z.uuid().parse(id),[chat]=await db()`SELECT c.id,c.user_id,c.title,c.model,c.updated_at,u.name AS owner_name,u.email AS owner_email FROM fw_ai_chats c JOIN fw_users u ON u.id=c.user_id WHERE c.id=${chatId}`;
  if(!canReadChat(user,chat))throw new FerroError('Conversation not found.',404);
  const messages=await db()`SELECT id,role,content,model,embedding,sources,failed,created_at FROM fw_ai_messages WHERE chat_id=${chatId} ORDER BY id`;
  if(chat.user_id!==user.id)await db()`INSERT INTO fw_audit(actor,action,target) VALUES (${user.id},'ferroai.safety.read',${chatId})`;
  return Response.json({chat,messages},{headers:{'Cache-Control':'no-store'}});
 }
 const search=params.get('q')?.trim().slice(0,200)||'',before=params.get('before');
 if(before)z.iso.datetime({offset:true}).parse(before);
 const cursor=before||'9999-12-31T23:59:59Z';
 const chats=all?await db()`SELECT c.id,c.title,c.model,c.user_id,c.updated_at,u.name AS owner_name,u.email AS owner_email FROM fw_ai_chats c JOIN fw_users u ON u.id=c.user_id WHERE c.updated_at<${cursor}::timestamptz AND (${search}='' OR position(lower(${search}) in lower(c.title||' '||u.name||' '||u.email))>0) ORDER BY c.updated_at DESC,c.id DESC LIMIT 100`:await db()`SELECT id,title,model,updated_at FROM fw_ai_chats WHERE user_id=${user.id} AND updated_at<${cursor}::timestamptz ORDER BY updated_at DESC,id DESC LIMIT 100`;
 return Response.json({chats,nextCursor:chats.length===100?new Date(chats.at(-1)!.updated_at).toISOString():null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return ferroFailure(error)}}
export async function DELETE(request:Request){try{
 checkOrigin(request);const user=await ferroIdentity(),id=z.uuid().parse(new URL(request.url).searchParams.get('id'));
 await db().begin(async sql=>{
  await sql`SELECT id FROM fw_users WHERE id=${user.id} FOR UPDATE`;
  const [chat]=await sql`SELECT id,user_id FROM fw_ai_chats WHERE id=${id} FOR UPDATE`;
  if(!canDeleteChat(user,chat))throw new FerroError('Conversation not found.',404);
  const [pending]=await sql`SELECT id FROM fw_ai_requests WHERE chat_id=${id} AND status='pending' AND created_at>now()-interval '110 seconds' LIMIT 1`;
  if(pending)throw new FerroError('Wait for this conversation’s response to finish before deleting it.',409);
  await sql`DELETE FROM fw_ai_chats WHERE id=${id}`;
  await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${user.id},'ferroai.chat.delete',${id})`;
 });return Response.json({ok:true});
 }catch(error){return ferroFailure(error)}}
