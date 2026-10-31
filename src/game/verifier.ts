import {
  ENGINE_VERSION,
  EMPTY_INPUT,
  type RuleProgram,
  type VerificationCheck,
  type VerificationReport,
} from "./contracts";
import { GameEngine, assertWorld } from "./core";
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
    effects: { surfacesCreated: 0, impulsesApplied: 0, cuesApplied: 0 },
  };
}
/** Trusted suite runs the complete ordered program, including shared global resource budgets. */
function verify(input: RuleProgram, composition: boolean): VerificationReport {
  const checks: VerificationCheck[] = [];
  let ticksSimulated = 0,
    observable = false;
  const effects = { surfacesCreated: 0, impulsesApplied: 0, cuesApplied: 0 };
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
  run("Actual effects and protected invariants", () => {
    for (let scenario = 0; scenario < 5; scenario++) {
      const e = new GameEngine(),
        baseline = new GameEngine();
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
        if (
          e.world.entities.length !== baseline.world.entities.length ||
          e.world.surfaces.some((s) => s.generated) ||
          e.world.entities.some((x, i) => {
            const b = baseline.world.entities[i];
            return (
              !b ||
              Boolean(x.cue && x.cue.intensity > 0) ||
              [
                "x",
                "y",
                "vx",
                "vy",
                "w",
                "h",
                "friction",
                "bounce",
                "timer",
              ].some((k) => x[k as "x"] !== b[k as "x"]) ||
              JSON.stringify(x.physics) !== JSON.stringify(b.physics)
            );
          })
        )
          observable = true;
      }
      for (const k of Object.keys(effects) as (keyof typeof effects)[])
        effects[k] += e.effects[k];
    }
  });
  run("Observable behavior in trusted scenarios", () => {
    if (!observable)
      throw new Error(
        "No actual effect occurred across idle, traversal, touch, jump and dropped-ember scenarios.",
      );
  });
  run("Deterministic input replay", () => {
    const a = new GameEngine(),
      b = new GameEngine();
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
      ticksSimulated += 2;
    }
    if (JSON.stringify(a.checkpoint()) !== JSON.stringify(b.checkpoint()))
      throw new Error("Replay diverged");
  });
  run("Activation rollback preserves exact world", () => {
    const e = new GameEngine();
    for (let t = 0; t < 30; t++) e.step({ ...EMPTY_INPUT, right: true });
    const before = e.checkpoint();
    e.activate(program, "rollback-version");
    for (let t = 0; t < 90; t++) {
      e.step();
      ticksSimulated++;
    }
    e.rollback();
    if (JSON.stringify(e.checkpoint()) !== JSON.stringify(before))
      throw new Error("Rollback changed protected state");
  });
  run("JSON checkpoint continuation and temporary cleanup", () => {
    const e = new GameEngine();
    e.activate(program, "roundtrip-version");
    for (let t = 0; t < 40; t++) {
      e.step();
      ticksSimulated++;
    }
    const cp = JSON.parse(JSON.stringify(e.checkpoint())),
      other = new GameEngine();
    other.restore(cp);
    for (let t = 0; t < 40; t++) {
      e.step({ ...EMPTY_INPUT, right: true });
      other.step({ ...EMPTY_INPUT, right: true });
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
