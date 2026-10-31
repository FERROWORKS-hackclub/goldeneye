import nodemailer from 'nodemailer';
import { get } from '@vercel/blob';
import { db } from './server';

// Pending messages live in the signing transaction, so mail failure never loses a signature.
export async function deliverSigningCopies(documentId:string){
 const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE!=='false',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});
 let failed=false;
 for(let i=0;i<25;i++){
  try{const sent=await db().begin(async tx=>{
   const [job]=await tx`SELECT id,detail FROM fw_sign_audit WHERE document_id=${documentId} AND event='email_copy_pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`;
   if(!job)return false;
   const data=job.detail;const blob=await get(data.path,{access:'private'});if(!blob||blob.statusCode!==200)throw Error('PDF attachment unavailable');
   await mailer.sendMail({messageId:`<ferrosign-copy-${job.id}@ferroworks.org>`,from:process.env.FERROSIGN_EMAIL_FROM||'FerroSign <noreply@ferroworks.org>',to:data.to,subject:`${data.complete?'Signing complete':'Signature received'}: ${data.title}`,text:data.complete?`Everyone has signed ${data.title}. The completed PDF is attached.`:`Your signature for ${data.title} has been recorded. Your PDF copy is attached. Other recipients may still need to sign; everyone will receive the completed PDF when signing is finished.`,attachments:[{filename:data.complete?'completed-document.pdf':'signature-receipt.pdf',content:Buffer.from(await new Response(blob.stream).arrayBuffer()),contentType:'application/pdf'}]});
   await tx`UPDATE fw_sign_audit SET event='email_copy_sent' WHERE id=${job.id}`;return true;
  });if(!sent)break;}catch(error){console.error('Signing copy delivery failed',error);failed=true;break;}
 }
 return !failed;
}
