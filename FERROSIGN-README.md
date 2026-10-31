# FerroSign handoff

## Latest rollout status — 31 October 2026

- Source pushed to `codex/ferrosign-rollout`; draft PR: https://github.com/FERROWORKS-hackclub/goldeneye/pull/1.
- Node 22 clean install, typecheck, all 41 tests and production build passed. Latest commit `600c4b3` has a successful Vercel preview. Production integration checks remain outstanding.
- `sign.ferroworks.org` is attached to the existing `ferrowork` project. Porkbun CNAME `sign` -> `fad657e3df90d54b.vercel-dns-017.com` is saved with TTL 600; Cloudflare DNS resolves that target and HTTPS works. The FerroSign production release is still pending.
- Vercel Production now has `FERROSIGN_BASE_URL=https://sign.ferroworks.org` and `FERROSIGN_EMAIL_FROM=FerroSign <noreply@ferroworks.org>`.
- Existing Purelymail noreply account confirmed. SMTP production settings are already present; no password was changed. One clearly labelled test invitation to `benjamin.graetz@henleyhs.sa.edu.au` is authorized but has not yet been sent.
- Private `ferrosign-documents` Blob store CREATED in iad1 after explicit user approval. Store ID: `store_PgU7XAAIncctVQng`. The `ferrowork` connection shows `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` for Production and Preview. Token values were not revealed.
- Neon Vercel SSO project: `empty-leaf-95074774`, production `main` branch `br-little-night-a7rsjmy2`, database `neondb` (AWS Sydney). Six-hour recovery history is available; a manual pre-migration snapshot was created at `2026-10-30 10:07:51 UTC`. The signing schema was applied and all three tables verified. Existing Goldeneye OIDC client now contains the approved `https://sign.ferroworks.org/api/login/callback/ferrowork` callback; all prior callbacks were preserved.
- User approved creating the private Blob store and connecting its token, and approved that callback. Identity's trusted origin, Porkbun DNS, Vercel domain and Production base/sender settings are configured. Preview has Blob connected, but preview identity/database/SMTP are not isolated or validated.
- Draft PR #1 is open on `codex/ferrosign-rollout` at `600c4b3b62d9dfe5cd67f6d930db631c51450b11`; GitHub reports Vercel Preview success. Merge/release, production login and staff workflow, one authorized test invitation, external signing, final-PDF output and private file access still need live verification.

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

## Code validation — 31 October 2026

- Node 22.23.4 was obtained from the official npm `node` package without changing the system Node installation.
- Clean `npm ci` succeeded after a network-reset retry. Run npm through Node 22's executable; this device's installed `npm.cmd` explicitly selects system Node 20.
- `npm run typecheck` passed after the clean install. Production `npm run build` also passed (exit 0); Better Auth logged default-secret warnings because no local production auth secrets are configured.
- `npm test` passed: 41 tests, including FerroSign tests for roles, same-origin enforcement, malformed/duplicate/out-of-bounds fields, signer assignments, missing/invalid expiry, invalid/unknown answers, and date/number/word/text validation.
- The previous note about missing test files was incorrect for this checkout. Node 20 on Windows failed to expand the test glob; Node 22 runs the suite.
- Hardening added: strict envelope schemas and unique field IDs, required signatures per signer, fail-closed expiry, bounded/type-checked answers, no-store signing metadata, draft download restrictions, transactional invitation locking and rollback on SMTP failure, safe completed-Blob retry, multiple signature strokes, clear controls, and field values restored across page navigation.
- Invitation sending currently holds a document transaction lock through SMTP delivery. On partial failure it rolls back all tokens and leaves the draft unavailable to external signers. Retrying sends fresh links to all signers; earlier emails may contain unusable links. This is safe against exposing a draft but still needs a real SMTP failure/retry test.
- Browser confirmed Vercel account `benjamin-graetzs-projects`, project `ferrowork`, linked to `FERROWORKS-hackclub/goldeneye`.
- Existing identity/SMTP/database secrets are Production-only. A preview still needs isolated identity, database, and mail services; do not copy production credentials into a broadly accessible preview.
- The Vercel CLI credential returned HTTP 403. Configuration was performed in the signed-in browser. No secret values were exposed.
- Full signing lifecycle, SMTP delivery/retry, OIDC login on the subdomain, PostgreSQL concurrency/rollback, completed-PDF visual rendering, and private Blob delivery remain integration tests. Unit/build/preview success do not establish those outcomes.
- Non-signature text currently accepts Latin text supported by the built-in PDF font, rejects unsupported Unicode and control characters, and caps text to 500 characters (80 for word fields).

## Remaining release checks

1. **Review/test the full signing lifecycle.** On Node 22+, test account login/logout on the subdomain, admin/manager authorization, member assigned-only visibility, invalid/expired/reused tokens, multi-page PDFs, multiple co-signers with fields assigned to different people, field validation, PDF coordinates, final PDF rendering, and private downloads. Confirm a partial mail-send failure remains safely retryable and does not expose a draft.
2. **Extend integration tests.** Cover role/ownership checks, token expiry and digest behavior, field validation, and completion/audit behavior. Run `npm run typecheck`, `npm test`, and `npm run build` with test/production-like environment values.
3. **Production release.** Merge draft PR #1 once the latest successful Vercel preview is confirmed; wait for the production deployment to finish before testing the live domain. Do not place credentials in the repository or a `NEXT_PUBLIC_*` variable.
4. **Verify live integration.** Confirm subdomain login, staff authorization, assigned-only visibility, one approved clearly labelled test email, token expiry/replay, multi-page field placement, external signing, audit/completion, final PDF rendering, and private Blob delivery. Test SMTP rollback/retry behavior if practical.
5. **Preview isolation.** Before enabling preview signing workflows, provide isolated identity/database/mail settings. The current preview Blob connection alone does not make preview end-to-end testing safe or representative.

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

This repository and branch are already pushed and the draft PR is open. Finish the production rollout only after reviewing the latest Vercel preview, then record the actual live results here and in the user handoff. Do not claim production readiness until live authentication, email delivery, signing, completed downloads, and Blob privacy have been verified.
```
