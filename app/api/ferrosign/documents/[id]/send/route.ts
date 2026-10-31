import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { db } from '../../../../../../lib/server';
import { appOrigin, currentUser, digest, staff, token } from '../../../../../../lib/ferrosign';
import { sameOriginRequest } from '../../../../../../lib/ferrosign-validation.mjs';
export const maxDuration=300;

export async function POST(request: Request, {params}:{params:Promise<{id:string}>}) {
 const user=await currentUser(); if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 if(!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Request origin not allowed.'},{status:403});
 const {id}=await params, sql=db();
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD)return NextResponse.json({error:'Email delivery is not configured.'},{status:503});
 const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE!=='false',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
 try {
  const result=await sql.begin(async tx=>{
  const [doc]=await tx`SELECT id,title,status FROM fw_sign_documents WHERE id=${id} AND NOT EXISTS (SELECT 1 FROM fw_sign_audit a WHERE a.document_id=fw_sign_documents.id AND a.event='template_saved') FOR UPDATE`;
  if(!doc||doc.status!=='draft')return {error:'Draft not found or already sent.',status:404};
  const recipients=await tx`SELECT * FROM fw_sign_recipients WHERE document_id=${id} ORDER BY signer_order`;
  if(!recipients.length)return {error:'No signers added.',status:400};
  const tokens=recipients.map(()=>token());
  for(let i=0;i<recipients.length;i++) {
   const recipient=recipients[i];
   await tx`UPDATE fw_sign_recipients SET token_hash=${digest(tokens[i])},token_expires_at=now()+interval '14 days' WHERE id=${recipient.id}`;
   const url=`${appOrigin()}/sign/${tokens[i]}`;
   const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
   await mailer.sendMail({from:process.env.FERROSIGN_EMAIL_FROM||'FerroSign <noreply@ferroworks.org>',to:recipient.email,subject:`Signature requested: ${doc.title}`,text:`Hello ${recipient.name},\n\nYou have a document to review and sign: ${doc.title}\n\nOpen this secure link (expires in 14 days): ${url}\n\nIf you weren't expecting this message, you can ignore it.`,html:`<p>Hello ${escapeHtml(recipient.name)},</p><p>You have a document to review and sign: <strong>${escapeHtml(doc.title)}</strong>.</p><p><a href="${url}">Review and sign document</a></p><p>This secure link expires in 14 days. If you weren't expecting this message, ignore it.</p>`});
  }
  await tx`UPDATE fw_sign_documents SET status='sent',updated_at=now() WHERE id=${id}`;
  await tx`INSERT INTO fw_sign_audit(document_id,actor,event,detail) VALUES (${id},${user.id},'sent',${tx.json({recipientCount:recipients.length})}::jsonb)`;
  return {ok:true};
  });
  if('error' in result)return NextResponse.json({error:result.error},{status:result.status});
  return NextResponse.json({ok:true});
 } catch(error) { console.error('FerroSign email send failed',error); return NextResponse.json({error:'Email could not be sent. Review SMTP configuration and try again.'},{status:502}); }
}
