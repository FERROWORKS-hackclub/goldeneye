import { z } from 'zod';

export const marketingStaff = role => ['admin','manager','member','finance'].includes(role);
export const priceOptions=[2250,2500,2750,3000,3250];
export const surveyChoices={
 drive:['Direct drive','AMS-style material system','Both','Not sure'],
 priority:['3D printer','Laser','CNC'],
 filament:['PLA','PETG','ABS / ASA','TPU','Nylon','Carbon-fibre composite','Not sure','Other'],
 wood:['Plywood','MDF','Pine','Hardwood','Balsa','None','Not sure','Other'],
 tradeoffs:['Speed','Price','Quality'],
 continent:['Africa','Antarctica','Asia','Europe','North America','Oceania','South America','Prefer not to say'],
 wouldBuy:['Yes','Maybe','No'],
};
export const surveyLabels={price:'Fair price (AUD)',shippingDays:'Preferred shipping time (days)',drive:'Preferred drive / material system',make:'What would you make?',priority:'Priority tool',filament:'Filaments',filamentOther:'Other filament',wood:'Wood types',woodOther:'Other wood',tradeoffs:'Two most important factors',continent:'Continent',wouldBuy:'Would you buy this machine?'};
const choices=(values,max=values.length)=>z.array(z.enum(values)).min(1).max(max).refine(v=>new Set(v).size===v.length,'Choose each option once');
export const surveyAnswersSchema=z.object({
 price:z.number().refine(v=>priceOptions.includes(v),'Choose one of the five prices'),
 shippingDays:z.number().int().min(4).max(35),drive:z.enum(surveyChoices.drive),
 make:z.string().trim().min(2).max(2000),priority:z.enum(surveyChoices.priority),
 filament:choices(surveyChoices.filament),filamentOther:z.string().trim().max(200).default(''),
 wood:choices(surveyChoices.wood),woodOther:z.string().trim().max(200).default(''),
 tradeoffs:choices(surveyChoices.tradeoffs,2).refine(v=>v.length===2,'Choose exactly two'),
 continent:z.enum(surveyChoices.continent),wouldBuy:z.enum(surveyChoices.wouldBuy),
}).superRefine((v,ctx)=>{for(const key of ['filament','wood'])if(v[key].includes('Other')&&!v[`${key}Other`])ctx.addIssue({code:'custom',path:[`${key}Other`],message:'Please describe your other choice'});});
export const subscriberSchema=z.object({name:z.string().trim().min(1).max(160),email:z.email().trim().toLowerCase().max(254),browserId:z.uuid(),requestId:z.uuid(),website:z.string().max(300).default(''),startedAt:z.number(),privacyConsent:z.literal(true),newsletterConsent:z.boolean(),metadata:z.object({timezone:z.string().max(80).default(''),language:z.string().max(50).default(''),screen:z.string().max(40).default('')}).default({})});
export const publicSurveySchema=subscriberSchema.extend({answers:surveyAnswersSchema});
const color=z.string().regex(/^#[0-9a-f]{6}$/i);
export function safeEmailUrl(value, image=false){if(!value)return '';try{const u=new URL(value);if(u.username||u.password)return '';if(u.protocol==='https:'||(!image&&u.protocol==='mailto:'))return u.href;}catch{}return '';}
const url=(image=false)=>z.string().trim().max(2000).refine(v=>!v||!!safeEmailUrl(v,image),'Use an HTTPS URL');
export const blockSchema=z.object({id:z.uuid(),type:z.enum(['heading','text','image','button','divider','columns']),text:z.string().max(8000).default(''),rightText:z.string().max(8000).default(''),url:url().default(''),image:url(true).default(''),alt:z.string().max(200).default(''),align:z.enum(['left','center','right']).default('left'),color:color.default('#193b2c'),background:color.default('#ffffff')});
export const campaignSchema=z.object({name:z.string().trim().min(1).max(160),subject:z.string().max(200).refine(v=>!/[\r\n]/.test(v),'Use a single-line subject'),preheader:z.string().max(300),blocks:z.array(blockSchema).max(80).refine(v=>new Set(v.map(b=>b.id)).size===v.length,'Blocks must have unique identifiers')});
export const operationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('setting'),field:z.enum(['name','subject','preheader']),value:z.string().max(300)}),
 z.object({kind:z.literal('field'),blockId:z.uuid(),field:z.enum(['text','rightText','url','image','alt','align','color','background']),value:z.string().max(8000)}),
 z.object({kind:z.literal('insert'),block:blockSchema,beforeId:z.uuid().nullable()}),
 z.object({kind:z.literal('remove'),blockId:z.uuid()}),
 z.object({kind:z.literal('move'),blockId:z.uuid(),beforeId:z.uuid().nullable()}),
]);
export function operationKey(op){return op.kind==='setting'?`setting:${op.field}`:op.kind==='field'?`block:${op.blockId}:${op.field}`:'structure';}
export function applyCampaignOperation(campaign,operation,validate=true){
 const op=operationSchema.parse(operation);const next={...campaign,blocks:campaign.blocks.map(b=>({...b}))};
 if(op.kind==='setting')next[op.field]=op.value;
 else if(op.kind==='field'){const b=next.blocks.find(b=>b.id===op.blockId);if(!b)throw Error('This block was removed by another editor.');b[op.field]=op.value;}
 else if(op.kind==='remove')next.blocks=next.blocks.filter(b=>b.id!==op.blockId);
 else {
   const b=op.kind==='insert'?op.block:next.blocks.find(b=>b.id===op.blockId);
   if(!b)throw Error('This block was removed by another editor.');
   if(op.kind==='insert'&&next.blocks.some(x=>x.id===b.id))return next;
   next.blocks=next.blocks.filter(x=>x.id!==b.id);
   const index=op.beforeId?next.blocks.findIndex(x=>x.id===op.beforeId):-1;
   next.blocks.splice(index<0?next.blocks.length:index,0,b);
 }
 if(validate)campaignSchema.parse(next);return next;
}
export function newEmailBlock(type,id){return blockSchema.parse({id,type,text:type==='heading'?'Something worth making.':type==='button'?'See what’s new':type==='text'?'A new chapter at Ferroworks. Share the latest from the workshop here.':'',url:type==='button'?'https://ferroworks.org/':''});}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function renderCampaignEmail(campaign,unsubscribeUrl,{name='',preview=false,footer='Ferroworks · Brisbane, Queensland, Australia'}={}){
 const data=campaignSchema.parse(campaign);
 if(!safeEmailUrl(unsubscribeUrl))throw Error('A valid unsubscribe link is required for every marketing email.');
 const e=escapeHtml,personalize=s=>e(s.replaceAll('{{name}}',name||'there')).replaceAll('\n','<br>');
 const blocks=data.blocks.map(b=>{
  const styles=`text-align:${b.align};color:${b.color};background:${b.background};padding:16px 28px;`;
  let content='';
  if(b.type==='heading')content=`<h1 style="font-size:30px;line-height:1.2;margin:0">${personalize(b.text)}</h1>`;
  if(b.type==='text')content=`<p style="font-size:16px;line-height:1.7;margin:0">${personalize(b.text)}</p>`;
  if(b.type==='image')content=b.image?`<img src="${e(safeEmailUrl(b.image,true))}" alt="${e(b.alt)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:8px">`:`<p style="color:#718076">${preview?'Add an HTTPS image URL':''}</p>`;
  if(b.type==='button')content=`<a href="${e(safeEmailUrl(b.url)||'https://ferroworks.org/')}" style="display:inline-block;background:#193b2c;color:#ffffff;padding:13px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${personalize(b.text||'Learn more')}</a>`;
  if(b.type==='divider')content='<hr style="border:0;border-top:1px solid #dce2dc">';
  if(b.type==='columns')content=`<table role="presentation" width="100%"><tr><td width="50%" style="padding-right:12px;vertical-align:top">${personalize(b.text)}</td><td width="50%" style="padding-left:12px;vertical-align:top">${personalize(b.rightText)}</td></tr></table>`;
  return `<tr><td style="${styles}">${content}</td></tr>`;
 }).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(data.subject)}</title></head><body style="margin:0;background:#f3f5f1;color:#193b2c;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${e(data.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dde4db;border-radius:12px;overflow:hidden"><tr><td style="padding:28px;font-size:13px;font-weight:bold;letter-spacing:3px;color:#193b2c">FERROWORKS</td></tr>${blocks}<tr><td style="padding:28px;border-top:1px solid #e2e7df;font-size:12px;color:#58685e;line-height:1.7">${e(footer)}<br>Sent from newsletter@ferroworks.org.<br><a href="${e(unsubscribeUrl)}" style="color:#193b2c;text-decoration:underline">Unsubscribe from marketing emails</a></td></tr></table></td></tr></table></body></html>`;
 const text=[data.subject,...data.blocks.flatMap(b=>[b.text,b.rightText,b.url].filter(Boolean)),footer,'Unsubscribe from marketing emails: '+unsubscribeUrl].join('\n\n').replaceAll('{{name}}',name||'there');
 return {html,text};
}
export function parseEmailAudience(value){return [...new Set(String(value||'').split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))].map(email=>z.email().max(254).parse(email));}
export function csvCell(value){return '"'+String(value??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';}
export function parseContactsCsv(source){
 if(source.length>200000)throw Error('Import up to 200 KB at once.');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw Error('CSV contains an unclosed quote.');row.push(field);if(row.some(Boolean))rows.push(row);
 const header=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase())||[];
 const ei=header.indexOf('email'),ni=header.indexOf('name');if(ei<0)throw Error('CSV needs an email column and an optional name column.');
 if(rows.length>500)throw Error('Import up to 500 contacts at once.');
 return rows.map(r=>({email:z.email().max(254).parse((r[ei]||'').trim().toLowerCase()),name:z.string().max(160).parse((r[ni]||'').trim())}));
}
export function browserDetails(userAgent){
 const ua=String(userAgent||'').slice(0,700);
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
 const device=/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|Android|iPhone/i.test(ua)?'Mobile':'Desktop / other';
 const os=/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
 return {browser,device,os,userAgent:ua};
}
export function percentages(counts,total){return Object.entries(counts).map(([label,count])=>({label,count:Number(count),percent:total?Math.round(Number(count)/total*1000)/10:0}));}
