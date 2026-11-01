import { NextResponse } from 'next/server';
import { db } from '../../../../lib/server';
import { compileBiweeklyReport } from '../../../../lib/ferrosign-reports';
export const runtime='nodejs',maxDuration=300;
const addDays=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const [period]=await db()`SELECT date_trunc('week',now() AT TIME ZONE 'Australia/Sydney')::date::text AS week_start`;
 try{
  const sql=db();await sql`CREATE TABLE IF NOT EXISTS fw_ferrosign_biweekly_reports(id uuid PRIMARY KEY,period_start date NOT NULL,period_end date NOT NULL,blob_path text NOT NULL,source_count integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(period_start,period_end))`;
  const existingRows=await sql`SELECT period_start::text FROM fw_ferrosign_biweekly_reports`,existing=new Set(existingRows.map((row:any)=>row.period_start));
  const generated=[];let start='2026-10-19';
  while(addDays(start,14)<=period.week_start&&generated.length<4){const end=addDays(start,13);if(!existing.has(start)){generated.push(await compileBiweeklyReport(start,end));existing.add(start)}start=addDays(start,14)}
  return NextResponse.json({ok:true,weekStart:period.week_start,generated});
 }catch(error){console.error('FerroSign fortnightly report compilation failed',error);return NextResponse.json({error:'Report compilation failed.'},{status:500})}
}
