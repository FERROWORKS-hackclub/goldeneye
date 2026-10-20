import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,defaultLimits,effectiveLimits,limitReason,ferroModels} from '../lib/ferroai-models.mjs';
import {canReadChat,canDeleteChat} from '../lib/ferroai-policy.mjs';
test('saved chats are private to their owner except for administrator safety review',()=>{
 const chat={user_id:'alice'};
 assert.equal(canReadChat({id:'alice',role:'member'},chat),true);
 assert.equal(canReadChat({id:'admin',role:'admin'},chat),true);
 for(const role of ['member','manager','finance','viewer'])assert.equal(canReadChat({id:'bob',role},chat),false);
 assert.equal(canReadChat({id:'admin',role:'admin'},undefined),false);
});
test('only the chat owner can delete its content',()=>{
 const chat={user_id:'alice'};
 assert.equal(canDeleteChat({id:'alice',role:'member'},chat),true);
 assert.equal(canDeleteChat({id:'bob',role:'member'},chat),false);
 assert.equal(canDeleteChat({id:'admin',role:'admin'},chat),false);
 assert.equal(canDeleteChat({id:'alice',role:'member'},undefined),false);
});
test('individual quotas override roles and roles override defaults',()=>{
 const settings={...defaultSettings,roleLimits:{member:{...defaultLimits,dailyRequests:50}},userLimits:{alice:{...defaultLimits,dailyRequests:7}}};
 assert.equal(effectiveLimits(settings,{id:'alice',role:'member'}).dailyRequests,7);
 assert.equal(effectiveLimits(settings,{id:'bob',role:'member'}).dailyRequests,50);
 assert.equal(effectiveLimits(settings,{id:'charlie',role:'admin'}).dailyRequests,100);
});
test('quota boundaries reject the next request at the limit',()=>{
 assert.equal(limitReason(defaultLimits,{daily:99,minute:5},24000),null);
 assert.match(limitReason(defaultLimits,{daily:100,minute:0},20),/daily/);
 assert.match(limitReason(defaultLimits,{daily:1,minute:6},20),/minute/);
 assert.match(limitReason(defaultLimits,{daily:1,minute:0},24001),/characters/);
});
test('disabling quotas still enforces bounded input',()=>{
 const limits={...defaultLimits,enabled:false};
 assert.equal(limitReason(limits,{daily:10000,minute:10000},100),null);
 assert.match(limitReason(limits,{daily:0,minute:0},24001),/characters/);
});
test('original models are retained alongside advanced models and real search modes',()=>{
 assert.equal(new Set(ferroModels.map(model=>model.id)).size,ferroModels.length);
 assert.ok(ferroModels.some(model=>model.id==='xingchen-agi/xing4.0-29b-a4b:free'));
 assert.ok(ferroModels.some(model=>model.id==='minimax/minimax-m3.1-flash:free'));
 assert.ok(ferroModels.some(model=>model.id==='nvidia/nemotron-3-ultra-550b-a55b:free'));
 assert.ok(ferroModels.some(model=>model.id==='google/gemma-4-31b-it:free'));
 assert.equal(ferroModels.filter(model=>model.live).length,3);
 assert.equal(ferroModels.filter(model=>model.kind==='embedding').length,1);
 assert.ok(ferroModels.every(model=>model.apiModel.endsWith(':free')));
 assert.ok(ferroModels.filter(model=>model.live).every(model=>model.kind==='chat'&&model.id!==model.apiModel));
});
