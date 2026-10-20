# Goldeneye for Ferrowork

A Vercel-ready Next.js application for Ferrowork, a 3D printing company. The shared workspace combines an Auth0 login portal, an intranet app launcher, project management and a cash-flow ledger.

## Current status

Goldeneye: **https://goldeneye.ferroworks.org** · FerroAI: **https://ferroai.ferroworks.org** · Printer Lab: **https://printerlab.ferroworks.org**. All three use Ferrowork login/SSO, Auth0 email/password accounts and PostgreSQL. Auth0 public signup remains disabled; reusable signup links submit inactive accounts for admin/manager review. Existing admin-created accounts continue to work.

See [ENDPOINTS.md](./ENDPOINTS.md) for the complete API route list and a role-based security testing checklist.

The production build and 17 automated tests pass. Signup/approval transaction checks use real PostgreSQL with a mocked Auth0 provider and roll back all fixtures. Public HTTP checks cover valid/revoked links, anonymous reviewer denial, foreign origins, unknown tokens and weak signup validation. No demo records are bundled. Labelled QA workflow records were removed at the owner's request.

## Included

- One Auth0 email/password session across the portal, Projects and Money.
- Admin-managed website launcher: add, edit, categorize, search and remove HTTPS shortcuts.
- Projects with descriptions, owners, statuses, due dates and budgets.
- Tasks with project association, assignee, priority, due date and a three-column status board.
- Income/expense ledger, categories, references, paid/pending status, paid cash-flow totals, search, filters and CSV export. Currency is AUD; stored amounts use integer cents.
- Server-enforced roles, administrator-created users, account deactivation and access changes.
- Audit history for successful application changes (latest 100 shown).
- Responsive layout, validation and error messages.

Website shortcuts open the destination website. They do not automatically sign users into unrelated services or deploy those services. Each external service needs its own SAML/OIDC integration with Auth0 if you want SSO there. This is a single-company workspace, not a multi-tenant product. Money is a manually maintained ledger; outbound banking actions, automatic invoicing, tax/GST calculations, attachments and payroll are not included. HCB provides read-only balances and transactions.

## Roles

| Role | Launcher | Projects/tasks | Money | Users/audit |
| --- | --- | --- | --- | --- |
| Admin | Manage | Manage | Manage | Manage users, read audit |
| Manager | Read/open | Manage | No access | Review pending users; approve member/viewer access |
| Member | Read/open | Manage | No access | No access |
| Finance | Read/open | Read | Manage | No access |
| Viewer | Read/open | Read | No access | No access |

Accounts must exist in both Auth0 and `fw_users` with a matching Auth0 subject ID. Auth0 users who are not active workspace members cannot read or write workspace data. Deactivation is enforced on every API request, including existing login sessions. It does not delete the Auth0 identity. Admins cannot remove their own admin access or deactivate the last active admin.

## Setup from scratch

You need Node.js 22+, an Auth0 account, a Vercel account and a hosted PostgreSQL database (for example Neon through the Vercel Marketplace). Complete account registration yourself, including each provider's terms. Do not send secrets in chat or commit them to Git.

### 1. Create the Auth0 application

1. Create an Auth0 tenant at https://auth0.com/ . In Applications, create a **Regular Web Application** named `Ferrowork Workspace`.
2. Create or use a dedicated database connection named `Ferrowork-Users`; enable it for this application. Enable email/password login. Disable public signups on the connection. Disable social/passwordless connections for this application unless deliberately needed.
3. Application callback URLs for local testing: `http://localhost:3000/auth/callback`. Allowed logout URLs: `http://localhost:3000`. Application login URI: `http://localhost:3000/auth/login`.
4. After obtaining your Vercel domain, add `https://YOUR-DOMAIN/auth/callback` to callback URLs and `https://YOUR-DOMAIN` to logout URLs. Use the actual domain, without wildcards. Set the application login URI to `https://YOUR-DOMAIN/auth/login`.
5. Copy the tenant domain, application client ID and application client secret into the matching environment variables below.
6. Create a separate **Machine to Machine Application** named `Ferrowork User Administration`, authorize it for the Auth0 Management API, and grant `create:users` and `delete:users`. The app creates database identities; `delete:users` is used only to roll back a failed local provisioning operation. Enable this M2M client for the database connection if required by your tenant's connection settings. Put its ID and secret in the `AUTH0_MGMT_*` variables.
7. Configure the Auth0 password policy and password reset email provider. Universal Login supplies the password-reset flow. MFA can be enabled through Auth0's tenant policies.

Auth0 documentation: [Next.js SDK](https://auth0.github.io/nextjs-auth0/), [Management API user creation](https://auth0.com/docs/manage-users/user-accounts/manage-users-using-the-management-api), [Disable signups](https://support.auth0.com/center/s/article/Disable-Signups-at-Connection-Level).

### 2. Connect PostgreSQL and configure secrets

Create an empty PostgreSQL database. Use its TLS connection URL. For Vercel, a pooled connection string is suitable; the app disables prepared statements and uses at most three connections per function instance. Enable the database provider's backups before storing business records.

From this directory in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use that generated value for `AUTH0_SECRET`. Edit `.env.local` locally:

| Variable | Value |
| --- | --- |
| `APP_BASE_URL` | `http://localhost:3000` locally; exact `https://YOUR-DOMAIN` on Vercel |
| `AUTH0_DOMAIN` | Tenant hostname, e.g. `YOUR-TENANT.au.auth0.com` |
| `AUTH0_CLIENT_ID` | Regular Web Application client ID |
| `AUTH0_CLIENT_SECRET` | Regular Web Application secret |
| `AUTH0_SECRET` | Random 32-byte hex session secret |
| `AUTH0_CONNECTION` | Dedicated database connection name |
| `AUTH0_MGMT_CLIENT_ID` | M2M client ID |
| `AUTH0_MGMT_CLIENT_SECRET` | M2M client secret |
| `DATABASE_URL` | Hosted PostgreSQL connection URL with TLS |

These are server variables. Do not prefix secrets with `NEXT_PUBLIC_`. Use `localhost` consistently for local login and the browser URL; the API checks request Origin against `APP_BASE_URL`.

### 3. Initialize the database and starter admin

```powershell
npm run db:setup
npm run bootstrap
```

The bootstrap script creates **benjamin.graetz@henleyhs.sa.edu.au** as an administrator in Auth0 and the workspace database. It generates a cryptographically random temporary password (24 random bytes plus character-class suffix) and displays it once in the terminal. Save it directly to a password manager. The password is never stored in application source or the application database. Use Auth0's Forgot password flow to replace it after first sign-in; replacement is not automatically enforced.

No admin account or password exists until this command succeeds. Rerunning bootstrap will not reset an existing account. It refuses to promote an existing Auth0 identity implicitly. If a database insert fails, the script attempts to remove the newly created Auth0 identity; inspect your Auth0 dashboard if rollback fails.

```powershell
npm run dev
```

Visit `http://localhost:3000`, choose Sign in, and use the new administrator credentials. Add people through People & access. Newly created passwords appear once in the UI; distribute them securely. The app does not automatically send invitation emails.

### 4. Deploy to Vercel

From this project directory:

```powershell
vercel login
vercel link
```

Create/select the `ferrowork` project, use the Next.js framework preset and this directory as project root. Add all environment variables from the table to the project's Production environment through Vercel Settings. Set `APP_BASE_URL` to the stable production domain. Add that domain's callback/logout URLs in Auth0 as described above. Then:

```powershell
vercel --prod
```

Vercel runs `npm run build`. Redeploy after changing environment variables. Use separate Auth0 callback URLs and preferably separate database/tenant credentials for any preview or staging environment. Never use a preview's random hostname as the production app base URL.

Alternatively, push this directory to a private GitHub repository and import it into Vercel. `.gitignore` excludes secrets, dependencies, generated build output and local Vercel state.

[Vercel CLI deployment](https://vercel.com/docs/cli/deploy), [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Validation before team use

1. `npm test` and `npm run build`.
2. Sign in as the starter admin; create a second user and sign in as that user in a separate browser profile.
3. Confirm records persist after refresh and are shared between those two sessions.
4. Test each role: non-finance users must receive no finance data, and non-admins must not manage users or websites.
5. Deactivate a user and verify their existing session loses API access.
6. Confirm public signup is unavailable and an Auth0 identity absent from `fw_users` receives no workspace data.
7. Check password reset delivery, logout, production callback URLs, database backups and audit events.

## Implementation notes

`app/api/workspace/route.ts` checks Auth0 session, active membership, role and mutation Origin. Records and audit entries are written in PostgreSQL transactions. Admin access changes use a transaction advisory lock to protect the last administrator. Projects with tasks cannot be deleted until their tasks are removed. Validation restricts external launcher URLs to HTTPS. Monetary amounts are converted to integer cents. CSV values are quoted and guarded against common formula prefixes.

Authentication is handled by the official Auth0 SDK through Next.js `proxy.ts`. Passwords and Management API tokens stay on the server. Identity provisioning crosses Auth0 and PostgreSQL, so it uses compensating deletion rather than a distributed transaction. Database modifications and Auth0 authentication events are separate; Auth0 dashboard changes are not mirrored in the application audit log. Concurrent edits use last-write-wins behavior. There is no custom login-password endpoint.

The frontend uses system fonts. Workspace records are supplied only by the authenticated API. No demo records are bundled in the interface.

## Installed workspace notes

The starter administrator is benjamin.graetz@henleyhs.sa.edu.au. Its generated password was delivered separately in a local credentials file outside this source directory. Server secrets are in ignored local configuration and Vercel Production secrets; none are included in the source archive.

Ferrowork uses its own Auth0 connection and applications within your existing AU tenant. The tenant display name and hosted-login theme are branded Ferrowork, including its logo, orange action buttons, green text and light background. This branding applies to all applications sharing the tenant. The live login page has been visually verified.




## HCB

Money includes a read-only HCB source for `org_mqupky` (FERROWORKS) using [HCB API v3](https://hcb.hackclub.com/docs/api/v3). Transparency Mode is enabled; no API key is needed. `/api/hcb` checks active membership and the existing admin/finance permission before fetching the fixed organization. It returns only the balance and transaction fields needed by the interface, with timeouts and no-store responses. Transactions load in pages of 50 with deduplication and an explicit refresh. CSV exports contain only the currently loaded, filtered rows and include currency.

HCB values are USD ([upstream currency configuration](https://github.com/hackclub/hcb/blob/main/config/initializers/money.rb)); the manual ledger remains AUD. The two sources are never combined or automatically imported. Payments, invoices and account changes must be performed in HCB. Availability depends on HCB and Transparency Mode.

## Goldeneye workflows

The signed-in product is Goldeneye; the Ferrowork login screen, Auth0 tenant, SSO application and Vercel address retain Ferrowork branding.

- Projects: separate AUD and USD budgets. Manual ledger entries accept a project. HCB transactions have a project selector in Money; a transaction can belong to one project, and its organization and amount are verified server-side. HCB allocations store a verified snapshot; reselecting the project refreshes that snapshot. Project finance summaries are visible only to admins and finance users. Currencies are never combined.
- Due dates: projects, tasks, quotes and orders appear in an upcoming list, with Adelaide-local due-today, due-soon and overdue labels. Completed work is excluded. These are in-app indicators, not scheduled email reminders.
- People: account creation requests an Auth0 password-setup email. Existing active users have Send setup email with a one-minute cooldown. A generated fallback password is shown once. Requested email delivery is not proof of inbox receipt; configure an Auth0 email provider for reliable production delivery. No larger Management API scopes are required. The first-login welcome can be acknowledged, with status shown to admins.
- Filament: material, colour, remaining grams, threshold, cost/kg and notes, with low-stock filtering and CSV export.
- Job costs: material grams, filament cost/kg, print hours, watts, energy rate, labour, overhead and markup calculate AUD cost and suggested selling price. Selecting a spool copies its current cost/kg into the estimate; changing spool costs later does not silently change existing estimates.
- Quotes: one job estimate per quote, quantity, unit price, customer, optional email, validity date, status and notes/terms. Accepted quotes convert atomically into one order. Converted quotes cannot be edited. Quotes and orders have printable/PDF views, sorting, filtering and CSV export. Internal cost breakdowns are hidden when printing a quote/order. Quotes are internal records; changing status to Sent does not send customer emails. Tax calculations and automatic billing are not implemented.
- Orders: production status, due date and an explicit Use filament action. Stock deduction is atomic, checks available grams and prevents repeated deduction. The job and quantity are locked after stock use. Cancellation does not automatically return used material; adjust spool stock after any physical return. This feature does not send printer commands.

Permissions: admin manages everything. Manager and finance manage quotes/orders. Member and manager manage job estimates and inventory. Viewers can read estimates/inventory. Customer details and HCB allocations are withheld from members/viewers. Linked records cannot be deleted while dependencies exist.

## Signup links and pending users

In People, admins and managers choose **Create signup link**, choose 7/30/90 days, and copy the reusable link. The recipient supplies their own name, email and password on the Ferrowork signup page. Auth0 creates the identity while Goldeneye stores an inactive member profile and a Pending request. A signed-in pending or denied applicant receives a clear status message and no workspace data. No role, approval status or active flag is accepted from public signup input.

People shows **Pending users** to admins and managers, with approval/denial, role assignment and a recent-review history. Managers may approve member/viewer roles; admins may assign any existing role. Reviews are transactional, check the reviewer's current membership and prevent a second decision on a handled request. The list refreshes every 30 seconds while visible. Denied requests remain inactive; approval does not send a notification email. Existing direct admin user creation and password-setup emails are still available to admins.

Links store only a SHA-256 token hash. Raw 256-bit tokens appear only in the copyable link, in the URL fragment rather than a server path/query. Links are reusable until expiry or revocation and become unusable if their creator is deactivated or loses admin/manager status. Signup attempts are limited to 20 per hour per hashed network fingerprint. Public signup creates no active workspace access. Accounts and review history are retained after denial; the same email cannot submit a second account. No invitation URLs, passwords or application secrets are packaged in source archives.

## Printer product development and Printer Lab

Goldeneye now includes a Printer BOM and Design changes. BOM entries capture part number, supplier, category, quantity per printer, USD unit cost, lead time, qualification status and revision. The page totals the estimated component bill and compares it with an $899 USD retail target, showing the amount left before margin and non-BOM costs. This is a component-cost view; assembly, freight, tax, warranty, packaging and channel fees still need to be added to get full unit economics. Design changes capture an owner, affected parts, cost impact, target date and review status.

Printer Lab is a separate tool at `/printer-lab` in the same Vercel deployment. It tracks firmware release metadata, prototype test runs and issues; it does not build, upload or flash firmware and does not send commands to a printer. Both tools use the existing Ferrowork Auth0 SSO session and the Goldeneye PostgreSQL user directory as the shared role source. Every API request checks current active membership and role, so People-page access changes apply immediately in both tools. There is no second Auth0 application or separate role copy to maintain.

Access: admins can manage all records; managers and members can create, edit or remove product records; viewers can read; finance-only accounts do not receive product records. Printer Lab supports creating, editing and deleting firmware/test/issue records. Git-based firmware artifacts, device telemetry, printer control and automated releases need the printer's firmware repository and device protocol before they can be connected.
