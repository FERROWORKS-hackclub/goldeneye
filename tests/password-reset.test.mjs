import test from 'node:test';
import assert from 'node:assert/strict';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { activePasswordResetToken } from '../lib/password-reset.mjs';

async function fixture() {
  const store = { user: [], account: [], session: [], verification: [] };
  let reset;
  const auth = betterAuth({
    baseURL: 'https://identity.example.test',
    secret: 'isolated-tests-only-not-a-production-secret',
    database: memoryAdapter(store),
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      sendResetPassword: async (data) => { reset = data; } },
  });
  await auth.api.signUpEmail({ body: { name: 'Reset test', email: 'reset@example.test', password: 'initial-Test-password!7' } });
  await auth.api.requestPasswordReset({ body: { email: 'reset@example.test', redirectTo: 'https://identity.example.test/reset-password' } });
  const context = await auth.$context;
  const lookup = (id) => context.internalAdapter.findVerificationValue(id);
  return { auth, store, reset, lookup };
}

test('password-reset pages reject missing, malformed and callback-rejected links before password entry', async () => {
  const lookup = () => { throw new Error('Invalid input must not query the database'); };
  for (const params of [{}, { token: '' }, { token: ['x'] }, { token: 'x'.repeat(257) }, { token: 'x', error: 'INVALID_TOKEN' }]) {
    assert.equal(await activePasswordResetToken(params, lookup), undefined);
  }
});

test('opening an emailed reset link does not consume it; one successful update hides the form on reuse', async () => {
  const { auth, reset, lookup } = await fixture();
  const params = { token: reset.token };
  for (let i = 0; i < 2; i++) {
    const response = await auth.handler(new Request(reset.url));
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get('location')).searchParams.get('token'), reset.token);
    assert.equal(await activePasswordResetToken(params, lookup), reset.token);
  }
  await assert.rejects(auth.api.resetPassword({ body: { token: reset.token, newPassword: 'too-short' } }));
  assert.equal(await activePasswordResetToken(params, lookup), reset.token, 'Validation failure leaves the link usable');
  await auth.api.resetPassword({ body: { token: reset.token, newPassword: 'new-Test-password!8' } });
  assert.equal(await activePasswordResetToken(params, lookup), undefined, 'A used link displays recovery instead of another password form');
  await assert.rejects(auth.api.resetPassword({ body: { token: reset.token, newPassword: 'another-Test-password!9' } }), (e) => e.body?.code === 'INVALID_TOKEN');
  const session = await auth.api.signInEmail({ body: { email: 'reset@example.test', password: 'new-Test-password!8' } });
  assert.ok(session.user);
});

test('expired links display recovery and cannot change a password', async () => {
  const { auth, store, reset, lookup } = await fixture();
  store.verification.forEach((row) => { row.expiresAt = new Date(Date.now() - 1000); });
  assert.equal(await activePasswordResetToken({ token: reset.token }, lookup), undefined);
  await assert.rejects(auth.api.resetPassword({ body: { token: reset.token, newPassword: 'unused-Test-password!9' } }), (e) => e.body?.code === 'INVALID_TOKEN');
});
