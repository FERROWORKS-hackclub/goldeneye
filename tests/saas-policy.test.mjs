import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessWorkspace } from '../lib/saas-policy.mjs';

test('SaaS access requires a matching user and organization membership',()=>{
  assert.equal(canAccessWorkspace('u1','org-a',{userId:'u1',organizationId:'org-a',role:'member'}),true);
  assert.equal(canAccessWorkspace('u1','org-b',{userId:'u1',organizationId:'org-a',role:'owner'}),false);
  assert.equal(canAccessWorkspace('u2','org-a',{userId:'u1',organizationId:'org-a',role:'owner'}),false);
  assert.equal(canAccessWorkspace('', 'org-a',{userId:'u1',organizationId:'org-a',role:'owner'}),false);
});

test('SaaS roles separate read access from write access',()=>{
  for(const role of ['owner','admin','manager']) assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role},true,'transactions'),true);
  assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role:'member'},true,'projects'),true);
  assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role:'member'},true,'transactions'),false);
  assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role:'finance'},true,'transactions'),true);
  assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role:'finance'},true,'projects'),false);
  for(const role of ['member','finance','viewer']) assert.equal(canAccessWorkspace('u','o',{userId:'u',organizationId:'o',role}),true);
});
