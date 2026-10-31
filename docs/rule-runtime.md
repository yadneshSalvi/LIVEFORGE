# The Last Light rule runtime — engine 2

LIVEFORGE generates a `RuleProgram` as JSON or a TypeScript-shaped literal (`export default { ... } satisfies RuleModule`). The compiler parses data into a strict bounded schema. Generated JavaScript is never executed: functions, imports, getters, loops, spreads and executable expressions are outside the grammar. Arithmetic is represented by validated data nodes. Infinite loops are rejected as syntax rather than run and interrupted.

A dedicated Web Worker owns the fixed 60 Hz simulation. Canvas2D renders original suspended-foundry artwork from snapshots; React does not own entity physics. This deliberately replaces the planning document's proposed QuickJS/Phaser implementation with a capability language and original renderer. It is not arbitrary game-code generation.

## Source language

Source programs retain literal `version: 1`; the compatible engine is `last-light/2.0.0`. Source has one to eight clauses. A clause queries `player`, `prop`, `lantern` or `ember`, combines `all`/`any`/`not` comparisons, and performs up to six actions. Its optional trigger is `tick` (default), `jump`, `land`, `interact`, `enterZone` or `touch`. Zone entry requires a bounded rectangle. Touch fires on contact entry, and land fires on the tick after landing; remaining in contact or standing on a floor does not repeatedly emit those events. Jump means an allowed jump press. Interact means a rising press near an entity (the courier always receives its own press).

Scalar values can read position, velocity, speed, stillness, grounded state, distance to courier/nearest enabled lantern, tick, timer, held jump/interact input, carried-ember state and extra-jump usage. Validated `add`, `mul`, `min`, `max` arrays and `clamp` objects allow arithmetic composition. Intermediate arithmetic saturates to ±10,000; division and dynamic code are unavailable. Expression evaluation has an independent depth bound.

Actions are generic capabilities:

- `physics` changes gravity scale (0.3–2), jump strength (0.5–1.6), extra air jumps (0–2), courier scale (0.6–1.6), local integration speed (0.5–1.5), or horizontal wind (±0.18). Conditions can restrict effects to zones or entities. Scaling preserves the feet and refuses growth through solid geometry. Local time scale changes entity integration, not simulation ticks, TTLs or the authority heartbeat.
- `material` changes friction (0.65–0.99) and restitution (0–0.95). Physics and material actions support bounded lifetimes, allowing a touch event to make a crate bouncy for exactly 180 ticks (three seconds). When effects expire, ordinary properties return. Later matching modifiers override earlier matching modifiers.
- `projectShadow` projects a silhouette from the nearest enabled lantern to the entity's feet plane and creates a temporary surface. The generated program supplies the relationship between stillness and collision. There is no `shadowBridge` preset, and cosmetic baseline shadows never collide.
- `createSurface` refreshes a bounded surface relative to an entity. `spawnPlatform` creates a distinct temporary surface at a trigger/tick, with a per-clause cap. `spawnProp` creates a temporary 28×40 crate with a cooldown and per-clause cap. Spawned props cannot recursively spawn more props. Capacity skips further creation; aggregate command or surface-budget violations reject the copied batch.
- `impulse` adds components clamped to ±2; total velocity is capped at ±20. `cue` applies approved visual emphasis, and `timer` sets a per-entity countdown.

Constant physics and impulse values outside their capability limits reject compilation; arithmetic results saturate to the action's bounds. All numbers must be finite. The complete exact API is exported as `RULE_API_DOCUMENTATION` for the trusted generation coordinator.

## One world, three ordered laws

The world contains a courier, three authored movable crates, three lanterns, and exactly one protected physical ember. A/D or arrows move; Space jumps; E moves a nearby crate, toggles lanterns or operates the authored Counterweight Hall/Warden encounters; Q drops or picks up the nearby ember; R recovers at the most recent checkpoint. Dropped ember physics can bounce, while pickup resumes ordinary carried behavior. Generated actions cannot drop, pick up, steal, delete or duplicate the ember. Finishing the objective requires carrying it. Falling recovers the protected objective.

`composeRulePrograms` accepts one to three strict original programs. Two or three produce deterministic namespaced clause IDs and `composition.members` containing the ordered originals. `validateRuntimeRuleProgram` revalidates each original, rebuilds the entire derived program, and compares it with the supplied IR. A composition marker cannot authorize arbitrary extra rules, nested compositions or modified derived actions. Source compilation never accepts composition metadata.

The combined runtime has up to 24 clauses. Laws execute in retained order; later matching property modifiers take precedence. They share the same global command, entity, temporary-surface and modifier limits. Individual verification is insufficient: `verifyRuleComposition` simulates the actual combined program. A combined command flood can therefore fail even when all individual members pass. Approval and artifact hashing are server responsibilities and must bind the ordered candidate identities, engine version, combined program and preview context. An engine-1 save is never silently restored as engine 2; the backend provides explicit upgrade and fresh approval while preserving history.

## Limits and recovery

Each source is limited to 24,000 characters, 1,600 tree nodes, depth 16, eight clauses, six actions per clause and six children per compound condition. Scalar evaluation depth is limited to 12; composition data is bounded to three such sources and their deterministic expansion. A tick queries at most 32 entities and applies at most 128 commands across the entire stack. The world holds at most 12 temporary props (20 total entities), 48 temporary surfaces and 48 timed modifiers. Creation and modifier lifetimes are 1–600 ticks. A spawn clause permits at most four props; a platform clause at most eight surfaces. Shadow projection length is at most 480 world units. All commands operate against copied state before commitment and resource validation.

Strict checkpoints preserve all eight authored identities, their base sizes, the unique ember, immutable baseline route geometry, bounded spawned identities and lifetimes, previous positions/grounded/input state, and timed modifiers. The checkpoint parser validates the exact runtime program and artifact identity. Saves round-trip through JSON and continue deterministically. No runtime capability exposes the DOM, files, network, process state, provider secrets, progress mutation, teleportation or checkpoint editing.

The worker sends a wall-time heartbeat every 20 seconds even while paused. Only the active host consumes it for lease renewal. Runtime fault messages capture the faulted artifact and tick before local rollback; command errors have a separate protocol and do not retire an active law. The viewport exposes pause, reset, exact checkpoint/restore, activation, rollback and immediate heartbeat requests. Runtime faults pause the authority and restore the prior validated checkpoint. Retiring a restored law cleans its temporary entities, surfaces and modifiers.

## What verification establishes

The trusted verifier checks the strict source/derived IR, runs baseline comparisons across idle, movement, extra-jump, interaction and dropped-ember scenarios, requires an actual effect, checks bounded invariants, compares deterministic replays, restores an exact activation checkpoint, and checks JSON continuation and cleanup. Reports contain observed simulated-tick and effect counts. They do not prove global solvability or natural-language fidelity.

`tests/runtime-engine2.test.ts` contains explicitly synthetic comparative experiments for all ten frozen intent requests and held-out combinations. Additional tests cover exact previously generated source, aggregate flooding, forged composition, bounds, lifetime expiry, deterministic spawning, checkpoint corruption and protected identities. These are engine tests, not claims that fresh Codex generations or browser intent checks have succeeded. The immutable evaluation and real provider/browser results are recorded separately by the release owner.

`PRACTICE_RULE_SOURCE` is deliberately prewritten and must remain labeled as practice. Previously generated artifacts retain their original provenance; a candidate preview runs its exact compiled behavior. All scene art is original procedural Canvas2D work in `src/game/renderer.ts`.
