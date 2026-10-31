import {
  ENGINE_VERSION,
  EMPTY_INPUT,
  type RuleProgram,
  type VerificationCheck,
  type VerificationReport,
} from "./contracts";
import { GameEngine, assertWorld } from "./core";
import { validateRuleProgram } from "./rules";
/** Trusted harness: candidate has no tests, callbacks, or access to this verifier. */
export function verifyRuleProgram(input: RuleProgram): VerificationReport {
  const checks: VerificationCheck[] = [];
  let ticksSimulated = 0;
  let observable = false;
  const effects = { surfacesCreated: 0, impulsesApplied: 0, cuesApplied: 0 };
  let program: RuleProgram;
  try {
    program = validateRuleProgram(input);
    checks.push({
      name: "Bounded capability schema",
      passed: true,
      detail:
        "Strict schema, finite numbers, unique IDs, depth, size and resource caps checked.",
    });
  } catch (error) {
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
      effects,
    };
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
    for (let scenario = 0; scenario < 4; scenario++) {
      const engine = new GameEngine(),
        baseline = new GameEngine();
      engine.world.entities[0].x = [170, 510, 1080, 1870][scenario];
      baseline.world.entities[0].x = engine.world.entities[0].x;
      engine.activate(program, "verification-only");
      for (let t = 0; t < 360; t++) {
        const input = {
          ...EMPTY_INPUT,
          right: scenario > 0 && t % 180 < 125,
          left: scenario === 3 && t % 180 >= 125,
          jump: scenario > 1 && t % 48 === 0,
          interact: scenario === 1 && t % 60 < 20,
        };
        engine.step(input);
        baseline.step(input);
        ticksSimulated += 2;
        assertWorld(engine.world);
        if (
          engine.world.surfaces.some((s) => s.generated) ||
          engine.world.entities.some((e, i) => {
            const original = baseline.world.entities[i];
            return (
              Boolean(e.cue && e.cue.intensity > 0) ||
              ["x", "y", "vx", "vy", "friction", "bounce", "timer"].some(
                (key) => e[key as "x"] !== original[key as "x"],
              )
            );
          })
        )
          observable = true;
      }
      for (const k of Object.keys(effects) as (keyof typeof effects)[])
        effects[k] += engine.effects[k];
    }
  });
  run("Observable behavior in trusted scenarios", () => {
    if (!observable)
      throw new Error(
        "No observable effect occurred across the trusted idle, prop-interaction, traversal and late-level fixtures. Revise the conditions or supported mechanic.",
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
      };
      a.step(input);
      b.step(input);
      ticksSimulated += 2;
    }
    if (JSON.stringify(a.checkpoint()) !== JSON.stringify(b.checkpoint()))
      throw new Error("Replay diverged");
  });
  run("Activation rollback preserves exact world", () => {
    const engine = new GameEngine();
    for (let t = 0; t < 30; t++) engine.step({ ...EMPTY_INPUT, right: true });
    const before = engine.checkpoint();
    engine.activate(program, "rollback-version");
    for (let t = 0; t < 90; t++) {
      engine.step({ ...EMPTY_INPUT });
      ticksSimulated++;
    }
    engine.rollback();
    if (JSON.stringify(engine.checkpoint()) !== JSON.stringify(before))
      throw new Error(
        "Rollback did not restore the exact protected checkpoint",
      );
  });
  run("Checkpoint round trip and temporary cleanup", () => {
    const engine = new GameEngine();
    engine.activate(program, "roundtrip-version");
    for (let t = 0; t < 40; t++) {
      engine.step();
      ticksSimulated++;
    }
    const checkpoint = engine.checkpoint();
    const restored = new GameEngine();
    restored.restore(checkpoint);
    if (JSON.stringify(restored.checkpoint()) !== JSON.stringify(checkpoint))
      throw new Error("Checkpoint serialization mismatch");
    restored.rollback();
    if (restored.world.surfaces.some((s) => s.generated))
      throw new Error("Retired rule left collision surfaces");
  });
  const passed = checks.every((c) => c.passed);
  return {
    passed,
    engineVersion: ENGINE_VERSION,
    checks,
    ticksSimulated,
    summary: passed
      ? "Passed trusted schema, simulation, determinism and recovery checks. Global solvability is not proven."
      : "Candidate failed trusted verification; activation is blocked.",
    effects,
  };
}
