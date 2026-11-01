import { randomUUID } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from './server';
import { storedJson, workLogSummary } from './ferrosign-validation.mjs';

const ink=rgb(.12,.21,.17),green=rgb(.22,.45,.34),muted=rgb(.40,.47,.42),line=rgb(.84,.88,.84),pale=rgb(.96,.98,.96),orange=rgb(.94,.36,.21);
const asText=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
const dateText=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export type Worklog={id:string;title:string;name:string;email:string;week:string;signedAt:string;minutes:number;formatted:string;workedDays:number;skippedDays:number;needsHelp:boolean;helpDetails:string;metrics:{key:string;label:string;value:number}[];fields:any[];answers:Record<string,string>;completedBlob:string|null};

export async function getSignedWorklogs(start:string,end:string):Promise<Worklog[]>{
 const rows=await db()`SELECT d.id,d.title,d.completed_blob,r.name,r.email,r.signed_at,r.signer_order,n.fields,n.answers,
 (SELECT f->>'autoValue' FROM jsonb_array_elements(n.fields) f WHERE f->>'reportMetric'='week' AND f->>'recipientIndex'=(r.signer_order-1)::text LIMIT 1) AS week_start
 FROM fw_sign_documents d JOIN fw_sign_recipients r ON r.document_id=d.id
 CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(d.fields)='string' THEN (d.fields #>> '{}')::jsonb ELSE d.fields END AS fields,COALESCE(CASE WHEN jsonb_typeof(r.answers)='string' THEN (r.answers #>> '{}')::jsonb ELSE r.answers END,'{}'::jsonb) AS answers) n
 WHERE d.status='completed' AND r.signed_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(n.fields) f WHERE f->>'reportMetric'='weeklyMinutes')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(n.fields) f WHERE f->>'reportMetric'='week' AND (f->>'autoValue')::date>=${start}::date AND (f->>'autoValue')::date<${end}::date)
 ORDER BY week_start,r.name,r.email LIMIT 600`;
 return rows.map((row:any)=>{const fields=storedJson(row.fields,[]).filter((f:any)=>f.recipientIndex===row.signer_order-1),answers=storedJson(row.answers,{}),summary=workLogSummary(fields,answers);return {id:row.id,title:row.title,name:row.name,email:row.email,week:summary.week||String(row.week_start||''),signedAt:String(row.signed_at),minutes:summary.minutes,formatted:summary.formatted,workedDays:summary.workedDays,skippedDays:summary.skippedDays,needsHelp:summary.needsHelp,helpDetails:summary.helpDetails,metrics:summary.metrics,fields,answers,completedBlob:row.completed_blob||null}});
}

export function latestWorklogEntries(logs:Worklog[]){
 const groups=new Map<string,Worklog[]>();for(const log of logs){const key=`${log.email}:${log.week}`;groups.set(key,[...(groups.get(key)||[]),log])}
 return [...groups.values()].map(group=>{const latest=[...group].sort((a,b)=>Date.parse(b.signedAt)-Date.parse(a.signedAt))[0];return {...latest,needsHelp:group.some(log=>log.needsHelp),helpDetails:[...new Set(group.map(log=>log.helpDetails).filter(Boolean))].join(' · ')}}).sort((a,b)=>a.week.localeCompare(b.week)||a.name.localeCompare(b.name));
}

function text(page:any,text:string,x:number,y:number,size:number,font:any,color=ink){page.drawText(asText(text),{x,y,size,font,color,maxWidth:page.getWidth()-x-38,lineHeight:size*1.3});}
function addPie(page:any,cx:number,cy:number,r:number,values:number[]){
 const colors=[green,rgb(.22,.51,.75),rgb(.52,.40,.67),orange,rgb(.20,.60,.57),rgb(.47,.53,.45),rgb(.76,.57,.20),rgb(.69,.36,.39)];
 const total=values.reduce((a,b)=>a+b,0);if(!total){page.drawCircle({x:cx,y:cy,size:r,color:pale,borderColor:line,borderWidth:1});return}
 let angle=-Math.PI/2;values.forEach((value,index)=>{if(value<=0)return;const sweep=Math.PI*2*value/total,path=[`M ${r} ${r}`];for(let i=0;i<=36;i++){const a=angle+sweep*i/36;path.push(`L ${r+r*Math.cos(a)} ${r-r*Math.sin(a)}`)}path.push('Z');page.drawSvgPath(path.join(' '),{x:cx-r,y:cy+r,color:colors[index%colors.length],borderColor:rgb(1,1,1),borderWidth:.5});angle+=sweep});
}

export async function buildWorklogPdf(start:string,end:string,logs:Worklog[],{appendSignedForms=true,title='Fortnightly work log summary'}:{appendSignedForms?:boolean;title?:string}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),page=pdf.addPage([612,792]);
 const summaries=latestWorklogEntries(logs);
 page.drawRectangle({x:0,y:750,width:612,height:42,color:ink});page.drawText('FERROWORKS  /  DEVELOPMENT REPORT',{x:40,y:765,size:10,font:bold,color:rgb(1,1,1)});
 text(page,title,40,706,24,bold);text(page,`${dateText(start)} - ${dateText(end)}`,40,682,11,font,muted);
 text(page,'Signed weekly reports are summarized below. Source signed forms are attached after this summary.',40,656,10,font,muted);
 text(page,'Self-reported activity is context for support and planning; it is not a standalone measure of skill or value.',40,640,9,font,muted);
 const people=[...new Map(summaries.map(log=>[log.email,{name:log.name,email:log.email}])).values()];
 const totalMinutes=summaries.reduce((sum,log)=>sum+log.minutes,0),submitted=summaries.length;
 page.drawRectangle({x:40,y:564,width:532,height:54,color:pale,borderColor:line,borderWidth:1});
 text(page,`Signed work logs: ${submitted}`,52,596,12,bold,green);text(page,`Recorded time: ${Math.floor(totalMinutes/60)} h ${totalMinutes%60} min`,52,576,12,bold,green);
 text(page,'Share of submitted recorded time by staff member',40,532,12,bold);
 const totals=people.map(person=>summaries.filter(log=>log.email===person.email).reduce((sum,log)=>sum+log.minutes,0));addPie(page,112,430,62,totals);
 let legendY=485;people.slice(0,10).forEach((person,index)=>{const mins=totals[index]||0;page.drawCircle({x:207,y:legendY+3,size:4,color:[green,rgb(.22,.51,.75),rgb(.52,.40,.67),orange,rgb(.20,.60,.57),rgb(.47,.53,.45),rgb(.76,.57,.20),rgb(.69,.36,.39)][index%8]});text(page,`${person.name} - ${Math.floor(mins/60)} h ${mins%60} min`,220,legendY,9,font);legendY-=17});
 if(people.length>10)text(page,`and ${people.length-10} more staff members`,220,legendY,8,font,muted);
 text(page,'Week-by-week report metrics',40,330,13,bold);
 text(page,'Blank means no signed value was reported; it does not mean zero.',40,313,9,font,muted);
 const weeks=[...new Set(summaries.map(log=>log.week))].sort();let y=287;const metricKeys=[['emailsSent','Emails sent'],['tasksCompleted','Tasks completed'],['deliverablesCompleted','Deliverables completed']];
 let detailPage=page;
 for(const person of people){const personLogs=summaries.filter(log=>log.email===person.email);if(y<90){detailPage=pdf.addPage([612,792]);y=740;text(detailPage,'Work log detail (continued)',40,y,15,bold);y-=32;}
  text(detailPage,`${person.name}  |  ${personLogs.length} signed report(s)`,40,y,10,bold,green);y-=16;
  for(const [key,label] of metricKeys){const vals=weeks.map(week=>{const log=personLogs.find(item=>item.week===week);return log?.metrics.find(metric=>metric.key===key)?.value});if(vals.some(value=>value!==undefined)){
    const pieces=weeks.map((week,index)=>`${dateText(week)}: ${vals[index]===undefined?'not reported':vals[index]}`).join('   |   ');text(detailPage,`${label}: ${pieces}`,52,y,8,font);y-=13;
  }}
  const total=personLogs.reduce((sum,log)=>sum+log.minutes,0),help=personLogs.some(log=>log.needsHelp);text(detailPage,`Recorded time: ${Math.floor(total/60)} h ${total%60} min   |   Support requested: ${help?'yes':'no'}`,52,y,8,font,muted);y-=19;
 }
 if(appendSignedForms&&logs.some(log=>log.completedBlob)){const divider=pdf.addPage([612,792]);divider.drawRectangle({x:0,y:750,width:612,height:42,color:ink});divider.drawText('FERROWORKS  /  SIGNED SOURCE FORMS',{x:40,y:765,size:10,font:bold,color:rgb(1,1,1)});text(divider,'Signed weekly work logs',40,690,22,bold);text(divider,'The original signed PDFs follow in this section, unchanged.',40,660,11,font,muted);text(divider,`${new Set(logs.filter(log=>log.completedBlob).map(log=>log.id)).size} source form(s)`,40,632,11,bold,green);}
 if(appendSignedForms&&logs.length){const ids=[...new Set(logs.filter(log=>log.completedBlob).map(log=>log.id))];for(const id of ids){const log=logs.find(item=>item.id===id)!;try{const blob=await get(log.completedBlob!,{access:'private'});if(!blob||blob.statusCode!==200)continue;const bytes=await new Response(blob.stream).arrayBuffer(),source=await PDFDocument.load(bytes),copied=await pdf.copyPages(source,source.getPageIndices());copied.forEach(item=>pdf.addPage(item))}catch(error){console.error('Could not append signed work log',id,error)}}}
 return pdf.save();
}

export async function compileBiweeklyReport(start:string,end:string){
 const sql=db();await sql`CREATE TABLE IF NOT EXISTS fw_ferrosign_biweekly_reports(id uuid PRIMARY KEY,period_start date NOT NULL,period_end date NOT NULL,blob_path text NOT NULL,source_count integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(period_start,period_end))`;
 return sql.begin(async(tx:any)=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext('ferrosign:biweekly-report'))`;
  const [old]=await tx`SELECT id,period_start,period_end,source_count,created_at FROM fw_ferrosign_biweekly_reports WHERE period_start=${start}::date AND period_end=${end}::date`;
  if(old)return {...old,created:false};
  const logs=await getSignedWorklogs(start,addDays(end,1));const pdf=await buildWorklogPdf(start,end,logs);
  const reportId=randomUUID(),blob=await put(`ferrosign/reports/${reportId}/fortnightly.pdf`,new Blob([pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer],{type:'application/pdf'}),{access:'private',contentType:'application/pdf',addRandomSuffix:false});
  await tx`INSERT INTO fw_ferrosign_biweekly_reports(id,period_start,period_end,blob_path,source_count) VALUES (${reportId},${start}::date,${end}::date,${blob.pathname},${new Set(logs.map(log=>log.id)).size})`;
  return {id:reportId,period_start:start,period_end:end,source_count:new Set(logs.map(log=>log.id)).size,created_at:new Date().toISOString(),created:true};
 });
}
function addDays(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

export async function buildBusinessCardsPdf(people:{name:string;email:string}[]){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const pageW=595.28,pageH=841.89,cardW=255.12,cardH=155.91,gapX=28.35,gapY=5.67,startX=(pageW-(cardW*2+gapX))/2,startY=pageH-9;
 people.forEach((person,index)=>{
  if(index%10===0&&index>0){}const pageIndex=Math.floor(index/10),col=(index%10)%2,row=Math.floor((index%10)/2);let page=pdf.getPages()[pageIndex];if(!page)page=pdf.addPage([pageW,pageH]);
  const x=startX+col*(cardW+gapX),top=startY-row*(cardH+gapY),y=top-cardH;
  page.drawRectangle({x,y,width:cardW,height:cardH,color:rgb(1,1,1),borderColor:line,borderWidth:.8});
  page.drawRectangle({x,y,width:8,height:cardH,color:ink});
  // Compact outline mark inspired by the existing Ferrowork wordmark.
  const cx=x+29,cy=y+cardH-29,r=12;for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/6,b=Math.PI/3*(i+1)-Math.PI/6;page.drawLine({start:{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)},end:{x:cx+r*Math.cos(b),y:cy+r*Math.sin(b)},thickness:2,color:orange})}
  page.drawText('FERROWORKS',{x:x+49,y:y+cardH-32,size:10,font:bold,color:ink});
  const name=asText(person.name||'Ferroworks staff');let nameSize=17;while(nameSize>10&&bold.widthOfTextAtSize(name,nameSize)>cardW-34)nameSize--;
  page.drawText(name,{x:x+20,y:y+cardH-76,size:nameSize,font:bold,color:ink,maxWidth:cardW-34});
  page.drawLine({start:{x:x+20,y:y+58},end:{x:x+cardW-20,y:y+58},thickness:.7,color:line});
  let emailSize=9;const email=asText(person.email);while(emailSize>7&&font.widthOfTextAtSize(email,emailSize)>cardW-40)emailSize--;
  page.drawText(email,{x:x+20,y:y+39,size:emailSize,font,color:muted,maxWidth:cardW-38});
  page.drawText('ferroworks.org',{x:x+20,y:y+21,size:8,font:font,color:green});
  for(const [mx,my,dx,dy] of [[x-3,y-3,-1,0],[x+cardW+3,y-3,1,0],[x-3,y+cardH+3,-1,0],[x+cardW+3,y+cardH+3,1,0]])page.drawLine({start:{x:mx,y:my},end:{x:mx+dx*6,y:my},thickness:.5,color:muted});
 });
 if(!people.length){const page=pdf.addPage([pageW,pageH]);page.drawText('No active non-viewer staff accounts were found.',{x:40,y:pageH-60,size:13,font:await pdf.embedFont(StandardFonts.Helvetica),color:muted})}
 return pdf.save();
}
