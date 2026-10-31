# Release verification — 31 October 2026

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
