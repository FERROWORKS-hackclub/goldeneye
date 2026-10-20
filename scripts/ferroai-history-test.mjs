import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false}),chatId=randomUUID(),requestId=randomUUID(),rollback=Error('Rollback synthetic chat test');
try{
 try{await sql.begin(async transaction=>{
  const [user]=await transaction`SELECT id FROM fw_users WHERE active=true LIMIT 1`;
  assert.ok(user,'An active test owner is required');
  await transaction`INSERT INTO fw_ai_chats(id,user_id,title,model) VALUES (${chatId},${user.id},'Disposable history integration test','liquid/lfm-2.5-2.6b:free')`;
  await transaction`INSERT INTO fw_ai_messages(chat_id,role,content,model) VALUES (${chatId},'user','Synthetic test prompt','liquid/lfm-2.5-2.6b:free')`;
  await transaction`INSERT INTO fw_ai_messages(chat_id,role,content,model,embedding,sources) VALUES (${chatId},'assistant','Synthetic test response','liquid/lfm-2.5-embedding-350m:free',${transaction.json([0.1,0.2])},${transaction.json([{title:'Synthetic source',url:'https://example.com/'}])})`;
  await transaction`INSERT INTO fw_ai_requests(id,user_id,model,status,chat_id) VALUES (${requestId},${user.id},'liquid/lfm-2.5-2.6b:free','complete',${chatId})`;
  const messages=await transaction`SELECT role,content,embedding,sources FROM fw_ai_messages WHERE chat_id=${chatId} ORDER BY id`;
  assert.equal(messages.length,2);assert.equal(messages[0].role,'user');assert.deepEqual(messages[1].embedding,[0.1,0.2]);
  assert.deepEqual(messages[1].sources,[{title:'Synthetic source',url:'https://example.com/'}]);
  const otherOwner=await transaction`SELECT id FROM fw_ai_chats WHERE id=${chatId} AND user_id='nonexistent-test-user'`;
  assert.equal(otherOwner.length,0);
  await transaction`DELETE FROM fw_ai_chats WHERE id=${chatId} AND user_id=${user.id}`;
  const [remaining]=await transaction`SELECT count(*)::int AS count FROM fw_ai_messages WHERE chat_id=${chatId}`;
  assert.equal(remaining.count,0);
  const [request]=await transaction`SELECT chat_id FROM fw_ai_requests WHERE id=${requestId}`;
  assert.equal(request.chat_id,null);
  throw rollback;
 })}catch(error){if(error!==rollback)throw error}
 const [result]=await sql`SELECT count(*)::int AS count FROM fw_ai_requests WHERE id=${requestId}`;
 assert.equal(result.count,0);
 console.log('History storage, owner filtering, cascading deletion, preserved usage counters and rollback verified. No test content retained.');
}finally{await sql.end()}
