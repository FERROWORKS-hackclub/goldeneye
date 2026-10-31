import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { db } from '../../../../../../lib/server';
import { usableSigningLink } from '../../../../../../lib/ferrosign-validation.mjs';
import { digest } from '../../../../../../lib/ferrosign';
export const runtime='nodejs';
export async function GET(_:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const [row]=await db()`SELECT d.source_blob,d.completed_blob,r.token_expires_at FROM fw_sign_recipients r JOIN fw_sign_documents d ON d.id=r.document_id WHERE r.token_hash=${digest(token)} AND d.status IN ('sent','completed')`;
 if(!usableSigningLink(row))return new NextResponse('Link invalid or expired',{status:404});
 const blob=await get(row.completed_blob||row.source_blob,{access:'private'});if(!blob||blob.statusCode!==200)return new NextResponse('Document unavailable',{status:404});
 return new NextResponse(blob.stream,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="document.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
