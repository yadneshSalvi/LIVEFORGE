# Evidence index

This index separates tests, real integrations and browser observations. No synthetic participant is presented as a Twitch viewer, no stored sample is presented as a fresh generation, and planned acceptance targets are not reported as results.

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

The [release manifest](../release-manifest.md) records the final observed build/test versions and the canonical deployment target. The release owner adds production results after deployment. Source-access and video-publication obligations are separate release tasks; this evidence bundle does not claim those actions occurred.
