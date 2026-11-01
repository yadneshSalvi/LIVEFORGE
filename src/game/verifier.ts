import {
  ENGINE_VERSION,
  EMPTY_INPUT,
  type RuleProgram,
  type VerificationCheck,
  type VerificationReport,
} from "./contracts";
import { GameEngine, assertWorld } from "./core";
import { emptyEffects } from "./runtime";
import {
  validateRuleProgram,
  validateRuntimeRuleProgram,
  composeRulePrograms,
} from "./rules";
export function verifyRuleProgram(input: RuleProgram): VerificationReport {
  return verify(input, false);
}
export function verifyRuleComposition(
  programs: RuleProgram[],
): VerificationReport {
  try {
    return verify(composeRulePrograms(programs), true);
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown): VerificationReport {
  return {
    passed: false,
    engineVersion: ENGINE_VERSION,
    checks: [
      {
        name: "Bounded capability schema",
        passed: false,
        detail: error instanceof Error ? error.message : "Invalid program",
      },
    ],
    ticksSimulated: 0,
    summary: "Candidate rejected before simulation.",
    effects: emptyEffects(),
  };
}
/** Trusted suite runs the complete ordered program, including shared global resource budgets. */
function verify(input: RuleProgram, composition: boolean): VerificationReport {
  const checks: VerificationCheck[] = [];
  let ticksSimulated = 0,
    observable = false;
  const effects = emptyEffects();
  const engines: GameEngine[] = [];
  const makeEngine = (recordEffects = true) => {
    const engine = new GameEngine();
    if (recordEffects) engines.push(engine);
    return engine;
  };
  let program: RuleProgram;
  try {
    program = composition
      ? validateRuntimeRuleProgram(input)
      : validateRuleProgram(input);
    checks.push({
      name: "Bounded capability schema",
      passed: true,
      detail:
        "Strict source members, derived composition, finite expressions and aggregate limits checked.",
    });
  } catch (error) {
    return failure(error);
  }
  const run = (name: string, fn: () => void) => {
    try {
      fn();
      checks.push({
        name,
        passed: true,
        detail: "Trusted engine assertions passed.",
      });
    } catch (error) {
      checks.push({
        name,
        passed: false,
        detail: error instanceof Error ? error.message : "Simulation failed",
      });
    }
  };
  const assertDiagnostics = (engine: GameEngine) => {
    const saturated = Object.entries(engine.diagnostics).filter(
      ([key, count]) =>
        count > 0 &&
        !["worldBoundsRecoveries", "surfacesSkipped", "spawnsSkipped"].includes(
          key,
        ),
    );
    if (saturated.length)
      throw new Error(
        `Runtime safety limit reached: ${saturated.map(([key, count]) => `${key}=${count}`).join(", ")}.`,
      );
  };
  // Brief ceiling contact is ordinary play; a law that keeps any entity pinned
  // to the clamp is a runaway in every scenario, not only under held input.
  const ceilingRuns = new WeakMap<GameEngine, number>();
  const assertSafety = (engine: GameEngine) => {
    assertDiagnostics(engine);
    const ceilingTicks = engine.world.entities.some((entity) => entity.y <= -80)
      ? (ceilingRuns.get(engine) ?? 0) + 1
      : 0;
    ceilingRuns.set(engine, ceilingTicks);
    if (ceilingTicks > 30)
      throw new Error(
        "Runtime safety limit reached: worldBoundsRecoveries sustained ceiling contact for more than 30 ticks.",
      );
  };
  const hasPhysics = program.rules.some((r) =>
    r.actions.some((a) => a.type === "physics"),
  );
  const comparisonMembers = (program.composition?.members ?? [program])
    .map((member) => ({
      ...member,
      rules: member.rules
        .map((rule) => ({
          ...rule,
          actions: rule.actions.filter((action) => action.type !== "physics"),
        }))
        .filter((rule) => rule.actions.length > 0),
    }))
    .filter((member) => member.rules.length > 0);
  const physicsBaseline = comparisonMembers.length
    ? composeRulePrograms(comparisonMembers)
    : null;
  let physicsNoticeable = false;
  run("Actual effects and protected invariants", () => {
    for (let scenario = 0; scenario < 5; scenario++) {
      const e = makeEngine(),
        baseline = makeEngine(false);
      e.world.entities[0].x = [170, 510, 1080, 1870, 400][scenario];
      baseline.world.entities[0].x = e.world.entities[0].x;
      e.activate(program, "verification-only");
      for (let t = 0; t < 420; t++) {
        const input = {
          ...EMPTY_INPUT,
          right: scenario > 0 && t % 180 < 125,
          left: scenario === 3 && t % 180 >= 125,
          jump: scenario > 1 && (t % 48 === 0 || t % 48 === 12),
          interact: scenario === 1 && t % 60 < 20,
          drop: scenario === 4 && (t === 15 || t === 100),
        };
        e.step(input);
        baseline.step(input);
        ticksSimulated += 2;
        assertWorld(e.world);
        assertSafety(e);
        if (
          e.world.entities.length !== baseline.world.entities.length ||
          e.world.surfaces.some((surface) => surface.generated) ||
          e.world.entities.some((entity, i) => {
            const base = baseline.world.entities[i];
            return (
              !base ||
              Boolean(entity.cue && entity.cue.intensity > 0) ||
              [
                "friction",
                "bounce",
                "timer",
                ...(!hasPhysics ? ["x", "y", "vx", "vy", "w", "h"] : []),
              ].some((key) => entity[key as "x"] !== base[key as "x"])
            );
          })
        )
          observable = true;
      }
    }
  });
  run("Controlled gameplay comparison including airborne jumps", () => {
    // Without physics actions the comparison program is identical; actual
    // effects and the safety/replay scenarios still exercise those laws.
    if (!hasPhysics) return;
    // Broad authored floors and a bounded run avoid route/death discontinuities
    // amplifying a negligible physics change into an apparent gameplay effect.
    for (const start of [170, 400, 510, 1080, 1870]) {
      for (let scenario = 0; scenario < 10; scenario++) {
        const e = makeEngine(),
          baseline = makeEngine(false);
        e.world.entities[0].x = baseline.world.entities[0].x = start;
        e.activate(program, "controlled-verification");
        if (physicsBaseline)
          baseline.activate(physicsBaseline, "controlled-without-physics");
        // Only late-onset scenarios need the longer horizon; the short
        // comparisons keep tiny differences from accumulating into false effects.
        for (let t = 0; t < (scenario >= 7 ? 420 : 150); t++) {
          const input = {
            ...EMPTY_INPUT,
            jump:
              (scenario === 1 ||
                scenario === 2 ||
                scenario === 4 ||
                scenario === 5 ||
                scenario === 7 ||
                scenario === 8) &&
              (t === (scenario === 4 ? 20 : scenario >= 7 ? 320 : 0) ||
                ((scenario === 2 || scenario === 5) && t === 12) ||
                (scenario === 8 && t === 332)),
            drop: (scenario === 6 && t === 20) || (scenario === 9 && t === 320),
            interact: scenario === 3 || scenario === 5,
            right: scenario === 4 && t < 30,
          };
          e.step(input);
          baseline.step(input);
          ticksSimulated += 2;
          assertSafety(e);
          // Stop scoring as soon as either simulation recovers or leaves its
          // original authored floor; safety coverage continues in other runs.
          const onFloor = (engine: GameEngine) => {
            const player = engine.world.entities[0];
            return engine.world.surfaces.some(
              (surface) =>
                !surface.generated &&
                player.x >= surface.x &&
                player.x + player.w <= surface.x + surface.w &&
                surface.y === 448,
            );
          };
          if (
            e.world.deaths ||
            baseline.world.deaths ||
            !onFloor(e) ||
            !onFloor(baseline)
          )
            break;
          if (
            e.world.entities.some((entity) => {
              const base = baseline.world.entities.find(
                (x) => x.id === entity.id,
              );
              return (
                base &&
                ["x", "y", "w", "h"].some(
                  (key) => Math.abs(entity[key as "x"] - base[key as "x"]) > 4,
                )
              );
            })
          )
            physicsNoticeable = true;
        }
      }
    }
  });
  run("Held input stress and soft runtime budgets", () => {
    for (const held of ["jump", "interact", "left", "right"] as const) {
      const e = makeEngine();
      e.activate(program, "held-verification");
      for (let t = 0; t < 600; t++) {
        e.step({ ...EMPTY_INPUT, [held]: true });
        ticksSimulated++;
        assertWorld(e.world);
        assertSafety(e);
      }
    }
  });
  run("Observable behavior in trusted scenarios", () => {
    if (
      (hasPhysics && !physicsNoticeable) ||
      (!observable && !physicsNoticeable)
    )
      throw new Error("No noticeable effect on play.");
  });
  run("Deterministic input replay", () => {
    const a = makeEngine(),
      b = makeEngine();
    a.activate(program, "same-version");
    b.activate(program, "same-version");
    for (let t = 0; t < 240; t++) {
      const input = {
        ...EMPTY_INPUT,
        right: t % 120 < 80,
        jump: t % 45 === 0,
        interact: t % 65 === 0,
        drop: t === 70 || t === 100,
      };
      a.step(input);
      b.step(input);
      assertSafety(a);
      assertSafety(b);
      ticksSimulated += 2;
    }
    if (JSON.stringify(a.checkpoint()) !== JSON.stringify(b.checkpoint()))
      throw new Error("Replay diverged");
  });
  run("Activation rollback preserves exact world", () => {
    const e = makeEngine();
    for (let t = 0; t < 30; t++) e.step({ ...EMPTY_INPUT, right: true });
    const before = e.checkpoint();
    e.activate(program, "rollback-version");
    for (let t = 0; t < 90; t++) {
      e.step();
      assertSafety(e);
      ticksSimulated++;
    }
    e.rollback();
    if (JSON.stringify(e.checkpoint()) !== JSON.stringify(before))
      throw new Error("Rollback changed protected state");
  });
  run("JSON checkpoint continuation and temporary cleanup", () => {
    const e = makeEngine();
    e.activate(program, "roundtrip-version");
    for (let t = 0; t < 40; t++) {
      e.step();
      assertSafety(e);
      ticksSimulated++;
    }
    const cp = JSON.parse(JSON.stringify(e.checkpoint())),
      other = makeEngine();
    other.restore(cp);
    for (let t = 0; t < 40; t++) {
      e.step({ ...EMPTY_INPUT, right: true });
      other.step({ ...EMPTY_INPUT, right: true });
      assertSafety(e);
      assertSafety(other);
      ticksSimulated += 2;
    }
    if (JSON.stringify(e.checkpoint()) !== JSON.stringify(other.checkpoint()))
      throw new Error("Serialized continuation diverged");
    other.rollback();
    if (
      other.world.surfaces.some((s) => s.generated) ||
      other.world.entities.some((x) => x.spawnRule) ||
      other.world.modifiers.length
    )
      throw new Error("Retired program left generated state");
  });
  for (const engine of engines)
    for (const key of Object.keys(effects) as (keyof typeof effects)[])
      effects[key] += engine.effects[key];
  const passed = checks.every((c) => c.passed);
  return {
    passed,
    engineVersion: ENGINE_VERSION,
    checks,
    ticksSimulated,
    summary: passed
      ? "Passed actual combined simulation, deterministic replay, rollback and JSON continuation. Intent and global solvability still require review."
      : "Candidate or composition failed trusted verification; activation is blocked.",
    effects,
  };
}
