import {test} from 'node:test';
import assert from 'node:assert/strict';
import {envelopeSchema,staffRole,usableSigningLink,validateAnswers,sameOriginRequest,templateAccess,signerRolesSchema} from '../lib/ferrosign-validation.mjs';
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
