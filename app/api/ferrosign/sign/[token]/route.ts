import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../../lib/server';
import { digest } from '../../../../../lib/ferrosign';
import { usableSigningLink, validateAnswers } from '../../../../../lib/ferrosign-validation.mjs';
import { signedPdf } from '../../../../../lib/ferrosign-pdf';
export const maxDuration=60;

export async function GET(_:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const [row]=await db()`SELECT r.id,r.name,r.email,r.signed_at,r.signer_order,r.token_expires_at,d.id AS document_id,d.title,d.fields FROM fw_sign_recipients r JOIN fw_sign_documents d ON d.id=r.document_id WHERE r.token_hash=${digest(token)} AND d.status IN ('sent','completed')`;
 if(!usableSigningLink(row))return NextResponse.json({error:'This signing link is invalid or expired.'},{status:404});
 const fields=Array.isArray(row.fields)?row.fields.filter((field:any)=>field.recipientIndex===row.signer_order-1):[];
 return NextResponse.json({name:row.name,email:row.email,signed:!!row.signed_at,title:row.title,fields,fileUrl:`/api/ferrosign/sign/${encodeURIComponent(token)}/file`},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const origin=request.headers.get('origin');try{if(!origin||new URL(origin).origin!==new URL(process.env.FERROSIGN_BASE_URL||'https://sign.ferroworks.org').origin)return NextResponse.json({error:'Request origin not allowed.'},{status:403})}catch{return NextResponse.json({error:'Request origin not allowed.'},{status:403})}
 const {token}=await params;let body:any;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid submission.'},{status:400})}
 const submittedAnswers=body?.answers;if(!submittedAnswers||typeof submittedAnswers!=='object'||Array.isArray(submittedAnswers))return NextResponse.json({error:'Complete the required fields.'},{status:400});
 const sql=db();const result=await sql.begin(async tx=>{
  const [row]=await tx`SELECT r.id,r.name,r.email,r.signed_at,r.signer_order,r.token_expires_at,d.id AS document_id,d.status,d.fields,d.source_blob FROM fw_sign_recipients r JOIN fw_sign_documents d ON d.id=r.document_id WHERE r.token_hash=${digest(token)} FOR UPDATE OF r,d`;
  if(!usableSigningLink(row)||!['sent','completed'].includes(row.status))return {error:'This signing link is invalid, expired, or unavailable.',status:404};
  if(row.signed_at)return {error:'This document has already been signed.',status:409};
  const fields=Array.isArray(row.fields)?row.fields.filter((f:any)=>f.recipientIndex===row.signer_order-1):[];
  const validated=validateAnswers(fields,submittedAnswers);
  if(validated.error)return {error:validated.error,status:400};
  const answers=validated.answers;
  await tx`UPDATE fw_sign_recipients SET signed_at=now(),answers=${JSON.stringify(answers)}::jsonb WHERE id=${row.id} AND signed_at IS NULL`;
  await tx`INSERT INTO fw_sign_audit(document_id,recipient_id,actor,event,detail) VALUES (${row.document_id},${row.id},${row.email},'signed',${JSON.stringify({name:row.name,fieldCount:fields.length})}::jsonb)`;
  const [{pending}]=await tx`SELECT count(*)::int AS pending FROM fw_sign_recipients WHERE document_id=${row.document_id} AND signed_at IS NULL`;
  if(!pending){const signed=await tx`SELECT answers FROM fw_sign_recipients WHERE document_id=${row.document_id} ORDER BY signer_order`;const allAnswers=Object.assign({},...signed.map((r:any)=>r.answers||{}));const path=await signedPdf(row.source_blob,row.fields,allAnswers,row.document_id);await tx`UPDATE fw_sign_documents SET status='completed',completed_blob=${path},completed_at=now(),updated_at=now() WHERE id=${row.document_id}`;await tx`INSERT INTO fw_sign_audit(document_id,recipient_id,actor,event) VALUES (${row.document_id},${row.id},${row.email},'document_completed')`}
  return {ok:true};
 });
 if('error' in result)return NextResponse.json({error:result.error},{status:result.status});
 return NextResponse.json({ok:true});
}
