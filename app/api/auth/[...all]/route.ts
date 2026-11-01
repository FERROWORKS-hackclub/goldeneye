import { toNextJsHandler } from 'better-auth/next-js';
import { identityAuth, identityTrustedOrigins } from '../../../../lib/better-auth';
import { identityConfigured } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handlers = toNextJsHandler(identityAuth);
function unavailable() { return Response.json({ error: 'Ferrowork Identity is not configured.' }, { status: 503 }); }
const allowedOrigins = new Set(identityTrustedOrigins.filter(origin => origin.startsWith('http://') || origin.startsWith('https://')));

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers = new Headers();
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  return headers;
}

async function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  corsHeaders(request).forEach((value, key) => {
    if (key.toLowerCase() === 'vary' && headers.has(key)) headers.set(key, `${headers.get(key)}, ${value}`);
    else headers.set(key, value);
  });
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const OPTIONS = (request: Request) => {
  const headers = corsHeaders(request);
  if (!headers.has('Access-Control-Allow-Origin')) return new Response(null, { status: 204 });
  const requestedMethod = request.headers.get('access-control-request-method')?.toUpperCase();
  if (requestedMethod && !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(requestedMethod)) return new Response(null, { status: 405 });
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  const requestedHeaders = request.headers.get('access-control-request-headers');
  if (requestedHeaders) headers.set('Access-Control-Allow-Headers', requestedHeaders);
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
};

export const GET = async (request: Request) => withCors(request, identityConfigured ? await handlers.GET(request) : unavailable());
export const POST = async (request: Request) => withCors(request, identityConfigured ? await handlers.POST(request) : unavailable());
export const PATCH = async (request: Request) => withCors(request, identityConfigured ? await handlers.PATCH(request) : unavailable());
export const PUT = async (request: Request) => withCors(request, identityConfigured ? await handlers.PUT(request) : unavailable());
export const DELETE = async (request: Request) => withCors(request, identityConfigured ? await handlers.DELETE(request) : unavailable());
