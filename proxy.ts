import { NextRequest, NextResponse } from 'next/server';
import { auth, configured } from './lib/auth';
export async function proxy(request: NextRequest) {
 if (!configured) return request.nextUrl.pathname.startsWith('/auth/') ? NextResponse.json({error:'Auth0 setup required'}, {status:503}) : NextResponse.next();
 return auth().middleware(request);
}
export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
