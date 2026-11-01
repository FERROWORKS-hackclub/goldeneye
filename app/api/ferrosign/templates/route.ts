import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../../../../lib/server';
import { currentUser,staff,id } from '../../../../lib/ferrosign';
import { envelopeSchema,sameOriginRequest,templateAccess,signerRolesSchema,storedJson } from '../../../../lib/ferrosign-validation.mjs';
import weeklySetup from '../../../../public/templates/weekly-worklog-template-setup.json';
import { lockedTemplateKey, WEEKLY_WORKLOG_TEMPLATE_TITLE, verifyTemplateUnlockToken } from '../../../../lib/ferrosign-template-lock.mjs';
export const runtime='nodejs';
const weeklyRoles=[{label:'Team member / contributor',role:'signer'}];

async function ensureWeeklyWorklogTemplate(ownerId:string){
 const sql=db();
 await sql.begin(async(tx:any)=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext('ferrosign:weekly-worklog-template'))`;
  const [active]=await tx`SELECT d.id,a.detail FROM fw_sign_documents d JOIN LATERAL (SELECT detail FROM fw_sign_audit WHERE document_id=d.id AND event IN ('template_saved','template_updated') ORDER BY id DESC LIMIT 1) a ON true WHERE d.status='draft' AND lower(trim(d.title))=lower(${WEEKLY_WORKLOG_TEMPLATE_TITLE}) ORDER BY d.created_at DESC LIMIT 1 FOR UPDATE OF d`;
  if(active){const detail=storedJson(active.detail,{});if(detail.builtinKey==='weekly-worklog'&&detail.visibility==='staff'&&detail.locked===true)return;await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${active.id},${ownerId},'template_updated',${tx.json({visibility:'staff',signerCount:weeklyRoles.length,roles:weeklyRoles,locked:true,builtinKey:'weekly-worklog'})}::jsonb)`;return;}
  const [deleted]=await tx`SELECT 1 FROM fw_sign_audit WHERE event='template_deleted' AND detail->>'builtinKey'='weekly-worklog' LIMIT 1`;
  const [renamed]=await tx`SELECT 1 FROM fw_sign_audit WHERE event IN ('template_saved','template_updated') AND detail->>'builtinKey'='weekly-worklog' LIMIT 1`;
  if(deleted||renamed)return;
  const templateId=id(),pdf=await readFile(join(process.cwd(),'public','templates','weekly-worklog-template.pdf'));
  const blob=await put(`ferrosign/templates/${templateId}/source.pdf`,new Blob([new Uint8Array(pdf)],{type:'application/pdf'}),{access:'private',contentType:'application/pdf',addRandomSuffix:false});
  const fields=(weeklySetup as any).fields;
  const recipients=weeklyRoles.map((role,index)=>({name:role.label,email:`slot${index+1}@example.invalid`}));
  await tx`INSERT INTO fw_sign_documents(id,title,source_blob,created_by,fields) VALUES (${templateId},${WEEKLY_WORKLOG_TEMPLATE_TITLE},${blob.pathname},${ownerId},${tx.json(fields)}::jsonb)`;
  await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${templateId},${ownerId},'template_saved',${tx.json({visibility:'staff',signerCount:recipients.length,roles:weeklyRoles,locked:true,builtinKey:'weekly-worklog'})}::jsonb)`;
 });
}

function validUnlock(token:string,id:string,userId:string){return verifyTemplateUnlockToken(token,id,userId,process.env.BETTER_AUTH_SECRET||'');}

export async function GET(){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 try{await ensureWeeklyWorklogTemplate(user.id)}catch(error){console.error('Weekly work log template restore failed',error)}
 const templates=await db()`SELECT d.id,d.title,d.fields,d.created_by AS owner_id,a.detail->>'visibility' AS visibility,a.detail->'roles' AS roles,(a.detail->>'signerCount')::int AS signer_count,a.detail->>'locked' AS locked,u.name AS owner FROM fw_sign_documents d JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(detail)='string' THEN (detail #>> '{}')::jsonb ELSE detail END AS detail FROM fw_sign_audit WHERE document_id=d.id AND event IN ('template_saved','template_updated') ORDER BY id DESC LIMIT 1) a ON true JOIN fw_users u ON u.id=d.created_by WHERE d.status='draft' AND (d.created_by=${user.id} OR a.detail->>'visibility'='staff') ORDER BY d.created_at DESC`;
 return NextResponse.json({templates:templates.filter(template=>templateAccess(user,template.owner_id,template.visibility)).map(template=>({...template,fields:storedJson(template.fields,[]),roles:storedJson(template.roles,null),locked:template.locked==='true'||!!lockedTemplateKey(template.title)}))},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});
 const form=await request.formData(),file=form.get('file'),visibility=form.get('visibility');
 if(!['private','staff'].includes(String(visibility)))return NextResponse.json({error:'Choose template visibility'},{status:400});
 if(!(file instanceof File)||file.type!=='application/pdf'||file.size>4*1024*1024)return NextResponse.json({error:'Upload a PDF under 4 MB'},{status:400});
 let input;try{input={title:String(form.get('title')||''),fields:JSON.parse(String(form.get('fields'))),recipients:JSON.parse(String(form.get('recipients')))}}catch{return NextResponse.json({error:'Invalid template'},{status:400})}
 const parsed=envelopeSchema.safeParse(input);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid template'},{status:400});
 let roles;try{const config=form.get('roles');roles=signerRolesSchema.parse(config?JSON.parse(String(config)):parsed.data.recipients.map((_:any,i:number)=>({label:`Signer ${i+1}`,role:'signer'})));if(roles.length!==parsed.data.recipients.length)throw Error('Signer slots do not match')}catch{return NextResponse.json({error:'Invalid signer roles'},{status:400})}
 let pageCount;try{pageCount=(await PDFDocument.load(await file.arrayBuffer())).getPageCount()}catch{return NextResponse.json({error:'Invalid PDF'},{status:400})}
 if(parsed.data.fields.some((f:any)=>f.page>=pageCount))return NextResponse.json({error:'A field is outside the PDF'},{status:400});
 const templateId=id(),blob=await put(`ferrosign/templates/${templateId}/source.pdf`,file,{access:'private',contentType:'application/pdf',addRandomSuffix:false});
 await db().begin(async tx=>{
  await tx`INSERT INTO fw_sign_documents(id,title,source_blob,created_by,fields) VALUES (${templateId},${parsed.data.title},${blob.pathname},${user.id},${tx.json(parsed.data.fields)}::jsonb)`;
  const builtinKey=lockedTemplateKey(parsed.data.title);
  await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${templateId},${user.id},'template_saved',${tx.json({visibility:String(visibility),signerCount:parsed.data.recipients.length,roles,locked:!!builtinKey,...(builtinKey?{builtinKey}:{})})}::jsonb)`;
 });
 return NextResponse.json({id:templateId},{status:201});
}

export async function PATCH(request:Request){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 const templateId=String(body.id||''),unlockToken=String(body.unlockToken||'');
 let roles;try{roles=signerRolesSchema.parse(body.roles)}catch{return NextResponse.json({error:'Invalid signer roles'},{status:400})}
 const recipients=roles.map((role:any,index:number)=>({name:role.label,email:`slot${index+1}@example.invalid`}));
 const parsed=envelopeSchema.safeParse({title:body.title,fields:body.fields,recipients});
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid template'},{status:400});
 const result=await db().begin(async(tx:any)=>{
  const [row]=await tx`SELECT d.id,d.created_by,d.title,a.detail FROM fw_sign_documents d JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(detail)='string' THEN (detail #>> '{}')::jsonb ELSE detail END AS detail FROM fw_sign_audit WHERE document_id=d.id AND event IN ('template_saved','template_updated') ORDER BY id DESC LIMIT 1) a ON true WHERE d.id=${templateId} AND d.status='draft' FOR UPDATE OF d`;
  if(!row)return {error:'Template not found or unavailable',status:404};
  const detail=storedJson(row.detail,{}),locked=detail.locked===true||!!lockedTemplateKey(row.title,detail);
  if(row.created_by!==user.id&&detail.visibility!=='staff')return {error:'Template not found or unavailable',status:404};
  if(locked&&!validUnlock(unlockToken,templateId,user.id))return {error:'Unlock this template first.',status:403};
  const key=detail.builtinKey||lockedTemplateKey(row.title,detail);
  await tx`UPDATE fw_sign_documents SET title=${parsed.data.title},fields=${tx.json(parsed.data.fields)}::jsonb,updated_at=now() WHERE id=${templateId}`;
  await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${templateId},${user.id},'template_updated',${tx.json({visibility:detail.visibility||'private',signerCount:roles.length,roles,locked,...(key?{builtinKey:key}:{})})}::jsonb)`;
  return {ok:true};
 });
 return 'error'in result?NextResponse.json({error:result.error},{status:result.status}):NextResponse.json({ok:true});
}

export async function DELETE(request:Request){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 const templateId=String(body.id||''),unlockToken=String(body.unlockToken||'');
 const result=await db().begin(async(tx:any)=>{const [row]=await tx`SELECT d.id,d.created_by,d.title,a.detail FROM fw_sign_documents d JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(detail)='string' THEN (detail #>> '{}')::jsonb ELSE detail END AS detail FROM fw_sign_audit WHERE document_id=d.id AND event IN ('template_saved','template_updated') ORDER BY id DESC LIMIT 1) a ON true WHERE d.id=${templateId} AND d.status='draft' FOR UPDATE OF d`;if(!row)return {error:'Template not found or unavailable',status:404};const detail=storedJson(row.detail,{}),locked=detail.locked===true||!!lockedTemplateKey(row.title,detail);if(row.created_by!==user.id&&detail.visibility!=='staff')return {error:'Template not found or unavailable',status:404};if(locked&&!validUnlock(unlockToken,templateId,user.id))return {error:'Unlock this template first.',status:403};const builtinKey=detail.builtinKey||lockedTemplateKey(row.title,detail);await tx`UPDATE fw_sign_documents SET status='void',updated_at=now() WHERE id=${templateId}`;await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${templateId},${user.id},'template_deleted',${tx.json({locked,builtinKey})}::jsonb)`;return {ok:true}});
 return 'error'in result?NextResponse.json({error:result.error},{status:result.status}):NextResponse.json({ok:true});
}
