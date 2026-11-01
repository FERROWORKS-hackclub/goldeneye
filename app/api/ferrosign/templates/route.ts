import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import { db } from '../../../../lib/server';
import { currentUser,staff,id } from '../../../../lib/ferrosign';
import { envelopeSchema,sameOriginRequest,templateAccess,signerRolesSchema,storedJson } from '../../../../lib/ferrosign-validation.mjs';
export const runtime='nodejs';
export async function GET(){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 const templates=await db()`SELECT d.id,d.title,d.fields,d.created_by AS owner_id,a.detail->>'visibility' AS visibility,a.detail->'roles' AS roles,(a.detail->>'signerCount')::int AS signer_count,u.name AS owner FROM fw_sign_documents d JOIN (SELECT document_id,event,CASE WHEN jsonb_typeof(detail)='string' THEN (detail #>> '{}')::jsonb ELSE detail END AS detail FROM fw_sign_audit) a ON a.document_id=d.id AND a.event='template_saved' JOIN fw_users u ON u.id=d.created_by WHERE d.status='draft' AND (d.created_by=${user.id} OR a.detail->>'visibility'='staff') ORDER BY d.created_at DESC`;
 return NextResponse.json({templates:templates.filter(template=>templateAccess(user,template.owner_id,template.visibility)).map(template=>({...template,fields:storedJson(template.fields,[]),roles:storedJson(template.roles,null)}))},{headers:{'Cache-Control':'private, no-store'}});
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
  await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${templateId},${user.id},'template_saved',${tx.json({visibility:String(visibility),signerCount:parsed.data.recipients.length,roles})}::jsonb)`;
 });
 return NextResponse.json({id:templateId},{status:201});
}
export async function DELETE(request:Request){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 const templateId=String(body.id||'');
 const result=await db().begin(async tx=>{const [row]=await tx`SELECT d.id,d.created_by,a.detail FROM fw_sign_documents d JOIN fw_sign_audit a ON a.document_id=d.id AND a.event='template_saved' WHERE d.id=${templateId} AND d.status='draft' FOR UPDATE OF d`;if(!row)return false;const detail=storedJson(row.detail,{});if(row.created_by!==user.id&&detail.visibility!=='staff')return false;await tx`UPDATE fw_sign_documents SET status='void',updated_at=now() WHERE id=${templateId}`;await tx`INSERT INTO fw_sign_audit(document_id,actor,event) VALUES (${templateId},${user.id},'template_deleted')`;return true});
 return result?NextResponse.json({ok:true}):NextResponse.json({error:'Template not found or unavailable'},{status:404});
}
