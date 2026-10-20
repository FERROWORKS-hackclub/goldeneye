import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HCB_ORG, normalizeHcb} from '../lib/hcb.mjs';
const org = {id: HCB_ORG, transparent: true, name: 'FERROWORKS', slug: 'ferroworks', balances: {balance_cents: 3201, incoming_balance_cents: 0, total_raised: 3442}};
test('HCB preserves signed integer cents, pending state and USD separately', () => {
  const result = normalizeHcb(org, [{id:'txn_a', memo:'Parts', amount_cents:-241, pending:true, date:'2026-10-18', type:'card_charge', user:{email:'private'}}], 1, 50);
  assert.equal(result.currency, 'USD'); assert.equal(result.organization.balanceCents, 3201);
  assert.equal(result.transactions[0].amountCents, -241); assert.equal(result.transactions[0].type, 'Expense');
  assert.equal(result.transactions[0].status, 'Pending'); assert.equal(result.hasMore, false);
  assert.equal(result.transactions[0].user, undefined);
});
test('HCB rejects wrong organizations, private responses and invalid amounts', () => {
  assert.throws(() => normalizeHcb({...org,id:'other'}, [],1,50));
  assert.throws(() => normalizeHcb({...org,transparent:false}, [],1,50));
  assert.throws(() => normalizeHcb({...org,balances:{...org.balances,balance_cents:1.2}}, [],1,50));
});
test('HCB pagination is based on returned page size', () => {assert.equal(normalizeHcb(org, [],2,50).hasMore,false); assert.equal(normalizeHcb(org, [{id:'a',amount_cents:0,date:'2026-10-18'}],2,1).hasMore,true);});
