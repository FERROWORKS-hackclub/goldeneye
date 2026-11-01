import { z } from 'zod';

export const staffRole = role => typeof role === 'string' && role !== 'viewer';
export const templateAccess = (user, ownerId, visibility) => Boolean(user && staffRole(user.role) && (user.id === ownerId || visibility === 'staff'));
export function sameOriginRequest(origin, requestUrl) {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(requestUrl).origin; } catch { return false; }
}
export const usableSigningLink = (row, now = new Date()) => Boolean(row && row.token_expires_at && Number.isFinite(new Date(row.token_expires_at).getTime()) && new Date(row.token_expires_at) > now);
const field = z.object({
  id: z.string().uuid(), type: z.enum(['signature','date','number','sentence','word','checkbox','duration','url','image','total']),
  label: z.string().trim().max(120), description: z.string().trim().max(1000).optional(), page: z.number().int().min(0),
  day:z.enum(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']).optional(), skipDay:z.boolean().optional(), reportMetric:z.enum(['week','weeklyMinutes','help','helpDetails','emailsSent','tasksCompleted','deliverablesCompleted']).optional(),
  autoValue: z.string().optional(), prepared: z.boolean().optional(),
  recipientIndex: z.number().int().min(0), required: z.boolean(),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
});
export const envelopeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fields: z.array(field).min(1).max(100),
  recipients: z.array(z.object({name:z.string().trim().min(1).max(120),email:z.email().trim().toLowerCase().max(254),role:z.enum(['staff','contractor','parent','signer']).optional()})).min(1).max(20),
}).superRefine((value, ctx) => {
  if (new Set(value.fields.map(f => f.id)).size !== value.fields.length) ctx.addIssue({code:'custom',message:'Field IDs must be unique.'});
  for (const f of value.fields) {
    if(f.autoValue!==undefined && (f.type==='signature'||(!(f.prepared && f.autoValue==='') && validateAnswers([f],{}).error)))ctx.addIssue({code:'custom',message:'Invalid automatic field value.'});
    if (f.recipientIndex >= value.recipients.length || f.x + f.width > 1 || f.y + f.height > 1) ctx.addIssue({code:'custom',message:'Invalid field placement or signer.'});
  }
  if(value.fields.filter(f=>f.type==='image').length>7)ctx.addIssue({code:'custom',message:'Use at most seven image fields per document.'});
  const skips=new Set();for(const f of value.fields){if(f.skipDay){const key=`${f.recipientIndex}:${f.day}`;if(f.type!=='checkbox'||!f.day||skips.has(key))ctx.addIssue({code:'custom',message:'Each day may have one skip control.'});skips.add(key)}if(f.reportMetric==='week'&&(f.type!=='date'||(f.autoValue&&new Date(f.autoValue).getUTCDay()!==1)))ctx.addIssue({code:'custom',message:'The weekly log must start on a Monday.'});}
  value.recipients.forEach((_,i) => {
    if (!value.fields.some(f => f.recipientIndex === i && f.type === 'signature' && f.required)) ctx.addIssue({code:'custom',message:'Place a required signature field for every signer.'});
  });
});

export function validateAnswers(fields, input, {partial=false}={}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {error:'Complete the required fields.'};
  const answers = {};
  if (Object.keys(input).some(key => !fields.some(f => f.id === key))) return {error:'Unknown field.'};
  const skipped=new Set(fields.filter(f=>f.skipDay&&input[f.id]==='true').map(f=>f.day));
  for (const f of fields) {
    if(f.day&&skipped.has(f.day)&&!f.skipDay)continue;
    if(f.type==='total')continue;
    if(f.type==='checkbox'){const checked=input[f.id]??'false';if(!['true','false'].includes(checked))return {error:'Invalid checkbox answer.'};answers[f.id]=checked;continue;}
    const value = f.autoValue ?? input[f.id];
    if (value === undefined || value === '') {
      if (f.required&&!partial) return {error:`Complete the ${f.label || f.type} field.`};
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) return {error:'Invalid field value.'};
    if(f.type==='image'){if(!validWorklogImage(value))return {error:'Use a PNG or JPEG image under 200 KB and 1,600 pixels per side.'};answers[f.id]=value;continue;}
    if (f.type === 'signature') {
      if (value.length > 1400000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return {error:'Signature must be a drawn PNG under 1 MB.'};
      const png = Buffer.from(value.split(',')[1], 'base64');
      if (png.length < 24 || png.length > 1024 * 1024 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) > 4096 || png.readUInt32BE(20) > 4096) return {error:'Invalid signature image.'};
    } else {
      if (value.length > (f.type === 'word' ? 80 : 500) || /[^\x20-\x7e\xa0-\xff]/.test(value)) return {error:'Use supported Latin text within the field limit.'};
      if(f.type==='url'){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error()}catch{return {error:'Enter a valid http or https timelapse link.'}}}
      if(f.type==='duration'&&(!/^\d+$/.test(value)||Number(value)>1440||(f.day&&Number(value)<1)))return {error:'Enter recorded work time as whole minutes (1–1,440), or skip the day.'};
      if(['emailsSent','tasksCompleted','deliverablesCompleted'].includes(f.reportMetric)&&(!/^\d+$/.test(value)||Number(value)>1000000))return {error:'Enter a whole-number count from 0 to 1,000,000.'};
      if (f.type === 'word' && /\s/.test(value.trim())) return {error:'Enter a single word.'};
      if (f.type === 'number' && !/^-?\d+(?:\.\d+)?$/.test(value)) return {error:'Enter a valid number.'};
      if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) return {error:'Enter a valid date.'};
    }
    answers[f.id] = value;
  }
  const report=workLogSummary(fields,answers);
  if(!partial&&report.needsHelp&&!report.helpDetails.trim())return {error:'Tell staff what you need help with.'};
  for(const f of fields.filter(f=>f.type==='total'))answers[f.id]=formatWorkMinutes(report.minutes);
  return {answers};
}

export const signerRolesSchema=z.array(z.object({label:z.string().trim().min(1).max(80),role:z.enum(['staff','contractor','parent','signer']),defaultCurrentUser:z.boolean().optional(),optionalUnder18:z.boolean().optional()})).min(1).max(20).superRefine((roles,ctx)=>{roles.forEach((role,i)=>{if(role.optionalUnder18&&(role.role!=='parent'||i!==roles.length-1))ctx.addIssue({code:'custom',message:'The conditional parent must be the final signer slot.'});if(role.defaultCurrentUser&&role.role!=='staff')ctx.addIssue({code:'custom',message:'Only staff slots can default to the current user.'})})});

export function storedJson(value,fallback){try{for(let i=0;i<3&&typeof value==='string';i++)value=JSON.parse(value);return value??fallback}catch{return fallback}}

export function formatWorkMinutes(minutes){return `${Math.floor(minutes/60)} h ${minutes%60} min`}
export function workLogSummary(fields,answers){
 const skip=new Set(fields.filter(f=>f.skipDay&&answers[f.id]==='true').map(f=>f.day));
 const durations=fields.filter(f=>f.type==='duration'&&!skip.has(f.day));
 const minutes=durations.reduce((sum,f)=>sum+(Number.isInteger(Number(answers[f.id]))&&Number(answers[f.id])>=0&&Number(answers[f.id])<=1440?Number(answers[f.id]):0),0);
 const metrics=fields.filter(f=>['emailsSent','tasksCompleted','deliverablesCompleted'].includes(f.reportMetric)&&answers[f.id]!==undefined).map(f=>({key:f.reportMetric,label:f.label,value:Number(answers[f.id])}));
 return {minutes,formatted:formatWorkMinutes(minutes),workedDays:durations.filter(f=>Number(answers[f.id])>0).length,skippedDays:skip.size,needsHelp:fields.some(f=>f.reportMetric==='help'&&answers[f.id]==='true'),helpDetails:fields.filter(f=>f.reportMetric==='helpDetails').map(f=>answers[f.id]||'').join(' '),week:fields.find(f=>f.reportMetric==='week')?.autoValue||'',metrics};
}
export function validWorklogImage(value){
 if(typeof value!=='string'||value.length>280000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 const bytes=Buffer.from(value.split(',')[1],'base64');if(bytes.length>200*1024||bytes.length<24)return false;
 let width=0,height=0;
 if(value.startsWith('data:image/png;')){if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20)}
 else{if(bytes[0]!==255||bytes[1]!==216)return false;let p=2;while(p+8<bytes.length){if(bytes[p]!==255)return false;const marker=bytes[p+1];p+=2;if(marker===217||marker===218)break;const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)return false;if([192,193,194].includes(marker)){height=bytes.readUInt16BE(p+3);width=bytes.readUInt16BE(p+5);break}p+=length}}
 return width>0&&height>0&&width<=1600&&height<=1600;
}
