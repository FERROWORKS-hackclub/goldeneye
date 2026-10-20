import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
const sql=postgres(process.env.DATABASE_URL,{ssl: ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require'});
try {await sql.unsafe(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); console.log('Ferrowork database ready.');} finally {await sql.end();}
await import('./ferroai-setup.mjs');

