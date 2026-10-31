# Independent intent measurements

`evaluation-proposals.json` and `intent-experiments.md` were frozen before engine expansion. The separate `intent-probes.ts` runner measures those original behaviors in the trusted game interpreter. It never imports or evaluates generated source as executable JavaScript.

Run it against one retained real-generation summary:

```sh
npx tsx docs/evidence/review-2026-11-01/intent-probes.ts path/to/evaluation-summary.json path/to/new-intent-results.json
```

The output path must be new: the runner refuses to overwrite an earlier result. Every predeclared case receives a result, including absent candidates, mismatched input text, compiler rejection and runtime exceptions. `automatedIntentPassed` is separate from `browserObserved`, which this runner always leaves false. Real provider provenance, browser gameplay and explicit adaptation review remain additional acceptance gates.

The measurements use controlled synthetic arrangements: equal starting checkpoints, nearby and distant crates, a ceiling that obstructs growth, known horizontal speeds, and a player above a projected bridge. These fixtures isolate cause and effect; they are not recordings of viewers or demonstrations of fresh generation. The source hash binds the measurement to the retained literal source. The generic verifier, checkpoint replay and exact rollback also run for each candidate.

## Probe calibration

```sh
npx tsx docs/evidence/review-2026-11-01/probe-calibration.ts
```

The calibration script contains ten explicitly hand-authored positive rules and a deliberately unrelated glow-only negative rule. Its local report is written under ignored `.local/`. On the initial engine2 working contracts, all ten positive rules passed and the unrelated rule failed all ten intended-behavior evaluations. This checks the measurement harness; it is **not** the required eight-of-ten real Codex acceptance result. The final provider results must name their frozen source/engine checkpoint separately.

## Browser and composition follow-up

For each generated candidate counted as accepted, inspect the playable effect in the browser. Record the exact candidate hash, setup, input, observation and limitations. Composition needs its own independently verified ordered stack, approval, activation, save/restore and rollback evidence; successful individual laws do not prove a safe combination.
