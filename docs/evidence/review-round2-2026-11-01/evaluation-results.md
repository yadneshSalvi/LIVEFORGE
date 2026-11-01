# Fresh ten-case evaluation under the stricter verifier

**10/10 original proposals produced a fresh real Codex law on the first attempt; all eight stricter server checks passed for every artifact.** The unchanged independent intent probes also passed for all ten, across 43 assertions. There were no failed cases, repairs, adaptations or reused artifacts in this run.

The run used frozen source `3a74ae32747ec09ba54670cf44363fca32fbac57`, `gpt-6.1-sol`, Codex SDK `0.166.0` and engine `last-light/2.0.0`. All ten distinct Codex thread IDs, exact sources, hashes, timings, usage and reports remain in the [raw evaluation summary](provider-3a74ae3/evaluation-summary.json) and individual case files. Every source SHA-256 matches its returned source, and the source/protocol hashes remained unchanged during the run.

The original [predeclared inputs](../review-2026-11-01/evaluation-proposals.json) were used in order without edits. The [protocol](evaluation-protocol.json) was recorded before provider calls. The [independent intent results](provider-3a74ae3/intent-summary.json) use the original probe code unchanged. These are synthetic practice inputs, each matching available primitives; they do not represent ten real viewers.

| Case                                        | Original category    | Attempts | Strict checks | Intent checks | Observed time to ready | Source SHA-256 prefix |
| ------------------------------------------- | -------------------- | -------: | ------------: | ------------: | ---------------------: | --------------------- |
| [E01](provider-3a74ae3/evaluation-E01.json) | low gravity          |        1 |           8/8 |           4/4 |               29.737 s | `a830377a1d`          |
| [E02](provider-3a74ae3/evaluation-E02.json) | double jump          |        1 |           8/8 |           5/5 |               29.383 s | `c8d1479b95`          |
| [E03](provider-3a74ae3/evaluation-E03.json) | giant mode           |        1 |           8/8 |           5/5 |               29.343 s | `4781ea963d`          |
| [E04](provider-3a74ae3/evaluation-E04.json) | wind                 |        1 |           8/8 |           4/4 |               31.240 s | `5c66d6129f`          |
| [E05](provider-3a74ae3/evaluation-E05.json) | slow motion          |        1 |           8/8 |           5/5 |               26.620 s | `613697e16f`          |
| [E06](provider-3a74ae3/evaluation-E06.json) | ember physics        |        1 |           8/8 |           4/4 |               37.814 s | `5b1cfe55ec`          |
| [E07](provider-3a74ae3/evaluation-E07.json) | temporary creation   |        1 |           8/8 |           5/5 |               30.472 s | `9aeaf02642`          |
| [E08](provider-3a74ae3/evaluation-E08.json) | arithmetic           |        1 |           8/8 |           3/3 |               34.224 s | `59d4453029`          |
| [E09](provider-3a74ae3/evaluation-E09.json) | touch response       |        1 |           8/8 |           4/4 |               35.696 s | `249e132e64`          |
| [E10](provider-3a74ae3/evaluation-E10.json) | persistent signature |        1 |           8/8 |           4/4 |               30.429 s | `f1c1972794`          |

Median time to ready was **30.451 seconds**, range **26.620–37.814 seconds**. Each proposal has one observation and all ten used the dependency snapshot cache. This is not a repeated latency benchmark and is not compared as equivalent to the earlier paired cold/snapshot study. Exact metrics are in [results.json](provider-3a74ae3/results.json).

The stricter verifier measures noticeable physics differences, explicit airborne jumps, held-input safety, diagnostics, replay, rollback and checkpoint continuation. Independent intent fixtures separately exercise the requested semantics on the returned source. Neither proves global level solvability or arbitrary unsupported ideas. **Fresh browser gameplay was not repeated for each of these ten artifacts.** The release owner's [local reused-sample walkthrough](local-browser.md) and the historical ten-artifact browser records remain separate evidence.
