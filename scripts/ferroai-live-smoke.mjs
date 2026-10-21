import postgres from 'postgres';
import {createDecipheriv,createHash} from 'node:crypto';
import {ferroModels} from '../lib/ferroai-models.mjs';
import {searchSources,generationMessages} from '../lib/ferroai-search.mjs';
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false});
try{
 const [row]=await sql`SELECT key_cipher FROM fw_ai_settings WHERE id=1`;
 let key=process.env.HC_AI_API_KEY;
 if(row?.key_cipher){const data=Buffer.from(row.key_cipher,'base64'),secret=createHash('sha256').update('ferroai-key:'+(process.env.AUTH0_SECRET||process.env.BETTER_AUTH_SECRET)).digest(),cipher=createDecipheriv('aes-256-gcm',secret,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));key=Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')}
 if(!key)throw Error('Connect the shared key first.');
 const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'},context=[{role:'user',content:'What does Hack Club do? Cite one source.'}];
 const search=await fetch('https://ai.hackclub.com/proxy/v1/exa/search',{method:'POST',headers,body:JSON.stringify({query:context[0].content,type:'auto',numResults:5,contents:{text:{maxCharacters:1800}}}),signal:AbortSignal.timeout(20000)});
 if(!search.ok)throw Error(`Live search HTTP ${search.status}`);
 const sources=searchSources(await search.json());if(!sources.length)throw Error('No usable live sources');
 console.log(JSON.stringify({search:'ok',sources:sources.map(source=>({title:source.title,url:source.url,excerptLength:source.excerpt.length}))}));
 let success=false;
 for(const model of ferroModels.filter(candidate=>candidate.live)){
  try{const response=await fetch('https://ai.hackclub.com/proxy/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:model.apiModel,messages:generationMessages(context,sources,true),max_tokens:700,stream:false}),signal:AbortSignal.timeout(65000)}),body=await response.json();
   const content=body.choices?.[0]?.message?.content;
   console.log(JSON.stringify({model:model.name,status:response.status,answer:typeof content==='string'?content.slice(0,1500):null}));
   if(response.ok&&content?.trim()){success=true;break}
  }catch(error){console.log(JSON.stringify({model:model.name,error:error.name==='TimeoutError'?'Provider timeout':error.message}))}
 }
 if(!success)throw Error('Search succeeded but live generation probes were unavailable.');
}finally{await sql.end()}
