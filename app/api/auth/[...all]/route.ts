import { toNextJsHandler } from 'better-auth/next-js';
import { identityAuth } from '../../../../lib/better-auth';
import { identityConfigured } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = toNextJsHandler(identityAuth);
function unavailable() { return Response.json({ error: 'Ferrowork Identity is not configured.' }, { status: 503 }); }
export const GET = (request: Request) => identityConfigured ? handlers.GET(request) : unavailable();
export const POST = (request: Request) => identityConfigured ? handlers.POST(request) : unavailable();
