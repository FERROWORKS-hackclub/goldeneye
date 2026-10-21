import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { hashPassword } from 'better-auth/crypto';

const email='benjamin.graetz@henleyhs.sa.edu.au';
if(!process.env.DATABASE_URL||!process.env.BETTER_AUTH_SECRET)throw new Error('Set DATABASE_URL and BETTER_AUTH_SECRET first.');
const sql=postgres(process.env.DATABASE_URL,{ssl:['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)?false:'require',max:1,prepare:false});
try{
 const [admin]=await sql`SELECT id,email,name,role FROM fw_users WHERE lower(email)=lower(${email}) AND active=true`;
 if(!admin||admin.role!=='admin')throw new Error('The existing Goldeneye admin account was not found or is not an admin.');
 const [existing]=await sql`SELECT id FROM "user" WHERE lower(email)=lower(${email})`;
 if(existing){await sql`UPDATE "user" SET role='admin' WHERE id=${existing.id}`;console.log(`Ferrowork Identity already has ${email}; administrator role confirmed. No password was changed.`);process.exitCode=0;}
 else{
  const password=randomBytes(32).toString('base64url')+'Aa7!';
  await sql.begin(async tx=>{
   await tx`INSERT INTO "user"(id,name,email,"emailVerified",role,"createdAt","updatedAt") VALUES (${admin.id},${admin.name},${email},false,'admin',now(),now())`;
   await tx`INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES (${randomBytes(16).toString('hex')},${admin.id},'credential',${admin.id},${await hashPassword(password)},now(),now())`;
  });
  console.log(`Ferrowork Identity administrator created for ${email}.`);
  console.log('A private random password was generated and discarded. Send a password setup email after SMTP is configured.');
 }
}finally{await sql.end();}
