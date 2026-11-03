import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const sql=postgres(process.env.DATABASE_URL,{ssl:['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)?false:'verify-full',max:1,prepare:false});
try { await sql.begin(async tx=>{await tx.unsafe(await readFile(new URL('./marketing-schema.sql',import.meta.url),'utf8'));await tx`INSERT INTO fw_marketing_lists(id,name,description,created_by) SELECT '44b7ce99-d432-4b72-8e90-9c943157f1ac','Public newsletter','Confirmed FERROWORKER updates and launch news',id FROM fw_users WHERE active=true AND role='admin' ORDER BY created_at LIMIT 1 ON CONFLICT DO NOTHING`;}); console.log('Marketing and research tables are ready.'); }
finally {await sql.end();}
