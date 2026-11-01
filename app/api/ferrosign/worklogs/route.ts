import { NextResponse } from 'next/server';
import { db } from '../../../../lib/server';
import { currentUser,staff } from '../../../../lib/ferrosign';
import { storedJson,workLogSummary } from '../../../../lib/ferrosign-validation.mjs';
export async function GET(){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 const logs=await db()`SELECT d.id,d.title,r.name,r.email,r.signed_at,r.signer_order,n.fields,
 (SELECT COALESCE(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb) FROM jsonb_each(n.answers) entry WHERE entry.key IN (SELECT f->>'id' FROM jsonb_array_elements(n.fields) f WHERE f->>'type' NOT IN ('image','signature'))) AS answers
 FROM fw_sign_documents d JOIN fw_sign_recipients r ON r.document_id=d.id
 CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(d.fields)='string' THEN (d.fields #>> '{}')::jsonb ELSE d.fields END AS fields,COALESCE(CASE WHEN jsonb_typeof(r.answers)='string' THEN (r.answers #>> '{}')::jsonb ELSE r.answers END,'{}'::jsonb) AS answers) n
 WHERE r.signed_at IS NOT NULL AND r.signed_at >= now() - interval '3 months' AND d.status='completed' AND EXISTS (SELECT 1 FROM jsonb_array_elements(n.fields) f WHERE f->>'reportMetric'='weeklyMinutes')
 ORDER BY r.signed_at DESC LIMIT 600`;
 const latest=new Map<string,any>();for(const log of logs){const report={id:log.id,title:log.title,name:log.name,email:log.email,signedAt:log.signed_at,...workLogSummary(storedJson(log.fields,[]).filter((f:any)=>f.recipientIndex===log.signer_order-1),storedJson(log.answers,{}))},key=`${report.email}:${report.week}`;const existing=latest.get(key);if(!existing)latest.set(key,report);else{existing.needsHelp=existing.needsHelp||report.needsHelp;existing.helpDetails=[...new Set([existing.helpDetails,report.helpDetails].filter(Boolean))].join(' · ')}}
 const reports=[...latest.values()].sort((a,b)=>Number(b.needsHelp)-Number(a.needsHelp));
 return NextResponse.json({reports},{headers:{'Cache-Control':'private, no-store'}});
}
