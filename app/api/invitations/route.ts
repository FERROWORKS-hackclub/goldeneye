import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {auth,configured} from '../../../lib/auth';
import {db} from '../../../lib/server';
import {isTrustedOrigin,primaryAppBaseUrl} from '../../../lib/trusted-origins.mjs';
import {reviewSignup} from '../../../lib/signup.mjs';
import {inviteToken,tokenHash,inviteStatus,canReview,canAssignRole} from '../../../lib/invitations.mjs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function reviewer(){if(!configured)throw new Error('503');const session=await auth().getSession();if(!session)throw new Error('401');const [user]=await db()`SELECT id,role,active FROM fw_users WHERE id=${session.user.sub}`;if(!user?.active||!canReview(user.role))throw new Error('403');return user;}
function error(e:unknown){const message=e instanceof Error?e.message:'';const status=['401','403','503'].includes(message)?Number(message):e instanceof z.ZodError||message.startsWith('Cannot')?400:500;return json({error:status===401?'Sign in required':status===403?'Admin or manager access required':status===400?e instanceof z.ZodError?'Check the invitation details.':message:'Could not update signup requests. Try again.'},status);}
export async function GET(){try{await reviewer();const links=await db()`SELECT id,created_at,expires_at,revoked_at FROM fw_signup_links ORDER BY created_at DESC LIMIT 100`;const pending=await db()`SELECT r.id,r.created_at,u.name,u.email FROM fw_join_requests r JOIN fw_users u ON u.id=r.user_id WHERE r.status='Pending' ORDER BY r.created_at`;const recent=await db()`SELECT r.id,r.status,r.reviewed_at,u.name,u.email,u.role FROM fw_join_requests r JOIN fw_users u ON u.id=r.user_id WHERE r.status<>'Pending' ORDER BY r.reviewed_at DESC LIMIT 20`;return json({links:links.map(row=>({...row,status:inviteStatus(row)})),pending,recent});}catch(e){return error(e);}}
export async function POST(req:NextRequest){try{
 if(!isTrustedOrigin(req.headers.get('origin')))return json({error:'Invalid origin'},403);
 const actor=await reviewer();
 const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),days:z.number().int().min(1).max(90)}),
  z.object({action:z.literal('revoke'),id:z.uuid()}),
  z.object({action:z.literal('approve'),id:z.uuid(),role:z.enum(['member','viewer','manager','finance','admin'])}),
  z.object({action:z.literal('deny'),id:z.uuid()})
 ]).parse(await req.json());
 if(input.action==='approve'||input.action==='deny'){
  if(input.action==='approve'&&!canAssignRole(actor.role,input.role))throw new Error('403');
  await reviewSignup(db(),actor,input);return json({ok:true});
 }
 if(input.action==='revoke'){await db().begin(async sql=>{const [link]=await sql`SELECT id,revoked_at FROM fw_signup_links WHERE id=${input.id} FOR UPDATE`;if(!link||link.revoked_at)throw new Error('Cannot revoke this link');await sql`UPDATE fw_signup_links SET revoked_at=now() WHERE id=${input.id}`;await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${actor.id},'signup.revoke',${input.id})`;});return json({ok:true});}
 const token=inviteToken(),id=randomUUID(),expires=new Date(Date.now()+input.days*86400000);
 await db().begin(async sql=>{await sql`INSERT INTO fw_signup_links(id,token_hash,created_by,expires_at) VALUES (${id},${tokenHash(token)},${actor.id},${expires})`;await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${actor.id},'signup.link',${id})`;});
 const baseUrl=primaryAppBaseUrl();if(!baseUrl)return json({error:'Application URL is not configured.'},503);
 return json({ok:true,id,expiresAt:expires.toISOString(),url:`${new URL('/invite',baseUrl).href}#${token}`});
}catch(e){return error(e);}}
