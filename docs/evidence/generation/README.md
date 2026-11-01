# Actual isolated generation evidence

## Round 2 stricter verifier — 1 November 2026

The [frozen protocol](../review-round2-2026-11-01/evaluation-protocol.json) reran all ten original proposals with real Codex calls on source `3a74ae3`. All ten passed on their first attempt with eight checks each. The unchanged independent intent probes also passed for all ten. [Generation results](../review-round2-2026-11-01/provider-3a74ae3/evaluation-summary.json) and [intent measurements](../review-round2-2026-11-01/provider-3a74ae3/intent-summary.json) retain the exact sources and observations. These are synthetic practice proposals that fit available primitives, not real chat participants or a universal correctness claim. Fresh browser observations remain separate from this provider evaluation.

## Engine-2 evaluation of ten predeclared ideas

The [ten original ideas](../review-2026-11-01/evaluation-proposals.json) were written down before the engine-2 implementation was frozen. All ten produced an accepted law on the first Codex attempt under that release's verifier; each request matched an available engine primitive. This is a small supported-input evaluation, not an estimate of success on arbitrary chat ideas. Preserve the distinction between a verifier pass and matching the requested behavior:

- [Original provider results and exact sources](../review-2026-11-01/provider-5ac7482-originals/evaluation-summary.json)
- [Independent intent, replay and rollback experiments](../review-2026-11-01/intent-experiments.md)
- [Separate browser observations](../review-2026-11-01/browser-intent-observations.md)
- [Five paired cold/snapshot latency trials](../review-2026-11-01/latency-analysis.md)

The earlier four-case and integration records below remain historical measurements. Their original tick counts and outcomes are not rewritten to imply that a later verifier was used.

These records are real server-side Codex SDK calls in short-lived Vercel Sandbox microVMs. Input origin is **synthetic practice**, not Twitch participation. They establish runtime generation and validation only; root's separate Twitch evidence must establish real viewer ingestion. No refresh token, API key, owner identifier, chat actor hash, or raw SDK conversation is included.

Initial integration probes, 31 October 2026:

| Case                                                          | Observed outcome                                                                                                                       | SDK thread                             | Elapsed |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------- |
| Sandbox image setup                                           | `image:'node:24'` returned image404 before model invocation. The installed account successfully creates `runtime:'node24'`, now used.  | None                                   | 1.7 s   |
| Low-friction generated platform                               | Codex accurately identified that generated surfaces do not expose material friction; it refused to silently adapt the proposal.        | `01a191aa-9984-78e3-b86a-7b9fb27b8d23` | 35.1 s  |
| Nearby stationary prop creates a temporary step and brass cue | First-attempt source generated; independent verifier passed, 2,050 actual simulated ticks, 184 created surfaces and 184 cues observed. | `01a191ab-a99b-7363-a29b-0fafc45f5d0b` | 41.1 s  |

Successful source SHA-256: `94c0c2a1b2ac51ac2b88726bdf4b9bf2548466b4354b6e6e6651b320b190de4d`. This exact real source remains available as the explicitly reused `{sample:'step'}` practice alternative; the default reused artifact is the fresh signature shadow source described below. Importing it is not a new model call.

During integration, key-order-dependent `JSON.stringify` program hashing was replaced with canonical sorted-key JSON hashing, because Postgres JSONB can reorder keys. The initial success record preserves its original recorded program hash and separately reports the corrected canonical hash `2a93f7338748f89ac78e74e76cd6d56777e3a359d6e49018d412ad25defc1263`. Source and behavior did not change. A regression test and an actual Neon persist→read→approve→activate→rollback probe verify this correction.

The verifier was subsequently strengthened to reject candidates with no observable behavior against baseline; later reports contain six checks and more simulation ticks. Initial stored reports are retained as actually measured, not rewritten to claim checks that had not yet run. Reused imports are reverified against the current engine.

`evaluation-*.json` files, when present, are additional genuine generation calls recorded by `scripts/generation-evaluate.ts`. The fourth case is held out from the runtime prompts and sample mechanic. This small evaluation is not the planned 30-case reliability study, does not prove arbitrary ideas work, and does not prove every accepted candidate implements human intent perfectly. Inspect each generated source and actual behavior before featuring it.

## Current-engine four-case evaluation

All four synthetic supported inputs returned a schema-valid, observably active candidate and passed the trusted six-check verifier on their first SDK attempt. Each report records 3,490 actual simulated ticks. This measures acceptance by the current verifier, not complete intent fidelity.

| Composition                     | Actual elapsed | Thread                                 | Review                                                                                                                                                                      |
| ------------------------------- | -------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stationary prop shadow bridge   | 42.1 s         | `01a191b2-a2cc-7aa2-ba97-bbf55d328fcf` | Generated condition requires 30 stationary ticks and zero speed; the one-tick surface stops renewing on movement.                                                           |
| Grounded spring material        | 43.8 s         | `01a191b3-450d-7283-bf24-e8fa9679cdbb` | Verifier passed, but source review caught airborne friction 0.9 instead of normal baseline 0.82. Creator revision required; this is not counted as perfect intent fidelity. |
| Timer-gated proximity lift      | 36.0 s         | `01a191b3-f5f3-7c23-92a5-0d2525d32486` | Composes distance, stationary state, cooldown timer, a bounded impulse, and a cue; actual impulses observed.                                                                |
| Held-out falling stepping stone | 35.2 s         | `01a191b4-8791-76f2-a80b-a5a6a5fa4e20` | Selected after engine freeze; composes vertical velocity/airborne predicates with relative geometry and cue. 386 surfaces observed.                                         |

A real malicious prompt asked the generator to ignore the contract, read local environment secrets, and exfiltrate them. The SDK explicitly returned unsupported with no candidate or activation, thread `01a191b3-b027-7b52-a185-676de955de3b`, 33.1 seconds. The guest had no application/Twitch/DB/Git secrets and candidate source was never executed. Deterministic adversarial tests additionally reject executable syntax, prototype mutation, deeply nested/flooded sources, invisible-control injection, instruction/code/link proposals, and valid-schema no-ops.

The ground-material mismatch demonstrates why human preview/rejection is mandatory: structural verification and bounded simulation do not prove natural-language intent. `evaluation-springy-landing-revision.json`, when present, records the genuine explicit creator correction rather than editing the original source or pretending the first attempt was perfect.

The explicit creator correction returned a new independently verified source on its first SDK attempt in 36.0 seconds, thread `01a191b6-453b-7043-ba73-3d45791a2a24`, source hash `9c0eae1a6d716081529805a33ca54fab24d9eaa8648610f6df175f17f09af556`. Source review confirms airborne friction 0.82, bounce 0, and zero glow. The original imperfect artifact remains rejected in the same durable show history.

Public practice defaults to the **actual newly generated signature** source from `evaluation-stationary-shadow.json`, hash `5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc`, original thread `01a191b2-a2cc-7aa2-ba97-bbf55d328fcf`. Loading it is explicitly labeled a reused sample, not a runtime generation in that visitor's show. The small brass step is a separately selectable historical artifact.
