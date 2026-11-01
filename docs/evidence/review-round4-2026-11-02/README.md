# Round 4 verifier replay — 2 November 2026

Offline replay of the same frozen provider sources as [round 3](../review-round3-2026-11-01/verifier-replay.md). No provider calls, generation, revisions or source substitutions. Reproduce with `npx tsx scripts/round3-verifier-replay.ts docs/evidence/review-round4-2026-11-02` from LIVEFORGE; with no argument the script still writes the round-3 location.

## What changed

Round 3 rejected sustained ceiling contact (more than 30 consecutive ticks with any entity at the ceiling clamp) only in the held-input stress scenario. Laws that pin the courier without held input could therefore pass, for example "after an air jump, float upward" or "float while the ember is dropped". The verifier now tracks consecutive ceiling ticks after every step of every engine running the candidate program: actual-effects runs, controlled physics comparisons (including dropped-ember and late-onset runs), held-input stress, deterministic replay, rollback and checkpoint continuation. It reuses the existing "sustained ceiling contact" diagnostic. Brief ceiling contact is still allowed. The ceiling clamp, runtime resource limits and other checks are unchanged.

## Results

Both sets still replay at **10/10 singles and 4/4 review stacks** (20/20 singles and 8/8 stacks overall). Each set has two original-provider stacks (E01 + E02, E01 + E02 + E03) and two synthetic numeric fixtures (gravity 0.5 + jump 1.4, gravity 0.4 + one air jump), run separately beside each set. Every per-law and per-stack report in [verifier-replay.json](verifier-replay.json) is identical to the round-3 record. Only `createdAt` and two runtime hashes differ: `src/game/verifier.ts` (the change above) and `src/game/core.ts`. The `core.ts` change is copy only: the opening on-screen prompt now reads "Carry the ember to the Astral Hearth." instead of "Carry the last ember to the Astral Hearth.", with no gameplay change. The `runtime.ts` and `contracts.ts` hashes are unchanged.

New regression tests in `tests/round3-runtime.test.ts` check that the two pinning laws above now fail outside held-input stress. They also check that original E02 + E03 and E01 + E03 stacks from both provider sets pass, along with all 20 stored singles. Existing tests still require held-jump runaway and gravity 0.999 to fail.

Passing trusted verification shows bounded, observable behavior in the tested scenarios. It does not establish proposal intent or global level solvability. Historical generation results and intent reviews remain in their original directories.
