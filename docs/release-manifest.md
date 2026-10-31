# Release verification

## Current release: explicit alternatives — 1 November 2026

Canonical app: https://liveforge-iota.vercel.app. Deployment `dpl_8MZL2kezSB8rxFMhCTGnnuRsAjYk`; deployed source `5fe10fbcb441180bdefc719fb9cd83b4bdec0f90`; runtime source `e02c25efb838a925b92002dcc940e438c76502fc`. Typecheck, **357 tests in 34 files**, full formatting, diff checks and an isolated optimized build passed. Vercel’s remote build completed 14 static tasks. No generation prompt or simulation/compiler changes were made in this follow-up.

The [adaptation acceptance record](evidence/review-2026-11-01/adaptation-followup.md) preserves the original real refusal, the explicitly synthetic local UI checks, and a separate successful real production alternative. Its exact source was previewed, approved, activated, exported, and independently checked for held gravity, release restoration and provenance. Anonymous access controls and the public credit/privacy boundary passed. Renewed second-account OAuth/quota, optional chat replies/moderation and actual OBS broadcast remain unverified. The sections below retain historical checkpoints.

## Engine 2 deployed review release — 1 November 2026

Canonical app: https://liveforge-iota.vercel.app. Deployment: `dpl_GhnWJQHEWLHBgXjw4S6yBWfggQfa`; deployed source: `2a7e01ac223270620bb29caead990ec0b8b87847`. Runtime source `8a4683f` passed 287 tests in 32 files, typecheck, format, diff and isolated build; the final descendant adds only an evidence record. Vercel's remote build also passed 14 static tasks.

[Production review evidence](evidence/review-2026-11-01/production-browser.md) records saved-world upgrade, vote reset, real Twitch reconnect, fresh Codex generation, playable preview, exact approval and activation, exported source/artifact verification and canonical-origin checks. [Independent review evidence](evidence/review-2026-11-01/README.md) retains all ten original behavior results, composition/recovery tests, background observations and all five latency pairs. Second-account OAuth/quota, optional replies/moderator/adaptation and OBS acceptance remain explicitly separate and pending; the earlier release record below remains historical.

## Engine 2 review branch — 1 November 2026

The final review candidate passed typecheck, **287 tests in 32 files**, formatting, diff checks and an isolated optimized production build with **14 static page-generation tasks** on Node 22.22.3. Its simulation/compiler/worker files remain the evaluated `5ac7482` contract, with later compatibility, snapshot, idempotency and presentation corrections. The [review ledger](review-progress.md) records those checkpoints and remaining acceptance.

Root evidence commit `074ab32` retains ten original real generations with independent intent/replay/rollback passes and separate browser observations, product two/three-law activation and rollback, legacy upgrade and synthetic fault recovery. Five corrected cold/snapshot pairs on `cd7ce27` measured 39.000 s versus 30.849 s medians including first preparation; [the audit](evidence/review-2026-11-01/latency-analysis.md) states the limits. These review changes are **not labeled deployed** until the release owner verifies and promotes them. New-account OAuth/quota, optional real chat replies, moderator commands, canonical production behavior and actual OBS capture remain separate acceptance tasks.

## Released application — 31 October 2026

LIVEFORGE is deployed at [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app). Local and production browser verification passed; the remaining evidence limits are stated below.

## Reproducible checks

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

The runtime composes six generic actions through a restricted literal language. It does not execute arbitrary generated TypeScript. One experimental law is active at a time. Independent fixtures establish bounded observable behavior, determinism and recovery for those tests; they do not prove arbitrary natural-language correctness or every possible level state.

No frame-rate benchmark, 30-proposal reliability result, human usability study or universal generation-latency guarantee is claimed. Generation coordination has a finite function/Sandbox lifetime and fails visibly after interruption; it is not a durable resumable worker service. The supported projector capture path is a same-browser window, with the studio kept open.

## Release-owner actions

Production deployment, browser verification and GitHub push are complete. Judge access to private source, OBS capture and video publication remain separate submission-preparation actions.

## Root production verification

Released at https://liveforge-iota.vercel.app using Vercel deployment `dpl_68Mt4gMityYr7PEeAok2VB8E7zX5`, with Node 22.x, Neon persistence and request-scoped Sandbox OIDC. Both the public reused-artifact playthrough and a fresh authorized Codex generation→preview→approval→activation passed in the in-app browser. Actual production Twitch OAuth and EventSub connection passed. See [production browser evidence](evidence/browser/2026-10-31-production.md).

The follow-up code commit `94d0ff5` passes 162 tests. Public Twitch command ingress subsequently passed, including a complete real-message-to-activation journey. OBS capture remains unverified.
