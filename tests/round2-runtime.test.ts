import { describe, expect, it } from "vitest";
import {
  GameEngine,
  assertWorld,
  createWorld,
  retireGeneratedCheckpoint,
} from "../src/game/core";
import {
  EMPTY_INPUT,
  type RuleAction,
  type RuleProgram,
} from "../src/game/contracts";
import { applyRuleProgram } from "../src/game/runtime";
import { composeRulePrograms, verifyRuleProgram } from "../src/game/rules";
const always = { compare: { left: 1, op: "eq", right: 1 } } as const;
const law = (
  actions: RuleAction[],
  each: "player" | "prop" = "player",
): RuleProgram => ({
  version: 1,
  name: "Round two synthetic regression",
  description: "Synthetic runtime regression fixture.",
  rules: [{ id: "regression", each, when: always, actions }],
});
const physics = (gravityScale: number) =>
  law([{ type: "physics", target: "self", gravityScale }]);

describe("round two bounded live execution", () => {
  it("collects at most 128 commands and reports skipped actions without faulting", () => {
    const program = law(
      Array.from(
        { length: 6 },
        () =>
          ({
            type: "cue",
            target: "self",
            color: "mint",
            intensity: 1,
          }) as const,
      ),
      "prop",
    );
    program.rules = Array.from({ length: 8 }, (_, i) => ({
      ...program.rules[0],
      id: `r-${i}`,
    }));
    const combined = composeRulePrograms([program, program, program]);
    const result = applyRuleProgram(createWorld(), combined);
    expect(result.effects.cuesApplied).toBe(128);
    expect(result.diagnostics.commandsSkipped).toBe(304);
    assertWorld(result.world);
  });
  it.each(["createSurface", "projectShadow"] as const)(
    "caps %s globally and per rule while allowing refresh",
    (type) => {
      const action: RuleAction =
        type === "projectShadow"
          ? { type, maxLength: 100, thickness: 8, lifetime: 600, solid: true }
          : {
              type,
              offsetX: 0,
              offsetY: 0,
              width: 50,
              lifetime: 600,
              solid: true,
            };
      const program = law(
        Array.from({ length: 6 }, () => action),
        "prop",
      );
      let world = createWorld();
      const result = applyRuleProgram(world, program);
      expect(result.world.surfaces.filter((s) => s.generated)).toHaveLength(8);
      expect(result.diagnostics.surfacesSkipped).toBeGreaterThan(0);
      world = result.world;
      const globalProgram = structuredClone(program);
      globalProgram.rules = Array.from({ length: 8 }, (_, i) => ({
        ...program.rules[0],
        id: `r-${i}`,
      }));
      world = applyRuleProgram(createWorld(), globalProgram).world;
      expect(world.surfaces.filter((s) => s.generated)).toHaveLength(48);
      const again = applyRuleProgram(world, globalProgram);
      expect(again.world.surfaces.filter((s) => s.generated)).toHaveLength(48);
      assertWorld(again.world);
    },
  );
  it("enforces createSurface maxCount and skips out of bounds geometry", () => {
    const program = law(
      [
        {
          type: "createSurface",
          offsetX: 0,
          offsetY: 0,
          width: 50,
          lifetime: 60,
          solid: true,
          maxCount: 1,
        },
      ],
      "prop",
    );
    const result = applyRuleProgram(createWorld(), program);
    expect(result.world.surfaces.filter((s) => s.generated)).toHaveLength(1);
    expect(result.diagnostics.surfacesSkipped).toBe(2);
    const world = createWorld();
    world.entities[1].y = -80;
    program.rules[0].actions = [
      {
        type: "createSurface",
        offsetX: 0,
        offsetY: -200,
        width: 50,
        lifetime: 60,
        solid: true,
      },
    ];
    const bounded = applyRuleProgram(world, program);
    expect(bounded.diagnostics.geometrySkipped).toBe(1);
    assertWorld(bounded.world);
  });
  it("held jump impulses stay inside the world live and fail stress verification readably", () => {
    const program = law([{ type: "impulse", target: "self", x: 0, y: -2 }]);
    program.rules[0].when = {
      compare: { left: { field: "inputJump" }, op: "eq", right: 1 },
    };
    const engine = new GameEngine();
    engine.activate(program, "held-jump");
    for (let i = 0; i < 900; i++) {
      engine.step({ ...EMPTY_INPUT, jump: true });
      assertWorld(engine.world);
    }
    expect(engine.world.entities[0].y).toBeGreaterThanOrEqual(-80);
    expect(engine.diagnostics.worldBoundsRecoveries).toBeGreaterThan(0);
    const report = verifyRuleProgram(program);
    expect(report.passed).toBe(false);
    expect(
      report.checks.some(
        (c) => !c.passed && c.detail.includes("worldBoundsRecoveries"),
      ),
    ).toBe(true);
  });
  it("own surface capacity saturation is accepted by verification", () => {
    const program = law([
      {
        type: "spawnPlatform",
        offsetX: 0,
        offsetY: 0,
        width: 50,
        lifetime: 600,
        solid: true,
        maxCount: 2,
      },
    ]);
    const report = verifyRuleProgram(program);
    expect(report.passed).toBe(true);
  });
  it("counts applied modifiers and prop spawns including activation", () => {
    const program = law([
      { type: "physics", target: "self", gravityScale: 0.5 },
      {
        type: "spawnProp",
        offsetX: 60,
        offsetY: 0,
        cooldown: 100,
        lifetime: 20,
        maxCount: 4,
      },
    ]);
    const engine = new GameEngine();
    engine.activate(program, "counted");
    engine.step();
    expect(engine.effects.modifiersApplied).toBe(2);
    expect(engine.effects.entitiesSpawned).toBe(1);
    const report = verifyRuleProgram(program);
    expect(report.effects.modifiersApplied).toBeGreaterThan(0);
    expect(report.effects.entitiesSpawned).toBeGreaterThan(0);
  });
  it("softly caps modifier batches before they exceed the shared resource budget", () => {
    const program = law(
      Array.from(
        { length: 6 },
        () =>
          ({
            type: "material",
            target: "self",
            friction: 0.7,
            bounce: 0.1,
          }) as const,
      ),
      "prop",
    );
    program.rules = Array.from({ length: 8 }, (_, i) => ({
      ...program.rules[0],
      id: `r-${i}`,
    }));
    const result = applyRuleProgram(createWorld(), program);
    expect(result.world.modifiers).toHaveLength(48);
    expect(result.diagnostics.modifiersSkipped).toBeGreaterThan(0);
    assertWorld(result.world);
  });
  it("normalizes fractional arithmetic air-jump results to an integer", () => {
    const result = applyRuleProgram(
      createWorld(),
      law([{ type: "physics", target: "self", airJumps: 0.5 }]),
    );
    expect(result.world.entities[0].physics.airJumps).toBe(0);
  });
  it("retires generated checkpoint state while preserving progress", () => {
    const engine = new GameEngine();
    engine.activate(
      law([
        { type: "physics", target: "self", playerScale: 1.5 },
        {
          type: "spawnProp",
          offsetX: 60,
          offsetY: 0,
          cooldown: 100,
          lifetime: 20,
          maxCount: 4,
        },
        {
          type: "createSurface",
          offsetX: 60,
          offsetY: 0,
          width: 50,
          lifetime: 20,
          solid: true,
        },
        { type: "cue", target: "self", color: "mint", intensity: 1 },
      ]),
      "retire",
    );
    engine.step();
    engine.world.entities[0].timer = 40;
    engine.world.entities[0].airJumpsUsed = 1;
    engine.world.progress = 0.4;
    const retired = retireGeneratedCheckpoint(engine.checkpoint());
    expect(retired.program).toBeNull();
    expect(retired.artifactHash).toBeNull();
    expect(retired.snapshot.activeHash).toBeNull();
    expect(retired.snapshot.progress).toBe(0.4);
    expect(retired.snapshot.entities).toHaveLength(8);
    expect(retired.snapshot.modifiers).toHaveLength(0);
    expect(retired.snapshot.surfaces.some((s) => s.generated)).toBe(false);
    expect(retired.snapshot.entities[0].w).toBe(25);
    expect(retired.snapshot.entities[0].cue).toBeUndefined();
    expect(
      retired.snapshot.entities.every(
        (entity) => entity.timer === 0 && entity.airJumpsUsed === 0,
      ),
    ).toBe(true);
    const continuation = new GameEngine();
    continuation.restore(retired);
    const timerLaw = law([
      { type: "cue", target: "self", color: "coral", intensity: 1 },
    ]);
    timerLaw.rules[0].when = {
      compare: { left: { field: "timer" }, op: "gt", right: 0 },
    };
    continuation.activate(timerLaw, "future-timer-law");
    continuation.step();
    expect(continuation.world.entities[0].cue).toBeUndefined();
    assertWorld(retired.snapshot);
  });
});
describe("round two meaningful controlled physics verification", () => {
  it("rejects gravity 0.999 even when traversal timing would amplify tiny differences", () => {
    const report = verifyRuleProgram(physics(0.999));
    expect(report.passed).toBe(false);
    expect(
      report.checks.find(
        (c) => c.name === "Observable behavior in trusted scenarios",
      )?.detail,
    ).toBe("No noticeable effect on play.");
  });
  it("does not let cosmetic cues or separate impulses mask negligible gravity", () => {
    const program = physics(0.999);
    program.rules[0].actions.push(
      { type: "cue", target: "self", color: "mint", intensity: 1 },
      { type: "impulse", target: "self", x: 0.1, y: 0 },
    );
    const report = verifyRuleProgram(program);
    expect(
      report.checks.find(
        (c) => c.name === "Observable behavior in trusted scenarios",
      )?.detail,
    ).toBe("No noticeable effect on play.");
  });
  it("rejects extra jumps that disappear before the airborne jump, and held jump does not repeat", () => {
    const program = law([{ type: "physics", target: "self", airJumps: 1 }]);
    program.rules[0].when = {
      compare: { left: { field: "grounded" }, op: "eq", right: 1 },
    };
    expect(verifyRuleProgram(program).passed).toBe(false);
    const engine = new GameEngine();
    engine.activate(
      law([{ type: "physics", target: "self", airJumps: 2 }]),
      "held-extra-jumps",
    );
    for (let t = 0; t < 25; t++) engine.step({ ...EMPTY_INPUT, jump: true });
    expect(engine.world.entities[0].airJumpsUsed).toBe(0);
    expect(engine.world.entities[0].vy).toBeGreaterThan(0);
  });
  it("exercises gravity that only applies while interact is held during a jump", () => {
    const program = physics(1 / 3);
    program.rules[0].when = {
      compare: { left: { field: "inputInteract" }, op: "eq", right: 1 },
    };
    expect(verifyRuleProgram(program).passed).toBe(true);
  });
  it("exercises time scaling of a nearby moving prop", () => {
    const program = law(
      [{ type: "physics", target: "self", timeScale: 0.5 }],
      "prop",
    );
    program.rules[0].when = {
      compare: { left: { field: "distanceToPlayer" }, op: "lt", right: 200 },
    };
    expect(verifyRuleProgram(program).passed).toBe(true);
  });
  it.each([0.5, 1.5])("accepts measurable gravity %s", (value) =>
    expect(verifyRuleProgram(physics(value)).passed).toBe(true),
  );
  it("exercises an actual airborne extra jump and rejects an unused grant", () => {
    const program = law([{ type: "physics", target: "self", airJumps: 1 }]);
    expect(verifyRuleProgram(program).passed).toBe(true);
    program.rules[0].when = {
      compare: { left: { field: "airJumpsUsed" }, op: "gt", right: 1 },
    };
    expect(verifyRuleProgram(program).passed).toBe(false);
    expect(
      verifyRuleProgram(
        law([{ type: "physics", target: "self", jumpStrength: 1.3 }]),
      ).passed,
    ).toBe(true);
  });
});
