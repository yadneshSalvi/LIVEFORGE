# Surface motion regression evidence

`backward-compat-baseline.json` was captured before the surface motion implementation, from commit `02d171809b7651adb40b9d6a969b868f2e383d38` with engine `last-light/2.0.0`. It contains the literal source, parsed program, full verification report, and SHA-256 values for both stored sample artifacts and revision 004's actual Solid Shadows source. The source strings have not been edited.

The two stored samples were read from `src/server/reused-artifact.ts`. Solid Shadows was read from `../videos/liveforge/evidence/revision-005-baseline/solid-shadows.ts`, and its source hash was checked against `../videos/liveforge/REVISION-004-INDEX.json`. All three reports passed eight checks and simulated 7,290 ticks. The existing engine files were also hashed and preserved before implementation so the third report could be captured with the original engine after the source record was retrieved.

| Artifact                   | Source SHA-256                                                     | Canonical program SHA-256                                          | Canonical report SHA-256                                           |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Settled Prop Shadow Bridge | `5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc` | `e2c587406b146dbed283c9bcec7fb620d377970a07211bc23ec907ef35956a6c` | `67c33a6b91ec388e7c5fe4043d0ece46316fe62523da86b1cdf5bea6e72b2889` |
| Brass Prop Step            | `94c0c2a1b2ac51ac2b88726bdf4b9bf2548466b4354b6e6e6651b320b190de4d` | `2a93f7338748f89ac78e74e76cd6d56777e3a359d6e49018d412ad25defc1263` | `bda0713407339e221ac97742538806b88e2365c18838c77fcf596ad3beebd373` |
| Solid Shadows              | `1d201ac7150e0e0bef6ba1273c1ee1a11b681524386db14e610f413ce4b08779` | `11d5cfae5816930462ea2ab514dac61a1d01b88c00c0b1cd722a50913d00fbd6` | `e7462670009437af2eb7b68def5112b0bbe08b37b14ed55f8fcce8fa8c652efc` |

`tests/game-surface-motion-compat.test.ts` recompiles and validates every baseline source, then compares the serialized report byte for byte as well as checking its canonical hash. It also checks the stored sample source strings and stored hashes directly. The additional verifier scenarios are conditional on motion capabilities, keeping these existing reports unchanged.

The moving geometry used by `tests/game-surface-motion.test.ts` is an explicitly synthetic engine regression fixture. It is not a generated law, sample artifact, production proposal, or recorded gameplay evidence.

## Implementation verification

The final implementation passes type checking, **513 tests across 41 files**, the full formatting check, and the optimized Next.js build with **15 static page-generation tasks**. [Gate results](gates.json) bind the checked runtime files and build ID. Fifty new regressions cover schema bounds, signed travel, the absolute phase, 3,200-tick replay, refresh and expiration, fixed anchors with moving owners, props and dropped-ember carry, world clamps, multiple supports, checkpoint grants and tampering, saved continuation, rollback, and composition with both stored samples.

The continuous traversal regression starts the courier on the arrival ledge, observes a complete out-and-back, jumps onto the surface using normal inputs, stops horizontal input and rides through a complete cycle, then jumps onto the foundry ledge and reaches its checkpoint. There is no player repositioning after activation. The synthetic path leaves at least 50 world units to each ledge. This establishes the engine behavior needed for a generated law; natural-language fidelity and the final recorded take remain separate checks.

The verifier adds two checks only for programs that request motion: a long trajectory and saved-continuation scenario, and a grounded-rider probe. The rider probe reports the number of neutral supported ticks it could check; if candidate conditions prevent a stable neutral ride, its detail says so explicitly. All programs still run the existing held-input, ceiling, resource, replay and recovery checks. Programs without motion retain the original eight-check reports.

The wider [archive replay](archive-replay/verifier-replay.json) passes **20/20 stored single laws and 8/8 review stacks**. The [comparison](archive-replay/comparison.json) confirms that every source hash and complete record is byte-identical to the round-4 replay. Each provider set contributes two original-source stacks and two explicitly synthetic numeric stacks. This was an offline replay with no provider calls, revisions or source substitutions.

The engine version remains `last-light/2.0.0`. No stored sample was replaced, and there is no named moving-surface preset or example law in the generation contract. Real Twitch generation, production deployment and revision 005 film evidence are release-owner follow-up work.
