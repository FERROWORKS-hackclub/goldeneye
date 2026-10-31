import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { PDFDocument } from 'pdf-lib';
import { envelopeSchema, sameOriginRequest,validateAnswers } from '../../../../lib/ferrosign-validation.mjs';
import { db } from '../../../../lib/server';
import { currentUser, id, staff } from '../../../../lib/ferrosign';

export const runtime = 'nodejs';
export async function GET() {
 const user = await currentUser(); if (!user) return NextResponse.json({error:'Sign in required'},{status:401});
 const rows = staff(user.role)
  ? await db()`SELECT d.id,d.title,d.status,d.created_at,d.updated_at,u.name AS creator, COALESCE(json_agg(json_build_object('id',r.id,'name',r.name,'email',r.email,'signed_at',r.signed_at) ORDER BY r.signer_order) FILTER (WHERE r.id IS NOT NULL),'[]') AS recipients FROM fw_sign_documents d JOIN fw_users u ON u.id=d.created_by LEFT JOIN fw_sign_recipients r ON r.document_id=d.id WHERE d.status <> 'void' AND NOT EXISTS (SELECT 1 FROM fw_sign_audit ta WHERE ta.document_id=d.id AND ta.event='template_saved') GROUP BY d.id,u.name ORDER BY d.updated_at DESC`
  : await db()`SELECT DISTINCT d.id,d.title,d.status,d.created_at,d.updated_at,u.name AS creator, json_build_array(json_build_object('id',r.id,'name',r.name,'email',r.email,'signed_at',r.signed_at)) AS recipients FROM fw_sign_documents d JOIN fw_users u ON u.id=d.created_by JOIN fw_sign_recipients r ON r.document_id=d.id WHERE r.user_id=${user.id} AND d.status IN ('sent','completed') ORDER BY d.updated_at DESC`;
 return NextResponse.json({documents:rows,canCreate:staff(user.role),me:{name:user.name,email:user.email}});
}

export async function POST(request: NextRequest) {
 const user = await currentUser(); if (!user) return NextResponse.json({error:'Sign in required'},{status:401});
 if (!staff(user.role)) return NextResponse.json({error:'Staff access required'},{status:403});
 if (!sameOriginRequest(request.headers.get('origin'),request.url)) return NextResponse.json({error:'Request origin not allowed.'},{status:403});
 const form = await request.formData(); const file = form.get('file');
 if (!(file instanceof File) || file.type !== 'application/pdf' || file.size > 4 * 1024 * 1024) return NextResponse.json({error:'Upload a PDF under 4 MB.'},{status:400});
 const parsed = envelopeSchema.safeParse({title:String(form.get('title')||''),fields:(()=>{try{return JSON.parse(String(form.get('fields')||'null'))}catch{return null}})(),recipients:(()=>{try{return JSON.parse(String(form.get('recipients')||'null'))}catch{return null}})()});
 if (!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid signing request.'},{status:400});
 const {title,fields,recipients}=parsed.data;
 for(const field of fields){if(field.prepared&&validateAnswers([field],{}).error)return NextResponse.json({error:`Complete before sending: ${field.label}`},{status:400})}
 for(const recipient of recipients){if(recipient.role==='staff'){const [account]=await db()`SELECT role FROM fw_users WHERE lower(email)=${recipient.email} AND active=true`;if(!account||!staff(account.role))return NextResponse.json({error:'The staff signer must be an active staff account.'},{status:400})}}
 const documentId=id();
 let pageCount:number;try{pageCount=(await PDFDocument.load(await file.arrayBuffer(),{updateMetadata:false})).getPageCount()}catch{return NextResponse.json({error:'The uploaded file is not a readable PDF.'},{status:400})}
 if(fields.some((f:any)=>f.page>=pageCount||f.x+f.width>1||f.y+f.height>1))return NextResponse.json({error:'A field is positioned outside the PDF page.'},{status:400});
 const blob=await put(`ferrosign/${documentId}/source.pdf`,file,{access:'private',contentType:'application/pdf',addRandomSuffix:false});
 const sql=db();
 try {
  await sql.begin(async tx=>{
   await tx`INSERT INTO fw_sign_documents(id,title,source_blob,created_by,fields) VALUES (${documentId},${title},${blob.pathname},${user.id},${tx.json(fields)}::jsonb)`;
   for (let i=0;i<recipients.length;i++) {
    const recipient=recipients[i], email=recipient.email.trim().toLowerCase();
    const [account]=await tx`SELECT id FROM fw_users WHERE lower(email)=${email} AND active=true`;
    await tx`INSERT INTO fw_sign_recipients(id,document_id,user_id,email,name,signer_order) VALUES (${id()},${documentId},${account?.id||null},${email},${recipient.name.trim().slice(0,120)},${i+1})`;
   }
   await tx`INSERT INTO fw_sign_audit(document_id,actor,event) VALUES (${documentId},${user.id},'draft_created')`;
  });
 } catch(error) { console.error('FerroSign document creation failed',error); return NextResponse.json({error:'Could not save document.'},{status:500}); }
 return NextResponse.json({id:documentId}, {status:201});
}
