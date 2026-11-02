# LIVEFORGE backend

The control plane runs in Next.js Route Handlers. Neon Postgres stores versioned show documents using atomic compare-and-swap updates. The browser worker owns the fixed-step game; the server stores acknowledged checkpoints and controls exact-artifact approval and activation. A renewable 90-second authority lease carries a monotonically increasing fencing epoch. A second tab cannot publish a world while the first owns an unexpired lease.

## Configure and run

Use Node.js 22.x. Install with `npm ci`; start with `npm run dev` (port 3100). Configure `.env.local` locally or Vercel environment variables on deployment:

- `DATABASE_URL`: Neon/Postgres connection URL. Production refuses to fall back to memory or local disk.
- `SESSION_SECRET`: at least 32 characters; signs host sessions and pseudonymizes Twitch voting identities.
- `TOKEN_ENCRYPTION_KEY`: exactly 32 random bytes encoded as base64; encrypts OAuth grants with AES-256-GCM.
- `APP_BASE_URL`: exact studio origin, such as `http://localhost:3100` or the production alias.
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: Twitch application. Register `${APP_BASE_URL}/api/auth/twitch/callback` exactly. The obsolete copied `TWITCH_REDIRECT_URI` is deliberately ignored.
- `OPENAI_API_KEY`: runtime model access. Never use a `NEXT_PUBLIC_` variable.
- `CODEX_MODEL`: defaults to `gpt-6.1-sol`; the configured account must actually support it.
- `LIVEFORGE_GENERATION_HOST_IDS`: comma-separated Twitch user IDs outside the public daily quota. With `LIVEFORGE_GENERATIONS_PER_HOST_PER_DAY` set (integer 0–2000), each listed host gets that many reservations per UTC day, charged outside the shared pool; unset, listed hosts are fully exempt. Other independently OAuth-authenticated accounts can generate within their allowance; anonymous visitors cannot launch model jobs. Labeled reused laws are available in practice and Twitch shows without model spend.
- `LIVEFORGE_GENERATIONS_PER_USER_PER_DAY` and `LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY`: generation reservations per verified Twitch user and globally per UTC day; defaults 3 and 40. Each accepts an integer from 0 through 2000. Zero disables that public allowance; malformed/out-of-range configuration fails closed.
- Vercel Sandbox identity: Vercel provides trusted per-request OIDC context in deployments (a static `VERCEL_OIDC_TOKEN` variable is not required); use a fresh local OIDC token from the linked project, or all of `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` locally.

Without `DATABASE_URL`, development alone may persist to `.local/store`. This is a cross-process lock plus atomic-rename JSON store, not process memory. A crashed development process may leave `.local/store/.lock`; stop all local servers before removing that lock. No such fallback is permitted when `NODE_ENV=production` or `VERCEL` is set. Redis and Blob are not required.

Read-only/setup probes (never print secrets):

```sh
node --env-file=.env --env-file=.env.local --import tsx scripts/db-check.ts
```

The following is a **real billable** Codex SDK generation, not a mock or prewritten rule selector:

```sh
node --env-file=.env --env-file=.env.local --import tsx scripts/generation-probe.ts 'When a stationary prop is close to the courier, create a temporary step to its right and make it glow brass.'
```

## HTTP contract

All responses are JSON and `Cache-Control: no-store`. All show mutations require the signed HttpOnly `liveforge_host` cookie, an exact same-origin `Origin` header, and a unique `x-idempotency-key` (8–100 word/hyphen characters). Next.js browser `fetch` supplies Origin automatically on POST. Responses normally contain `{show: ShowState}`; private fields, grants and vote identities are omitted. Types live in `src/server/contracts.ts`.

| Method/path | Input or behavior |
| --- | --- |
| `GET /api/status` | Services/model/transport, session-scoped generation allowance/quota explanation, and `twitch.chatRepliesAuthorized`. Configuration is not a live provider health probe. |
| `POST /api/shows` | `{mode:'practice' \| 'twitch'}` creates a studio and signed host cookie. Initial creation requires same origin. |
| `GET /api/shows` | Host-scoped summaries, latest forty indexed shows plus current show. |
| `POST /api/shows/:id/resume` | Resumes an owned studio by updating the current-show cookie; the host identity persists. |
| `GET /api/shows/current` | Private current studio; 401 before creation. |
| `GET /api/shows/:id` | Always sanitized public state, including when a host cookie is present. No source, credentials, checkpoints, private ancestry, or voter identifiers. |
| `POST /api/shows/:id/proposals` | Practice only: `{text,author?}`. Genuine Twitch ideas enter through `!forge`. |
| `POST /api/shows/:id/votes` | Practice only: `{proposalId}`. One replaceable endorsement/account/round. A new round clears tally and voter data. |
| `POST /api/shows/:id/practice/sample` | Practice or Twitch: `{sample?:'shadow' \| 'step',mode?:'append' \| 'replace'}`. Reverify a labeled real prior Codex artifact; no model call. |
| `POST /api/shows/:id/generate` | `{proposalId,revision?,priorCandidateId?,mode?:'append' \| 'replace'}`. Defaults to replace, preserves original credit on revisions. Returns 202 `{show,job}`; requires independently OAuth-authenticated Twitch identity and shared daily reservation. |
| `GET /api/shows/:id/generations/:jobId` | Private actual stage, attempts, bounded SDK phases/thread evidence and diagnostics. No percentage is fabricated. |
| `POST /api/shows/:id/generations/:jobId/cancel` | Durable cancellation and Sandbox stop. Late output cannot publish. |
| `POST /api/shows/:id/generations/:jobId/adapt` | `{text,expectedRevision,expectedJobUpdatedAt}` saves one host-reviewed alternative to a failed current-engine job. A model suggestion is optional. The distinct proposal preserves original credit and explicit wording provenance; a separate generate request is required. No model call occurs here. |
| `POST /api/shows/:id/candidates/:id/approve` | `{sourceHash,programHash,compositionHash,contextHash,artifactHash,previewCheckpoint}`. Requires the complete current combination and its fully validated preview. |
| `POST /api/shows/:id/candidates/:id/reject` | `{reason?}`. Retains immutable evidence; rejects approval/activation and reopens intake. Reasons remain private. |
| `POST /api/shows/:id/lease` | `{clientId,takeover?:boolean}`. Acquire/renew ninety seconds. Explicit same-host takeover increments fencing epoch. |
| `POST /api/shows/:id/lease/release` | `{clientId,epoch}`. Conditional release cannot release a newer owner. |
| `POST /api/shows/:id/checkpoint` | `{clientId,epoch,checkpoint}`. Strict full save and exact active runtime identity validation. |
| `POST /api/shows/:id/activate` | `{candidateId,sourceHash,programHash,compositionHash,contextHash,artifactHash,clientId,epoch,checkpoint}`. Exact approved current engine/ordered stack/context only; trusted engine preflights then stores new checkpoint/revision. |
| `POST /api/shows/:id/rollback` | `{clientId,epoch,expectedRevision?,faultedArtifactHash?,runtimeFaultReason?}`. Runtime faults require revision, exact current combination artifact hash, and bounded reason together. The legacy `faultedSourceHash` alias carries the runtime artifact identity. Restores prior stack plus checkpoint; later progress resets. |
| `POST /api/shows/:id/upgrade` | `{clientId,epoch,expectedRevision,targetEngineVersion}`. Explicitly archives an earlier engine's opaque checkpoint/stack then starts current engine opening world. No inherited approvals or silent deserialization. |
| `GET /api/library` | Private `{entries:[metadata]}`, exact-source source text omitted. Metadata includes name/description/credit/origin/hashes/engine versions/generation provenance and private ancestry. |
| `GET /api/library/:entryId` | Private `{entry:metadata+source}` only within owned browser-host or validated Twitch-account library scope. |
| `POST /api/shows/:id/library/save` | `{candidateId}` saves an approved immutable leaf source; returns `{show,entry}`. No model call. |
| `POST /api/shows/:id/library/import` | `{entryId,mode?:'append' \| 'replace'}` reparses and independently reverifies original source and current combination. Requires fresh preview/approval. |
| `POST /api/shows/:id/settings` | `{blockedTerms?:string[],chatRepliesEnabled?:boolean}`. Forty normalized terms, 2–60 characters each. Enabling replies requires independent write-scoped channel OAuth; default off. |
| `POST /api/shows/:id/round` | `{votingOpen:boolean}` closes/opens intake without changing connection health. |
| `POST /api/shows/:id/proposals/:id/moderate` | `{status:'hidden' \| 'rejected' \| 'open',reason?}`. Host control; private reason. Hidden rows omitted publicly; rejected rows have neutral status. |
| `GET /api/auth/twitch/login?showId=...` | Expiring single-use state, owned practice or Twitch show. Optional `&writeChat=1` explicitly requests write permission. EventSub remains Twitch-only. |
| `GET /api/auth/twitch/callback` | Server exchange, app/identity/requested-scope validation, encrypted grant. Friendly redirect without code/token in the URL. |
| `POST /api/shows/:id/twitch/session` | `{sessionId,reconnect?:boolean}` from genuine welcome. Creates authorized subscription; planned migration inherits it. |
| `POST /api/shows/:id/twitch/events` | Actual `channel.chat.message` envelope; matching subscription/channel, five-minute age bound. `!hide P#` / `!reject P#` require a moderator/broadcaster badge. |
| `POST /api/shows/:id/twitch/health` | `{status:'connected' \| 'gap' \| 'revoked' \| 'disconnected'}`. Freshness cannot restore invalid OAuth or reopen a deliberately closed round. |

Reviewed alternatives require normalized 8–280-character text, the show revision and the exact failed job's `updatedAt`. A first acceptance requires the current engine, open intake, an available original proposal, no active generation, and matching review tokens. Hidden/rejected originals reject. This proposal-only edit uses the host session and same-origin checks; it neither takes the game lease nor spends a generation allowance. Preview/activation retain their separate exact-hash and authority checks.

The host may accept an unchanged model suggestion, edit it, or write an alternative when the model returned none. The server derives `adaptationSource` as `model-suggested`, `host-edited` or `host-written`; clients cannot assign it. Original text, contributor, failed job, model message and model suggestion remain intact. Only the new accepted proposal goes onto the public board. Local drafts never leave the host composer before submission. Public HTTP/projector credit carries only ancestry kind, original author and the accepted provenance enum; private failure text and original/job lineage stay out of those projections. Host evidence exports and library metadata retain the private ancestry, and library imports retain the safe provenance label while requiring new verification/approval.

Adaptation request keys bind operation, failed-job identity, normalized text and both review tokens atomically. An exact completed retry returns the same result after unrelated state changes. Each failed job keeps one immutable accepted alternative beyond ordinary receipt rotation: a fresh key with the same text recovers it, while different text returns `409 adaptation_conflict`. Rebinding an existing key returns `409 idempotency_conflict`. Invalid text/tokens return `400`; stale first acceptance returns `409 stale_revision` or `409 stale_job`. Unknown client network outcomes retry the same key and payload. After a definite stale rejection the draft remains local for renewed review. A separate `/generate` remains billable, authorized and quota-bound; creating an alternative cannot launch it implicitly.

Connected Twitch state expires in host/public responses when its last genuine subscription/event/health heartbeat is more than 70 seconds old or the host authority lease is missing/expired. The connector posts health at most every 25 seconds while genuinely receiving welcome/keepalive/events. A heartbeat updates transport freshness and never opens an intentionally closed round. Revoked or unvalidated OAuth cannot be restored by a transport heartbeat.

The game revision changes only on activation, rollback, or an explicit engine upgrade. Lease renewal, routine snapshots, proposals and job progress cannot invalidate an otherwise current candidate. Checkpoints have strict schema validation, fixed entity identities, bounded finite geometry, protected ember/progress fields, exact active source/program identity, and trusted-engine restoration checks.

## Composition, engine upgrades and library

New shows declare `last-light/2.0.0`. A source remains an immutable `RuleProgram.version=1` literal with at most eight clauses. `mode` defaults to replace. Append retains at most three ordered original candidates; trusted composition namespacing and the actual combined simulation verify the whole result. The server never approves a combination solely because its individual members passed.

A candidate's `composition` envelope contains engine/mode/base revision, ordered `baseMembers` and `members` (`candidateId,sourceHash,programHash`), `contextHash`, `compositionHash`, combined `program` and `programHash`, runtime `artifactHash`, and combined `verification`. Its top-level source/program/hash still identify only the original leaf. Preview and activation use the envelope program/artifact hash. Approval binds both sets of identities and the exact preview. Ordered candidate IDs and world context are hash-bound so reimporting the same source cannot reuse an old runtime fault identity. Activation preserves prior IDs and checkpoint; a current fault restores both. Changing stack/order/engine/source or approval invalidates apply.

An earlier-engine show is read as history with `engineUpgradeRequired`; generation/import/approval/apply and checkpoint deserialization are blocked. Upgrade requires current revision and authority epoch, keeps up to three private opaque engine archives and all immutable source/job history, and resets to the new opening world. Earlier approved source can be saved to the private library and imported for current-engine verification and fresh approval. Historical evidence is never rewritten to imply it ran on the new engine.

Library entries are exact original source with original author, text, hashes, generation model/thread/time and ancestry. Each host has a private library scope; a validated independently owned Twitch account also opens its account scope across shows/browser sessions. Revoked account grants cannot expose that account library. Lists omit source, detail/import enforce ownership. Each scope holds at most thirty entries, source at most 32 KB and complete entry at most 60 KB (under 1.8 MB/scope). No unapproved source or another owner's entry can be saved/read/imported. An import consumes no AI quota, gets fresh combination/runtime identity, and needs a new preview and approval.

Public projection includes safe show/job timestamps, approved active-law names/descriptions/credit/hashes and neutral operational events. It omits raw model/SDK diagnostics, moderation reasons, suggestions, source, full ancestry text and private ancestry IDs. A descendant can expose ancestry kind and original author only, so hiding an ancestor does not leak its text through lineage metadata.

## Twitch authorization and transport

The host browser opens `wss://eventsub.wss.twitch.tv/ws`. It posts the welcome session ID; the server validates the user's token and creates the `channel.chat.message` subscription with `user:read:chat`. Tokens never enter browser JavaScript. The browser forwards bounded command envelopes and reports reconnect gaps. Replies default off. A separate `writeChat=1` OAuth reconsent requests `user:write:chat`; reauthorization always resets the show toggle to off. An explicit host toggle enables restrained fixed-template replies through the server only. Read-only or copied bootstrap grants cannot send replies.

This is a trusted-host connector: Twitch WebSocket messages forwarded by the authorized host browser are not independently signed server webhook evidence. A malicious authorized host can fabricate envelopes. Public visitors cannot post events to another host's show. Demonstration evidence should include the original Twitch chat alongside the resulting ledger rather than claim server-side cryptographic proof of a viewer event.

The copied local bootstrap token is usable only in development, never on a Vercel deployment. The server never automatically refreshes that shared grant; the setup owner remains its sole refresh owner. New OAuth grants created through this application are encrypted, explicitly marked with authorization-code provenance and client ID, and renewed automatically under a per-grant database lease. Rotated access/refresh tokens are persisted encrypted as pending validation before a follow-up request; identity, application, and the exact original scopes must pass before use. Routine same-scope renewal does not require another prompt. A revoked/invalid refresh grant ends the Twitch session and requires reauthorization. Older unmarked records remain validation-only until one reauthorization. Production authorization is independent from copied development credentials.

The active OAuth-backed studio polling path maintains token validation at least hourly, and subscription/model authorization validates before use. Renewal occurs when less than one minute of usable lifetime remains or validation reports 401. A 60-second fenced database lease serializes renewals across processes; a contender waits up to 15 seconds and then reports retryable busy. Transient provider failures pause intake and back off for 30 seconds; pending rotated tokens survive a crash and resume validation without discarding the new refresh token. No always-on worker or disconnected-browser Twitch session is claimed. [Twitch token renewal](https://dev.twitch.tv/docs/authentication/refresh-tokens/).

A Twitch connection request key binds the operation, exact welcome session ID and normalized reconnect flag. One durable attempt owner may invoke the connector; completed identical replays return state without reconnecting, while pending/unknown outcomes require a fresh socket and request key. Mismatched reuse returns 409. New attempts share the existing eight-per-minute limit. Up to 128 connection receipts/show are pinned against ordinary sixty-command receipt rotation; a full history requires another studio rather than dropping deduplication evidence. No automatic retry is made under a consumed key; the existing bounded 401 refresh inside one connector invocation remains unchanged.

A planned EventSub reconnect preserves subscriptions. An unexpected disconnect opens a connection gap and requires resubscription. Twitch does not replay missed messages; the UI must not invent missing votes. Keepalive and reconnect handling belongs to the browser connector. [Twitch WebSocket protocol](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [chat authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage), [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [OAuth flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow).

Chat replies require both explicit write reconsent and the per-show toggle. Templates acknowledge an accepted idea ID, selected/forging status, an approved live law's author, or a neutral refusal/adaptation; proposal/model text and moderator reasons never enter outgoing messages. Delivery reserves a durable show-event receipt before any POST, then atomically reserves a sender-wide budget shared across shows: at most four attempts/minute and at least ten seconds apart. The ledger retains at most four current-minute timestamps; each show retains at most six hundred delivery receipts without truncating dedup history. When full, further replies stop. Failed/rate-suppressed replies are best effort; unknown network outcomes are never retried, so this is at-most-one POST attempt, not external exactly-once delivery. Toggle/revocation is rechecked before sending. `is_sent`, bounded `drop_reason.code`, HTTP 429, `Retry-After` and `Ratelimit-Reset` are inspected; raw provider text stays private. Default-off and fixed templates prevent an unsolicited mass bot. Tests use mocked sends; this review wave has not sent a real chat message.

User-token messages also appear in linked Shared Chat sessions; Twitch forbids setting `for_source_only` with these tokens. [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message), [sender-wide chat limits](https://dev.twitch.tv/docs/chat/#twitch-chat-rate-limits), [EventSub badge fields](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#channel-chat-message-event).

## Generation boundary and evidence

The coordinator starts a genuine short-lived Vercel Sandbox microVM and installs pinned official `@openai/codex-sdk@0.166.0`. No application repository, `.env`, Twitch/DB/Git credentials or Vercel control-plane credentials are copied into the guest. Only the trusted SDK process receives the model API key. The guest has a fresh Codex home; shell and multi-agent/plugin capabilities are disabled, approvals are denied, and unexpected tool events abort the turn. It asks for source text only. Future rule names/descriptions use plain performer language and timing in seconds while retaining exact simulation thresholds in the immutable source; previously generated artifacts are unchanged. A trusted wrapper writes `rule.ts`, thread ID and usage from actual SDK events.

The network firewall permits only npm during dependency preparation, only OpenAI during generation, then denies all egress before reading the artifact. No candidate JavaScript executes anywhere. The application parses a restricted TypeScript literal into a bounded `RuleProgram` data tree; the separate trusted verifier simulates that tree through the capability-limited engine. Candidate-provided tests cannot replace this verifier. Every final guest artifact read, including failure/thread metadata, follows a successful deny-all firewall update. Provider failures retain bounded specific diagnostics only for the owning host; the server independently redacts known credentials, authorization fields, key patterns and tokens. Public job/event projections use controlled generic failure text. API keys are not available to candidate logic. This is bounded rule generation, not safe execution of arbitrary generated programs.

Source hashes use SHA-256 of exact UTF-8 bytes; program and preview hashes use SHA-256 of canonical sorted-key JSON, stable across Postgres JSONB key reordering. Approval and activation recompile the exact source and independently check the stored program hash and the original approved identities. The trusted engine preflights activation against a copy of the acknowledged checkpoint. Cancellation wins over late outputs. A six-minute abandoned coordinator threshold is repaired durably on the next show read, so a killed serverless invocation cannot leave a show permanently forging; sandbox lifetime independently stops execution.

The authenticated generation request resolves the current OIDC token with the official `@vercel/oidc` helper before scheduling `after()`. Its team/project/token are held only in that invocation’s closure and passed explicitly to the Sandbox SDK; they are never persisted, logged, placed in the guest, or written to global environment variables. This keeps authorization available even if request context is no longer accessible in the background callback. Each request resolves its own current token; no static expiring deployment token is uploaded. [Vercel runtime OIDC](https://vercel.com/docs/oidc).

Next.js `after()` keeps queued generation running after the HTTP response, within a 300-second function budget. This is not a durable resumable job engine: after platform failure the interrupted job becomes a visible failure and must be retried. It never pretends to resume an incomplete SDK turn. [Codex SDK](https://developers.openai.com/codex/sdk/), [Vercel Sandbox SDK](https://vercel.com/docs/sandbox/sdk-reference).

## Actual limits

- 60 visible proposals and 300 total proposal history entries/show, 8–280 normalized characters; reject links, code blocks and credential-extraction instructions. Host selection remains the final moderation/capability gate; this is not a comprehensive abuse classifier.
- Three proposals/account/minute, 60 proposals/channel/minute, 15 vote changes/account/minute. One endorsement/account/round; a later vote replaces it. Current dedup window retains 4,000 recent message identifiers; notification age is bounded to five minutes.
- 12 studio creations/IP/hour; fresh generation always requires an independently OAuth-authenticated host. Public allowances default to 3 reservations per verified Twitch account and 40 globally per UTC day, shared across shows and host cookies. Fully exempt hosts consume neither public pool nor shared quota receipts; hosts with a configured host allowance are counted against that allowance only. Six requests/show/hour, one active job/show, 30 jobs/show, and at most two repairs remain separate abuse/resource limits. No application dollar/token cap is claimed; provider project-key spend settings remain owner-managed.
- User/global quota debits commit together in one CAS ledger. A deterministic request/job identity makes retries idempotent across processes and midnight, including a crash between reservation and show persistence. Reservations count attempted runs, including failed or cancelled runs; ambiguous server failures conservatively retain the one reservation, recovered by retrying the same request key. The ledger retains current/previous UTC-day public receipts and counters, drops redundant fields, and never adds exempt receipts. Public daily configuration is bounded to 2000 so the worst-case two-day state fits the existing 2 MB document budget. Persisted show jobs retain request deduplication after shared receipts age out.
- 260-second sandbox lifetime; 60-second SDK install limit; 65-second SDK turn limit and 70-second command kill limit. Job/function timeout is a failure, not a success.
- Two-megabyte show JSON budget, 256-kilobyte checkpoint budget, 384-kilobyte HTTP body budget; 150 retained operational events, 60 ordinary idempotency receipts and up to 128 pinned Twitch connection receipts/show.
- The strict engine contract currently bounds literal source to 24,000 characters and IR depth/nodes; see the tracked game runtime documentation for actual capabilities and simulation budgets.

Shows are bounded but retained until deployment/database owner cleanup; automatic retention/deletion/export is not implemented. The earlier planning retention targets are not product claims. Quota receipts have the bounded two-day retention described above. Twitch grants remain encrypted; public board output excludes them and private actor hashes.

## Verification and observed generation

Run `npm test`. The backend suite covers cross-process serialization, idempotency, show authorization, one-account voting, lease fencing, source/program/approval tampering, strict checkpoint failures, activation/rollback, cancelled jobs, stale coordinator recovery, encrypted grants, OAuth state replay, chat deduplication and production generation authorization. Provider/network behavior is mocked in the deterministic integration tests; the separate generation evidence records actual model calls and Sandbox execution.

See `docs/evidence/generation/` for sanitized real-run evidence and its actual sample count. A reused practice sample is labeled reused and retains the original SDK thread/model/time. Neither a stored fixture nor one success establishes broad generation reliability or live Twitch operation.
