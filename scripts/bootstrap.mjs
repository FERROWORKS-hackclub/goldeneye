import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import postgres from 'postgres';
const email='benjamin.graetz@henleyhs.sa.edu.au';
for(const k of ['AUTH0_DOMAIN','AUTH0_MGMT_CLIENT_ID','AUTH0_MGMT_CLIENT_SECRET','DATABASE_URL'])if(!process.env[k])throw new Error(`Set ${k}`);
const domain=process.env.AUTH0_DOMAIN.replace(/^https?:\/\//,'').replace(/\/$/,'');
const tokenResponse=await fetch(`https://${domain}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:process.env.AUTH0_MGMT_CLIENT_ID,client_secret:process.env.AUTH0_MGMT_CLIENT_SECRET,audience:`https://${domain}/api/v2/`})});
if(!tokenResponse.ok)throw new Error('Management API authentication failed');
const {access_token}=await tokenResponse.json();
const sql=postgres(process.env.DATABASE_URL,{ssl: ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require'});
try{
 const existing=await sql`SELECT id FROM fw_users WHERE email=${email}`;if(existing.length)throw new Error('Starter admin already exists; use Auth0 password reset if needed.');
 const password=randomBytes(24).toString('base64url')+'Aa1!';
 const r=await fetch(`https://${domain}/api/v2/users`,{method:'POST',headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},body:JSON.stringify({email,name:'Benjamin Graetz',password,connection:process.env.AUTH0_CONNECTION||'Username-Password-Authentication',email_verified:false,verify_email:false})});
 if(!r.ok)throw new Error(`Auth0 create failed (${r.status}); check connection and whether account already exists.`);
 const user=await r.json();
 try{await sql`INSERT INTO fw_users(id,email,name,role) VALUES (${user.user_id},${email},'Benjamin Graetz','admin')`;}catch(e){await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(user.user_id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${access_token}`}});throw e;}
 if(process.env.STARTER_CREDENTIALS_PATH){
  await writeFile(process.env.STARTER_CREDENTIALS_PATH,`Ferrowork administrator\nWebsite: https://ferrowork.vercel.app\nEmail: ${email}\nTemporary password: ${password}\n\nSave this password in your password manager. Replace it through Auth0's Forgot password flow after signing in. Keep this file private.\n`,{flag:'wx'});
  console.log(`Admin created: ${email}. Credentials saved to your local delivery file.`);
 }else console.log(`Admin created: ${email}\nTemporary password (save in a password manager; do not commit): ${password}\nUse Auth0 password reset to replace it after first sign-in.`);
}finally{await sql.end();}

