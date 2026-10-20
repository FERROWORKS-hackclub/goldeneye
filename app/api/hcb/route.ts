import {NextRequest, NextResponse} from 'next/server';
import {auth, configured} from '../../../lib/auth';
import {db} from '../../../lib/server';
import {can} from '../../../lib/policy.mjs';
import {HCB_ORG, normalizeHcb} from '../../../lib/hcb.mjs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export async function GET(req: NextRequest) {
  try {
    if (!configured) return reply({error: 'Login unavailable'}, 503);
    const session = await auth().getSession();
    if (!session) return reply({error: 'Sign in required'}, 401);
    const [user] = await db()`SELECT role,active FROM fw_users WHERE id=${session.user.sub}`;
    if (!user?.active || !can(user.role, 'transactions')) return reply({error: 'Access denied'}, 403);
    const page = Number(req.nextUrl.searchParams.get('page') || '1');
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return reply({error: 'Invalid page'}, 400);
    const base = `https://hcb.hackclub.com/api/v3/organizations/${HCB_ORG}`;
    const responses = await Promise.all([base, `${base}/transactions?page=${page}&per_page=50`].map(url => fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(12000), headers: {Accept: 'application/json'}})));
    if (responses.some(response => !response.ok)) return reply({error: 'HCB is unavailable. Try again shortly.'}, 502);
    const [org, transactions] = await Promise.all(responses.map(response => response.json()));
    return reply(normalizeHcb(org, transactions, page, 50));
  } catch {return reply({error: 'Could not load HCB. Try again shortly.'}, 502);}
}
