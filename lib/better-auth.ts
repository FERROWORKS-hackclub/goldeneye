import { betterAuth } from 'better-auth';
import { admin, organization, jwt } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import { oauthProvider } from '@better-auth/oauth-provider';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

const databaseUrl = process.env.DATABASE_URL || 'postgres://build:build@127.0.0.1:5432/build';
const authUrl = process.env.BETTER_AUTH_URL || 'https://auth.ferroworks.org';
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
      ? "We've migrated away from Auth0 to our own Ferrowork identity service. Due to incompatibilities with the previous provider, your old password could not be transferred. Please use the secure link below to set a new password."
      : undefined;
    await sendIdentityEmail(user.email, migrationNotice ? 'Action required: set your Ferrowork password' : 'Reset your Ferrowork password', url, note);
  } },
  emailVerification: { sendVerificationEmail: async ({ user, url }) => sendIdentityEmail(user.email, 'Verify your Ferrowork account', url) },
  trustedOrigins: [
    'https://goldeneye.ferroworks.org', 'https://ferroai.ferroworks.org', 'https://printerlab.ferroworks.org',
    'https://auth.ferroworks.org', 'http://127.0.0.1:3000', 'goldeneye://', 'exp://',
  ],
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
