# Release verification

## Current release: round 3 verifier and UI — 1 November 2026

Source `c0e5acdadc40d2d0d9eed7239b116e7a5ac032c5` passed typecheck, **432 tests across 39 files**, full formatting and an optimized build with **15 static page-generation tasks** (build ID `AxFVpMcmL_hL5IbXFDbJH`). It is pushed to `main`. Deployment `dpl_DGkRR7W79dsG3A3kf2umceq9Rram` is **Ready**, with the canonical alias and signed-out judge path verified after deployment. The canonical target remains [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app).

The verifier now distinguishes safe ceiling contact from sustained runaway, measures dropped-ember and late-onset physics, and distinguishes clause-local cap skips from global budget denial. Gravity 0.999 still rejects, resource limits are unchanged, and canonical security serialization and public filtering remain intact. The [offline replay](evidence/review-round3-2026-11-01/verifier-replay.md) passes **20/20 stored singles and 8/8 review stacks** across both frozen provider sets. Four stack runs compose original provider sources and four are explicitly synthetic acceptance runs. No fresh provider calls, revisions or source substitutions were made; verifier acceptance is not a new intent-fidelity result.

The UI update simplifies Studio, preview, Outputs, library, moderation and public pages; keeps technical data in Evidence or collapsed disclosures; preserves Practice/Sample disclosure and actual author credit; and adds a footer-only How it's built page. Final CSS normalizes mobile controls and dialog typography to the Studio scale and removes the decorative overlay preview label while preserving its transparency control.

The [local browser rehearsal](evidence/review-round3-2026-11-01/local-browser.md) on `313d74f` passed sample preview → approval → activation and observed bridge traversal. Retained audits found no overflow at 390, 1280, 1440 and 1920 px. Typography findings were corrected and verified on production, including the final Archive and Community CSS followup. The [before/after UI index](evidence/ui-pass-2026-11-01/README.md) and [production browser record](evidence/review-round3-2026-11-01/production-browser.md) record the completed production checks. Actual OBS capture, current-release OS-minimized/OBS-covered operation and non-allowlisted quota exhaustion remain unverified.

## Earlier release: round 2 hardening — 1 November 2026

Source `3a74ae32747ec09ba54670cf44363fca32fbac57` passed typecheck, **405 tests across 36 files**, full formatting and an optimized **14-page build**, build ID `r0KgJgn4YzUJ9Wn1o8oVs`. This candidate adds repeated-fault retirement, soft runtime limits with stricter gameplay verification, bounded reply receipts, checkpoint grants, generation refunds, moderator support, public attribution and recorded generation milestones. The hash serialization remains compatible with saved approvals.

The baseline was independently gated before edits: 359 tests across 34 files, typecheck, formatting and a 14-page build. The stricter ten-case rerun followed the [frozen evaluation protocol](evidence/review-round2-2026-11-01/evaluation-protocol.json): all ten original proposals passed on their first real Codex attempt, with eight checks each; all unchanged independent intent probes passed. The [local browser rehearsal](evidence/review-round2-2026-11-01/local-browser.md) separately verified reused-law preview, approval, activation, rollback, public moderation and a 1920 × 1080 overlay. Production deployment `dpl_HV7eBQe6qngfzCBUxtYK8MdWsqLC` is Ready at https://liveforge-iota.vercel.app, with Git source `e41209c27f3085b8d6d1c2b68705f26e5860d6da` (documentation-only descendants of the frozen runtime). [Production acceptance](evidence/review-round2-2026-11-01/production-browser.md) records the real moderator hide and role removal, replies OFF/ON, a fresh second-account proposal → preview → exact approval → activation, one quota debit, and independent held/released-gravity measurements. The repository is public. Actual OBS capture and a true OS-minimized/OBS-covered run remain unverified.

## Earlier release: Twitch moderation relay — 1 November 2026

Canonical app: https://liveforge-iota.vercel.app. Deployed/runtime source `bbf8ddc7c46784b3d67a671d2ba07efc8e12c793`, deployment `dpl_9b5xhLMTbP3WN7dP6tyxqDf7ZLGd`. Typecheck, **359 tests across 34 files**, changed-file formatting and diff checks passed. The release owner’s optimized build completed 14 pages (`dzegbGH3FPClVG8kNfmhv`). The browser now forwards bounded moderation commands with their original badges; the generation prompt and game/compiler are unchanged.

[Second-account production acceptance](evidence/review-2026-11-01/second-account-production.md) records independent non-exempt OAuth, a distinct viewer’s real proposal, fresh generation → preview → exact approval → activation, one user/shared quota debit, three observed chat replies, viewer denial and broadcaster hide/host restore. One operator used both accounts. The original relay failure and a stale-bundle retry remain recorded. Replies are off, intake is closed and the world is paused. Actual moderator-badge behavior, production quota exhaustion/reset, forced duplicate replay and OBS capture remain separate limits. The earlier releases below retain their historical counts and evidence.

## Explicit alternatives release — 1 November 2026

Canonical app: https://liveforge-iota.vercel.app. Deployment `dpl_8MZL2kezSB8rxFMhCTGnnuRsAjYk`; deployed source `5fe10fbcb441180bdefc719fb9cd83b4bdec0f90`; runtime source `e02c25efb838a925b92002dcc940e438c76502fc`. Typecheck, **357 tests in 34 files**, full formatting, diff checks and an isolated optimized build passed. Vercel’s remote build completed 14 static tasks. No generation prompt or simulation/compiler changes were made in this follow-up.

The [adaptation acceptance record](evidence/review-2026-11-01/adaptation-followup.md) preserves the original real refusal, the explicitly synthetic local UI checks, and a separate successful real production alternative. Its exact source was previewed, approved, activated, exported, and independently checked for held gravity, release restoration and provenance. Anonymous access controls and the public credit/privacy boundary passed. Renewed second-account OAuth/quota, optional chat replies/moderation and actual OBS broadcast remain unverified.

The [final signed-out Chrome walkthrough](evidence/review-2026-11-01/final-signed-out-practice.md) passed on this same deployment around 21:53–21:54 UTC on 31 October: landing → new practice show → labeled reused law → preview → exact approval → checkpoint activation → restore. Its screenshot retains the active law and reused credit. This browser check made no fresh model call or public chat post; it does not claim measured traversal or level completion. The source and release gates above remain unchanged. The sections below retain historical checkpoints.

## Engine 2 deployed review release — 1 November 2026

Canonical app: https://liveforge-iota.vercel.app. Deployment: `dpl_GhnWJQHEWLHBgXjw4S6yBWfggQfa`; deployed source: `2a7e01ac223270620bb29caead990ec0b8b87847`. Runtime source `8a4683f` passed 287 tests in 32 files, typecheck, format, diff and isolated build; the final descendant adds only an evidence record. Vercel's remote build also passed 14 static tasks.

[Production review evidence](evidence/review-2026-11-01/production-browser.md) records saved-world upgrade, vote reset, real Twitch reconnect, fresh Codex generation, playable preview, exact approval and activation, exported source/artifact verification and canonical-origin checks. [Independent review evidence](evidence/review-2026-11-01/README.md) retains all ten original behavior results, composition/recovery tests, background observations and all five latency pairs. Second-account OAuth/quota, optional replies/moderator/adaptation and OBS acceptance remain explicitly separate and pending; the earlier release record below remains historical.

## Engine 2 review branch — 1 November 2026

The final review candidate passed typecheck, **287 tests in 32 files**, formatting, diff checks and an isolated optimized production build with **14 static page-generation tasks** on Node 22.22.3. Its simulation/compiler/worker files remain the evaluated `5ac7482` contract, with later compatibility, snapshot, idempotency and presentation corrections. The [review ledger](review-progress.md) records those checkpoints and remaining acceptance.

Root evidence commit `074ab32` retains ten original real generations with independent intent/replay/rollback passes and separate browser observations, product two/three-law activation and rollback, legacy upgrade and synthetic fault recovery. Five corrected cold/snapshot pairs on `cd7ce27` measured 39.000 s versus 30.849 s medians including first preparation; [the audit](evidence/review-2026-11-01/latency-analysis.md) states the limits. These review changes are **not labeled deployed** until the release owner verifies and promotes them. New-account OAuth/quota, optional real chat replies, moderator commands, canonical production behavior and actual OBS capture remain separate acceptance tasks.

## Released application — 31 October 2026

LIVEFORGE is deployed at [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app). Local and production browser verification passed; the remaining evidence limits are stated below.

## Historical 31 October checks (superseded by the current release above)

| Check                  | Observed result                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Environment            | Node 22.22.3, npm 10.9.8                                                                                                           |
| Framework              | Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2                                                                                     |
| `npm run typecheck`    | Passed                                                                                                                             |
| `npm test`             | 162 tests passed across 14 files                                                                                                   |
| `npm run build`        | Passed with Turbopack; all 13 static page-generation tasks completed                                                               |
| `npm run format:check` | Review baseline failed on the production Twitch export; formatting was corrected and rechecked on 1 November 2026                  |
| `npm audit --omit=dev` | Zero reported vulnerabilities                                                                                                      |
| `git diff --check`     | Passed                                                                                                                             |
| Credential comparison  | No known local secret values found in non-ignored source/evidence files; credentials, private plans and local state remain ignored |

The final production build ran against an isolated copy of the exact application source and installed dependencies, with relative dependency symlinks preserved. It copied no `.env` files and did not modify the active development server’s output. An earlier copy attempt resolved executable symlinks into the original dependency tree and failed React prerendering; correcting the verification harness resolved that failure without an application workaround.

The setup script was also exercised in an isolated temporary directory: it generated missing local configuration, preserved existing values on a second run, and retained private file permissions. It did not replace the project’s real provider configuration.

## Observed product journey

[Local browser evidence](evidence/browser/2026-10-31-local.md) records actual in-app-browser operation: a new host proposal, fresh Codex generation, playable isolated preview, approval of the exact artifact, activation, shadow-bridge traversal, the counterweight interaction, guardian and beacon completion, and rollback to the prior activation checkpoint. Screenshots come from that running game.

Follow-up checks verified same-tab reload recovery, honest reconnect state, successful Twitch reconnect, navigation without the prior ResizeObserver fault, dialog dismissal, and a mobile viewport whose document width equals its 390px viewport. The brief-key-tap correction has independent worker/input regression coverage and was subsequently verified in the production playthrough with instantaneous E taps at both the crane and guardian.

Real Twitch OAuth, EventSub, and public command ingress passed after explicit user authorization. The signed-in account posted one `!forge` proposal and one `!back P1` message in its own channel. The app received P1 with Twitch attribution and support 1. That exact proposal then completed fresh Codex generation, playable preview, source-specific approval, and checkpoint activation. See the production browser evidence below.

## Generation evidence and limits

[Generation evidence](evidence/generation/README.md) retains actual SDK thread IDs, exact source bytes/hashes, model usage, sandbox identity and timings. Four curated new proposals passed the trusted verifier on their first attempt. A material-behavior nuance was found in one accepted source and corrected through a real new revision; verifier acceptance and full intent fidelity are reported separately. A real request to extract secrets produced no candidate.

That historical engine-1 release supported six generic actions and one active law. Engine 2 now supports nine action types (physics, material, shadow projection, surfaces, platform spawning, prop spawning, impulses, cues and timers), with up to three laws checked together. The [current runtime contract](rule-runtime.md) is authoritative for supported limits. Generated TypeScript is parsed as bounded data rather than executed. Independent fixtures establish behavior, determinism and recovery for their tested cases; they do not prove arbitrary natural-language correctness or every possible level state.

No frame-rate benchmark, 30-proposal reliability result, human usability study or universal generation-latency guarantee is claimed. Generation coordination has a finite function/Sandbox lifetime and fails visibly after interruption; it is not a durable resumable worker service. The supported projector capture path is a same-browser window, with the studio kept open.

## Release-owner actions

Production deployment, browser verification and GitHub push are complete. Judge access to private source, OBS capture and video publication remain separate submission-preparation actions.

## Root production verification

Released at https://liveforge-iota.vercel.app using Vercel deployment `dpl_68Mt4gMityYr7PEeAok2VB8E7zX5`, with Node 22.x, Neon persistence and request-scoped Sandbox OIDC. Both the public reused-artifact playthrough and a fresh authorized Codex generation→preview→approval→activation passed in the in-app browser. Actual production Twitch OAuth and EventSub connection passed. See [production browser evidence](evidence/browser/2026-10-31-production.md).

The follow-up code commit `94d0ff5` passes 162 tests. Public Twitch command ingress subsequently passed, including a complete real-message-to-activation journey. OBS capture remains unverified.
