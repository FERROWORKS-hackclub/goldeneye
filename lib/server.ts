import postgres from 'postgres';
let client: ReturnType<typeof postgres>;
export function db() { if(!process.env.DATABASE_URL) throw new Error('Database setup required'); return client ??= postgres(process.env.DATABASE_URL,{ssl: ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require',max:3,prepare:false}); }
export async function management(path:string,method='GET',body?:unknown) {
 const domain=process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//,'').replace(/\/$/,'');
 if(!domain || !process.env.AUTH0_MGMT_CLIENT_ID || !process.env.AUTH0_MGMT_CLIENT_SECRET) throw new Error('Auth0 Management API setup required');
 const response=await fetch(`https://${domain}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:process.env.AUTH0_MGMT_CLIENT_ID,client_secret:process.env.AUTH0_MGMT_CLIENT_SECRET,audience:`https://${domain}/api/v2/`})});
 if(!response.ok) throw new Error('Auth0 Management API authentication failed');
 const token=await response.json();
 const result=await fetch(`https://${domain}/api/v2/${path}`,{method,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 if(!result.ok) throw new Error(`Auth0 operation failed (${result.status})`);
 return result.status===204 ? null : result.json();
}

