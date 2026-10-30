# FerroSign handoff

## Latest rollout status — 30 October 2026

- Source pushed to `codex/ferrosign-rollout`; draft PR: https://github.com/FERROWORKS-hackclub/goldeneye/pull/1.
- Node 22 clean install, typecheck, 40 tests and production build passed. Vercel also reported a successful preview deployment. Production integration tests remain outstanding.
- `sign.ferroworks.org` is attached to the existing `ferrowork` project. Porkbun CNAME `sign` -> `fad657e3df90d54b.vercel-dns-017.com` saved with TTL 600; Cloudflare DNS verified. HTTPS returned 200 for the previous production app; FerroSign code is not promoted yet.
- Vercel Production now has `FERROSIGN_BASE_URL=https://sign.ferroworks.org` and `FERROSIGN_EMAIL_FROM=FerroSign <noreply@ferroworks.org>`.
- Existing Purelymail noreply account confirmed. No mail was sent or passwords changed.
- Private `ferrosign-documents` Blob store CREATED in iad1 after explicit user approval. Store ID: `store_PgU7XAAIncctVQng`. The `ferrowork` connection shows `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` for Production and Preview. Token values were not revealed.
- Neon Vercel SSO project confirmed: `empty-leaf-95074774`, production `main` branch `br-little-night-a7rsjmy2`, database `neondb` (AWS Sydney). Six-hour recovery history verified and a manual pre-migration snapshot created at `2026-10-30 10:07:51 UTC`. Signing schema transaction completed successfully and verification returned all three tables. The existing internal OIDC callback update remains pending explicit approval.
- Production is not ready: backup/restore review, signing schema, OIDC callback registration, APP_BASE_URL verification, private Blob configuration, isolated preview integrations, and the full live signing lifecycle remain required.

The detailed verification notes below describe earlier checkpoints; this section supersedes their deployment status.

FerroSign is the Ferroworks document-signing workspace intended for **https://sign.ferroworks.org**. This file records the work in the current source clone, what still needs verification/configuration, and a copy-ready prompt for whoever completes the rollout.

## Current implementation in this clone

- The existing Next.js app routes requests on `sign.ferroworks.org` to FerroSign and reuses Ferrowork's OIDC login and `fw_users` roles.
- `admin` and `manager` accounts can upload a PDF (currently limited to 4 MiB), assign signers by name/email, place fields across PDF pages, and assign each field to a signer. Field types include drawn signature, date, number, sentence, and word.
- Account holders see only envelopes assigned to their account. External signees/co-signees get an email link without needing an account. Links use random tokens stored as SHA-256 digests and expire after 14 days.
- Purelymail SMTP is used through the existing SMTP environment variables. Completed documents are assembled as PDFs, and source/completed files use private Vercel Blob access behind authorization routes.
- Signing events are recorded in `fw_sign_audit`. This is an auditable electronic acknowledgement, **not** a certified/qualified digital signature.
- Database migration: `scripts/ferrosign-schema.sql`; apply with `npm run db:ferrosign` after configuring `.env.local` with the correct database.
- Runtime setup values are listed in `.env.example`. The app expects `BLOB_READ_WRITE_TOKEN`, SMTP credentials, and `FERROSIGN_BASE_URL` in Vercel Production.

## Validation and deployment status — 30 October 2026

- Node 22.23.4 was obtained from the official npm `node` package without changing the system Node installation.
- Clean `npm ci` succeeded after a network-reset retry. Run npm through Node 22's executable; this device's installed `npm.cmd` explicitly selects system Node 20.
- `npm run typecheck` passed after the clean install. Production `npm run build` also passed (exit 0); Better Auth logged default-secret warnings because no local production auth secrets are configured.
- `npm test` passed: 40 tests, including six new FerroSign tests for roles, malformed/duplicate/out-of-bounds fields, signer assignments, missing/invalid expiry, invalid/unknown answers, and date/number/word/text validation.
- The previous note about missing test files was incorrect for this checkout. Node 20 on Windows failed to expand the test glob; Node 22 runs the suite.
- Hardening added: strict envelope schemas and unique field IDs, required signatures per signer, fail-closed expiry, bounded/type-checked answers, no-store signing metadata, draft download restrictions, transactional invitation locking and rollback on SMTP failure, safe completed-Blob retry, multiple signature strokes, clear controls, and field values restored across page navigation.
- Invitation sending currently holds a document transaction lock through SMTP delivery. On partial failure it rolls back all tokens and leaves the draft unavailable to external signers. Retrying sends fresh links to all signers; earlier emails may contain unusable links. This is safe against exposing a draft but still needs a real SMTP failure/retry test.
- Browser confirmed Vercel account `benjamin-graetzs-projects`, project `ferrowork`, linked to `FERROWORKS-hackclub/goldeneye`. Current production was commit `a587a31` from 22 October.
- Vercel production identity/SMTP secrets and the Neon `ferrowork-db` integration exist. No Blob store was connected and `sign.ferroworks.org` was absent from project domains when inspected.
- Existing identity/SMTP/database secrets are Production-only. A preview needs isolated test services and configured callback/origin values; do not copy production credentials into a broadly accessible preview.
- Browser control repeatedly timed out/disconnected. The stored Vercel CLI credential returned HTTP 403. No database migration, Blob store, environment-variable, DNS, or production-deployment change has been made in this session.
- Full signing lifecycle, real SMTP, OIDC callback registration, PostgreSQL concurrency/rollback, completed-PDF visual rendering, and private Blob delivery remain integration tests to perform before launch. The unit tests do not establish those outcomes.
- Non-signature text currently accepts Latin text supported by the built-in PDF font, rejects unsupported Unicode and control characters, and caps text to 500 characters (80 for word fields).

## Required before production

1. **Review/test the full signing lifecycle.** On Node 22+, test account login/logout on the subdomain, admin/manager authorization, member assigned-only visibility, invalid/expired/reused tokens, multi-page PDFs, multiple co-signers with fields assigned to different people, field validation, PDF coordinates, final PDF rendering, and private downloads. Confirm a partial mail-send failure remains safely retryable and does not expose a draft.
2. **Extend integration tests.** Cover role/ownership checks, token expiry and digest behavior, field validation, and completion/audit behavior. Run `npm run typecheck`, `npm test`, and `npm run build` with test/production-like environment values.
3. **Configure database.** Run `npm run db:ferrosign` against the intended production database only after reviewing the SQL and confirming a backup. Verify all three FerroSign tables/columns and the migration is safe to re-run.
4. **Configure private storage.** Create/choose the correct Vercel Blob store, ensure it is private, add its `BLOB_READ_WRITE_TOKEN` to Vercel Production, then test upload, streaming, and completed-PDF storage without public URLs.
5. **Configure email and identity.** Set Purelymail SMTP (`smtp.purelymail.com`, port 465/TLS, `noreply@ferroworks.org`) and `FERROSIGN_EMAIL_FROM=FerroSign <noreply@ferroworks.org>`. Add `https://sign.ferroworks.org/api/login/callback/ferrowork` to the trusted Ferrowork OIDC client, and confirm `https://sign.ferroworks.org` is in Identity's trusted origins and `APP_BASE_URL`.
6. **Attach the subdomain.** In Vercel, add `sign.ferroworks.org` to the existing project and use the DNS record/target Vercel displays. In Porkbun, create that record (do not guess the target; use Vercel's current instructions). Wait for DNS/TLS verification.
7. **Deploy safely.** Deploy a preview first; verify identity redirects/callback, account-holder visibility, external email links, completed PDFs, and Blob privacy. Only then promote to production. Do not place any credentials in the repository or in a `NEXT_PUBLIC_*` variable.
8. **Push/PR.** The code changes originated in the temporary clone at `C:\Users\240026\AppData\Local\Temp\opencode\goldeneye`. Review/copy them into the intended GitHub checkout and create/push the PR using the owner's browser workflow. No PR, Vercel change, DNS change, or production deployment has been made by this work session.

## Copy-ready completion prompt

```text
Finish and safely deploy FerroSign in the Ferroworks Goldeneye repository. Read FERROSIGN-README.md and the repository's AGENTS.md files first. The current implementation is in the repo's FerroSign files; do not replace the existing Ferrowork OIDC login or weaken existing workspace authorization.

Requirements:
- Host the FerroSign product at https://sign.ferroworks.org on the existing Vercel Next.js project. Staff creation is limited to admin/manager. Account holders see only documents assigned to them. External signees/co-signees sign by secure email link without accounts.
- Use private Vercel Blob storage; Purelymail SMTP from noreply@ferroworks.org. Do not expose blob URLs/tokens or add secrets to source control.
- Support multi-page PDFs, per-signer field assignment (signature/date/number/sentence/word), required-field validation, co-signers, saved field placements, audit events, and a generated completed PDF. Signing is an auditable electronic acknowledgement, not a claim of certified e-signature compliance.
- Review every FerroSign API/UI path for authorization, token expiry/replay, input validation, concurrency, partial email failures, PDF handling, accessibility, and private file delivery. Fix defects rather than merely documenting them. In particular test multiple signatures per signer and multiple signers, PDF page coordinates, and completion after the final signer.
- Add automated tests for roles/assignment, invalid/expired/reused links, field validation, audit/completion, and unauthorized downloads. Run npm ci, npm run typecheck, npm test, and npm run build with Node 22+; report results and warnings honestly.
- Verify schema/migration safety before applying scripts/ferrosign-schema.sql to the intended database. Then configure the real Vercel Blob token, Purelymail SMTP, OIDC callback/trusted origin, and APP_BASE_URL. Add the subdomain in Vercel and configure Porkbun using the exact DNS target shown by Vercel. Never guess DNS targets or request/post secrets in chat.
- Deploy and test a preview before production. Do not claim the live subdomain is ready until DNS/TLS, login, email delivery, external signing, completed downloads, and Blob privacy have all been verified.

The repository owner will push/create the PR through their browser. Prepare the code and a clear deployment checklist; do not claim to have pushed, changed DNS, or deployed unless that actually happened.
```
