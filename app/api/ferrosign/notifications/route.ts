import { NextResponse } from 'next/server';
import { currentUser,staff } from '../../../../lib/ferrosign';
import { sameOriginRequest } from '../../../../lib/ferrosign-validation.mjs';
import { deliverSigningCopies } from '../../../../lib/ferrosign-mail';
import { db } from '../../../../lib/server';
export const maxDuration=300;
export async function POST(request:Request){const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});if(!sameOriginRequest(request.headers.get('origin'),request.url))return NextResponse.json({error:'Origin not allowed'},{status:403});const jobs=await db()`SELECT DISTINCT document_id FROM fw_sign_audit WHERE event='email_copy_pending' LIMIT 10`;let delivered=true;for(const job of jobs)if(!await deliverSigningCopies(job.document_id))delivered=false;return NextResponse.json({ok:delivered});}
