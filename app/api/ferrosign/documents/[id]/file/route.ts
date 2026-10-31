import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { db } from '../../../../../../lib/server';
import { currentUser, staff } from '../../../../../../lib/ferrosign';
export const runtime='nodejs';
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return new NextResponse('Sign in required',{status:401});const {id}=await params;
 const [doc]=staff(user.role)
  ? await db()`SELECT completed_blob,source_blob FROM fw_sign_documents WHERE id=${id} AND status<>'void'`
  : await db()`SELECT d.completed_blob,d.source_blob FROM fw_sign_documents d JOIN fw_sign_recipients r ON r.document_id=d.id WHERE d.id=${id} AND d.status IN ('sent','completed') AND r.user_id=${user.id} LIMIT 1`;
 if(!doc)return new NextResponse('Document not found',{status:404});const blob=await get(doc.completed_blob||doc.source_blob,{access:'private'});if(!blob||blob.statusCode!==200)return new NextResponse('Document unavailable',{status:404});
 return new NextResponse(blob.stream,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="ferrosign-document.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
