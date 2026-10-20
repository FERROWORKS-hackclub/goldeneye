import {test} from 'node:test';
import assert from 'node:assert/strict';
import {can,cents} from '../lib/policy.mjs';
test('only admins can manage identities, launchers and audit',()=>{for(const role of ['manager','member','finance','viewer']){assert.equal(can(role,'users',true),false);assert.equal(can(role,'links',true),false);assert.equal(can(role,'audit'),false);}assert.equal(can('admin','users',true),true);});
test('finance data is restricted to finance and admins',()=>{for(const role of ['manager','member','viewer'])assert.equal(can(role,'transactions'),false);assert.equal(can('finance','transactions',true),true);});
test('project readers cannot modify work',()=>{for(const role of ['viewer','finance']){assert.equal(can(role,'projects'),true);assert.equal(can(role,'tasks',true),false);}assert.equal(can('member','tasks',true),true);});
test('all known roles can launch shared websites',()=>{for(const role of ['admin','manager','member','finance','viewer'])assert.equal(can(role,'links'),true);});
test('money is stored in integer cents and rejects invalid amounts',()=>{assert.equal(cents(19.99),1999);assert.equal(cents(0.1),10);for(const v of [-1,0,Infinity,NaN,'invalid',1000000001])assert.throws(()=>cents(v));});
