# Evidence index

This index separates tests, real integrations and browser observations. No synthetic participant is presented as a Twitch viewer, no stored sample is presented as a fresh generation, and planned acceptance targets are not reported as results.

## Current review: predeclared experiments

The [implementation ledger](../review-progress.md) tracks L1–L17 without treating code or mocked tests as external acceptance. The root froze [ten original intent requests](review-2026-11-01/evaluation-proposals.json), [independent intent experiments](review-2026-11-01/intent-experiments.md), [composition experiments](review-2026-11-01/composition-experiments.json) and a [paired latency protocol](review-2026-11-01/latency-protocol.json) before evaluating generated artifacts. All provider outcomes are retained; adaptation, reuse and verifier acceptance are reported separately from original intent success. The [original frozen engine 2 evaluation](review-2026-11-01/provider-5ac7482-originals/) contains ten fresh generations and ten independent intent/replay/rollback passes. Every original run fell back cold; those records are not a snapshot-speed result. The [engine 2 browser record](review-2026-11-01/engine2-browser.md) and [ten case observations](review-2026-11-01/browser-intent-observations.md) separately record observed behavior, exact two/three-law activation and rollback, legacy upgrade and synthetic runtime-fault recovery.

The [five-pair latency audit](review-2026-11-01/latency-analysis.md) evaluates corrected `cd7ce27`: 39.000 s cold versus 30.849 s snapshot medians, including the slower first snapshot preparation. Four snapshot jobs were warm hits; none fell back. The report retains every pair and distinguishes these verifier-passing latency artifacts from the independently intent-tested ten original artifacts. Missing fine-grained source-returned/verifier timing is explicit.

[P0 browser acceptance](review-2026-11-01/p0-browser.md) includes anonymous reused-artifact review/activation, a controlled checkpoint save failure with successful retry, and a real Chrome hidden-tab lease observation lasting 16.13 minutes with the same epoch. Its source is `177079c`; the report explicitly separates that result from later engine 2 acceptance. Independent intent-probe calibration uses labeled hand-authored positive and unrelated-law negative fixtures, not provider output.

## Real browser operation

[Local in-app-browser walkthrough, 31 October 2026](browser/2026-10-31-local.md) records the coordinating operator’s actual journey through a fresh generated rule, interactive preview, exact approval, activation, all three game encounters, beacon completion and rollback. Its screenshots were captured from the actual application. The same review identified and drove fixes for renderer unmount cleanup, short key taps, lease recovery, nested interactive semantics and small instructional text.

Live Twitch and production findings belong in that browser narrative or a separate release observation. A completed local practice flow is not evidence of a real viewer’s Twitch message.

## Real model and isolation runs

[Generation evidence](generation/README.md) includes exact generated source, hashes, actual Codex SDK thread identifiers, Sandbox identity, timings, model usage, independent verification and revision history. Four curated fresh rules passed the trusted verifier on their first attempt; source review found one material-intent nuance that needed a real creator-style revision. That distinction is retained. A real malicious request to extract secrets was refused without a candidate.

The sample size is stated in the generation report. These runs do not establish the private plan’s 30-proposal reliability target, a universal latency promise, or correctness for arbitrary natural language. Reused public examples retain their original provenance and explicitly state that no new model call occurs during reuse.

## Deterministic tests

Run `npm test` from the repository root. The suite covers actual game traversal and interactions; exact-source signature bridge collision; literal grammar/capability attacks; observable effects; deterministic replay; JSON persistence; rollback; same-source idempotent activation; short input edges; host and show authorization; exact approval hashes; JSONB canonicalization; lease fencing; idempotency; vote replacement/deduplication; OAuth lifecycle; cancellation/stale jobs; and EventSub browser reconnect semantics.

The browser connector tests use a deliberately synthetic socket implementation to exercise welcome, planned migration, unexpected gaps, keepalive expiry and revocation. OAuth/API fault tests use mock provider responses. These deterministic tests are not claimed as live Twitch traffic. Real provider/database evidence is stored separately.

A palette test reads the actual CSS tokens and measures 19 essential foreground/background combinations against the 4.5:1 normal-text threshold. It does not establish complete WCAG compliance or replace keyboard/screen-reader/manual review.

## Development and release

[Codex development evidence](../development-evidence.md) identifies the actual root and implementation threads and links concrete observed bugs to changes and tests. [Architecture](../architecture.md) states the implemented language, runtime, storage and capture boundaries. [Asset rights](../rights.md) identifies original/generated work and third-party licenses.

The [release manifest](../release-manifest.md) records the final observed build/test versions and the canonical deployment target. The [production browser record](browser/2026-10-31-production.md) records the deployed playthrough, OAuth/EventSub and fresh-generation verification. Source-access and video-publication obligations are separate release tasks; this evidence bundle does not claim those actions occurred.
