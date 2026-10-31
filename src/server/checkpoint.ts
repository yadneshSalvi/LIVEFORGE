import { z } from "zod";
import {
  ENGINE_VERSION,
  type GameCheckpoint,
  type RuleProgram,
} from "@/game/contracts";
import { assertWorld, GameEngine } from "@/game/core";
import { validateRuleProgram } from "@/game/rules";
import { assert } from "./errors";
import { digest, hashData } from "./security";
const finite = z.number().finite();
const bounded = finite.min(-4000).max(4000);
const entity = z
  .object({
    id: z.string().min(1).max(40),
    kind: z.enum(["player", "prop", "lantern"]),
    x: bounded,
    y: finite.min(-2000).max(2000),
    w: finite.positive().max(100),
    h: finite.positive().max(150),
    vx: finite.min(-12.01).max(12.01),
    vy: finite.min(-12.01).max(12.01),
    grounded: z.boolean(),
    stationaryTicks: finite.int().min(0).max(10000),
    timer: finite.int().min(0).max(600),
    friction: finite.min(0.65).max(0.99),
    bounce: finite.min(0).max(0.6),
    cue: z
      .object({
        color: z.enum(["mint", "coral", "brass"]),
        intensity: finite.min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
const surface = z
  .object({
    id: z.string().min(1).max(150),
    x: bounded,
    y: bounded,
    w: finite.positive().max(3000),
    h: finite.positive().max(200),
    expires: finite.int().min(0).max(Number.MAX_SAFE_INTEGER),
    solid: z.boolean(),
    generated: z.boolean().optional(),
    owner: z.string().min(1).max(40).optional(),
  })
  .strict();
export const checkpointSchema = z
  .object({
    snapshot: z
      .object({
        version: z.literal(ENGINE_VERSION),
        tick: finite.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        entities: z.array(entity).length(3),
        surfaces: z.array(surface).min(9).max(58),
        checkpoint: finite.int().min(0).max(2),
        progress: finite.min(0).max(1),
        ember: z.literal(true),
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
    JSON.stringify(value)?.length <= 96_000,
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
    entities[0].id === "courier" &&
      entities[0].kind === "player" &&
      entities[1].id === "counterweight" &&
      entities[1].kind === "prop" &&
      entities[2].id === "lamp" &&
      entities[2].kind === "lantern",
    400,
    "checkpoint_identity",
    "Checkpoint must preserve the original courier, prop, and lantern identities.",
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
  if (cp.program !== null) validateRuleProgram(cp.program);
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
