import { describe, it, expect } from "vitest";
import { GameEngine, AUTHORED_ENTITIES } from "../src/game/core";
import {
  EMPTY_INPUT,
  type RuleAction,
  type RuleClause,
  type RuleProgram,
} from "../src/game/contracts";
import {
  compileRuleSource,
  composeRulePrograms,
  validateRuntimeRuleProgram,
  validateRuleProgram,
  verifyRuleComposition,
  verifyRuleProgram,
  PRACTICE_RULE_SOURCE,
} from "../src/game/rules";
const always = { compare: { left: 1, op: "eq", right: 1 } } as const;
const law = (
  actions: RuleAction[],
  changes: Partial<RuleClause> = {},
): RuleProgram => ({
  version: 1,
  name: "Engine intent fixture",
  description: "Explicit synthetic intent experiment; not provider output.",
  rules: [{ id: "intent", each: "player", when: always, actions, ...changes }],
});
const engine = (p: RuleProgram) => {
  const e = new GameEngine();
  e.activate(p, "intent-hash");
  return e;
};
const step = (e: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) e.step();
};
describe("predeclared engine2 intent experiments (synthetic source fixtures)", () => {
  it("E01 moon gravity increases apex and airtime, then lands safely", () => {
    const a = engine(
        law([{ type: "physics", target: "self", gravityScale: 0.35 }]),
      ),
      b = new GameEngine();
    let lowA = 400,
      lowB = 400,
      airA = 0,
      airB = 0;
    for (let t = 0; t < 180; t++) {
      a.step({ ...EMPTY_INPUT, jump: t === 0 });
      b.step({ ...EMPTY_INPUT, jump: t === 0 });
      lowA = Math.min(lowA, a.world.entities[0].y);
      lowB = Math.min(lowB, b.world.entities[0].y);
      if (!a.world.entities[0].grounded) airA++;
      if (!b.world.entities[0].grounded) airB++;
    }
    expect(lowA).toBeLessThan(lowB - 100);
    expect(airA).toBeGreaterThan(airB);
    expect(a.world.entities[0].grounded).toBe(true);
  });
  it("E02 grants exactly one extra jump and renews it on landing", () => {
    const e = engine(law([{ type: "physics", target: "self", airJumps: 1 }]));
    e.step({ ...EMPTY_INPUT, jump: true });
    step(e, 15);
    e.step({ ...EMPTY_INPUT, jump: true });
    expect(e.world.entities[0].vy).toBeLessThan(-10);
    expect(e.world.entities[0].airJumpsUsed).toBe(1);
    step(e, 8);
    const before = e.world.entities[0].vy;
    e.step({ ...EMPTY_INPUT, jump: true });
    expect(e.world.entities[0].vy).toBeGreaterThan(before);
    step(e, 100);
    expect(e.world.entities[0].grounded).toBe(true);
    expect(e.world.entities[0].airJumpsUsed).toBe(0);
  });
  it("E03 grows only while interact is held, preserving feet and avoiding solid overlap", () => {
    const p = law([{ type: "physics", target: "self", playerScale: 1.6 }], {
      when: {
        compare: { left: { field: "inputInteract" }, op: "eq", right: 1 },
      },
    });
    const e = engine(p);
    e.step({ ...EMPTY_INPUT, interact: true });
    expect(e.world.entities[0].h).toBeCloseTo(76.8);
    expect(e.world.entities[0].y + e.world.entities[0].h).toBe(448);
    e.step();
    expect(e.world.entities[0].h).toBe(48);
    e.world.surfaces.push({
      id: "test-overhang",
      owner: "courier",
      generated: true,
      x: 150,
      y: 385,
      w: 100,
      h: 9,
      solid: true,
      expires: e.world.tick + 600,
    });
    e.step({ ...EMPTY_INPUT, interact: true });
    expect(e.world.entities[0].h).toBe(48);
  });
  it("E04 pushes two nearby crates while the distant original crate stays still", () => {
    const e = engine(
      law([{ type: "physics", target: "self", windX: 0.15 }], {
        each: "prop",
        when: {
          compare: {
            left: { field: "distanceToLantern" },
            op: "lt",
            right: 150,
          },
        },
      }),
    );
    step(e, 15);
    expect(e.world.entities[3].x).toBeGreaterThan(AUTHORED_ENTITIES[3].x);
    expect(e.world.entities[4].x).toBeGreaterThan(AUTHORED_ENTITIES[4].x);
    expect(e.world.entities[1].x).toBe(510);
  });
  it("E05 slows nearby moving crates and restores ordinary integration out of range", () => {
    const e = engine(
      law([{ type: "physics", target: "self", timeScale: 0.5 }], {
        each: "prop",
        when: {
          compare: {
            left: { field: "distanceToPlayer" },
            op: "lt",
            right: 200,
          },
        },
      }),
    );
    e.world.entities[0].x = 1000;
    e.world.entities[1].vx = 2;
    e.world.entities[3].vx = 2;
    e.step();
    expect(e.world.entities[3].x - 1130).toBe(1);
    expect(e.world.entities[1].x - 510).toBe(2);
    e.world.entities[0].x = 200;
    e.step();
    expect(e.world.entities[3].physics.timeScale).toBe(1);
  });
  it("E06 makes the dropped protected ember rebound and picking up stops its independent physics", () => {
    const e = engine(
      law([{ type: "material", target: "self", friction: 0.9, bounce: 0.85 }], {
        each: "ember",
      }),
    );
    e.step({ ...EMPTY_INPUT, drop: true });
    expect(e.world.emberCarried).toBe(false);
    let rebound = false;
    for (let t = 0; t < 80; t++) {
      const ember = e.world.entities[7],
        vy = ember.vy;
      e.step();
      if (vy > 0 && e.world.entities[7].vy < 0) rebound = true;
    }
    expect(rebound).toBe(true);
    const ember = e.world.entities[7];
    e.world.entities[0].x = ember.x - 25;
    e.step({ ...EMPTY_INPUT, drop: true });
    expect(e.world.emberCarried).toBe(true);
    expect(e.world.entities[7].vy).toBe(0);
    expect(e.world.entities.filter((x) => x.kind === "ember")).toHaveLength(1);
    expect(e.world.ember).toBe(true);
  });
  it("E07 creates one temporary platform per landing rather than per grounded tick", () => {
    const e = engine(
      law(
        [
          {
            type: "spawnPlatform",
            offsetX: 55,
            offsetY: 0,
            width: 70,
            lifetime: 12,
            solid: true,
            maxCount: 3,
          },
        ],
        { on: "land" },
      ),
    );
    e.world.entities[0].grounded = false;
    e.world.entities[0].wasGrounded = false;
    e.world.entities[0].y = 370;
    let max = 0;
    for (let t = 0; t < 60; t++) {
      e.step();
      max = Math.max(max, e.world.surfaces.filter((s) => s.generated).length);
    }
    expect(max).toBe(1);
    expect(e.world.surfaces.some((s) => s.generated)).toBe(false);
  });
  it("E08 running speed produces a monotonic bounded jump strength", () => {
    const p = law([
      {
        type: "physics",
        target: "self",
        jumpStrength: {
          clamp: {
            value: { add: [1, { mul: [{ field: "speed" }, 0.1] }] },
            min: 1,
            max: 1.6,
          },
        },
      },
    ]);
    const velocities = [0, 2, 4].map((v) => {
      const e = engine(p);
      e.world.entities[0].vx = v;
      e.step({ ...EMPTY_INPUT, jump: true });
      return e.world.entities[0].vy;
    });
    expect(velocities[1]).toBeLessThan(velocities[0]);
    expect(velocities[2]).toBeLessThan(velocities[1]);
    expect(velocities[2]).toBeGreaterThanOrEqual(-20);
  });
  it("E09 touching a crate grants bounce for three seconds without indefinite refresh", () => {
    const e = engine(
      law(
        [
          {
            type: "material",
            target: "self",
            friction: 0.8,
            bounce: 0.8,
            lifetime: 180,
          },
        ],
        { each: "prop", on: "touch" },
      ),
    );
    e.world.entities[0].previousX = 450;
    e.world.entities[0].x = 490;
    e.step();
    expect(e.world.entities[1].bounce).toBe(0.8);
    e.world.entities[0].x = 170;
    step(e, 179);
    expect(e.world.entities[1].bounce).toBe(0.8);
    e.step();
    expect(e.world.entities[1].bounce).toBe(0);
    expect(e.world.modifiers).toHaveLength(0);
  });
  it("E10 still props create real geometry that disappears when that owner moves", () => {
    const e = engine(compileRuleSource(PRACTICE_RULE_SOURCE));
    step(e, 30);
    expect(
      e.world.surfaces.some((s) => s.generated && s.owner === "counterweight"),
    ).toBe(true);
    e.world.entities[1].vx = 2;
    step(e, 2);
    expect(
      e.world.surfaces.some((s) => s.generated && s.owner === "counterweight"),
    ).toBe(false);
  });
});
describe("events, spawning, expressions and ordered composition safety", () => {
  it("fires enterZone once and rejects a trigger without zone bounds", () => {
    const p = law(
        [{ type: "cue", target: "self", color: "mint", intensity: 1 }],
        { on: "enterZone", zone: { x: 200, y: 300, width: 80, height: 200 } },
      ),
      e = engine(p);
    e.world.entities[0].x = 205;
    e.step();
    expect(e.world.entities[0].cue).toBeDefined();
    e.step();
    expect(e.world.entities[0].cue).toBeUndefined();
    delete p.rules[0].zone;
    expect(() => validateRuleProgram(p)).toThrow();
  });
  it("caps spawned props, expires them, and round-trips their deterministic identities", () => {
    const p = law([
      {
        type: "spawnProp",
        offsetX: 60,
        offsetY: 0,
        lifetime: 30,
        cooldown: 1,
        maxCount: 4,
      },
    ]);
    const e = engine(p);
    step(e, 10);
    expect(e.world.entities.filter((x) => x.spawnRule)).toHaveLength(4);
    const restored = new GameEngine();
    restored.restore(JSON.parse(JSON.stringify(e.checkpoint())));
    step(e, 10);
    step(restored, 10);
    expect(restored.checkpoint()).toEqual(e.checkpoint());
    e.rollback();
    expect(e.world.entities).toHaveLength(8);
    expect(e.world.modifiers).toHaveLength(0);
  });
  it("shares the twelve-prop global limit across a three-law composition", () => {
    const p = law([
      {
        type: "spawnProp",
        offsetX: 60,
        offsetY: 0,
        lifetime: 60,
        cooldown: 1,
        maxCount: 4,
      },
    ]);
    const e = engine(composeRulePrograms([p, p, p]));
    step(e, 10);
    expect(e.world.entities.filter((x) => x.spawnRule)).toHaveLength(12);
    expect(e.world.entities).toHaveLength(20);
    expect(verifyRuleComposition([p, p, p]).passed).toBe(false);
  });
  it("verifies actual composed behavior and rejects aggregate command flooding", () => {
    const p = law(
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
    );
    p.rules = Array.from({ length: 8 }, (_, i) => ({
      ...p.rules[0],
      id: `r-${i}`,
    }));
    expect(verifyRuleProgram(p).passed).toBe(true);
    expect(verifyRuleComposition([p, p, p]).passed).toBe(false);
  });
  it("rebuilds trusted IR from original members and refuses forged or nested composition", () => {
    const a = law([{ type: "physics", target: "self", gravityScale: 0.5 }]),
      b = law([{ type: "physics", target: "self", airJumps: 1 }]),
      combined = composeRulePrograms([a, b]);
    expect(validateRuntimeRuleProgram(combined)).toEqual(combined);
    expect(() => validateRuleProgram(combined)).toThrow();
    const forged = structuredClone(combined);
    forged.rules[0].actions = [{ type: "timer", value: 5 }];
    expect(() => validateRuntimeRuleProgram(forged)).toThrow();
    expect(() => composeRulePrograms([combined, b])).toThrow();
    expect(() => composeRulePrograms([a, b, a, b])).toThrow();
  });
  it("defines ordered override semantics and restores the exact prior stack on rollback", () => {
    const a = law([{ type: "physics", target: "self", gravityScale: 0.5 }]),
      b = law([{ type: "physics", target: "self", gravityScale: 1.4 }]);
    const e = engine(composeRulePrograms([a, b]));
    expect(e.world.entities[0].physics.gravityScale).toBe(1.4);
    const before = e.checkpoint();
    e.activate(composeRulePrograms([b, a]), "reverse-order");
    expect(e.world.entities[0].physics.gravityScale).toBe(0.5);
    e.rollback();
    expect(e.checkpoint()).toEqual(before);
  });
  it("bounds adversarial arithmetic, tree size, modifiers and creation lifetimes", () => {
    expect(() =>
      validateRuleProgram(
        law([{ type: "physics", target: "self", gravityScale: 99 }]),
      ),
    ).toThrow();
    expect(() =>
      validateRuleProgram(
        law([
          {
            type: "spawnProp",
            offsetX: 0,
            offsetY: 0,
            lifetime: 601,
            cooldown: 1,
            maxCount: 4,
          },
        ]),
      ),
    ).toThrow();
    let expression: import("../src/game/contracts").Scalar = 1;
    for (let i = 0; i < 30; i++) expression = { mul: [expression, 10000] };
    expect(() =>
      validateRuleProgram(
        law([{ type: "impulse", target: "self", x: expression, y: 0 }]),
      ),
    ).toThrow();
    const e = engine(
      law([
        {
          type: "physics",
          target: "self",
          windX: { mul: [10000, 10000, 10000] },
        },
      ]),
    );
    e.step();
    expect(e.world.entities[0].physics.windX).toBe(0.18);
  });
  it("a held-out zone, event, arithmetic and timed-material stack is deterministic and recoverable", () => {
    const a = law([
        {
          type: "physics",
          target: "self",
          jumpStrength: {
            min: [1.5, { add: [1, { mul: [{ field: "speed" }, 0.08] }] }],
          },
        },
      ]),
      b = law(
        [
          {
            type: "material",
            target: "self",
            friction: 0.75,
            bounce: 0.3,
            lifetime: 90,
          },
        ],
        { each: "prop", on: "touch" },
      ),
      c = law(
        [
          {
            type: "spawnPlatform",
            offsetX: 50,
            offsetY: 0,
            width: 50,
            lifetime: 45,
            solid: true,
          },
        ],
        { on: "enterZone", zone: { x: 200, y: 300, width: 500, height: 300 } },
      );
    expect(verifyRuleComposition([a, b, c]).passed).toBe(true);
  });
  it("keeps repeated exact activation idempotent in midair while refusing a new stack there", () => {
    const p = law([{ type: "physics", target: "self", gravityScale: 0.5 }]),
      e = engine(p);
    e.step({ ...EMPTY_INPUT, jump: true });
    expect(() => e.activate(p, "intent-hash")).not.toThrow();
    expect(() => e.activate(p, "different-hash")).toThrow(/grounded/);
  });
});
