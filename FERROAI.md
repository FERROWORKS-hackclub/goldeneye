# FerroAI

FerroAI lives at `/ferroai`, with admin controls at `/ferroai/settings`. It shares Ferrowork Identity and the `fw_users` directory with Goldeneye and Printer Lab. Active approved accounts are required; live roles are checked server-side on every API call. Admins alone can edit settings, keys, allowed models, role access, and limits. FerroAI does not read company records into model context.

## Setup

Run `node --env-file=.env.local scripts/ferroai-setup.mjs` against the existing database before deployment. This adds two tables without changing company records. The script is safe to run again and preserves settings.

Sign in as an admin, open Settings and save the shared Hack Club AI API key. It is encrypted using AES-256-GCM with a key derived from the existing server-only `AUTH0_SECRET` during the transition; if that legacy value is unavailable, `BETTER_AUTH_SECRET` is used. Preserve the old value until the stored key is securely re-encrypted. A server-only `HC_AI_API_KEY` environment variable is also supported as a fallback. Never prefix it with `NEXT_PUBLIC_`. The API returns only connection status, never the secret.

No separate role assignments are needed: the app uses the same role authority as Ferrowork's internal tools. Changes made in Goldeneye People apply to new FerroAI requests; an already-running generation may complete.

## Models and requests

The model picker preserves the six originally requested exact `:free` IDs and adds MiniMax M3.1 Flash, NVIDIA Nemotron 3 Ultra 550B, Google Gemma 4 31B, and Thinking Machines Inkling. Chat models use HC's `/proxy/v1/chat/completions` endpoint. LFM2.5-Embedding-350M uses `/proxy/v1/embeddings`, returning a downloadable vector rather than an answer. Its 512-token context is conservatively bounded to 480 UTF-8 input bytes. There is no automatic model fallback or paid model selection. Upstream availability is not guaranteed. This version accepts text input, including when selecting Nemotron; image uploads are not implemented.

### Live web modes

MiniMax M3.1 Flash Live, Nemotron 3 Ultra 550B Live, and Gemma 4 31B Live display a LIVE tag. These are FerroAI search-enabled variants, rather than claims that the underlying base models independently browse. Each accepted Live turn searches the internet through HC's `/proxy/v1/exa/search` endpoint, then supplies bounded results to the selected model. At most the last two user messages, bounded to 1,800 characters, form the search query. Queries are sent to HC's search provider. Search counts against the shared HC daily allowance, even though model generation uses `:free` endpoints; there is no unlimited-free-search promise. Admins can disable each Live mode in Settings.

Up to five source links and their retrieval times are saved with the response and displayed in both conversation history and Safety review. Models receive numbered citation instructions and explicit instructions to treat web excerpts as untrusted data. These measures do not guarantee factual accuracy or eliminate prompt injection. Links reject executable protocols and embedded credentials. Search is fresh per turn, but source pages may reflect the search provider's index or cached content. Search failures are surfaced to users rather than silently generating a response that claims live research. Regular models are explicitly told they do not have live web access for that response.

The search step times out after 20 seconds; the complete search and generation sequence shares a 95-second deadline. Existing identity, role access, quotas, chat ownership, deletion and safety review apply to Live modes too. Run `scripts/ferroai-model-update.mjs` once after deploying the expanded settings schema to enable the new options in an existing workspace. Its audit marker prevents subsequent runs from re-enabling options an admin later disables. The original model toggles and all role/limit settings are preserved.

Conversations save by default to the signed-in profile in `fw_ai_chats` and `fw_ai_messages`, including prompts, responses, selected models, embeddings and generation errors. The most recent conversation loads on return; older chats are available in the sidebar across devices. Conversations from the earlier tab-memory-only version cannot be recovered. Context for new chat turns is read from server-owned message history, not client-supplied history. The last 49 eligible messages are included, subject to configured character limits; embeddings and failed assistant responses are omitted from generation context. Full conversation context is sent to HC and its model providers. Responses render as plain text to prevent HTML execution.

Members see a notice above the composer that chats are saved and admins can review prompts and responses. `/ferroai/safety` is an admin-only view of saved conversations with member/title search and pagination. Non-admin users cannot list or read anyone else's chats, including by guessing a conversation ID. Reviews of other members' conversations are audited without duplicating message content into the audit log.

The sidebar trash button opens a confirmation dialog. Deletion permanently removes that owner's conversation and its message/embedding rows from the application database and safety view via a cascading foreign key. It cannot be undone. Content-free request counts and audit entries remain; deletion does not reset quotas. Admin reviewers cannot delete other members' conversations. A chat with a pending generation cannot be deleted until the generation finishes or expires. This does not delete data already received by HC/model providers or managed database backups.

## Limits

Admins set workspace defaults and optional complete overrides for roles and individual users. Individual overrides take precedence over role overrides, which take precedence over defaults. Daily request quotas reset at 00:00 UTC; the minute window is rolling. Requests are reserved inside a database transaction while locking the user's row, so concurrent requests cannot bypass quotas. One generation per user is permitted at a time. Pending reservations expire after 110 seconds; the provider call times out after 95 seconds. Attempts, including failures and stopped responses, count toward request quotas. Input and output bounds always apply even if quotas are disabled.

Provider/account limits still apply and cannot be disabled in FerroAI. HC's service is for eligible users aged 18 or under; everyone receiving access must comply with its rules. The global key must not be used to extend access to ineligible users, resell access, or run autonomous coding agents. See https://docs.ai.hackclub.com/guide/rules.

Settings changes are audited without recording key contents. Usage totals are visible to admins; members can see their own request counts. The UI works in browsers on Windows, macOS, Linux and mobile; it is not a native executable.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Database migrations require access to the configured database; live generation requires the HC key and a currently available requested model.

`scripts/ferroai-smoke.mjs` checks base models using the configured key, without printing the key. Its short requests may produce empty answers for models that use their output budget for reasoning; it is an endpoint availability probe, not an application conversation test. `scripts/ferroai-live-smoke.mjs` tests Exa retrieval followed by a sourced answer. Direct probes are not counted in FerroAI's app quotas, but do consume the HC account allowance.
