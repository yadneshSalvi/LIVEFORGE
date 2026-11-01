# Round 3 verifier replay

Offline replay of all ten predeclared ideas in each frozen provider set. No new provider calls, generation, revisions or source substitutions. Reproduce with `npx tsx scripts/round3-verifier-replay.ts` from LIVEFORGE.

Both sets replay at **10/10 singles and 4/4 review stacks**. Each set contributes original E01+E02 and E01+E02+E03. The two explicitly named gravity/jump combinations are synthetic acceptance fixtures repeated beside each set, not additional provider generations. The JSON retains source SHA-256, historical generation success/status and verification, complete current reports, and trusted runtime hashes.

All 20 stored generation records historically reported `originalSuccess: true`. Replay does not rewrite these historical results or supersede the original intent reviews. A trusted verification pass establishes bounded, observable behavior in tested scenarios; it does not establish complete proposal intent or global level solvability.

The ceiling clamp and runtime resource limits remain unchanged. Held-input stress rejects more than 30 consecutive ticks with any entity at the ceiling. Ordinary ceiling contact is allowed. Aggregate skip diagnostics remain available; separate counters reject global surface/spawn denial only when the clause has not already reached its own limit. Command, modifier and invalid-geometry diagnostics still reject.

Physics comparisons run only for laws with physics actions; for other laws the comparison program would be identical, while actual-effects and all safety/replay checks still run. Physics comparisons retain 150-tick controlled runs, add a dropped-ember run, and add 420-tick late-onset runs with a jump at tick 320 and a second jump at 332 in the double-jump scenario. Death and floor-departure guards still prevent route discontinuities from creating apparent effects. Gravity 0.999 still rejects, including alongside cues or separate impulses.

Focused regressions cover original provider stacks, explicit bounded stacks, dropped ember, delayed physics, own spawn/surface caps, held-jump runaway, and global command/surface/spawn overflow. Earlier intent and production limitations remain in their original evidence directories.
