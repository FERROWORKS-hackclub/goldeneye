import { hashPassword } from 'better-auth/crypto';
import { identityAuth } from './better-auth';

export async function provisionIdentity(input: { email: string; name: string; password: string }) {
  const context = await identityAuth.$context;
  const user = await context.internalAdapter.createUser({ email: input.email.toLowerCase(), name: input.name, emailVerified: false, role: 'user' }, { method: 'admin' });
  try {
    await context.internalAdapter.createAccount({ userId: user.id, accountId: user.id, providerId: 'credential', password: await hashPassword(input.password) });
  } catch (error) {
    await context.internalAdapter.deleteUser(user.id).catch(() => undefined);
    throw error;
  }
  return { user_id: user.id, id: user.id };
}

export async function deleteIdentity(id: string) {
  const context = await identityAuth.$context;
  return context.internalAdapter.deleteUser(id);
}

export async function sendIdentityInvite(email: string) {
  const base = process.env.BETTER_AUTH_URL;
  await identityAuth.api.requestPasswordReset({ body: { email, redirectTo: `${base}/reset-password` } });
}
