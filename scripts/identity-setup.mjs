import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL first.');
const sql=postgres(process.env.DATABASE_URL,{ssl:['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)?false:'require',max:1,prepare:false});
try{
 const authSchema=await readFile(new URL('./auth-schema.sql',import.meta.url),'utf8');
 const saasSchema=await readFile(new URL('./saas-schema.sql',import.meta.url),'utf8');
 const names=['user','session','account','verification','organization','member','invitation','jwks','oauthClient','oauthResource','oauthClientResource','oauthRefreshToken','oauthAccessToken','oauthConsent','oauthClientAssertion'];
 const [state]=await sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ${sql(names)}`;
 if(state.count===0)await sql.unsafe(authSchema);
 else if(state.count!==names.length)throw new Error('Identity schema is partially installed. Run the Better Auth schema generator and review/apply its migration before retrying.');
 await sql.unsafe(saasSchema);
 console.log('Ferrowork Identity and tenant schemas applied.');
}finally{await sql.end();}
