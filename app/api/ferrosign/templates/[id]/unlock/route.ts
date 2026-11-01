import { NextResponse } from 'next/server';
import { db } from '../../../../../../lib/server';
import { currentUser,staff } from '../../../../../../lib/ferrosign';
import { sameOriginRequest,storedJson } from '../../../../../../lib/ferrosign-validation.mjs';
import { checkTemplateUnlockCode,createTemplateUnlockToken,lockedTemplateKey } from '../../../../../../lib/ferrosign-template-lock.mjs';

export const runtime='nodejs';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});
 const {id}=await params;let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 if(!checkTemplateUnlockCode(body.code))return NextResponse.json({error:'That code is incorrect.'},{status:403});
 const [row]=await db()`SELECT d.id,d.title,d.created_by,a.detail FROM fw_sign_documents d JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(detail)='string' THEN (detail #>> '{}')::jsonb ELSE detail END AS detail FROM fw_sign_audit WHERE document_id=d.id AND event IN ('template_saved','template_updated') ORDER BY id DESC LIMIT 1) a ON true WHERE d.id=${id} AND d.status='draft'`;
 if(!row)return NextResponse.json({error:'Template not found or unavailable'},{status:404});
 const detail=storedJson(row.detail,{});if(row.created_by!==user.id&&detail.visibility!=='staff')return NextResponse.json({error:'Template not found or unavailable'},{status:404});
 if(!(detail.locked===true||lockedTemplateKey(row.title,detail)))return NextResponse.json({error:'This template is not locked.'},{status:400});
 const secret=process.env.BETTER_AUTH_SECRET;if(!secret)return NextResponse.json({error:'Template unlock is not configured.'},{status:503});
 return NextResponse.json({token:createTemplateUnlockToken(id,user.id,secret)},{headers:{'Cache-Control':'private, no-store'}});
}
