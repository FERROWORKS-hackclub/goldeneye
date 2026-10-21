import { NextRequest, NextResponse } from 'next/server';
import { handlers } from '../../../../lib/next-auth';
import { configured } from '../../../../lib/auth';
export const dynamic='force-dynamic';
const unavailable=()=>Response.json({error:'Ferrowork OIDC client is not configured.'},{status:503});
export const GET=(request:NextRequest)=>{
  if(request.nextUrl.pathname==='/api/login/signin/ferrowork')return NextResponse.redirect(new URL('/',request.url));
  return configured?handlers.GET(request):unavailable();
};
export const POST=(request:NextRequest)=>configured?handlers.POST(request):unavailable();
