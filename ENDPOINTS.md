# API endpoint testing guide

Use a non-production test account first. Never place a real password, reset URL, OIDC secret or invitation token in shared logs or screenshots.

## Ferrowork Identity

| Method and path | Access | Test |
| --- | --- | --- |
| `GET/POST /api/auth/*` | Identity session or protocol flow | Email/password login, logout, password reset, organization and OAuth/OIDC calls. Public signup stays disabled. |
| `GET/POST /api/login/*` | OIDC client flow | Sign in/out at each product callback; validate PKCE/state, exact callback allowlists and role/session expiration. |
| `GET /sign-in` | Public | Login page; no account creation form. |
| `GET /consent` | Signed-in identity user | Shows OIDC client access request; allow/deny resumes or cancels the request. |
| `GET /reset-password` | One-time reset token | Expired/used token is rejected. No password appears in response or logs. |

## Internal workspace

| Method and path | Access | Test |
| --- | --- | --- |
| `GET /api/workspace` | Signed-in active Goldeneye user | Anonymous gets `401`; pending, denied, disabled and unknown users receive no data. Check finance/admin fields are role-limited. |
| `POST /api/workspace` | Active user + role + same-origin request | Create/update/delete and administrative actions; try forged role, foreign Origin, invalid IDs, duplicate stock use and cross-project references. |
| `GET /api/hcb` | Admin or finance | Anonymous and other roles are denied; only `org_mqupky` is accepted. |
| `GET /api/invitations` | Active admin or manager | Lists link and pending/recent review data; other roles are denied. |
| `POST /api/invitations` | Active admin or manager + same-origin | Create/revoke links and approve/deny; managers cannot assign elevated roles. |
| `POST /api/invitations/accept` | Public, 256-bit capability token | Preview reveals expiry only. Acceptance validates same origin, JSON, 16 KiB limit, password policy, uniqueness and rate limit; new workspace record remains inactive pending approval. |
| `GET/POST/PUT /api/ferroai*` | Active user plus server role checks | Test chat ownership, quotas, model/role restrictions, admin settings, foreign Origin and oversized requests. Provider keys never appear in GET results. |

## Commercial tenant API

| Method and path | Access | Test |
| --- | --- | --- |
| `GET /api/saas/workspace?organizationId=…` | Active organization member | No session or a member from another organization returns no customer data. Read roles can list records. |
| `POST /api/saas/workspace` | Organization owner/admin/manager + same-origin | Create, update, delete. Member, finance and viewer roles cannot write. A record ID from another tenant must return not found. |

Run cross-tenant tests with two organizations. Try a valid session with a missing organization id, a guessed foreign organization id, forged role/body fields, and SQL queries without transaction-local `app.organization_id`. `ge_saas_records` is protected by forced PostgreSQL row-level security in addition to application membership checks.

Every internal API except signup acceptance and Identity protocol routes requires an authenticated session and active `fw_users` membership. Tenant APIs additionally check Better Auth organization membership. Passwords are handled over HTTPS, hashed by Better Auth and not returned in JSON; browser DevTools can still display the user's own submitted request body. TLS protects it in transit.
