import { Auth0Client } from '@auth0/nextjs-auth0/server';
export const configured = !!(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_SECRET && process.env.APP_BASE_URL);
let client: Auth0Client;
export function auth() { if (!configured) throw new Error('Auth0 is not configured'); return client ??= new Auth0Client({authorizationParameters:{connection:process.env.AUTH0_CONNECTION || 'Username-Password-Authentication',scope:'openid profile email'}}); }
