import {randomUUID} from 'node:crypto';
import {usableInvite,canReview,canAssignRole} from './invitations.mjs';
export async function registerPending({database,createIdentity,deleteIdentity,input,hash}){
 let remoteId;
 try{
  await database.begin(async sql=>{
   const [link]=await sql`SELECT l.*,u.active AS issuer_active,u.role AS issuer_role FROM fw_signup_links l JOIN fw_users u ON u.id=l.created_by WHERE token_hash=${hash} FOR SHARE OF l,u`;
   if(!usableInvite(link))throw new Error('INVALID_INVITE');
   await sql`SELECT pg_advisory_xact_lock(hashtext(${input.email})::bigint)`;
   const [existing]=await sql`SELECT id FROM fw_users WHERE lower(email)=${input.email}`;
   if(existing)throw new Error('EXISTS');
   const remote=await createIdentity(input);remoteId=remote.user_id;
   await sql`INSERT INTO fw_users(id,email,name,role,active,invited_at) VALUES (${remote.user_id},${input.email},${input.name},'member',false,${link.created_at})`;
   await sql`INSERT INTO fw_join_requests(id,user_id,link_id) VALUES (${randomUUID()},${remote.user_id},${link.id})`;
   await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${remote.user_id},'signup.request',${remote.user_id})`;
  });
 }catch(error){if(remoteId){try{await deleteIdentity(remoteId);}catch{console.error('Signup rollback needs administrator attention');}}throw error;}
}
export async function reviewSignup(database,actor,input){
 if(!canReview(actor.role)||input.action==='approve'&&!canAssignRole(actor.role,input.role))throw new Error('403');
 await database.begin(async sql=>{
  const [currentActor]=await sql`SELECT role,active FROM fw_users WHERE id=${actor.id} FOR SHARE`;
  if(!currentActor?.active||!canReview(currentActor.role)||input.action==='approve'&&!canAssignRole(currentActor.role,input.role))throw new Error('403');
  const [request]=await sql`SELECT id,user_id,status FROM fw_join_requests WHERE id=${input.id} FOR UPDATE`;
  if(!request||request.status!=='Pending')throw new Error('Cannot review: this request has already been handled');
  const status=input.action==='approve'?'Approved':'Denied';
  await sql`UPDATE fw_users SET active=${input.action==='approve'},role=${input.action==='approve'?input.role:'member'} WHERE id=${request.user_id}`;
  await sql`UPDATE fw_join_requests SET status=${status},reviewed_at=now(),reviewed_by=${actor.id} WHERE id=${request.id}`;
  await sql`INSERT INTO fw_audit(actor,action,target) VALUES (${actor.id},${'signup.'+input.action},${request.user_id})`;
 });
}
