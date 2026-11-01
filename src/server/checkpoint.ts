import { z } from "zod";
import {
  ENGINE_VERSION,
  type GameCheckpoint,
  type RuleProgram,
  type Scalar,
  type PhysicsState,
} from "@/game/contracts";
import { assertWorld, GameEngine, AUTHORED_ENTITIES } from "@/game/core";
import {
  MAX_SPAWNED_ENTITIES,
  PHYSICS_LIMITS,
  defaultPhysics,
} from "@/game/runtime";
import { validateRuntimeRuleProgram } from "@/game/rules";
import { assert } from "./errors";
import { digest, hashData } from "./security";
const finite = z.number().finite();
const bounded = finite.min(-4000).max(4000);
const physics = z
  .object({
    gravityScale: finite.min(0.3).max(2),
    jumpStrength: finite.min(0.5).max(1.6),
    airJumps: finite.int().min(0).max(2),
    playerScale: finite.min(0.6).max(1.6),
    timeScale: finite.min(0.5).max(1.5),
    windX: finite.min(-0.18).max(0.18),
  })
  .strict();
const input = z
  .object({
    left: z.boolean(),
    right: z.boolean(),
    jump: z.boolean(),
    interact: z.boolean(),
    reset: z.boolean(),
    drop: z.boolean().optional(),
    pressed: z
      .object({
        jump: z.boolean(),
        interact: z.boolean(),
        reset: z.boolean(),
        drop: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const entity = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(["player", "prop", "lantern", "ember"]),
    x: bounded,
    y: finite.min(-2000).max(2000),
    w: finite.positive().max(100),
    h: finite.positive().max(150),
    vx: finite.min(-20.01).max(20.01),
    vy: finite.min(-20.01).max(20.01),
    grounded: z.boolean(),
    stationaryTicks: finite.int().min(0).max(10000),
    timer: finite.int().min(0).max(600),
    friction: finite.min(0.65).max(0.99),
    bounce: finite.min(0).max(0.95),
    previousX: bounded,
    previousY: finite.min(-2000).max(2000),
    wasGrounded: z.boolean(),
    airJumpsUsed: finite.int().min(0).max(2),
    baseW: finite.positive().max(100),
    baseH: finite.positive().max(150),
    physics,
    expires: finite.int().nonnegative().optional(),
    spawnRule: z.string().min(1).max(44).optional(),
    cue: z
      .object({
        color: z.enum(["mint", "coral", "brass"]),
        intensity: finite.min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
const modifier = z
  .object({
    id: z.string().min(1).max(200),
    entityId: z.string().min(1).max(200),
    expires: finite.int().nonnegative(),
    physics: physics.partial().optional(),
    material: z
      .object({
        friction: finite.min(0.65).max(0.99),
        bounce: finite.min(0).max(0.95),
      })
      .strict()
      .optional(),
  })
  .strict();
const surface = z
  .object({
    id: z.string().min(1).max(240),
    x: bounded,
    y: bounded,
    w: finite.positive().max(3000),
    h: finite.positive().max(200),
    expires: finite.int().min(0).max(Number.MAX_SAFE_INTEGER),
    solid: z.boolean(),
    generated: z.boolean().optional(),
    owner: z.string().min(1).max(200).optional(),
  })
  .strict();
export const checkpointSchema = z
  .object({
    snapshot: z
      .object({
        version: z.literal(ENGINE_VERSION),
        tick: finite.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        entities: z.array(entity).min(8).max(64),
        surfaces: z.array(surface).min(9).max(58),
        checkpoint: finite.int().min(0).max(2),
        progress: finite.min(0).max(1),
        ember: z.literal(true),
        emberCarried: z.boolean(),
        input,
        previousInput: input,
        modifiers: z.array(modifier).max(48),
        completed: z.boolean(),
        deaths: finite.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        activeHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        ruleName: z.string().min(1).max(70).nullable(),
        interaction: z.string().max(350),
        lanternOn: z.boolean(),
        encounters: z
          .object({ counterweight: z.boolean(), guardian: z.boolean() })
          .strict(),
      })
      .strict(),
    program: z.unknown(),
    artifactHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
/** Validate all serialized fields before calling the trusted engine; no candidate code executes. */
export function parseCheckpoint(
  value: unknown,
  expected: { program: RuleProgram | null; sourceHash: string | null },
): GameCheckpoint {
  assert(
    JSON.stringify(value)?.length <= 256_000,
    413,
    "checkpoint_budget",
    "Checkpoint is too large.",
  );
  const parsed = checkpointSchema.safeParse(value);
  assert(
    parsed.success,
    400,
    "checkpoint_invariant",
    "Checkpoint contains invalid or out-of-bounds world fields.",
  );
  const cp = parsed.data as GameCheckpoint;
  const entities = cp.snapshot.entities;
  assert(
    AUTHORED_ENTITIES.every(
      (original, index) =>
        entities[index]?.id === original.id &&
        entities[index]?.kind === original.kind &&
        entities[index]?.baseW === original.baseW &&
        entities[index]?.baseH === original.baseH,
    ),
    400,
    "checkpoint_identity",
    "Checkpoint must preserve every authored identity and the unique protected ember.",
  );
  assert(
    new Set(cp.snapshot.surfaces.map((s) => s.id)).size ===
      cp.snapshot.surfaces.length,
    400,
    "checkpoint_surface",
    "Checkpoint surface identifiers must be unique.",
  );
  assert(
    cp.artifactHash === expected.sourceHash &&
      cp.snapshot.activeHash === expected.sourceHash,
    409,
    "checkpoint_rule_mismatch",
    "Checkpoint must describe the expected exact rule artifact.",
  );
  if (cp.program !== null) validateRuntimeRuleProgram(cp.program);
  assert(
    hashData(cp.program) === hashData(expected.program),
    409,
    "checkpoint_program_mismatch",
    "Checkpoint program differs from the verified artifact.",
  );
  assert(
    cp.snapshot.ruleName === (expected.program?.name ?? null),
    409,
    "checkpoint_rule_mismatch",
    "Checkpoint rule identity does not match the verified artifact.",
  );
  const authoredIds = new Set(AUTHORED_ENTITIES.map((e) => e.id));
  assert(
    new Set(entities.map((e) => e.id)).size === entities.length &&
      entities.every((e) =>
        authoredIds.has(e.id) ? !e.spawnRule : Boolean(e.spawnRule),
      ) &&
      entities.filter((e) => e.spawnRule).length <= MAX_SPAWNED_ENTITIES,
    400,
    "checkpoint_grant",
    "Every entity must be authored or an authorized bounded spawn.",
  );
  for (const spawned of entities.filter((e) => e.spawnRule)) {
    const parts = spawned.id.split(":"),
      rule = cp.program?.rules.find((r) => r.id === spawned.spawnRule),
      action = rule?.actions[Number(parts[3])];
    assert(
      spawned.kind === "prop" &&
        spawned.baseW === 28 &&
        spawned.baseH === 40 &&
        entities.filter((e) => e.spawnRule === spawned.spawnRule).length <=
          // Runtime counts all spawns for a clause together. The largest action
          // cap is its maximum reachable count; individual creation history is not replayed.
          Math.max(
            0,
            ...(rule?.actions.map((a) =>
              a.type === "spawnProp" ? a.maxCount : 0,
            ) ?? []),
          ) &&
        parts.length === 5 &&
        parts[0] === "spawn" &&
        parts[1] === spawned.spawnRule &&
        authoredIds.has(parts[2]) &&
        rule?.each === AUTHORED_ENTITIES.find((e) => e.id === parts[2])?.kind &&
        Number.isSafeInteger(Number(parts[4])) &&
        Number(parts[4]) >= 0 &&
        Number(parts[4]) <= cp.snapshot.tick &&
        action?.type === "spawnProp" &&
        spawned.expires === Number(parts[4]) + action.lifetime - 1,
      400,
      "checkpoint_grant",
      "Spawned identity or lifetime is not authorized by the exact active program.",
    );
  }
  if (!cp.program)
    assert(
      !entities.some((e) => e.spawnRule) &&
        !cp.snapshot.modifiers.length &&
        !cp.snapshot.surfaces.some((s) => s.generated),
      400,
      "checkpoint_generated_state",
      "Baseline checkpoint cannot contain generated effects.",
    );
  const tick = cp.snapshot.tick;
  const grant = (id: string, owner?: string) => {
    const rule = cp.program?.rules.find((r) => id.startsWith(r.id + ":"));
    assert(rule, 400, "checkpoint_grant", "Generated state has no rule grant.");
    const tail = id.slice(rule.id.length + 1);
    let sourceId: string, index: number, created: number | undefined;
    if (owner) {
      const prefix = owner + ":";
      assert(
        tail.startsWith(prefix),
        400,
        "checkpoint_grant",
        "Surface owner differs from its rule identity.",
      );
      const parts = tail.slice(prefix.length).split(":");
      assert(
        parts.length <= 2 && parts.every((x) => /^\d+$/.test(x)),
        400,
        "checkpoint_grant",
        "Invalid generated surface identity.",
      );
      sourceId = owner;
      index = Number(parts[0]);
      if (parts[1] !== undefined) created = Number(parts[1]);
    } else {
      const split = tail.lastIndexOf(":");
      assert(
        split > 0 && /^\d+$/.test(tail.slice(split + 1)),
        400,
        "checkpoint_grant",
        "Invalid modifier action identity.",
      );
      sourceId = tail.slice(0, split);
      index = Number(tail.slice(split + 1));
    }
    const source = entities.find((e) => e.id === sourceId),
      action = rule.actions[index];
    assert(
      source &&
        source.kind === rule.each &&
        action &&
        Number.isSafeInteger(index),
      400,
      "checkpoint_grant",
      "Generated state has no matching source entity or action.",
    );
    return { source, action, rule, created };
  };
  for (const surface of cp.snapshot.surfaces.filter((s) => s.generated)) {
    assert(
      surface.owner,
      400,
      "checkpoint_grant",
      "A generated surface requires its source owner.",
    );
    const { source, action, created } = grant(surface.id, surface.owner);
    assert(
      action.type === "projectShadow" ||
        action.type === "createSurface" ||
        action.type === "spawnPlatform",
      400,
      "checkpoint_grant",
      "This action grants no surface creation.",
    );
    assert(
      surface.solid === action.solid &&
        surface.expires >= tick &&
        surface.expires <= tick + action.lifetime - 1,
      400,
      "checkpoint_grant",
      "Surface collision or lifetime exceeds its action grant.",
    );
    const born = surface.expires - action.lifetime + 1,
      age = tick - born;
    assert(
      Number.isSafeInteger(born) && born >= 0 && age >= 0,
      400,
      "checkpoint_grant",
      "Surface has an invalid creation window.",
    );
    const travel = 30 * (age + 1) + source.baseW * 0.5,
      originX = source.previousX,
      foot = source.previousY + source.h;
    if (action.type === "projectShadow")
      assert(
        surface.x >= originX + source.w / 2 - action.maxLength - travel &&
          surface.x + surface.w <=
            originX + source.w / 2 + action.maxLength + travel &&
          Math.abs(surface.y - foot) <= travel,
        400,
        "checkpoint_grant",
        "Shadow placement exceeds its bounded owner history.",
      );
    else
      assert(
        Math.abs(surface.x - (originX + action.offsetX)) <= travel &&
          Math.abs(surface.y - (foot + action.offsetY)) <= travel,
        400,
        "checkpoint_grant",
        "Surface placement exceeds its bounded relative grant.",
      );
    if (action.type === "projectShadow")
      assert(
        created === undefined &&
          surface.h === action.thickness &&
          surface.w <= action.maxLength,
        400,
        "checkpoint_grant",
        "Shadow geometry exceeds its action grant.",
      );
    else {
      assert(
        surface.w === action.width && surface.h === 9,
        400,
        "checkpoint_grant",
        "Platform dimensions differ from their action grant.",
      );
      if (action.type === "spawnPlatform")
        assert(
          created !== undefined &&
            Number.isSafeInteger(created) &&
            created <= tick &&
            created >= 0 &&
            surface.expires === created + action.lifetime - 1,
          400,
          "checkpoint_grant",
          "Spawned platform lifetime differs from its creation event.",
        );
      else
        assert(
          created === undefined,
          400,
          "checkpoint_grant",
          "Stable surface has a forged spawn identity.",
        );
    }
  }
  assert(
    new Set(cp.snapshot.modifiers.map((m) => m.id)).size ===
      cp.snapshot.modifiers.length,
    400,
    "checkpoint_modifier",
    "Duplicate timed modifier identity.",
  );
  for (const modifier of cp.snapshot.modifiers) {
    const { source, action } = grant(modifier.id);
    assert(
      action.type === "physics" || action.type === "material",
      400,
      "checkpoint_grant",
      "This action grants no timed physics or material effect.",
    );
    assert(
      modifier.entityId ===
        (action.target === "player" ? entities[0].id : source.id) &&
        modifier.expires >= tick &&
        modifier.expires <= tick + (action.lifetime ?? 1) - 1,
      400,
      "checkpoint_grant",
      "Modifier target or lifetime exceeds its action grant.",
    );
    if (action.type === "material")
      assert(
        !modifier.physics &&
          modifier.material?.friction === action.friction &&
          modifier.material?.bounce === action.bounce,
        400,
        "checkpoint_grant",
        "Material state differs from its exact action grant.",
      );
    else {
      assert(
        modifier.physics && !modifier.material,
        400,
        "checkpoint_grant",
        "Physics grant cannot carry a material effect.",
      );
      const keys = Object.keys(PHYSICS_LIMITS) as (keyof PhysicsState)[];
      assert(
        Object.keys(modifier.physics).length ===
          keys.filter((k) => action[k] !== undefined).length,
        400,
        "checkpoint_grant",
        "Modifier contains absent or missing physics capabilities.",
      );
      for (const key of keys) {
        const value = modifier.physics[key],
          expression = action[key];
        if (expression === undefined) {
          assert(
            value === undefined,
            400,
            "checkpoint_grant",
            "Absent physics capability injected.",
          );
          continue;
        }
        assert(
          value !== undefined,
          400,
          "checkpoint_grant",
          "Granted physics field is missing.",
        );
        const [lo, hi] = expressionRange(expression, tick),
          limits = PHYSICS_LIMITS[key],
          clamp = (n: number) => {
            const bounded = Math.max(limits[0], Math.min(limits[1], n));
            return key === "airJumps" ? Math.floor(bounded) : bounded;
          };
        assert(
          value >= clamp(lo) - 1e-9 && value <= clamp(hi) + 1e-9,
          400,
          "checkpoint_grant",
          "Physics value exceeds its bounded expression grant.",
        );
      }
    }
  }
  for (const entity of entities) {
    const physics = defaultPhysics();
    let friction = 0.82,
      bounce = 0;
    for (const modifier of cp.snapshot.modifiers)
      if (modifier.entityId === entity.id) {
        if (modifier.physics) Object.assign(physics, modifier.physics);
        if (modifier.material) {
          friction = modifier.material.friction;
          bounce = modifier.material.bounce;
        }
      }
    assert(
      hashData(entity.physics) === hashData(physics) &&
        entity.friction === friction &&
        entity.bounce === bounce,
      400,
      "checkpoint_grant",
      "Entity properties contain an ungranted modifier.",
    );
  }
  try {
    assertWorld(cp.snapshot);
    const engine = new GameEngine();
    engine.restore(cp);
  } catch {
    assert(
      false,
      400,
      "checkpoint_invariant",
      "Checkpoint could not restore a valid protected game world.",
    );
  }
  return structuredClone(cp);
}

/** Conservative interval of a source expression; historical field samples require replay, not a client assertion. */
function expressionRange(value: Scalar, tick: number): [number, number] {
  if (typeof value === "number") return [value, value];
  if ("field" in value) {
    switch (value.field) {
      case "grounded":
      case "inputJump":
      case "inputInteract":
      case "emberCarried":
        return [0, 1];
      case "airJumpsUsed":
        return [0, 2];
      case "speed":
        return [0, Math.hypot(20, 20)];
      case "vx":
      case "vy":
        return [-20, 20];
      case "timer":
        return [0, 600];
      case "stationaryTicks":
      case "distanceToPlayer":
      case "distanceToLantern":
        return [0, 10000];
      case "tick":
        return [0, tick];
      default:
        return [-4000, 4000];
    }
  }
  const cap = (n: number) => Math.max(-10000, Math.min(10000, n));
  if ("clamp" in value) {
    const [a, b] = expressionRange(value.clamp.value, tick),
      bound = (n: number) =>
        Math.max(value.clamp.min, Math.min(value.clamp.max, n));
    return [bound(a), bound(b)];
  }
  const items =
      "add" in value
        ? value.add
        : "mul" in value
          ? value.mul
          : "min" in value
            ? value.min
            : value.max,
    ranges = items.map((item) => expressionRange(item, tick));
  if ("add" in value)
    return [
      cap(ranges.reduce((a, b) => a + b[0], 0)),
      cap(ranges.reduce((a, b) => a + b[1], 0)),
    ];
  if ("min" in value)
    return [
      Math.min(...ranges.map((x) => x[0])),
      Math.min(...ranges.map((x) => x[1])),
    ];
  if ("max" in value)
    return [
      Math.max(...ranges.map((x) => x[0])),
      Math.max(...ranges.map((x) => x[1])),
    ];
  let range: [number, number] = [1, 1];
  for (const [a, b] of ranges) {
    const xs = [range[0] * a, range[0] * b, range[1] * a, range[1] * b];
    range = [Math.min(...xs), Math.max(...xs)];
  }
  return [cap(range[0]), cap(range[1])];
}
