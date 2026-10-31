# Review acceptance evidence — 1 November 2026

This directory records the review improvements separately from the earlier deployed build. It preserves actual results, failed observations and the exact source used for each experiment. No test persona is a claimed real viewer, and no synthetic fixture is counted as a generated artifact.

## What has been observed

- **Ten of ten original Codex requests passed independent behavior checks.** The requests were frozen before evaluation. Each completed in one verified attempt, with exact source, hash, model, thread, usage and timing retained in [the original records](provider-5ac7482-originals/evaluation-summary.json). This is a small declared acceptance set, not a universal generation success rate.
- [Independent intent probes](intent-experiments.md) test what each request actually means, separately from the production verifier. [All ten browser observations](browser-intent-observations.md) compare the same literal sources with controlled baseline worlds. The camera clipping discovered during this work and its renderer-only correction are both retained.
- [The local product journey](engine2-browser.md) covers exact-source library reuse, two/three-law preview and activation, manual rollback, a deliberately induced runtime fault, persistent recovery, saved-engine upgrade, private moderation, the public transparent overlay, and responsive presentation. A hand-authored fault fixture is explicitly labeled and excluded from provider counts.
- [Background authority observations](p0-browser.md) include a real hidden Chrome tab for16.13 minutes, a covered but DOM-visible in-app tab for16.30 minutes, and a controlled checkpoint failure followed by successful retry. These establish observed authority continuity, not a 60 fps guarantee.
- [The paired latency audit](latency-analysis.md) retains all five cold/snapshot pairs, including the first snapshot preparation. Median complete job time was 39.000 s cold and 30.849 s snapshot in this sample. It states missing timing boundaries and avoids claiming universal speed or intent success for the separate timing artifacts.

- [Real refusal → explicit alternative](adaptation-followup.md) preserves the no-suggestion failure, a labeled local fixture, and a distinct fresh production law with host-written ancestry, preview/approval/activation, exact export and independent held-gravity/release checks. Final runtime gates: 357 tests across 34 files.

## Frozen sources

The ten original outputs use source commit `5ac7482fa346f5221416af8e2f1bb85d74b1f5b2`, engine `last-light/2.0.0`, model `gpt-6.1-sol` and Codex SDK `0.166.0`. Their snapshot requests fell back to cold due to an invalid retention interval. They remain unchanged.

After correcting snapshot retention/lifecycle, the paired experiment used `cd7ce2793ddef6ef0be9af26d4aa9460a29b5e99`. It had four cache hits and no fallback across its five snapshot jobs. Product follow-up browser checks used `f89c2d00767f3d342cfb5fc5f7c63a956cc05545`; the seven simulation files remained identical to the original evaluation. Exact manifests are retained in each experiment directory.

## Remaining acceptance boundaries

At this checkpoint, new-account OAuth/quota, optional reply delivery, and a new-message production Twitch round are still pending a renewed Twitch browser sign-in. Automated route/security tests do not replace those observations. The OBS overlay was inspected in a separate browser context; no actual OBS recording or public broadcast is claimed. Release metadata and any subsequent production evidence will be recorded separately.
