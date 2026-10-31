import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { identityAuth } from '../../../../lib/better-auth';
import { identityConfigured } from '../../../../lib/auth';

export const dynamic='force-dynamic';
const redirectUris=[
  'https://goldeneye.ferroworks.org/api/login/callback/ferrowork',
  'https://ferroai.ferroworks.org/api/login/callback/ferrowork',
  'https://printerlab.ferroworks.org/api/login/callback/ferrowork',
  'https://sign.ferroworks.org/api/login/callback/ferrowork',
  'http://127.0.0.1:3000/api/login/callback/ferrowork',
];
export async function POST(req:NextRequest){try{
  if(!identityConfigured)return NextResponse.json({error:'Ferrowork Identity is not configured.'},{status:503});
  if(req.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL!).origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
  const requestHeaders=await headers();
  const session=await identityAuth.api.getSession({headers:requestHeaders});
  if(!session)return NextResponse.json({error:'Sign in required.'},{status:401});
  if(session.user.role!=='admin')return NextResponse.json({error:'Administrator access required.'},{status:403});
  const client=await identityAuth.api.adminCreateOAuthClient({headers:requestHeaders,body:{redirect_uris:redirectUris,scope:'openid profile email offline_access',token_endpoint_auth_method:'client_secret_basic',client_name:'Goldeneye Internal Tools',client_uri:'https://goldeneye.ferroworks.org',skip_consent:true,enable_end_session:true}});
  return NextResponse.json({clientId:client.client_id,clientSecret:client.client_secret,redirectUris,warning:'Copy the secret now into Vercel FERROWORK_OIDC_CLIENT_SECRET. It is shown only in this response.'},{headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});
}catch(error){console.error('OIDC client setup failed:',error instanceof Error?error.message:'unknown');return NextResponse.json({error:'Could not create the internal OIDC client.'},{status:500});}}
