import { db } from '../../../../lib/server';
import { marketingUser,marketingFailure } from '../../../../lib/marketing';
import { csvCell,surveyLabels } from '../../../../lib/marketing-validation.mjs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){try{
 await marketingUser();const kind=new URL(request.url).searchParams.get('kind')||'research';
 const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){try{
  if(kind==='contacts'){
   controller.enqueue(encoder.encode(['name','email','status','consent_source','consent_at','created_at'].map(csvCell).join(',')+'\r\n'));
   for await(const rows of db()`SELECT name,email,status,consent_source,consent_at,created_at FROM fw_marketing_contacts ORDER BY created_at DESC`.cursor(100))for(const row of rows)controller.enqueue(encoder.encode(Object.values(row).map(csvCell).join(',')+'\r\n'));
  }else{
   const keys=Object.keys(surveyLabels);controller.enqueue(encoder.encode(['Response ID','Date','Name','Email',...Object.values(surveyLabels),'Newsletter consent','Browser ID','IP address','Country','Region','City','Browser','Device','OS'].map(csvCell).join(',')+'\r\n'));
   for await(const rows of db()`SELECT * FROM fw_research_responses ORDER BY created_at DESC`.cursor(100))for(const row of rows){const values=[row.id,row.created_at,row.name,row.email,...keys.map(k=>Array.isArray(row.answers[k])?row.answers[k].join('; '):row.answers[k]),row.newsletter_consent,row.browser_id,row.metadata.ip,row.metadata.country,row.metadata.region,row.metadata.city,row.metadata.browser,row.metadata.device,row.metadata.os];controller.enqueue(encoder.encode(values.map(csvCell).join(',')+'\r\n'));}
  }
  controller.close();
 }catch(error){controller.error(error);}}});
 return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="ferroworks-${kind==='contacts'?'contacts':'research'}.csv"`,'Cache-Control':'no-store'}});
}catch(error){return marketingFailure(error);}}
