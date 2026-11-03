import { after } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../../../../lib/server';
import { runMarketingWorker } from '../../../../lib/marketing-mail';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const expected=`Bearer ${process.env.CRON_SECRET||''}`,given=request.headers.get('authorization')||'';
 if(!process.env.CRON_SECRET||given.length!==expected.length||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 await db()`DELETE FROM fw_marketing_rate_limits WHERE expires_at<now()`;
 await db()`DELETE FROM fw_marketing_presence WHERE seen_at<now()-interval '1 hour'`;
 after(()=>runMarketingWorker().catch(()=>console.error('Marketing recovery worker failed')));
 return Response.json({ok:true});
}
