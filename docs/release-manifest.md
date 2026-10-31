# Release verification — 31 October 2026

The implementation is ready for the coordinating release owner’s production deployment and verification. The canonical target is [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app). This document does not claim that deployment has happened.

## Reproducible checks

| Check                  | Observed result                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Environment            | Node 22.22.3, npm 10.9.8                                                                                                           |
| Framework              | Next.js 16.4.3, React 19.3.1, TypeScript 7.0.2                                                                                     |
| `npm run typecheck`    | Passed                                                                                                                             |
| `npm test`             | 162 tests passed across 14 files                                                                                                   |
| `npm run build`        | Passed with Turbopack; all 13 static page-generation tasks completed                                                               |
| `npm run format:check` | Passed with the repository’s explicit ignore rules                                                                                 |
| `npm audit --omit=dev` | Zero reported vulnerabilities                                                                                                      |
| `git diff --check`     | Passed                                                                                                                             |
| Credential comparison  | No known local secret values found in non-ignored source/evidence files; credentials, private plans and local state remain ignored |

The final production build ran against an isolated copy of the exact application source and installed dependencies, with relative dependency symlinks preserved. It copied no `.env` files and did not modify the active development server’s output. An earlier copy attempt resolved executable symlinks into the original dependency tree and failed React prerendering; correcting the verification harness resolved that failure without an application workaround.

The setup script was also exercised in an isolated temporary directory: it generated missing local configuration, preserved existing values on a second run, and retained private file permissions. It did not replace the project’s real provider configuration.

## Observed product journey

[Local browser evidence](evidence/browser/2026-10-31-local.md) records actual in-app-browser operation: a new host proposal, fresh Codex generation, playable isolated preview, approval of the exact artifact, activation, shadow-bridge traversal, the counterweight interaction, guardian and beacon completion, and rollback to the prior activation checkpoint. Screenshots come from that running game.

Follow-up checks verified same-tab reload recovery, honest reconnect state, successful Twitch reconnect, navigation without the prior ResizeObserver fault, dialog dismissal, and a mobile viewport whose document width equals its 390px viewport. The brief-key-tap correction has independent worker/input regression coverage; the full observed adventure used 150ms interaction presses before that correction.

Real Twitch OAuth and an actual EventSub connection were exercised with read-chat scope. **A real public `!forge` / `!back` message has not yet been submitted as part of verification.** The release owner is awaiting explicit authorization before posting test commands. Mocked connector and provider tests are labeled as such and do not stand in for that live intake check.

## Generation evidence and limits

[Generation evidence](evidence/generation/README.md) retains actual SDK thread IDs, exact source bytes/hashes, model usage, sandbox identity and timings. Four curated new proposals passed the trusted verifier on their first attempt. A material-behavior nuance was found in one accepted source and corrected through a real new revision; verifier acceptance and full intent fidelity are reported separately. A real request to extract secrets produced no candidate.

The runtime composes six generic actions through a restricted literal language. It does not execute arbitrary generated TypeScript. One experimental law is active at a time. Independent fixtures establish bounded observable behavior, determinism and recovery for those tests; they do not prove arbitrary natural-language correctness or every possible level state.

No frame-rate benchmark, 30-proposal reliability result, human usability study or universal generation-latency guarantee is claimed. Generation coordination has a finite function/Sandbox lifetime and fails visibly after interruption; it is not a durable resumable worker service. The supported projector capture path is a same-browser window, with the studio kept open.

## Release-owner actions

Production deployment and production browser verification remain with the coordinating root, as do Git push, live-chat test consent, repository/judge access and any video publication. The project’s canonical production origin and exact Twitch callback have been provisioned. Once deployed, record the deployment identity and observed production results alongside this manifest.
