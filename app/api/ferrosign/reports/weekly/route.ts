import { NextResponse } from 'next/server';
import { currentUser,staff } from '../../../../../lib/ferrosign';
import { db } from '../../../../../lib/server';
import { buildWorklogPdf,getSignedWorklogs } from '../../../../../lib/ferrosign-reports';

export const runtime='nodejs',maxDuration=300;
const addDays=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
export async function GET(request:Request){
 const user=await currentUser();if(!user||!staff(user.role))return new NextResponse('Staff access required',{status:403});
 const requested=new URL(request.url).searchParams.get('week');let week=requested||'';
 if(!week){const [current]=await db()`SELECT date_trunc('week',now() AT TIME ZONE 'Australia/Sydney')::date::text AS week`;week=current?.week||''}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||new Date(`${week}T12:00:00Z`).getUTCDay()!==1)return new NextResponse('Provide a Monday date for the report week.',{status:400});
 const start=new Date(`${week}T12:00:00Z`),today=Date.now();if(start.getTime()>today+7*86400000||start.getTime()<today-366*86400000)return new NextResponse('The report week is outside the available range.',{status:400});
 const logs=await getSignedWorklogs(week,addDays(week,7)),pdf=await buildWorklogPdf(week,addDays(week,6),logs,{title:'Weekly work log summary'});
 const body=pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer;
 return new NextResponse(body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ferroworks-worklogs-week-${week}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
