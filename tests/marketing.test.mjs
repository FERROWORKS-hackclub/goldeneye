import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { marketingStaff,surveyAnswersSchema,publicSurveySchema,newEmailBlock,campaignSchema,applyCampaignOperation,operationKey,renderCampaignEmail,parseEmailAudience,parseContactsCsv,csvCell,percentages,browserDetails } from '../lib/marketing-validation.mjs';
import { marketingToken,verifyMarketingToken } from '../lib/marketing-tokens.mjs';
const answers={price:2500,shippingDays:14,drive:'Direct drive',make:'Enclosures and useful workshop fixtures.',priority:'3D printer',filament:['PLA','PETG'],wood:['Plywood'],tradeoffs:['Price','Quality'],continent:'Oceania',wouldBuy:'Maybe'};
const draft=()=>({name:'Launch update',subject:'A new chapter',preheader:'From the workshop',blocks:[newEmailBlock('heading',randomUUID()),newEmailBlock('text',randomUUID()),newEmailBlock('button',randomUUID())]});
test('marketing is available to every known staff role and never viewers or arbitrary roles',()=>{for(const role of ['admin','manager','member','finance'])assert.ok(marketingStaff(role));for(const role of ['viewer','owner','',null,undefined])assert.equal(marketingStaff(role),false);});
test('research enforces the five AUD prices, shipping bounds, buying intent and exactly two distinct priorities',()=>{
 assert.equal(surveyAnswersSchema.parse(answers).price,2500);
 for(const patch of [{price:2249},{price:2600},{shippingDays:3},{shippingDays:36},{tradeoffs:['Speed']},{tradeoffs:['Speed','Price','Quality']},{tradeoffs:['Price','Price']},{wouldBuy:'Definitely'},{filament:[]},{wood:[]},{filament:['Other']}])assert.equal(surveyAnswersSchema.safeParse({...answers,...patch}).success,false);
});
test('survey capture requires disclosed-data consent and strips forged location and subscription status',()=>{
 const input={name:' Maker ',email:'MAKER@example.com',browserId:randomUUID(),requestId:randomUUID(),startedAt:Date.now()-5000,privacyConsent:true,newsletterConsent:false,answers,ip:'forged',status:'subscribed'};
 const parsed=publicSurveySchema.parse(input);assert.equal(parsed.email,'maker@example.com');assert.equal(parsed.newsletterConsent,false);assert.equal(parsed.ip,undefined);assert.equal(parsed.status,undefined);assert.equal(publicSurveySchema.safeParse({...input,privacyConsent:false}).success,false);
});
test('every marketing email has a visible unsubscribe link in both HTML and plain text',()=>{
 const c=draft();c.blocks=[];const url='https://goldeneye.ferroworks.org/unsubscribe?token=example';
 const output=renderCampaignEmail(c,url);assert.match(output.html,/Unsubscribe from marketing emails/);assert.ok(output.html.includes(url));assert.ok(output.text.includes(url));assert.throws(()=>renderCampaignEmail(c,''));assert.throws(()=>renderCampaignEmail(c,'javascript:alert(1)'));
});
test('email blocks escape content and reject executable URLs, injected CSS and header injection',()=>{
 const c=draft();c.blocks[0].text='<script>alert(1)</script> {{name}}';
 const output=renderCampaignEmail(c,'https://example.com/unsubscribe',{name:'<img src=x onerror=alert(1)>'});assert.ok(!output.html.includes('<script>'));assert.ok(!output.html.includes('<img src=x'));assert.match(output.html,/&lt;script&gt;/);
 for(const patch of [{url:'javascript:alert(1)'},{image:'data:image/svg+xml,evil'},{color:'red;display:none'}])assert.throws(()=>campaignSchema.parse({...c,blocks:[{...c.blocks[1],...patch}]}));
 assert.throws(()=>campaignSchema.parse({...c,subject:'Subject\r\nBcc: other@example.com'}));assert.throws(()=>campaignSchema.parse({...c,blocks:[c.blocks[0],c.blocks[0]]}));
});
test('block reordering preserves other editors’ text and stable block identifiers',()=>{
 const c=draft(),id=c.blocks[0].id;
 const updated=applyCampaignOperation(c,{kind:'field',blockId:id,field:'text',value:'Shared latest text'});
 const moved=applyCampaignOperation(updated,{kind:'move',blockId:id,beforeId:null});assert.equal(moved.blocks.at(-1).text,'Shared latest text');assert.equal(moved.blocks.at(-1).id,id);
 assert.notEqual(operationKey({kind:'field',blockId:id,field:'text'}),operationKey({kind:'setting',field:'subject'}));
 assert.throws(()=>applyCampaignOperation({...c,blocks:[]},{kind:'field',blockId:id,field:'text',value:'deleted'}));
});
test('unsubscribe, confirmation and worker tokens are purpose-bound and reject tampering',()=>{
 const secret='isolated-marketing-test-secret',id=randomUUID(),token=marketingToken('unsubscribe',id,secret);
 assert.equal(verifyMarketingToken('unsubscribe',token,secret),id);assert.equal(verifyMarketingToken('worker',token,secret),null);assert.equal(verifyMarketingToken('confirmation',token,secret),null);assert.equal(verifyMarketingToken('unsubscribe',token+'x',secret),null);assert.equal(verifyMarketingToken('unsubscribe',token,'other-secret'),null);
});
test('custom addresses are normalised and deduplicated; CSV imports handle quoted names and reject malformed rows',()=>{
 assert.deepEqual(parseEmailAudience('A@example.com, a@example.com; b@example.com\n'),['a@example.com','b@example.com']);assert.throws(()=>parseEmailAudience('good@example.com,not-an-email'));
 assert.deepEqual(parseContactsCsv('email,name\r\nA@example.com,"Alex, Maker"'),[{email:'a@example.com',name:'Alex, Maker'}]);assert.throws(()=>parseContactsCsv('email,name\na@example.com,"unfinished'));assert.ok(csvCell('=HYPERLINK("evil")').startsWith('"\''));
});
test('report percentages use respondents and handle empty research data without NaN',()=>{assert.deepEqual(percentages({Yes:2,No:1},3),[{label:'Yes',count:2,percent:66.7},{label:'No',count:1,percent:33.3}]);assert.equal(percentages({Yes:0},0)[0].percent,0);assert.equal(browserDetails('Mozilla/5.0 (iPhone) Mobile Safari/605.1').device,'Mobile');});
