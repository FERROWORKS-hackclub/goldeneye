import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { currentUser,staff } from '../../../../../../lib/ferrosign';
import { db } from '../../../../../../lib/server';
export const runtime='nodejs';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user||!staff(user.role))return new NextResponse('Staff access required',{status:403});
 const {id}=await params,[row]=await db()`SELECT blob_path,period_start FROM fw_ferrosign_biweekly_reports WHERE id=${id}`;
 if(!row)return new NextResponse('Report not found',{status:404});const blob=await get(row.blob_path,{access:'private'});if(!blob||blob.statusCode!==200)return new NextResponse('Report unavailable',{status:404});
 return new NextResponse(blob.stream,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ferroworks-fortnight-${row.period_start}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
