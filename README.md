# Goldeneye

Goldeneye is Ferrowork’s internal workspace for a 3D printer team, with a separate commercial edition foundation for other companies.

## Products

- Goldeneye: `https://goldeneye.ferroworks.org`
- FerroAI: `https://ferroai.ferroworks.org`
- Printer Lab: `https://printerlab.ferroworks.org`
- Ferrowork Identity: `https://auth.ferroworks.org`
- Goldeneye for Teams: `/for-teams`

Goldeneye includes projects, tasks, due dates, cash-flow, project finance, HCB read-only data, team access, activity history, filament inventory, job cost estimates, quotes, orders, printer BOM and design changes. Printer Lab tracks firmware releases, prototype tests and issues; it does not flash or control printers. FerroAI uses the configured model provider. HCB values are USD; manual ledger values are AUD.

The iOS and Android client source is in `mobile/`, built with Expo and React Native. It includes secure native sign-in, dashboard counts, projects, tasks, money, printer operations, search and sign-out. App Store/Play Store signing and publishing credentials are not included.

## Current readiness

The app source now uses Ferrowork Identity (Better Auth) for email/password accounts, OIDC SSO and native sessions. The identity service supports admin-provisioned accounts, password reset emails, user/org plugins and a locked-down consent flow. Browser tools use OIDC because `auth.ferroworks.org` and the tool domains cannot share cookies; the mobile app stores its identity session in iOS Keychain/Android Keystore.

The commercial edition has a separate tenant-scoped records API and PostgreSQL forced row-level security. Existing Ferrowork records remain in `fw_records`; customer data uses `ge_saas_records`. Subscription plan/status fields and a public product page are included. Customer self-onboarding, tenant switching UI, payment collection/webhooks, support operations, and production SaaS provisioning remain to be added before selling subscriptions.

The identity and SaaS tables have been applied to the attached Neon database, but the source has not been deployed with the new identity configuration. Vercel still needs the SMTP mailbox credentials, OIDC client credentials, and `auth.ferroworks.org` host attached and verified. This avoids switching a live sign-in before account migration is ready. Auth0 is no longer used by the application source; old Auth0 password hashes cannot be exported, so existing people must receive password setup/reset emails.

## Local setup

Requirements: Node.js 22+, PostgreSQL, a Purelymail mailbox for transactional mail, and the Better Auth schema applied to the database. Do not put server secrets in `NEXT_PUBLIC_*` variables or commit them.

1. Install dependencies: `npm ci` and `npm install --prefix mobile`.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `BETTER_AUTH_SECRET` (random 32-byte value), `BETTER_AUTH_URL=https://auth.ferroworks.org`, `APP_BASE_URL` to the exact comma-separated local and production tool origins, `NEXTAUTH_SECRET` (another random 32-byte value), `FERROWORK_OIDC_CLIENT_ID`, `FERROWORK_OIDC_CLIENT_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`, and `IDENTITY_EMAIL_FROM`.
3. `scripts/auth-schema.sql` is generated from the configured Better Auth plugins. To regenerate after a library/plugin upgrade, run `npx auth@latest generate --config ./lib/better-auth.ts --output ./scripts/auth-schema.sql --yes` and review the SQL change. The official [schema guide](https://better-auth.com/docs/concepts/database#schema-generation) explains the generator.
4. Run `npm run db:setup` then `npm run identity:setup`. This applies the Better Auth tables and the tenant-scoped SaaS tables, including forced PostgreSQL row-level security.
5. Run `npm run bootstrap:identity`. It links the existing Goldeneye admin row for **benjamin.graetz@henleyhs.sa.edu.au** to Ferrowork Identity using a private random password that is never shown. After SMTP is configured and the new source is deployed, send the admin a password setup email. Then run `npm run identity:migrate` to create login records for active team accounts using private random passwords. In People, send active users their password setup emails. Auth0 passwords cannot be transferred.
6. Sign in to `https://auth.ferroworks.org` with the administrator account, open `/setup-client`, create the trusted first-party OIDC client and copy its one-time secret into Vercel's `FERROWORK_OIDC_CLIENT_SECRET`.
7. Use these exact callbacks:
   - `https://goldeneye.ferroworks.org/api/login/callback/ferrowork`
   - `https://ferroai.ferroworks.org/api/login/callback/ferrowork`
   - `https://printerlab.ferroworks.org/api/login/callback/ferrowork`
   - `http://localhost:3000/api/login/callback/ferrowork`

Use a separate OIDC client for every external tool. Keep dynamic client registration disabled. Mark only controlled internal clients as trusted and skip consent only after their callback URLs have been verified. Password reset and setup emails use Purelymail SMTP (`smtp.purelymail.com`, port 465 with TLS). Signup remains admin-controlled.

Run Goldeneye with `npm run dev`; start the native app with `npm run mobile`. `npx expo run:ios` requires Xcode. `npx expo run:android` requires Android Studio and the Android SDK. Check [Expo’s build guide](https://docs.expo.dev/build/introduction/) to configure signing and store submissions.

## Vercel deployment

Attach all four domains above to the Vercel project, point `auth.ferroworks.org` at the same deployment, and provide the environment values above to Vercel Production. The Better Auth and SaaS schemas are installed on the linked Neon database. Connect `auth.ferroworks.org` as the Better Auth base URL and preserve the exact callbacks listed above. Deploy to a preview first and verify sign-in/out, password setup, user approval, role restrictions, mobile login and cross-tenant denial. Only then switch the production alias.

## Tenant isolation

`GET/POST /api/saas/workspace` requires an OIDC or native session, an organization id, an active Better Auth membership and an allowed role. The API sets `app.organization_id` transaction-locally, and `ge_saas_records` enforces the same organization using `ENABLE` and `FORCE ROW LEVEL SECURITY`. Requests without membership are denied before access; direct queries without a tenant setting return no records. The API intentionally does not reuse Ferrowork’s global internal records.

## API security checks

See [ENDPOINTS.md](./ENDPOINTS.md) for routes, required roles, and manual authorization tests. The invite-accept endpoint receives a password only over HTTPS in request memory, passes it to Better Auth’s password hasher, and does not return or log it. Workspace user creation returns no temporary password; the recipient gets a reset/setup email.

Run checks with `npm run typecheck`, `npm run typecheck --prefix mobile`, and `npm test`. HCB’s read-only integration is documented below in the existing HCB section of [ENDPOINTS.md](./ENDPOINTS.md).
