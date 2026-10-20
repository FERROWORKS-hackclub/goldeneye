import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db,management} from '../../../../lib/server';
import {tokenHash,usableInvite} from '../../../../lib/invitations.mjs';
import {registerPending} from '../../../../lib/signup.mjs';
import {acceptanceSchema} from '../../../../lib/invitation-validation.mjs';
import {isTrustedOrigin} from '../../../../lib/trusted-origins.mjs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const maxBodyBytes=16_384;
async function readLimitedBody(req:NextRequest){
 const reader=req.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBodyBytes){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return new TextDecoder().decode(Buffer.concat(chunks));
}
async function limitSignupRequests(req:NextRequest){
 const address=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
 const fingerprint=createHash('sha256').update((process.env.AUTH0_SECRET||'')+':'+address).digest('hex');
 await db().begin(async sql=>{await sql`SELECT pg_advisory_xact_lock(749186)`;const [attempts]=await sql`SELECT count(*)::int AS n FROM fw_signup_attempts WHERE fingerprint=${fingerprint} AND created_at>now()-interval '1 hour'`;if(attempts.n>=20)throw new Error('RATE_LIMIT');await sql`INSERT INTO fw_signup_attempts(fingerprint) VALUES (${fingerprint})`;});
}
export async function POST(req:NextRequest){try{
 if(!isTrustedOrigin(req.headers.get('origin')))return json({error:'Invalid origin'},403);
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Send a JSON request.'},415);
 const declaredSize=Number(req.headers.get('content-length')||0);if(declaredSize>maxBodyBytes)return json({error:'Request is too large.'},413);
 const raw=await readLimitedBody(req);
 const input=acceptanceSchema.parse(JSON.parse(raw));
 await limitSignupRequests(req);
 const hash=tokenHash(input.token);
 if(input.action==='preview'){const [link]=await db()`SELECT l.expires_at,l.revoked_at,u.active AS issuer_active,u.role AS issuer_role FROM fw_signup_links l JOIN fw_users u ON u.id=l.created_by WHERE token_hash=${hash}`;if(!usableInvite(link))return json({error:'This signup link has expired or was revoked. Ask an admin or manager for a new link.'},410);return json({expiresAt:link.expires_at});}
 await registerPending({database:db(),hash,input,createIdentity:async (person:{email:string;name:string;password:string})=>management('users','POST',{email:person.email,name:person.name,password:person.password,connection:process.env.AUTH0_CONNECTION||'Ferrowork-Users',email_verified:false,verify_email:true}),deleteIdentity:async (id:string)=>management(`users/${encodeURIComponent(id)}`,'DELETE')});return json({ok:true});
}catch(e){
 if(e instanceof z.ZodError)return json({error:'Enter a valid name, email and a password with 12–128 characters, upper/lowercase letters, a number and a symbol.'},400);
 if(e instanceof Error&&e.message==='BODY_TOO_LARGE')return json({error:'Request is too large.'},413);
 if(e instanceof SyntaxError)return json({error:'Send a valid JSON request.'},400);
 const message=e instanceof Error?e.message:'';
 if(message==='RATE_LIMIT')return json({error:'Too many signup attempts. Try again in an hour.'},429);
 if(message==='INVALID_INVITE'||message==='Invalid invitation')return json({error:'This signup link is no longer available. Ask an admin or manager for a new link.'},410);
 if(message==='EXISTS')return json({error:'This email already has an account or pending request. Sign in or contact an admin or manager.'},409);
 return json({error:'Could not submit your signup. Try a different strong password or contact an admin or manager.'},502);
}}
