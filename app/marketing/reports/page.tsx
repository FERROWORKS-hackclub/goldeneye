import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '../../../lib/server';
import { marketingUser,researchSummary } from '../../../lib/marketing';
import { surveyLabels } from '../../../lib/marketing-validation.mjs';
import { ResearchCharts } from '../charts';
import PrintButton from './print-button';
import '../marketing.css';
export const dynamic='force-dynamic';
export const metadata={title:'FERROWORKER research report | Goldeneye'};
export default async function Page({searchParams}:{searchParams:Promise<{id?:string;all?:string}>}){
 try{await marketingUser();}catch{redirect('/marketing');}
 const {id,all}=await searchParams;
 if(id)z.uuid().parse(id);
 const responses=id?await db()`SELECT * FROM fw_research_responses WHERE id=${id}`:all==='1'?await db()`SELECT * FROM fw_research_responses ORDER BY created_at DESC LIMIT 2000`:[];
 const summary=!id?await researchSummary():null;
 return <main className="mk mk-report"><div className="mk-no-print mk-report-toolbar"><a href="/marketing">← Marketing</a><PrintButton/></div><header className="mk-report-brand"><span>F / FERROWORKS</span><small>GOLDENEYE · PRODUCT RESEARCH</small></header>
 {summary&&<><h1>What makers want.</h1><p className="mk-muted">FERROWORKER survey · {new Date().toLocaleDateString('en-AU',{timeZone:'Australia/Adelaide'})} · All responses</p><div className="mk-metrics"><div><small>Responses</small><b>{summary.count}</b></div><div><small>Average fair price</small><b>${summary.average_price.toFixed(0)} AUD</b></div><div><small>Average shipping time</small><b>{summary.average_shipping.toFixed(1)} days</b></div><div><small>Newsletter opt-ins</small><b>{summary.opted_in}</b></div></div><p className="mk-note">Percentages use all {summary.count} respondents as the denominator. Multi-select totals can exceed 100%. IP locations are approximate and can reflect VPNs or shared networks.</p><ResearchCharts summary={summary}/></>}
 {responses.map(r=><article className="mk-response-sheet" key={r.id}><header><small>FERROWORKER · RESPONSE SHEET</small><h1>{r.name}</h1><p>{r.email}</p><p className="mk-muted">{new Date(r.created_at).toLocaleString('en-AU',{timeZone:'Australia/Adelaide'})} · {r.id}</p></header><dl><div><dt>Newsletter opt-in</dt><dd>{r.newsletter_consent?'Yes (confirmation required)':'No'}</dd></div>{Object.entries(surveyLabels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{Array.isArray(r.answers[key])?r.answers[key].join(', '):String(r.answers[key]??'—')}</dd></div>)}</dl><section className="mk-response-metadata"><h3>Submission details · internal</h3><p>IP: {r.metadata.ip||'Unavailable'} · Estimated location: {[r.metadata.city,r.metadata.region,r.metadata.country].filter(Boolean).join(', ')||'Unavailable'}</p><p>{r.metadata.browser} · {r.metadata.os} · {r.metadata.device} · Browser ID: {r.browser_id}</p><p className="mk-muted">{r.metadata.locationSource}</p></section></article>)}
 {all==='1'&&responses.length===2000&&<p>Printable response sheets are limited to the newest 2,000 entries. Use CSV export for the complete database.</p>}
 </main>;
}
