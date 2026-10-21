import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { createAuthClient } from 'better-auth/client';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';

test('password sign-in resumes the signed OIDC callback instead of returning to the identity login page', async () => {
  const origin = 'https://identity.example.test';
  const callback = 'https://goldeneye.ferroworks.org/api/login/callback/ferrowork';
  const now = new Date();
  const store = {
    user: [], account: [], session: [], verification: [], jwks: [], oauthConsent: [], oauthAccessToken: [], oauthRefreshToken: [],
    oauthClient: [{ id: 'test-client', clientId: 'test-tools', clientSecret: null, name: 'Test tools',
      redirectUris: [callback], scopes: ['openid', 'profile', 'email'], grantTypes: ['authorization_code'],
      responseTypes: ['code'], tokenEndpointAuthMethod: 'none', subjectType: 'public', requirePKCE: true,
      skipConsent: true, disabled: false, createdAt: now, updatedAt: now }],
  };
  const auth = betterAuth({
    baseURL: origin, secret: 'isolated-test-auth-secret-not-used-in-production',
    database: memoryAdapter(store), rateLimit: { enabled: false },
    trustedOrigins: [origin, 'https://goldeneye.ferroworks.org'],
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    plugins: [jwt(), oauthProvider({ loginPage: '/sign-in', consentPage: '/consent', scopes: ['openid', 'profile', 'email'] })],
  });
  const credentials = { email: 'signin@example.test', password: 'isolated-Test-password!7' };
  await auth.api.signUpEmail({ body: { ...credentials, name: 'Sign-in test' } });
  const authorize = new URL('/api/auth/oauth2/authorize', origin);
  authorize.search = new URLSearchParams({ client_id: 'test-tools', redirect_uri: callback, response_type: 'code',
    scope: 'openid profile email', state: 'original-application-state', code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update('test-verifier-with-enough-characters-for-pkce-123456').digest('base64url') }).toString();
  const response = await auth.handler(new Request(authorize, { headers: { accept: 'text/html' } }));
  assert.equal(response.status, 302);
  const login = new URL(response.headers.get('location'), origin);
  assert.equal(login.pathname, '/sign-in');
  assert.ok(login.searchParams.get('sig'));

  const client = createAuthClient({ baseURL: origin, plugins: [oauthProviderClient()],
    fetchOptions: { customFetchImpl: (url, init) => auth.handler(new Request(url, init)) } });
  const previousWindow = globalThis.window;
  // An isolated browser-location stand-in observes the SDK's redirect; no real
  // user account, browser session, password, or network service is involved.
  globalThis.window = { location: { search: login.search, href: login.href } };
  try {
    const result = await client.signIn.email({ ...credentials, callbackURL: 'https://goldeneye.ferroworks.org/' });
    assert.equal(result.error, null);
    assert.equal(result.data.redirect, true);
    const destination = new URL(globalThis.window.location.href);
    assert.equal(destination.origin + destination.pathname, callback);
    assert.equal(destination.searchParams.get('state'), 'original-application-state');
    assert.ok(destination.searchParams.get('code'));

    globalThis.window.location = { search: '', href: `${origin}/sign-in` };
    const direct = await client.signIn.email({ ...credentials, callbackURL: 'https://goldeneye.ferroworks.org/' });
    assert.equal(direct.error, null);
    assert.equal(globalThis.window.location.href, 'https://goldeneye.ferroworks.org/', 'Direct sign-in must not return to the identity login page');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
