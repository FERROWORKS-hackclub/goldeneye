import { NextResponse } from 'next/server';
import { currentUser,staff } from '../../../../lib/ferrosign';
import { db } from '../../../../lib/server';
import { buildBusinessCardsPdf } from '../../../../lib/ferrosign-reports';
export const runtime='nodejs',maxDuration=120;
export async function GET(){
 const user=await currentUser();if(!user||!staff(user.role))return new NextResponse('Staff access required',{status:403});
 const sql=db();await sql`ALTER TABLE fw_users ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT ''`;
 const people=await sql`SELECT name,COALESCE(NULLIF(trim(job_title),''),CASE role WHEN 'admin' THEN 'Company Administrator' WHEN 'manager' THEN 'Manager' WHEN 'finance' THEN 'Finance' ELSE 'Ferroworks Staff' END) AS title,CASE WHEN lower(email) LIKE '%@ferroworks.org' THEN email ELSE '' END AS email FROM fw_users WHERE active=true AND role<>'viewer' ORDER BY name,email`;
 const pdf=await buildBusinessCardsPdf(Array.from(people).map((person:any)=>({name:person.name,email:person.email,title:person.title})));
 const body=pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer;
 return new NextResponse(body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="ferroworks-business-cards.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
