# API endpoint testing guide

Base URL: `https://ferrowork.vercel.app` (or `http://localhost:3000` locally). Use a test account and a fresh test invitation. Never paste a real password or invitation token into shared logs, screenshots or bug reports.

## Application APIs

| Method and path | Access | What to test |
| --- | --- | --- |
| `GET /api/workspace` | Auth0 session + active Goldeneye user | Signed out returns `401`; signed in but inactive/pending/denied returns `403`; active users receive only records allowed for their role. Admin/manager user list and admin-only audit data are role-gated. |
| `POST /api/workspace` | Auth0 session + active user + role permission + same-origin request | Create, update, delete, user management, onboarding, quote conversion and stock deduction. Signed out returns `401`; insufficient role or foreign/missing Origin returns `403`. Try a forged role, invalid record id, duplicate stock deduction, and cross-project references; each must be rejected. |
| `GET /api/hcb` | Auth0 session + active admin/finance user | Signed out returns `401`; member/viewer/manager access is denied. HCB read failures should not expose credentials. |
| `GET /api/invitations` | Auth0 session + active admin/manager | Lists links and pending/recent signup requests. Signed out returns `401`; member/finance/viewer returns `403`. |
| `POST /api/invitations` | Auth0 session + active admin/manager + same-origin request | Create/revoke signup links or approve/deny pending requests. Try as member, with a foreign Origin, expired/revoked link, repeated decision, and manager assignment of an admin role; these must be rejected. |
| `POST /api/invitations/accept` | Public, capability limited by the invitation token | `action=preview` returns expiry only; `action=accept` creates an inactive pending account. Test invalid/expired/revoked token, foreign Origin, non-JSON, malformed JSON, >16 KiB body, weak password, duplicate email, and rate limit. Signup never grants workspace access before approval. |
| `GET /api/ferroai` | Auth0 session + active user | Returns role-filtered settings/models/usage; only admin receives settings and user-wide usage. Signed out returns `401`. |
| `POST /api/ferroai` | Auth0 session + active user + allowed role/model + same-origin request | Generate a model response. Test disabled feature/model/role, usage limit, foreign Origin, invalid chat ownership and oversized request. |
| `PUT /api/ferroai` | Auth0 session + active admin + same-origin request | Update settings or provider key. Signed out returns `401`; non-admin returns `403`; foreign Origin is rejected. Verify the key is never returned by `GET`. |
| `GET /api/ferroai/chats` | Auth0 session + active user | Lists only the caller's chats; `scope=all` is admin-only. Test reading another user's chat by id (must return not found) and non-admin `scope=all` (must be denied). |
| `DELETE /api/ferroai/chats?id=…` | Auth0 session + active chat owner + same-origin request | Owner can delete a completed chat; another user and an active response cannot. Foreign Origin is rejected. |

## Auth0 routes

The Auth0 Next.js SDK serves `/auth/login`, `/auth/callback`, `/auth/logout`, and related `/auth/*` routes. Login and callback must be reachable without an existing session; they establish or end sessions. When Auth0 is not configured, these routes return `503`.

## Security expectations

- Every application API except `POST /api/invitations/accept` requires a valid Auth0 session and checks current active membership. Role-sensitive operations apply server-side permissions; hiding a UI control is not the authorization boundary.
- Invitation acceptance is public by design so a new person can apply before an account/session exists. Its unguessable token is the capability; tokens are random 256-bit values, stored as SHA-256 hashes, and carried in the URL fragment. Submission is same-origin only, bounded to 16 KiB, and limited to 20 requests per hour per hashed network fingerprint. Created identities remain inactive pending review.
- Browser DevTools shows the decoded JSON request body, including the password, by design. Over the production `https://` connection, TLS encrypts that request in transit. The app receives the password in memory to create the Auth0 identity over HTTPS; it does not store it in PostgreSQL or log the request body.
- `401` means no valid session; `403` means the session or request lacks permission; the invitation endpoint can return `400`, `403`, `409`, `410`, `413`, `415` or `429` for rejected inputs/origin, duplicate account, unusable token, oversized body, wrong content type or throttling.
