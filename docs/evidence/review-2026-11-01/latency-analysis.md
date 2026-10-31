# Paired generation latency audit — frozen cd7ce27

In these five sequential real-provider pairs, the snapshot-mode median queue-to-verified duration was **30.849 s**, versus **39.000 s** for forced cold: **8.151 s (20.9%) lower in this observational sample**. The primary snapshot group includes its first dependency-image preparation. That first snapshot run was slower than its paired cold run; four later runs were cache hits. These observations do not establish a universal speedup or a faster model.

This analysis was computed read-only from all ten raw job records in [latency-cd7ce27](latency-cd7ce27/source-manifest.json), against the unchanged [predeclared protocol](latency-protocol.json). No raw record, protocol, provider request or browser state was modified by the audit. Durations below are seconds, calculated from recorded milliseconds without dropping runs.

## Protocol and identity audit

- The embedded protocol matches the immutable protocol exactly. All ten IDs, original request texts, pair associations, cold/snapshot choices and chronological ordering match it. Recorded job intervals do not overlap, consistent with concurrency one.
- All records identify model `gpt-6.1-sol`, Codex SDK `0.166.0` and engine `last-light/2.0.0`. Medium reasoning effort is specified by the protocol and frozen runner; it is not independently echoed as a provider configuration field in each result.
- The shared [source manifest](latency-cd7ce27/source-manifest.json) records commit `cd7ce2793ddef6ef0be9af26d4aa9460a29b5e99`. The audit recomputed SHA-256 from that Git commit for all seven listed coordinator, sandbox-helper and game/compiler/verifier files; all matched the manifest. Job records rely on this common manifest rather than repeating a source commit individually.
- Each recorded elapsed value exactly equals `completedAt − createdAt`. It measures the queued job record to the durable ready/verified update, including setup, model and verification/control-plane work. It is not pure provider compute, complete teardown time or viewer-visible broadcast latency.
- All ten generated source SHA-256 values recompute correctly. There are ten distinct generated sources; the two members of every pair differ. The workload is matched by original proposal, frozen coordinator/model/engine and settings, not identical model output.
- Every job is `ready`, with `originalSuccess: true`, a retained candidate, a passing trusted verifier, and one verified attempt. Failed/cancelled/stale jobs: **0**; repair attempts: **0**; coordinator exit failures: **0**. These flags mean fresh original-request output reached verification. They do **not** mean these ten latency artifacts separately passed the independent natural-language intent probes or browser review. Such checks were not rerun as part of this latency audit.

## Actual execution order

Times are UTC on 31 October 2026. The alternating order is the declared order, not randomized treatment assignment. Links retain each exact source, hash, phase and usage record.

| Order | Record                                                                    | Queued UTC   | Ready UTC    | Elapsed | Cache hit |
| ----: | ------------------------------------------------------------------------- | ------------ | ------------ | ------: | --------- |
|     1 | [B01-cold](latency-cd7ce27/B01-cold/evaluation-B01-cold.json)             | 19:26:24.144 | 19:27:03.144 |  39.000 | no        |
|     2 | [B01-snapshot](latency-cd7ce27/B01-snapshot/evaluation-B01-snapshot.json) | 19:27:09.743 | 19:27:53.772 |  44.029 | no        |
|     3 | [B02-snapshot](latency-cd7ce27/B02-snapshot/evaluation-B02-snapshot.json) | 19:28:00.384 | 19:28:30.253 |  29.869 | yes       |
|     4 | [B02-cold](latency-cd7ce27/B02-cold/evaluation-B02-cold.json)             | 19:28:35.693 | 19:29:12.919 |  37.226 | no        |
|     5 | [B03-cold](latency-cd7ce27/B03-cold/evaluation-B03-cold.json)             | 19:29:20.629 | 19:30:11.517 |  50.888 | no        |
|     6 | [B03-snapshot](latency-cd7ce27/B03-snapshot/evaluation-B03-snapshot.json) | 19:30:18.913 | 19:30:53.844 |  34.931 | yes       |
|     7 | [B04-snapshot](latency-cd7ce27/B04-snapshot/evaluation-B04-snapshot.json) | 19:31:00.279 | 19:31:29.404 |  29.125 | yes       |
|     8 | [B04-cold](latency-cd7ce27/B04-cold/evaluation-B04-cold.json)             | 19:31:37.047 | 19:32:16.395 |  39.348 | no        |
|     9 | [B05-cold](latency-cd7ce27/B05-cold/evaluation-B05-cold.json)             | 19:32:24.075 | 19:33:02.830 |  38.755 | no        |
|    10 | [B05-snapshot](latency-cd7ce27/B05-snapshot/evaluation-B05-snapshot.json) | 19:33:10.534 | 19:33:41.383 |  30.849 | yes       |

## All five paired comparisons

Delta is **snapshot minus cold**; a negative value is lower snapshot-mode latency. The first-image preparation remains in B01 and in every primary aggregate.

| Pair / original case | Actual pair order |   Cold | Snapshot |   Delta | Relative delta |
| -------------------- | ----------------- | -----: | -------: | ------: | -------------: |
| B01 / E01            | cold → snapshot   | 39.000 |   44.029 |  +5.029 |        +12.89% |
| B02 / E02            | snapshot → cold   | 37.226 |   29.869 |  -7.357 |        -19.76% |
| B03 / E03            | cold → snapshot   | 50.888 |   34.931 | -15.957 |        -31.36% |
| B04 / E04            | snapshot → cold   | 39.348 |   29.125 | -10.223 |        -25.98% |
| B05 / E10            | cold → snapshot   | 38.755 |   30.849 |  -7.906 |        -20.40% |

The **median paired delta is -7.906 s**, with median per-pair relative delta **-20.40%**. This differs from subtracting the two group medians; neither statistic is substituted for the other. Snapshot was lower in four pairs and higher in B01.

| Group                                     | Runs | Median total | Median setup | Median create | Median install | Median snapshot capture | Cache hits | Fallbacks |
| ----------------------------------------- | ---: | -----------: | -----------: | ------------: | -------------: | ----------------------: | ---------: | --------: |
| Cold — all five                           |    5 |       39.000 |       12.324 |         0.623 |          6.888 |                   0.000 |          0 |         0 |
| Snapshot — all five, preparation included |    5 |       30.849 |        4.307 |         1.829 |          0.000 |                   0.000 |          4 |         0 |
| Warm-hit snapshot subset — secondary only |    4 |       30.359 |        4.248 |         1.915 |          0.000 |                   0.000 |          4 |         0 |

The warm-only subset has four runs and is descriptive, not the five-run primary comparison. Its matched cold counterparts (B02–B05) have a median of **39.0515 s**, versus **30.359 s** for those four warm hits; their median paired delta is **−9.0645 s**. The full five-run comparison above remains primary.

## Setup costs and the first image

Create time is aggregate VM-creation time, including the preparation VM when present. The helper's total setup also includes durable-cache access, policy changes, clean-state checks and other setup overhead, so the three named sub-stages do not exhaust it. Per-column medians must not be added as though they came from one job.

| Record       | Setup total | VM create | SDK install | Snapshot capture | Other setup residual | Total minus setup |
| ------------ | ----------: | --------: | ----------: | ---------------: | -------------------: | ----------------: |
| B01-cold     |      12.522 |     0.632 |       7.057 |            0.000 |                4.833 |            26.478 |
| B01-snapshot |      20.000 |     1.789 |       6.786 |            2.308 |                9.117 |            24.029 |
| B02-snapshot |       5.413 |     2.869 |       0.000 |            0.000 |                2.544 |            24.456 |
| B02-cold     |      10.955 |     0.608 |       5.889 |            0.000 |                4.458 |            26.271 |
| B03-cold     |      16.956 |     0.662 |      11.760 |            0.000 |                4.534 |            33.932 |
| B03-snapshot |       4.307 |     2.001 |       0.000 |            0.000 |                2.306 |            30.624 |
| B04-snapshot |       3.865 |     1.242 |       0.000 |            0.000 |                2.623 |            25.260 |
| B04-cold     |      12.324 |     0.589 |       6.888 |            0.000 |                4.847 |            27.024 |
| B05-cold     |      10.813 |     0.623 |       5.733 |            0.000 |                4.457 |            27.942 |
| B05-snapshot |       4.189 |     1.829 |       0.000 |            0.000 |                2.360 |            26.660 |

B01-snapshot performed the first preparation: **20.000 s setup**, including **6.786 s SDK installation** and **2.308 s snapshot capture**, plus **1.789 s aggregate VM creation** and **9.117 s other setup**. Its complete job took **44.029 s**, **5.029 s longer** than B01-cold. None of that preparation was counted as free or removed from the primary median.

The four warm snapshot records each report zero SDK-install and zero snapshot-capture time. All five cold records report a fresh install. Cache hits: **4/5 snapshot, 0/5 cold**. Fallbacks: **0/10**. Aggregate setup across five jobs was **63.570 s cold** versus **37.774 s snapshot**; aggregate job duration was **205.217 s** versus **168.803 s**.

The median `elapsed − setup` residual is **27.024 s cold** and **25.260 s snapshot**. This is mixed model/startup/store/verification/control-plane time, not a separate measurement of model generation or verification. All ten records retain thread-started and turn-started phase timestamps, but **none contains a source-returned marker or dedicated verifier duration**. Consequently the protocol's requested finer stage split is unavailable here; it is an instrumentation limitation, not a zero-cost stage.

## Usage, scope and limits

| Recorded usage totals                        | Cold five | Snapshot five |
| -------------------------------------------- | --------: | ------------: |
| Input tokens                                 |     51062 |         51062 |
| Cached input tokens read                     |         0 |             0 |
| Output tokens                                |      1542 |          1474 |
| Reasoning output tokens, numeric counts only |       544 |           500 |
| Cache-write input tokens                     |     51047 |         51047 |

Each matched pair has the same recorded input-token count, but output and reasoning-token counts differ. Recorded cached-input reads are zero for every run: cache-write counters must not be described as cache hits. These counters do not rule out unobserved provider infrastructure effects. The dependency-image cache is distinct from the model's token cache.

The audit found **no workload, order, mode, version or retained-record deviation from the declared ten-run sequence**. The missing source-returned/verification timing boundary limits stage attribution. No additional provider or browser intent work was performed to fill that gap or to relabel verifier success as intent success.

This is a small, sequential, alternating-order observational sample over five different proposals. It includes stochastic outputs, changing provider/network/store conditions and one unusually long cold install (B03: 11.760 s). There is no randomization, confidence interval, broad load test, universal-p95 claim or controlled comparison against historical engine-1 jobs. The measured conclusion is limited to the lower snapshot-mode median and setup costs observed in these preserved pairs.
