import { NextResponse } from 'next/server';
import { currentUser,staff } from '../../../../lib/ferrosign';
import { db } from '../../../../lib/server';

export const runtime='nodejs';
export async function GET(){
 const user=await currentUser();if(!user||!staff(user.role))return NextResponse.json({error:'Staff access required'},{status:403});
 await db()`CREATE TABLE IF NOT EXISTS fw_ferrosign_biweekly_reports(id uuid PRIMARY KEY,period_start date NOT NULL,period_end date NOT NULL,blob_path text NOT NULL,source_count integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(period_start,period_end))`;
 const reports=await db()`SELECT id,period_start,period_end,source_count,created_at FROM fw_ferrosign_biweekly_reports ORDER BY period_start DESC LIMIT 26`;
 return NextResponse.json({reports},{headers:{'Cache-Control':'private, no-store'}});
}
