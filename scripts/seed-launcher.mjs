import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1});
try{
 const [admin]=await sql`SELECT id FROM fw_users WHERE email='benjamin.graetz@henleyhs.sa.edu.au' AND role='admin' AND active=true`;
 if(!admin)throw new Error('Starter administrator is unavailable');
 const links=[{name:'Vercel',url:'https://vercel.com/benjamin-graetzs-projects/ferrowork',category:'Administration',description:'Ferrowork hosting and deployments'},{name:'Ferrowork Identity',url:'https://auth.ferroworks.org',category:'Administration',description:'Ferrowork accounts and SSO'},{name:'GitHub',url:'https://github.com',category:'Engineering',description:'Code and collaboration'},{name:'Printables',url:'https://www.printables.com',category:'Production',description:'3D model library and print inspiration'}];
 await sql.begin(async tx=>{for(const data of links){const exists=await tx`SELECT id FROM fw_records WHERE kind='links' AND data->>'url'=${data.url}`;if(!exists.length){const id=randomUUID();await tx`INSERT INTO fw_records(id,kind,data,created_by) VALUES (${id},'links',${tx.json(data)},${admin.id})`;await tx`INSERT INTO fw_audit(actor,action,target) VALUES (${admin.id},'links.create',${id})`;}}});
 console.log('Ferrowork starter launcher links configured.');
}finally{await sql.end();}
