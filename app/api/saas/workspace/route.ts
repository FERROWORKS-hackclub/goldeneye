import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { identityAuth } from '../../../../lib/better-auth';
import { webSession } from '../../../../lib/next-auth';
import { db } from '../../../../lib/server';
import { canAccessWorkspace } from '../../../../lib/saas-policy.mjs';
import { isTrustedOrigin } from '../../../../lib/trusted-origins.mjs';

export const dynamic='force-dynamic';
const kinds=['projects','tasks','transactions','filament','jobs','quotes','orders','links'] as const;
async function actor() {
  const session=await webSession();
  if(session?.user?.id&&session.user.email){const [internal]=await db()`SELECT active FROM fw_users WHERE lower(email)=lower(${session.user.email})`;if(internal&&!internal.active)throw new Error('FORBIDDEN');return {id:session.user.id,email:session.user.email};}
  const native=await identityAuth.api.getSession({headers:await import('next/headers').then(m=>m.headers())});
  if(native){const [internal]=await db()`SELECT active FROM fw_users WHERE lower(email)=lower(${native.user.email})`;if(internal&&!internal.active)throw new Error('FORBIDDEN');return {id:native.user.id,email:native.user.email};}
  throw new Error('UNAUTHORIZED');
}
async function authorize(userId:string,organizationId:string,write=false,kind='') {
  const [member]=await db()`SELECT "userId" AS "userId", "organizationId" AS "organizationId", role FROM member WHERE "userId"=${userId} AND "organizationId"=${organizationId}`;
  if(!canAccessWorkspace(userId,organizationId,member,write,kind))throw new Error('FORBIDDEN');
}
function fail(error:unknown){const message=error instanceof Error?error.message:'';const status=message==='UNAUTHORIZED'?401:message==='FORBIDDEN'?403:error instanceof z.ZodError?400:500;console.error('SaaS workspace:',status,message);return NextResponse.json({error:status===500?'Workspace request failed. Check the server configuration.':status===401?'Sign in required':status===403?'Workspace access denied':message},{status,headers:{'Cache-Control':'no-store'}});}

export async function GET(req:NextRequest){try{
  const user=await actor(),organizationId=z.string().min(1).max(128).parse(req.nextUrl.searchParams.get('organizationId'));
  await authorize(user.id,organizationId);
  const records=await db().begin(async sql=>{await sql`SELECT set_config('app.organization_id',${organizationId},true)`;return sql`SELECT id,kind,data,updated_at FROM ge_saas_records WHERE organization_id=${organizationId} ORDER BY created_at DESC LIMIT 1000`;});
  return NextResponse.json({organizationId,records},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}

export async function POST(req:NextRequest){try{
  if(!isTrustedOrigin(req.headers.get('origin')))return NextResponse.json({error:'Invalid request origin'},{status:403});
  if(Number(req.headers.get('content-length')||0)>65536)return NextResponse.json({error:'Request is too large.'},{status:413});
  const user=await actor(),input=z.object({organizationId:z.string().min(1).max(128),kind:z.enum(kinds),action:z.enum(['create','update','delete']),id:z.uuid().optional(),data:z.record(z.string(),z.unknown()).default({})}).parse(await req.json());
  await authorize(user.id,input.organizationId,true,input.kind);
  const id=input.id||randomUUID();if(input.action!=='create'&&!input.id)throw new Error('Invalid record ID');
  await db().begin(async sql=>{
    await sql`SELECT set_config('app.organization_id',${input.organizationId},true)`;
    if(input.action==='create')await sql`INSERT INTO ge_saas_records(id,organization_id,kind,data,created_by) VALUES (${id},${input.organizationId},${input.kind},${sql.json(input.data as never)},${user.id})`;
    else if(input.action==='update'){const [record]=await sql`UPDATE ge_saas_records SET data=${sql.json(input.data as never)},updated_at=now() WHERE id=${id} AND organization_id=${input.organizationId} AND kind=${input.kind} RETURNING id`;if(!record)throw new Error('Record not found');}
    else {const [record]=await sql`DELETE FROM ge_saas_records WHERE id=${id} AND organization_id=${input.organizationId} AND kind=${input.kind} RETURNING id`;if(!record)throw new Error('Record not found');}
  });
  return NextResponse.json({ok:true,id,action:input.action},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
