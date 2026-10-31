# Generation setup, progress and evaluation

This change adds a dependency-only snapshot cache and trusted progress markers. No real setup, generation or latency trials were run by the implementation worker. The mocked tests establish lifecycle/order and data-handling behavior, not production speed. The release owner must record real cold/warm measurements separately before claiming an improvement.

## Clean dependency image

Only an already claimed generation job can call `createGenerationSandbox`. There is no public warm endpoint and selecting a proposal does not start infrastructure. A durable store record, keyed by project identity, Node runtime and pinned SDK version, permits one preparation lease at a time. A competing authorized job uses a bounded cold fallback instead of starting a second image preparation.

Preparation creates a fresh **nonpersistent** Node 24 VM with an empty injected environment. It can reach only `registry.npmjs.org`, installs `@openai/codex-sdk@0.166.0` using `npm --ignore-scripts --no-audit --no-fund`, then switches to deny-all networking. A trusted audit rejects existing input, runner, Codex home, output, thread, result or failure files and model-key environment variables. Only then does it create a snapshot with a finite six-hour expiration. No model API key, proposal, session or generated output is ever written to the preparation VM. The SDK's `snapshot()` stops that VM.

A job VM starts from the clean snapshot with `persistent: false`, an explicitly new model-only network policy, and no `runtime` field alongside snapshot source. It passes the clean-state audit before the coordinator writes its runner or input and injects the model key into the detached command. The generation VM is never snapshotted; stopping it discards its filesystem. Snapshot IDs remain in the internal cache record and never enter job timing data or evaluation output. Request-scoped Sandbox credentials stay closure-local and are never placed in the guest, the cache record or an uploaded configuration file.

The cache checks both its conservative expiry and the provider's ready status. Expired or invalid images allow at most one rebuild per job, followed by a cold fallback. Preparation has a finite lease and create/install/snapshot timeouts. Every failed VM is stopped. An image captured after losing its publication lease is deleted. A shared 260-second coordinator/VM deadline includes setup; model attempts use only its remaining time, capped at the existing 70-second per-attempt limit.

The installed Sandbox SDK is pinned to 3.9.1. The implementation was checked against its type declarations and the official [snapshot lifecycle](https://vercel.com/docs/sandbox/concepts/snapshots) and [SDK reference](https://vercel.com/docs/sandbox/sdk-reference). In this SDK snapshots stop their source VM, expiration is in milliseconds, and detached commands expose abortable `logs()` and `wait()` methods.

## Actual progress, bounded output

The trusted guest runner prints minimal JSON markers for genuine SDK `thread.started`, `turn.started`, and a returned nonempty source artifact. It never prints model text, reasoning or partial source. While the detached command runs, the coordinator consumes at most 16 KiB of stdout and accepts only three allowlisted phase names. Unknown lines and stderr are ignored; duplicate phases are discarded. A phase record contains only its enum, server timestamp and attempt number, with at most nine records across the repair budget.

Final thread/result/source/failure files are read only after command completion and a successful deny-all network update. Progress streaming does not relax that boundary. Host and public surfaces may translate phase enums into fixed labels; they must not infer fictional percentages, capabilities or partial code. Capability labels belong after successful verification.

`GenerationJob.sandboxTimings` records:

| Field        | Meaning                                                           |
| ------------ | ----------------------------------------------------------------- |
| `mode`       | Trusted server/evaluator choice, `cold` or `snapshot`             |
| `cacheHit`   | The job reused an existing image rather than preparing it         |
| `fallback`   | An image/setup failure or competing preparation required fallback |
| `setupMs`    | Total helper wall time until the clean job VM was ready           |
| `createMs`   | Aggregate VM-create time, including preparation if performed      |
| `installMs`  | Aggregate pinned dependency installation time                     |
| `snapshotMs` | Manual dependency-image capture time                              |

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
