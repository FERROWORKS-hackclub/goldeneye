import { betterAuth } from 'better-auth';
import { admin, organization, jwt } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { oauthProvider } from '@better-auth/oauth-provider';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

const databaseUrl = process.env.DATABASE_URL || 'postgres://build:build@127.0.0.1:5432/build';
const authUrl = process.env.BETTER_AUTH_URL || 'https://auth.ferroworks.org';
export const identityTrustedOrigins = [
  'https://goldeneye.ferroworks.org', 'https://ferroai.ferroworks.org', 'https://printerlab.ferroworks.org', 'https://sign.ferroworks.org',
  'https://auth.ferroworks.org', 'http://127.0.0.1:3000', 'goldeneye://', 'exp://',
];
let pool: Pool | undefined;

function getPool() {
  return pool ??= new Pool({ connectionString: databaseUrl, ssl: ['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) ? false : 'require', max: 5 });
}

export const auth = betterAuth({
  appName: 'Ferrowork Identity',
  baseURL: authUrl,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'local-development-only-change-this-secret-32-chars'),
  database: getPool(),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, sendResetPassword: async ({ user, url }) => {
    const callbackURL = new URL(url).searchParams.get('callbackURL') || '/reset-password';
    const migrationNotice = new URL(callbackURL, authUrl).searchParams.get('campaign') === 'auth0-migration';
    const note = migrationNotice
      ? "We've migrated away from Auth0 to our own Ferrowork identity service. Due to incompatibilities with the previous provider, your old password could not be transferred. Please use the secure link below to set a new password. This link expires in one hour and can only be used once."
      : 'This password reset link expires in one hour and can only be used once. After saving your password, return to Goldeneye to sign in.';
    await sendIdentityEmail(user.email, migrationNotice ? 'Action required: set your Ferrowork password' : 'Reset your Ferrowork password', url, note);
  } },
  user: { changeEmail: { enabled: true, sendChangeEmailConfirmation: async ({ user, newEmail, url }) => sendIdentityEmail(user.email, 'Ferroworks email migration: confirm your work address', url, `Your Ferroworks account is moving from ${user.email} to ${newEmail}. Confirm this change if you requested it. Your address will not change until you confirm this link and verify the new inbox.`) } },
  databaseHooks: { user: { update: { before: async (data) => { if(data.email&&!data.email.toLowerCase().endsWith('@ferroworks.org')) throw new Error('Company accounts must use an @ferroworks.org address.'); return {data}; }, after: async (user) => { await (getPool() as any).query('UPDATE fw_users SET email=$1 WHERE id=$2', [user.email.toLowerCase(), user.id]); } } } },
  emailVerification: { sendVerificationEmail: async ({ user, url }) => sendIdentityEmail(user.email, user.email.toLowerCase().endsWith('@ferroworks.org') ? 'Verify your new Ferroworks work email' : 'Verify your Ferrowork account', url) },
  trustedOrigins: identityTrustedOrigins,
  plugins: [
    admin(), organization(), expo(), jwt(),
    oauthProvider({
      loginPage: '/sign-in', consentPage: '/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      allowDynamicClientRegistration: false,
    }),
  ],
});
export const identityAuth = auth;

async function sendIdentityEmail(to: string, subject: string, url: string, note?: string) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, IDENTITY_EMAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !IDENTITY_EMAIL_FROM) throw new Error('Identity email is not configured.');
  const port = Number(process.env.SMTP_PORT || '465');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({
    from: IDENTITY_EMAIL_FROM,
    to,
    subject,
    text: `${subject}\n\n${note ? `${note}\n\n` : ''}Continue securely: ${url}\n\nIf you did not request this, ignore this message.`,
    html: `<p>${subject}</p>${note ? `<p>${note}</p>` : ''}<p><a href="${url}">Continue securely</a></p><p>If you did not request this, ignore this message.</p>`,
  });
}
