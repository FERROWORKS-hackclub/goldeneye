import {test} from 'node:test';
import assert from 'node:assert/strict';
import {envelopeSchema,staffRole,usableSigningLink,validateAnswers,sameOriginRequest,templateAccess,signerRolesSchema,storedJson,workLogSummary,validWorklogImage} from '../lib/ferrosign-validation.mjs';
const field={id:'12345678-1234-4234-8234-123456789abc',type:'signature',label:'Signature',page:0,recipientIndex:0,required:true,x:0,y:0,width:.3,height:.1};
const envelope={title:'Agreement',fields:[field],recipients:[{name:'Test Signer',email:'test@example.com'}]};
test('staff mutations require the exact request origin including scheme and port',()=>{
 const url='https://sign.ferroworks.org/api/ferrosign/documents';
 assert.equal(sameOriginRequest('https://sign.ferroworks.org',url),true);
 for(const origin of [null,'null','bad-url','http://sign.ferroworks.org','https://other.ferroworks.org','https://sign.ferroworks.org.attacker.test','https://sign.ferroworks.org:444'])assert.equal(sameOriginRequest(origin,url),false);
});
test('only managers and admins create signing requests',()=>{
 for(const role of ['admin','manager'])assert.equal(staffRole(role),true);
 for(const role of ['member','finance','viewer',undefined])assert.equal(staffRole(role),false);
});
test('envelope validation rejects malformed, duplicate, out-of-bounds and unassigned fields',()=>{
 assert.equal(envelopeSchema.safeParse(envelope).success,true);
 for(const fields of [[null],[{...field,width:0}],[{...field,x:.9}],[{...field,recipientIndex:1}],[field,field],[{...field,required:false}],[{...field,id:'__proto__'}]])assert.equal(envelopeSchema.safeParse({...envelope,fields}).success,false);
 assert.equal(envelopeSchema.safeParse({...envelope,recipients:[...envelope.recipients,{name:'Other',email:'other@example.com'}]}).success,false);
});
test('link expiry fails closed for missing or invalid timestamps and at expiry',()=>{
 const now=new Date('2026-10-30T00:00:00Z');
 assert.equal(usableSigningLink({token_expires_at:'2026-10-31'},now),true);
 for(const row of [null,{}, {token_expires_at:null},{token_expires_at:'invalid'},{token_expires_at:now}])assert.equal(usableSigningLink(row,now),false);
});
test('answers reject missing required fields, cross-signer fields and forged PNGs',()=>{
 for(const input of [null,[],{}, {[field.id]:123},{[field.id]:'data:image/png;base64,YWJj'}, {unknown:'value'}])assert.ok(validateAnswers([field],input).error);
});
test('text fields enforce dates, numbers, words, bounds and PDF font support',()=>{
 const check=(type,value)=>validateAnswers([{...field,type}],{[field.id]:value});
 for(const [type,value] of [['date','2026-02-30'],['date','yesterday'],['number','NaN'],['number','1e999'],['word','two words'],['sentence','a'.repeat(501)],['sentence','漢字'],['sentence','   ']])assert.ok(check(type,value).error);
 for(const [type,value] of [['date','2026-10-30'],['number','-42.5'],['word','accepted'],['sentence','I agree.']])assert.equal(check(type,value).answers[field.id],value);
});
test('each signature field remains independently required for multiple signers',()=>{
 const second={...field,id:'12345678-1234-4234-8234-123456789abd'};
 assert.equal(envelopeSchema.safeParse({...envelope,fields:[field,{...second,recipientIndex:1}],recipients:[...envelope.recipients,{name:'Second',email:'second@example.com'}]}).success,true);
 assert.ok(validateAnswers([field,second],{[field.id]:'test'}).error);
});

test('automatic dates are server-controlled and reject invalid values',()=>{
 const fields=[{id:'date-field',type:'date',label:'Agreement starts',required:true,autoValue:'2026-11-01'}];
 assert.deepEqual(validateAnswers(fields,{'date-field':'2099-01-01'}).answers,{'date-field':'2026-11-01'});
 assert.deepEqual(validateAnswers(fields,{}).answers,{'date-field':'2026-11-01'});
});

test('private templates belong to their staff owner and shared templates require staff access',()=>{
 assert.equal(templateAccess({id:'owner',role:'manager'},'owner','private'),true);
 assert.equal(templateAccess({id:'other',role:'admin'},'owner','private'),false);
 assert.equal(templateAccess({id:'other',role:'manager'},'owner','staff'),true);
 for(const role of ['member','viewer','finance'])assert.equal(templateAccess({id:'owner',role},'owner','staff'),false);
 assert.equal(templateAccess(null,'owner','staff'),false);
});

test('contractor templates keep the conditional parent in the final slot',()=>{
 const roles=[{label:'Staff',role:'staff',defaultCurrentUser:true},{label:'Contractor',role:'contractor'},{label:'Parent',role:'parent',optionalUnder18:true}];
 assert.equal(signerRolesSchema.safeParse(roles).success,true);
 assert.equal(signerRolesSchema.safeParse([roles[2],roles[0]]).success,false);
 assert.equal(signerRolesSchema.safeParse([{label:'Contractor',role:'contractor',defaultCurrentUser:true}]).success,false);
});
test('prepared contract details are allowed in templates but required before signing',()=>{
 const prepared={...field,type:'sentence',id:'12345678-1234-4234-8234-123456789abe',label:'Services',prepared:true,autoValue:''};
 assert.equal(envelopeSchema.safeParse({...envelope,fields:[field,prepared]}).success,true);
 assert.ok(validateAnswers([prepared],{}).error);
 assert.equal(validateAnswers([{...prepared,autoValue:'Build agreed deliverables'}],{}).answers[prepared.id],'Build agreed deliverables');
 assert.equal(envelopeSchema.safeParse({...envelope,fields:[{...field,autoValue:'forged signature'}]}).success,false);
});

test('legacy JSON text is decoded without losing field or signer role metadata',()=>{
 const value={roles:[{role:'parent',optionalUnder18:true}],fields:[field]};
 assert.deepEqual(storedJson(JSON.stringify(value),{}),value);
 assert.deepEqual(storedJson(JSON.stringify(JSON.stringify(value)),{}),value);
 assert.deepEqual(storedJson(value,{}),value);
 assert.deepEqual(storedJson('bad-json',[]),[]);
});

const evidence='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzXcAAAAASUVORK5CYII=';
const logFields=[{id:'skip',type:'checkbox',day:'Monday',skipDay:true},{id:'minutes',type:'duration',day:'Monday',required:true},{id:'summary',type:'sentence',day:'Monday',required:true},{id:'link',type:'url',day:'Monday',required:true},{id:'image',type:'image',day:'Monday',required:true},{id:'total',type:'total',reportMetric:'weeklyMinutes'}];
test('skipped work-log days do not require evidence and discard stale values',()=>{
 const result=validateAnswers(logFields,{skip:'true',minutes:'99999',image:'bad',summary:'stale'});
 assert.equal(result.error,undefined);assert.equal(result.answers.total,'0 h 0 min');assert.equal(result.answers.minutes,undefined);assert.equal(result.answers.image,undefined);
});
test('working days require evidence, safe links and whole recorded minutes',()=>{
 const input={skip:'false',minutes:'90',summary:'Implemented the settings screen.',link:'https://example.com/lapse',image:evidence,total:'999 h'};
 assert.ok(validateAnswers(logFields,{}).error);assert.equal(validateAnswers(logFields,input).answers.total,'1 h 30 min');
 for(const minutes of ['-1','0','1.5','1441'])assert.ok(validateAnswers(logFields,{...input,minutes}).error);
 for(const link of ['javascript:alert(1)','https://user:password@example.com/','not a URL'])assert.ok(validateAnswers(logFields,{...input,link}).error);
 assert.ok(validateAnswers(logFields,{...input,image:'data:image/svg+xml;base64,PHN2Zz4='}).error);
 assert.equal(validWorklogImage(evidence),true);
});
test('weekly totals ignore skipped days and cannot be supplied by the signer',()=>{
 const fields=[...logFields,{id:'skip2',type:'checkbox',day:'Tuesday',skipDay:true},{id:'minutes2',type:'duration',day:'Tuesday',required:true}];
 const result=validateAnswers(fields,{skip:'false',minutes:'61',summary:'Fixed a bug.',link:'https://example.com',image:evidence,skip2:'true',minutes2:'120',total:'fake'});
 assert.equal(result.answers.total,'1 h 1 min');assert.equal(workLogSummary(fields,result.answers).skippedDays,1);
});
test('drafts may be incomplete but still validate supplied evidence and support requests',()=>{
 assert.equal(validateAnswers(logFields,{summary:'Draft notes'},{partial:true}).error,undefined);
 assert.ok(validateAnswers(logFields,{link:'javascript:bad'},{partial:true}).error);
 const help=[{id:'help',type:'checkbox',reportMetric:'help'},{id:'notes',type:'sentence',reportMetric:'helpDetails'}];
 assert.ok(validateAnswers(help,{help:'true'}).error);assert.equal(validateAnswers(help,{help:'true',notes:'Please review the API approach.'}).error,undefined);
 assert.equal(validateAnswers(help,{help:'true'},{partial:true}).error,undefined);
});
