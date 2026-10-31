# LIVEFORGE review implementation — 1 November 2026

Work branch: `review/liveforge-improvements`, starting from clean `main` at `5832d42`. This ledger tracks the work order in the parent `projects_review.md`; it does not treat implementation or mocked tests as real-world acceptance.

The root coordinates browser/provider evaluation and release. The implementation lead owns integration and product UI, with separate game/runtime and backend workers. No PORTAL STAGE source is changed in this branch. Production deployment, merge and push remain release-owner actions.

## Baseline

Before changes, Node 22.22.3 / npm 10.9.8 ran:

- `npm run typecheck`: passed.
- `npm test`: 162 tests passed across 14 files.
- `npm run format:check`: failed only on `docs/evidence/generation/production-twitch-17d70e95da.json`, reproducing L4.
- `npm run build`: passed in an isolated source/dependency copy; all 13 static page-generation tasks completed. No local credentials were copied and the active dev output was untouched.

The [ten original evaluation proposals](evidence/review-2026-11-01/evaluation-proposals.json) were declared by the root before engine expansion. That file is immutable. All ten real runs, including failures, will be retained; an adaptation or reused law cannot count as success for an original proposal.

## Item ledger

| Item                                                           | Implementation checkpoint                                   | Deterministic verification                                                                            | Browser/provider/manual acceptance                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| L1 Public authenticated quotas + reused fallback               | P0 implemented                                              | Cross-show, concurrent, UTC reset, high-cap retention and anonymous-denial tests passed               | Fresh non-allowlisted OAuth account and second-account chat require root verification                           |
| L2 Failure detail + always-visible fallback                    | P0 implemented                                              | Failure-artifact sanitization, SDK-error propagation and public-redaction tests passed                | Root will force a visible failure and load fallback                                                             |
| L3 Runtime fault → durable rollback; visible checkpoint errors | P0 implemented                                              | Stale-fault fencing, revision-race retry, rollback and subsequent checkpoint tests passed             | Root will verify recovery notice and resume                                                                     |
| L4 Evidence formatting + manifest                              | Implemented in 8aa33ef                                      | Semantic JSON identity and formatter check passed                                                     | No provider/browser dependency                                                                                  |
| L5 Background authority                                        | P0 implemented: 20-second worker heartbeat, 90-second lease | Worker heartbeat while paused, fault context and fenced lease tests passed                            | Root will run a frozen P0 snapshot for 15 minutes hidden/covered; not yet measured                              |
| L6 Per-round vote reset                                        | P0 implemented                                              | Carried-proposal, activation and replacement-vote regressions passed                                  | Root checks visible counts across activation                                                                    |
| L7 Independent transparent OBS overlay                         | Planned after P0                                            | Planned public projection/privacy tests                                                               | Root checks separate browser context; actual OBS capture separately identified                                  |
| L8 Expanded bounded language + 2–3-law composition             | Planned after P0                                            | Events, modifiers, spawning, arithmetic, composition, adversarial budgets, rollback and serialization | Frozen-engine evaluation of all ten original ideas; at least eight original successes targeted, not yet claimed |
| L9 Capability hints + explicit adaptations                     | Planned after language contracts                            | Planned explicit consent/ancestry tests                                                               | Real unsupported proposal → host-approved adaptation                                                            |
| L10 Optional restrained server chat replies                    | Planned                                                     | Planned message builder, durable dedupe, toggle and rate-limit tests                                  | Root owns re-consent and public message authorization; no worker sends chat                                     |
| L11 Real progress + generation latency                         | Planned, dependency-only Sandbox snapshot                   | Planned genuine event/progress and snapshot-cleanliness tests                                         | Root compares at least five real runs; no speed result yet                                                      |
| L12 Host/moderator moderation + blocked terms                  | Planned                                                     | Planned badge authorization, privacy and blocked-term tests                                           | Root verifies moderator behavior when account available                                                         |
| L13 Honest description/reuse credit                            | Planned                                                     | Targeted presentation review                                                                          | Root checks reused source and credit labels                                                                     |
| L14 Keep unreviewed model text private                         | P0 public failure/projection guard implemented              | Public-output adversarial text test passed                                                            | Root checks board/overlay while failure awaits review                                                           |
| L15 Canonical origin                                           | Planned                                                     | Planned alias/canonical redirect cases                                                                | Root checks deployed alias behavior                                                                             |
| L16 Persistent host law library                                | Planned after composition contracts                         | Planned ownership, hashes, import reverification and credit tests                                     | Root saves and imports across shows                                                                             |
| L17 Skimmable README + actual capabilities/config              | Final integration                                           | Link/config/claim review against implemented code and evidence                                        | Signed-out judge path on final deployment                                                                       |

## Safety and release gates

Generated source remains literal-only data, never executed JavaScript. Every retained law and combination requires exact source/program approval, independent bounds/effect verification, durable fencing and rollback. Public quotas are keyed to verified Twitch identity and stored durably; visitors without Twitch authorization cannot launch a provider job. Sandbox snapshots, if used, contain only pinned runtime dependencies and are created before any key, proposal, Codex home/session or output exists.

Each integrated checkpoint records its commit, actual typecheck/test/format/build results, changed routes and outstanding manual acceptance. The root owns evidence under `docs/evidence/review-2026-11-01/`; historical evidence is preserved rather than rewritten to claim newer checks.

## P0 integrated checkpoint

The checkpoint titled **“Make public generation and live recovery resilient”** implements L1–L6 and the failure-text privacy portion of L14. `npm run typecheck`, all **196 tests in 19 files**, and an isolated production build passed. `npm run format:check` and `git diff --check` also passed after the last documentation/test formatting pass. The build copied no credentials and left the active dev server output untouched.

Changed behavior is exposed through `/api/status`, owned `/generate`, `/practice/sample`, `/rollback`, `/lease`, `/round` and activation commands, and the owned Twitch OAuth login path. Practice shows can authorize an account without losing their proposal or becoming a live-chat show. Daily quotas default to three per verified Twitch user and forty shared public runs; exempt hosts do not inflate the public ledger. Limits and receipt retention remain bounded under the existing 2 MB document guard.

The studio now offers a reused artifact in every mode and phase, displays quota and private failure detail, renews authority from a worker independent of simulation pause, and visibly pauses on lost authority. Checkpoint failures remain visible until a later acknowledgement. A runtime fault captures the exact failed artifact before local rollback, saves retirement through the server, and restores the authoritative returned checkpoint. A bounded conflict retry is permitted only for the same candidate, artifact and epoch; a newer law is preserved. Retries after a lost response reuse a durable idempotency key.

Browser/provider acceptance remains pending at this checkpoint: the root will use a frozen checkout for a genuine second-account OAuth/quota test and a fifteen-minute hidden/covered studio test. Neither the heartbeat unit test nor the mocked OAuth/API suite substitutes for those measurements. Browser suspension beyond the lease lifetime still requires explicit recovery from the last acknowledged checkpoint.
