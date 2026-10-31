# Generation setup, progress and evaluation

Generation uses a dependency-only snapshot cache and trusted progress markers. The release owner ran five predeclared real cold/snapshot pairs on frozen `cd7ce27`: median queue-to-verified time was **39.000 s cold / 30.849 s snapshot**, including first-image preparation, with four warm hits and no fallback. This is an observed 20.9% lower median in a small sequential sample, not a universal guarantee. The [latency audit](evidence/review-2026-11-01/latency-analysis.md) retains every pair, setup cost and limitation. Mocked lifecycle tests are reported separately.

## Clean dependency image

Only an already claimed generation job can call `createGenerationSandbox`. There is no public warm endpoint and selecting a proposal does not start infrastructure. A durable store record, keyed by project identity, Node runtime and pinned SDK version, permits one preparation lease at a time. A competing authorized job uses a bounded cold fallback instead of starting a second image preparation.

Preparation creates a fresh **nonpersistent** Node 24 VM with an empty injected environment. It can reach only `registry.npmjs.org`, installs `@openai/codex-sdk@0.166.0` using `npm --ignore-scripts --no-audit --no-fund`, then switches to deny-all networking. A trusted audit rejects existing input, runner, Codex home, output, thread, result or failure files and model-key environment variables. Only then does it request a snapshot with the provider’s minimum finite one-day retention. LIVEFORGE separately stops reusing that image after six hours, regardless of the longer provider expiration. Provider retention is measured from last use; unused replaced images expire under that provider policy. No model API key, proposal, session or generated output is ever written to the preparation VM. The SDK's `snapshot()` stops that VM.

A job VM starts from the clean snapshot with `persistent: false`, an explicitly new model-only network policy, and no `runtime` field alongside snapshot source. It passes the clean-state audit before the coordinator writes its runner or input and injects the model key into the detached command. The generation VM is never snapshotted; stopping it discards its filesystem. Snapshot IDs remain in the internal cache record and never enter job timing data or evaluation output. Request-scoped Sandbox credentials stay closure-local and are never placed in the guest, the cache record or an uploaded configuration file.

The cache checks both its conservative expiry and the provider's ready status. Expired or invalid images allow at most one rebuild per job, followed by a cold fallback. Preparation has a finite lease. Snapshot lookup, create, install, clean audit, network updates and snapshot capture use native SDK abort signals bounded by the remaining job deadline. Known VMs receive a bounded explicit stop on failure/cancellation; an image captured after losing its valid publication lease is deleted. Every allocation rechecks the durable starting claim before and after create, and preparation rechecks before capture, so a cancellation during installation cannot allocate another VM. A shared 260-second coordinator/VM deadline includes setup; model attempts use only its remaining time, capped at the existing 70-second per-attempt limit.

An aborted create request can have an unknown remote outcome before its VM identity is returned. Native SDK cancellation plus the VM's finite remaining job TTL bounds that outcome; the application cannot guarantee immediate remote deletion without an identifier. Database requests do not expose cancellation: claim reads have a bounded wait, and late progress writes are fenced by abort/deadline/current status/current attempt. A stalled progress observer cannot hold reader shutdown or the coordinator’s known-VM stop. Generation control-plane writes/reads/network changes also carry native bounded signals; final reads still require successful deny-all. These are bounded cleanup guarantees, not claims that every external request is cancellable.

The installed Sandbox SDK is pinned to 3.9.1. The implementation was checked against its type declarations and the official [snapshot lifecycle](https://vercel.com/docs/sandbox/concepts/snapshots) and [SDK reference](https://vercel.com/docs/sandbox/sdk-reference). In this SDK snapshots stop their source VM, expiration is in milliseconds, and detached commands expose abortable `logs()` and `wait()` methods. The provider’s minimum is documented in the official [snapshot retention announcement](https://vercel.com/changelog/vercel-sandbox-snapshots-now-allow-custom-retention-periods): one day. Frozen `5ac7482` requested six hours and real evaluations fell back cold; that evidence remains untouched. The corrected provider expiration and independent six-hour reuse cutoff were measured separately on `cd7ce27`; the original fallback records remain unchanged.

## Actual progress, bounded output

The trusted guest runner prints minimal JSON markers for genuine SDK `thread.started`, `turn.started`, and a returned nonempty source artifact. It never prints model text, reasoning or partial source. While the detached command runs, the coordinator consumes at most 16 KiB of stdout and accepts only three allowlisted phase names. Unknown lines and stderr are ignored; duplicate phases are discarded. A phase record contains only its enum, server timestamp and attempt number, with at most nine records across the repair budget.

The ten measured latency jobs retained thread-started and turn-started markers but no source-returned marker or dedicated verifier duration. Their total-minus-setup residual cannot be attributed solely to model time; the audit preserves this instrumentation limit.

Final thread/result/source/failure files are read only after command completion and a successful deny-all network update. Progress streaming does not relax that boundary. Host and public surfaces may translate phase enums into fixed labels; they must not infer fictional percentages, capabilities or partial code. Capability labels belong after successful verification.

`GenerationJob.sandboxTimings` records:

| Field        | Meaning                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `mode`       | Trusted server/evaluator choice, `cold` or `snapshot`                                                 |
| `cacheHit`   | The job reused an existing image rather than preparing it                                             |
| `fallback`   | An image/setup failure or competing preparation required fallback                                     |
| `setupMs`    | Total helper wall time until the clean job VM was ready                                               |
| `createMs`   | Aggregate VM-create time, including preparation if performed                                          |
| `installMs`  | Aggregate pinned dependency installation time                                                         |
| `snapshotMs` | Manual dependency-image capture time                                                                  |
| `failures?`  | At most four diagnostics: fixed `stage`, fixed `category`, optional integer `httpStatus` from 100–599 |

Failure stages are snapshot lookup/validation/capture, VM create, dependency install, network policy, clean audit, cache publication or cache lease. Categories distinguish HTTP error, timeout, network error, invalid/dirty image, command failure, lease contention/loss, store error or unknown. No SDK error message, URL, response body, token, raw provider code or infrastructure identifier is copied. Diagnostics are host/evidence metadata, not public overlay text.

These bounded durations contain no runtime or snapshot identifiers. Newly preparing the first image is not a cache hit and must be separated from warm-hit measurements.

## Explicit billable evaluation

The evaluator accepts the frozen shape `{ "proposals": [{ "id": "E01", "text": "…" }] }`. It processes every original case sequentially, retaining failures, unsupported output, exact returned source/hashes, model/SDK/engine versions, trusted phase timestamps, usage and setup timings. Adaptations or reused artifacts do not count as original-proposal success. Historical evidence files are never overwritten.

Run only when authorized to incur provider/Sandbox charges, using the owner's existing server environment:

```sh
node --import tsx scripts/generation-evaluate.ts \
  --cases-file path/to/frozen-cases.json \
  --output-dir docs/evidence/generation/runs/unique-run-directory \
  --sandbox-mode snapshot
```

`--sandbox-mode cold` bypasses both cache reuse and snapshot preparation for that invocation. This switch is a trusted server/evaluator option, never a request-body field. Production defaults to snapshot; an operator can set `LIVEFORGE_GENERATION_SANDBOX_MODE=cold` server-side. Public requests cannot choose a snapshot or supply an image ID.

If `--output-dir` is omitted, the evaluator creates a dated random directory. If the requested directory already exists, it fails before creating a show, job or provider call. `--help` and importing the script have no billable side effects. Without a cases file, the historical four-case set remains available, but output still goes to a unique new directory.

For performance claims, run at least five paired cold/warm trials after engine freeze, preserve every result, and compare matching proposals/model/SDK/engine versions. Report sample count, individual observations, medians and the warm-hit subset; include first-image preparation and fallback observations separately. Total generation latency also includes model, store and verifier work, so setup savings alone do not establish an end-to-end improvement.
