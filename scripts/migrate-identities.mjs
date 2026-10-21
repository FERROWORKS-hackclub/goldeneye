import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPassword } from 'better-auth/crypto';

if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL first.');
const sql=postgres(process.env.DATABASE_URL,{ssl:['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)?false:'require',max:1,prepare:false});
let created=0,matched=0,skipped=0;
try{
 const users=await sql`SELECT id,email,name,role,active FROM fw_users ORDER BY created_at`;
 for(const user of users){
  if(!user.active){skipped++;continue;}
  const [existing]=await sql`SELECT id FROM "user" WHERE lower(email)=lower(${user.email})`;
  if(existing){if(user.role==='admin')await sql`UPDATE "user" SET role='admin' WHERE id=${existing.id}`;matched++;continue;}
  const generated=randomBytes(32).toString('base64url')+'Aa7!';
  await sql.begin(async tx=>{
   await tx`INSERT INTO "user"(id,name,email,"emailVerified",role,"createdAt","updatedAt") VALUES (${user.id},${user.name},${user.email.toLowerCase()},false,${user.role==='admin'?'admin':'user'},now(),now())`;
   await tx`INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES (${randomBytes(16).toString('hex')},${user.id},'credential',${user.id},${await hashPassword(generated)},now(),now())`;
  });
  created++;
 }
 console.log(`Identity migration complete. Created ${created} login(s), matched ${matched} existing login(s), skipped ${skipped} inactive account(s).`);
 console.log('Passwords were regenerated with private random values. In People, send each active user a password setup email. No passwords or reset tokens were printed.');
}finally{await sql.end();}
