import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { applyStoredCampaignOperation,storedAudience,unsubscribeStoredContact } from '../lib/marketing-storage.mjs';
import { newEmailBlock } from '../lib/marketing-validation.mjs';

test('database: concurrent edits merge distinct fields, conflict on shared fields, preserve suppression and remain idempotent',{skip:process.env.MARKETING_DATABASE_TESTS!=='1'},async()=>{
 assert.ok(process.env.DATABASE_URL);
 const schema='fw_marketing_test_'+randomUUID().replaceAll('-','');
 const options={ssl:['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)?false:'verify-full',max:3,prepare:false};
 const admin=postgres(process.env.DATABASE_URL,options);let sql;
 try{
  await admin`CREATE SCHEMA ${admin(schema)}`;
  const pool=postgres(process.env.DATABASE_URL,options);
  // Transaction-local search_path also works through pooled database proxies.
  // Verify it before every test transaction so no test can touch live tables.
  const scoped=fn=>pool.begin(async tx=>{await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);const [state]=await tx`SELECT current_schema() AS schema`;assert.equal(state.schema,schema);return fn(tx);});
  sql=Object.assign((strings,...args)=>Array.isArray(strings)&&strings.raw?scoped(tx=>tx(strings,...args)):pool(strings,...args),{json:pool.json,unsafe:text=>scoped(tx=>tx.unsafe(text)),begin:scoped,end:()=>pool.end()});
  await sql`CREATE TABLE fw_users(id text PRIMARY KEY)`;await sql`INSERT INTO fw_users(id) VALUES('staff-a'),('staff-b')`;
  await sql.unsafe(await readFile(new URL('../scripts/marketing-schema.sql',import.meta.url),'utf8'));
  const id=randomUUID(),blocks=[newEmailBlock('text',randomUUID())];
  await sql`INSERT INTO fw_marketing_campaigns(id,name,subject,blocks,created_by) VALUES(${id},'Test campaign','Test subject',${sql.json(blocks)},'staff-a')`;
  const subject={operationId:randomUUID(),baseVersion:0,operation:{kind:'setting',field:'subject',value:'Editor A subject'}};
  const body={operationId:randomUUID(),baseVersion:0,operation:{kind:'field',blockId:blocks[0].id,field:'text',value:'Editor B body'}};
  const edits=await Promise.all([applyStoredCampaignOperation(sql,'staff-a',id,subject),applyStoredCampaignOperation(sql,'staff-b',id,body)]);
  assert.ok(edits.every(x=>!x.conflict));
  const [merged]=await sql`SELECT * FROM fw_marketing_campaigns WHERE id=${id}`;assert.equal(merged.version,2);assert.equal(merged.subject,'Editor A subject');assert.equal(merged.blocks[0].text,'Editor B body');
  const repeat=await applyStoredCampaignOperation(sql,'staff-a',id,subject);assert.equal(repeat.campaign.version,2);
  const conflict=await applyStoredCampaignOperation(sql,'staff-b',id,{...subject,operationId:randomUUID(),operation:{kind:'setting',field:'subject',value:'Stale overwrite'}});assert.equal(conflict.conflict,true);assert.equal(conflict.campaign.subject,'Editor A subject');
  await sql`UPDATE fw_marketing_campaigns SET status='queued' WHERE id=${id}`;
  await assert.rejects(applyStoredCampaignOperation(sql,'staff-a',id,{...body,operationId:randomUUID(),baseVersion:2}),e=>e.status===409);
  const list1=randomUUID(),list2=randomUUID(),contact=randomUUID(),pending=randomUUID();
  await sql`INSERT INTO fw_marketing_lists(id,name,created_by) VALUES(${list1},'List one','staff-a'),(${list2},'List two','staff-b')`;
  await sql`INSERT INTO fw_marketing_contacts(id,email,status) VALUES(${contact},'subscribed@example.test','subscribed'),(${pending},'pending@example.test','pending')`;
  await sql`INSERT INTO fw_marketing_memberships(list_id,contact_id) VALUES(${list1},${contact}),(${list2},${contact}),(${list1},${pending})`;
  await sql`INSERT INTO fw_marketing_suppressions(email) VALUES('subscribed@example.test'),('old-unsubscribed@example.test')`;
  const audience=await storedAudience(sql,[list1,list2],['subscribed@example.test','old-unsubscribed@example.test','custom@example.test']);
  assert.equal(audience.filter(x=>x.email==='subscribed@example.test').length,1);
  assert.equal(audience.find(x=>x.email==='subscribed@example.test').suppressed,true);
  assert.equal(audience.find(x=>x.email==='old-unsubscribed@example.test').suppressed,true);
  assert.equal(audience.find(x=>x.email==='pending@example.test').status,'pending');
  assert.equal(audience.find(x=>x.email==='custom@example.test').status,'custom');
  await sql`DELETE FROM fw_marketing_suppressions WHERE email='subscribed@example.test'`;
  await sql`UPDATE fw_marketing_contacts SET confirmation_nonce=${randomUUID()},confirmation_expires_at=now()+interval '1 day' WHERE id=${contact}`;
  const delivery=randomUUID();
  await sql`INSERT INTO fw_marketing_deliveries(id,campaign_id,contact_id,email,kind) VALUES(${delivery},${id},${contact},'subscribed@example.test','campaign')`;
  await unsubscribeStoredContact(sql,contact);
  await unsubscribeStoredContact(sql,contact);
  const [left]=await sql`SELECT status,confirmation_nonce,confirmation_expires_at FROM fw_marketing_contacts WHERE id=${contact}`;
  assert.equal(left.status,'unsubscribed');assert.equal(left.confirmation_nonce,null);assert.equal(left.confirmation_expires_at,null);
  const [job]=await sql`SELECT status FROM fw_marketing_deliveries WHERE id=${delivery}`;assert.equal(job.status,'skipped');
  const afterLeaving=await storedAudience(sql,[list1,list2],['subscribed@example.test']);assert.equal(afterLeaving.find(x=>x.email==='subscribed@example.test').suppressed,true);
  await assert.rejects(unsubscribeStoredContact(sql,randomUUID()),e=>e.status===404);
 }finally{
  if(sql)await sql.end();
  // This exact schema is generated above and never references live application tables.
  assert.match(schema,/^fw_marketing_test_[0-9a-f]{32}$/);
  await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;await admin.end();
 }
});
