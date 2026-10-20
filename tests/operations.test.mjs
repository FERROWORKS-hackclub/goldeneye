import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jobCost,dueState} from '../lib/operations.mjs';
import {can} from '../lib/policy.mjs';
test('job costing combines material, kWh, labour and overhead before markup',()=>{
 const result=jobCost({grams:100,costPerKg:25,hours:2,watts:150,energyRate:.4,labourHours:.25,labourRate:25,overhead:1,markup:30});
 assert.equal(result.costCents,987);assert.equal(result.suggestedCents,1283);assert.equal(result.materialCents,250);assert.equal(result.electricityCents,12);assert.equal(result.labourCents,625);
});
test('job costing rejects nonfinite and unsafe totals',()=>{assert.throws(()=>jobCost({grams:Infinity,costPerKg:25}));});
test('deadlines use Adelaide date boundaries and ignore completed work',()=>{
 const now=new Date('2026-10-17T14:00:00Z');
 assert.equal(dueState('2026-10-17','Planning',now),'Overdue');assert.equal(dueState('2026-10-18','Planning',now),'Due today');assert.equal(dueState('2026-10-25','New',now),'Due soon');assert.equal(dueState('2026-10-26','New',now),'');assert.equal(dueState('2026-10-17','Fulfilled',now),'');
});
test('financial links and customer records stay restricted',()=>{
 for(const role of ['member','viewer'])for(const area of ['allocations','quotes','orders'])assert.equal(can(role,area),false);
 assert.equal(can('manager','quotes',true),true);assert.equal(can('finance','orders',true),true);assert.equal(can('member','filament',true),true);assert.equal(can('viewer','jobs',true),false);
});
