# Marketing and product research

Staff open `/marketing` from the Goldeneye sidebar. Viewers cannot access campaign, contact, or research data.

## Operations

- Run `npm run db:marketing` with the production database before deployment. The migration creates only new `fw_marketing_*` and `fw_research_responses` tables and a default public newsletter list.
- Messages use `Ferroworks <newsletter@ferroworks.org>` through existing Purelymail `SMTP_*` settings. Optional `MARKETING_SMTP_HOST`, `MARKETING_SMTP_PORT`, `MARKETING_SMTP_USER`, and `MARKETING_SMTP_PASSWORD` override the shared transport. Ensure this sender is allowed by the Purelymail account. Settings → Verify SMTP checks authentication without sending a message.
- `MARKETING_BASE_URL` defaults to `https://goldeneye.ferroworks.org`. Link signatures use `MARKETING_TOKEN_SECRET` or the existing server auth secret. Keep this stable so unsubscribe links remain valid.
- Set `CRON_SECRET` for the daily recovery worker. Sending also processes bounded batches immediately and schedules authenticated continuation requests. Paused campaigns remain paused. Interrupted SMTP deliveries are marked unknown and are never automatically resent.
- Add the real organisation contact/postal information under Settings before sending campaigns.

## Editing and delivery

Drag blocks into a campaign; use handles or arrow buttons to reorder. Changes save automatically. Other editors and revisions refresh approximately every two seconds. Changes to different fields merge; simultaneous changes to the same field require explicit conflict resolution.

Review the audience and subject before sending. Sending freezes a version and deduplicates recipients. Every recipient receives a separate email with mandatory HTML/plain-text unsubscribe links and List-Unsubscribe headers. Suppressions are checked again immediately before delivery. Importing contacts cannot clear an unsubscribe. Public signups require confirmation by email; survey completion does not itself grant newsletter permission.

## Public forms and research

The FERROWORKER static site posts to the public API through an exact-origin CORS allowlist. Forms include a honeypot, bounded validation, rate limits and idempotent survey requests. Public response fields cannot set subscription status, IP address or location.

Survey choices include five AUD prices, shipping days 4–35, and exactly two tradeoffs. Submission metadata includes a random browser identifier, reported browser settings, user agent, and Vercel-provided IP/coarse location when available. These fields are disclosed before submission. Browser identifiers are not reliable proof of identity and approximate location is not GPS location.

Research contains individual responses, respondent-based percentages, charts, geographic/browser summaries, CSV export and branded print views (browser Print → Save as PDF). The combined printable report is limited to 2,000 individual responses; CSV export streams all responses. Multiple-choice chart percentages can add to more than 100%.

## Verification

`node --test tests/marketing.test.mjs` checks validation, tokens, rendering and import safety. `MARKETING_DATABASE_TESTS=1 node --env-file=.env.local --test tests/marketing-storage.test.mjs` runs concurrency and audience tests in a generated, isolated database schema that is removed afterwards.
