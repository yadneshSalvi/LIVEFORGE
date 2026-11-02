import { describe, expect, it } from "vitest";
import {
  EMPTY_INPUT,
  type RuleAction,
  type RuleProgram,
  type Surface,
  type SurfaceMotionState,
  type TickInput,
} from "../src/game/contracts";
import { assertWorld, GameEngine } from "../src/game/core";
import {
  compileRuleSource,
  composeRulePrograms,
  RULE_API_DOCUMENTATION,
  validateRuleProgram,
  verifyRuleComposition,
  verifyRuleProgram,
} from "../src/game/rules";
import { MAX_GENERATED_SURFACES } from "../src/game/runtime";
import { parseCheckpoint } from "../src/server/checkpoint";
import { buildGenerationPrompt } from "../src/server/generation";
import {
  REUSED_RULE_ARTIFACT,
  REUSED_STEP_ARTIFACT,
} from "../src/server/reused-artifact";

type SurfaceAction = Extract<
  RuleAction,
  { type: "createSurface" | "spawnPlatform" }
>;
const hash = "a".repeat(64);
const always = { compare: { left: 1, op: "eq", right: 1 } } as const;

/** Synthetic engine fixture; this is not a generated or production law. */
const motionLaw = (overrides: Partial<SurfaceAction> = {}): RuleProgram => ({
  version: 1,
  name: "Horizontal surface fixture",
  description: "Synthetic bounded motion regression fixture.",
  rules: [
    {
      id: "horizontal-fixture",
      each: "lantern",
      when: { compare: { left: { field: "x" }, op: "eq", right: 1030 } },
      actions: [
        {
          type: "createSurface",
          offsetX: -230,
          offsetY: 0,
          width: 100,
          lifetime: 1,
          solid: true,
          motion: { travel: -140, speed: 1.25 },
          ...overrides,
        },
      ],
    },
  ],
});
const moving = (engine: GameEngine) => {
  const surface = engine.world.surfaces.find((s) => s.motion);
  if (!surface?.motion) throw new Error("Expected the moving fixture surface");
  return surface as Surface & { motion: SurfaceMotionState };
};
const advance = (
  engine: GameEngine,
  ticks: number,
  input: TickInput = { ...EMPTY_INPUT },
) => {
  for (let tick = 0; tick < ticks; tick++) engine.step(input);
};
const placeRider = (engine: GameEngine, id = "courier", offset = 30) => {
  const surface = moving(engine),
    entity = engine.world.entities.find((e) => e.id === id)!;
  Object.assign(entity, {
    x: surface.x + offset,
    y: surface.y - entity.h,
    vx: 0,
    vy: 0,
    grounded: true,
    previousX: surface.x + offset,
    previousY: surface.y - entity.h,
  });
};

describe("bounded surface motion schema", () => {
  it.each(["createSurface", "spawnPlatform"] as const)(
    "accepts optional %s motion at every declared boundary",
    (type) => {
      for (const travel of [-240, -20, 20, 240])
        for (const speed of [0.3, 2.5]) {
          const law = motionLaw({ type, motion: { travel, speed } });
          expect(validateRuleProgram(law)).toEqual(law);
          expect(compileRuleSource(JSON.stringify(law))).toEqual(law);
        }
      expect(() =>
        validateRuleProgram(motionLaw({ type, motion: undefined })),
      ).not.toThrow();
    },
  );
  it.each([
    { travel: 0, speed: 1 },
    { travel: 19.99, speed: 1 },
    { travel: -19.99, speed: 1 },
    { travel: 240.01, speed: 1 },
    { travel: -240.01, speed: 1 },
    { travel: Infinity, speed: 1 },
    { travel: NaN, speed: 1 },
    { travel: 140, speed: 0.299 },
    { travel: 140, speed: 2.501 },
    { travel: 140, speed: -1 },
    { travel: 140, speed: Infinity },
    { travel: 140, speed: NaN },
    { travel: 140, speed: 1, y: 10 },
    { travel: 140, speed: 1, axis: "vertical" },
    { travel: 140, speed: 1, phase: 0 },
    { travel: 140, speed: 1, anchorX: 800 },
    { travel: 140, speed: 1, startedAt: 0 },
    { travel: 140, speed: 1, previousX: 800 },
    { travel: 140 },
    { speed: 1 },
    null,
  ])("rejects invalid, vertical and unknown motion members: %j", (motion) => {
    const law = motionLaw();
    Object.assign(law.rules[0].actions[0], { motion });
    expect(() => validateRuleProgram(law)).toThrow();
    expect(verifyRuleProgram(law).passed).toBe(false);
  });
  it("does not grant motion to other actions or permit executable source", () => {
    const law = motionLaw();
    law.rules[0].actions = [
      {
        type: "projectShadow",
        maxLength: 100,
        thickness: 9,
        lifetime: 1,
        solid: true,
        motion: { travel: -140, speed: 1.25 },
      } as RuleAction,
    ];
    expect(() => validateRuleProgram(law)).toThrow();
    expect(() =>
      compileRuleSource(
        "export default (() => ({ motion: { travel: 140, speed: 1 } }))()",
      ),
    ).toThrow();
  });
});

describe("deterministic horizontal surface trajectories", () => {
  it.each([
    [140, 1.25],
    [-140, 1.25],
    [240, 0.3],
    [-240, 2.5],
  ])("bounds travel %s at speed %s through long replay", (travel, speed) => {
    const program = motionLaw({ motion: { travel, speed } }),
      a = new GameEngine(),
      b = new GameEngine();
    a.activate(program, hash);
    b.activate(program, hash);
    const first = moving(a),
      minX = Math.min(first.motion.anchorX, first.motion.anchorX + travel),
      maxX = Math.max(first.motion.anchorX, first.motion.anchorX + travel);
    let observedMin = first.x,
      observedMax = first.x;
    for (let tick = 0; tick < 3200; tick++) {
      const previousX = moving(a).x;
      a.step();
      b.step();
      const surface = moving(a);
      expect(surface.x).toBeGreaterThanOrEqual(minX - 1e-7);
      expect(surface.x).toBeLessThanOrEqual(maxX + 1e-7);
      expect(surface.x).toBeGreaterThanOrEqual(0);
      expect(surface.x + surface.w).toBeLessThanOrEqual(2500);
      expect(Math.abs(surface.x - previousX)).toBeLessThanOrEqual(speed + 1e-7);
      expect(surface.motion.previousX).toBe(previousX);
      expect(surface.motion.startedAt).toBe(0);
      expect(surface.motion.anchorX).toBe(800);
      expect(surface.expires).toBe(a.world.tick);
      expect(surface.y).toBe(448);
      observedMin = Math.min(observedMin, surface.x);
      observedMax = Math.max(observedMax, surface.x);
    }
    expect(observedMin).toBeCloseTo(minX, 7);
    expect(observedMax).toBeCloseTo(maxX, 7);
    expect(a.checkpoint()).toEqual(b.checkpoint());
    expect(a.diagnostics.geometrySkipped).toBe(0);
    expect(
      a.world.entities
        .filter((entity) => entity.kind === "lantern")
        .map((entity) => [entity.x, entity.y]),
    ).toEqual([
      [320, 357],
      [1030, 357],
      [1840, 357],
    ]);
  });
  it("starts at the absolute simulation phase and reverses at both endpoints", () => {
    const e = new GameEngine();
    e.world.tick = 100;
    e.activate(motionLaw(), hash);
    expect(moving(e).x).toBe(675);
    expect(moving(e).motion).toMatchObject({
      anchorX: 800,
      startedAt: 100,
      previousX: 675,
    });
    advance(e, 12);
    expect(moving(e).x).toBe(660);
    e.step();
    expect(moving(e).x).toBe(661.25);
    advance(e, 111);
    expect(moving(e).x).toBe(800);
    e.step();
    expect(moving(e).x).toBe(798.75);
  });
  it("freezes initial anchor and height across one-tick refreshes from a moving owner", () => {
    const program = motionLaw({
      offsetX: 80,
      motion: { travel: 140, speed: 1.25 },
    });
    program.rules[0].each = "player";
    program.rules[0].when = always;
    const e = new GameEngine();
    e.activate(program, hash);
    for (let tick = 0; tick < 60; tick++) {
      e.step({ ...EMPTY_INPUT, right: true, jump: tick === 0 });
      expect(moving(e).motion.anchorX).toBe(250);
      expect(moving(e).motion.startedAt).toBe(0);
      expect(moving(e).y).toBe(448);
      expect(e.world.surfaces.filter((s) => s.motion)).toHaveLength(1);
    }
    expect(e.world.entities[0].x).toBeGreaterThan(400);
    expect(e.world.deaths).toBe(0);
    expect(() =>
      parseCheckpoint(e.checkpoint(), { program, sourceHash: hash }),
    ).not.toThrow();
  });
  it("expires unrefreshed surfaces and recreates without retaining an expired rider", () => {
    const program = motionLaw();
    program.rules[0].when = {
      all: [
        program.rules[0].when,
        {
          any: [
            { compare: { left: { field: "tick" }, op: "lt", right: 20 } },
            { compare: { left: { field: "tick" }, op: "gt", right: 60 } },
          ],
        },
      ],
    };
    const e = new GameEngine();
    e.activate(program, hash);
    advance(e, 19);
    placeRider(e);
    const x = e.world.entities[0].x;
    e.step();
    expect(e.world.surfaces.some((s) => s.motion)).toBe(false);
    expect(e.world.entities[0].x).toBe(x);
    expect(e.world.entities[0].grounded).toBe(false);
    advance(e, 40);
    expect(e.world.surfaces.some((s) => s.motion)).toBe(false);
    e.step();
    expect(moving(e).motion.startedAt).toBe(61);
    expect(moving(e).x).toBe(723.75);
    expect(moving(e).motion.previousX).toBe(723.75);
  });
  it("moves a spawned platform through its lifetime without extending it", () => {
    const program = motionLaw({ type: "spawnPlatform", lifetime: 120 });
    program.rules[0].when = {
      all: [
        program.rules[0].when,
        { compare: { left: { field: "tick" }, op: "eq", right: 50 } },
      ],
    };
    const e = new GameEngine();
    e.activate(program, hash);
    advance(e, 50);
    const id = moving(e).id;
    expect(moving(e).motion.startedAt).toBe(50);
    expect(moving(e).x).toBe(737.5);
    expect(moving(e).expires).toBe(169);
    advance(e, 100);
    expect(moving(e).id).toBe(id);
    expect(moving(e).x).toBe(707.5);
    expect(moving(e).expires).toBe(169);
    advance(e, 20);
    expect(e.world.surfaces.some((s) => s.motion)).toBe(false);
  });
});

describe("moving surface riders", () => {
  it("records carry as displacement for events and stillness", () => {
    const e = new GameEngine();
    e.activate(motionLaw(), hash);
    placeRider(e);
    const x = e.world.entities[0].x;
    e.step();
    expect(e.world.entities[0].previousX).toBe(x);
    expect(e.world.entities[0].x).toBe(x - 1.25);
    expect(e.world.entities[0].stationaryTicks).toBe(0);
    expect(e.world.entities[0].wasGrounded).toBe(true);
  });

  it("supports a continuous arrival jump, idle full-sweep ride and foundry jump", () => {
    const e = new GameEngine();
    e.world.entities[0].x = 580;
    e.activate(motionLaw(), hash);
    // One complete visible out-and-back before boarding; no player repositioning follows.
    advance(e, 224);
    expect(e.world.entities[0].x).toBe(580);
    expect(e.world.entities[0].grounded).toBe(true);
    let landed = false,
      leftArrival = false;
    for (let tick = 0; tick < 60; tick++) {
      e.step({ ...EMPTY_INPUT, right: true, jump: tick === 0 });
      const player = e.world.entities[0],
        surface = moving(e);
      leftArrival ||= !player.grounded && player.x > 610;
      if (
        player.grounded &&
        player.x > 610 &&
        player.y + player.h === surface.y
      ) {
        landed = true;
        break;
      }
    }
    expect(leftArrival).toBe(true);
    expect(landed).toBe(true);
    advance(e, 30);
    const riderOffset = e.world.entities[0].x - moving(e).x;
    let sawNear = false,
      sawFar = false;
    for (let tick = 0; tick < 224; tick++) {
      e.step();
      const player = e.world.entities[0],
        surface = moving(e);
      expect(player.grounded).toBe(true);
      expect(player.y + player.h).toBe(surface.y);
      expect(player.x - surface.x).toBeCloseTo(riderOffset, 7);
      expect(surface.x - 610).toBeGreaterThanOrEqual(50 - 1e-7);
      expect(950 - surface.x - surface.w).toBeGreaterThanOrEqual(50 - 1e-7);
      sawNear ||= surface.x <= 661.25;
      sawFar ||= surface.x >= 798.75;
    }
    expect(sawNear && sawFar).toBe(true);
    for (let tick = 0; tick < 224; tick++) {
      const surface = moving(e);
      if (surface.x >= 795 && surface.x > surface.motion.previousX) break;
      e.step();
    }
    let foundryLanding = false;
    for (let tick = 0; tick < 70; tick++) {
      e.step({ ...EMPTY_INPUT, right: true, jump: tick === 0 });
      const player = e.world.entities[0];
      if (player.grounded && player.x >= 950 && player.y === 400) {
        foundryLanding = true;
        break;
      }
    }
    expect(foundryLanding).toBe(true);
    expect(e.world.deaths).toBe(0);
    expect(e.world.emberCarried).toBe(true);
    advance(e, 12, { ...EMPTY_INPUT, right: true });
    expect(e.world.checkpoint).toBe(1);
  });

  it("carries props and a dropped ember for a whole sweep", () => {
    const e = new GameEngine();
    e.activate(motionLaw(), hash);
    e.world.emberCarried = false;
    placeRider(e, "counterweight", 10);
    placeRider(e, "ember", 75);
    for (let tick = 0; tick < 224; tick++) {
      e.step();
      const surface = moving(e);
      for (const [id, offset] of [
        ["counterweight", 10],
        ["ember", 75],
      ] as const) {
        const entity = e.world.entities.find((record) => record.id === id)!;
        expect(entity.x - surface.x).toBeCloseTo(offset, 7);
        expect(entity.y + entity.h).toBe(surface.y);
        expect(entity.grounded).toBe(true);
      }
    }
    expect(e.world.emberCarried).toBe(false);
    expect(
      e.world.entities.find((entity) => entity.id === "counterweight")!.x,
    ).toBe(810);
  });

  it.each([0.5, 1.5])(
    "does not scale platform carry with rider time scale %s",
    (timeScale) => {
      const program = motionLaw();
      program.rules.push({
        id: "rider-local-time",
        each: "player",
        when: always,
        actions: [{ type: "physics", target: "self", timeScale }],
      });
      const e = new GameEngine();
      e.activate(program, hash);
      placeRider(e);
      advance(e, 112);
      expect(moving(e).x).toBe(660);
      expect(e.world.entities[0].x).toBe(690);
      expect(e.world.entities[0].grounded).toBe(true);
    },
  );

  it("carries by only the final supporting surface when two paths overlap", () => {
    const program = motionLaw();
    program.rules[0].actions.push({
      ...(program.rules[0].actions[0] as SurfaceAction),
      motion: { travel: -140, speed: 2 },
    });
    const e = new GameEngine();
    e.activate(program, hash);
    placeRider(e);
    advance(e, 10);
    expect(e.world.entities[0].x).toBe(810);
    expect(e.world.entities[0].grounded).toBe(true);
  });

  it("never carries from a non-solid surface or a prop's own generated surface", () => {
    const ghost = new GameEngine();
    ghost.activate(motionLaw({ solid: false }), hash);
    placeRider(ghost);
    ghost.step();
    expect(ghost.world.entities[0].x).toBe(830);
    expect(ghost.world.entities[0].grounded).toBe(false);
    const own = motionLaw({ offsetX: 0 });
    own.rules[0].each = "prop";
    own.rules[0].when = {
      compare: { left: { field: "x" }, op: "eq", right: 510 },
    };
    const e = new GameEngine();
    e.activate(own, hash);
    advance(e, 30);
    expect(
      e.world.entities.find((entity) => entity.id === "counterweight")!.x,
    ).toBe(510);
  });

  it("clamps carried entities at both world bounds", () => {
    const leftProgram = motionLaw({
      offsetX: -150,
      motion: { travel: -20, speed: 1.25 },
    });
    leftProgram.rules[0].each = "player";
    leftProgram.rules[0].when = always;
    const left = new GameEngine();
    left.activate(leftProgram, hash);
    placeRider(left, "courier", 0);
    advance(left, 16);
    expect(moving(left).x).toBe(0);
    expect(left.world.entities[0].x).toBe(20);
    expect(left.world.entities[0].grounded).toBe(true);
    const rightProgram = motionLaw({
      offsetX: 300,
      width: 320,
      motion: { travel: 40, speed: 1.25 },
    });
    rightProgram.rules[0].when = {
      compare: { left: { field: "x" }, op: "eq", right: 1840 },
    };
    const right = new GameEngine();
    right.activate(rightProgram, hash);
    placeRider(right, "guardian-crate", 290);
    advance(right, 32);
    const prop = right.world.entities.find(
      (entity) => entity.id === "guardian-crate",
    )!;
    expect(moving(right).x + moving(right).w).toBe(2500);
    expect(prop.x).toBe(2470 - prop.w);
    expect(prop.grounded).toBe(true);
  });
});

describe("motion checkpoints, grants and shared safety", () => {
  it("continues the same mid-sweep rider checkpoint and restores the exact pre-activation world", () => {
    const program = motionLaw(),
      e = new GameEngine(),
      before = e.checkpoint();
    e.activate(program, hash);
    placeRider(e);
    advance(e, 137);
    const checkpoint = JSON.parse(JSON.stringify(e.checkpoint()));
    expect(parseCheckpoint(checkpoint, { program, sourceHash: hash })).toEqual(
      checkpoint,
    );
    const restored = new GameEngine();
    restored.restore(checkpoint);
    for (let tick = 0; tick < 1800; tick++) {
      const input = {
        ...EMPTY_INPUT,
        right: tick > 400 && tick < 430,
        jump: tick === 400,
      };
      e.step(input);
      restored.step(input);
    }
    expect(e.checkpoint()).toEqual(restored.checkpoint());
    e.rollback();
    expect(e.checkpoint()).toEqual(before);
    restored.rollback();
    expect(restored.world.surfaces.some((surface) => surface.generated)).toBe(
      false,
    );
  });

  it("rejects malformed motion snapshots atomically and binds valid states to their exact grant", () => {
    const program = motionLaw(),
      e = new GameEngine();
    e.activate(program, hash);
    advance(e, 37);
    const before = e.checkpoint(),
      expected = { program, sourceHash: hash };
    for (const change of [
      { travel: 0 },
      { travel: 241 },
      { speed: 2.501 },
      { speed: NaN },
      { anchorX: Infinity },
      { anchorX: -1 },
      { previousX: 2000 },
      { startedAt: -1 },
      { startedAt: 0.5 },
      { startedAt: 38 },
    ]) {
      const bad = e.checkpoint();
      Object.assign(
        bad.snapshot.surfaces.find((s) => s.motion)!.motion!,
        change,
      );
      expect(() => e.restore(bad)).toThrow();
      expect(e.checkpoint()).toEqual(before);
      expect(() => parseCheckpoint(bad, expected)).toThrow();
    }
    for (const change of [{ y: 10 }, { axis: "vertical" }, { phase: 0 }]) {
      const bad = e.checkpoint();
      Object.assign(
        bad.snapshot.surfaces.find((s) => s.motion)!.motion!,
        change,
      );
      expect(() => parseCheckpoint(bad, expected)).toThrow();
    }
    const shifted = e.checkpoint(),
      surface = shifted.snapshot.surfaces.find((s) => s.motion)!;
    surface.x += 10;
    surface.motion!.anchorX += 10;
    surface.motion!.previousX += 10;
    expect(() => assertWorld(shifted.snapshot)).not.toThrow();
    expect(() => parseCheckpoint(shifted, expected)).toThrow();
    for (const motion of [
      { speed: 1, travel: -140 },
      { speed: 1.25, travel: -120 },
    ]) {
      const forged = e.checkpoint(),
        path = forged.snapshot.surfaces.find((s) => s.motion)!;
      Object.assign(path.motion!, motion);
      path.x = 800 - 37 * motion.speed;
      path.motion!.previousX = 800 - 36 * motion.speed;
      expect(() => assertWorld(forged.snapshot)).not.toThrow();
      expect(() => parseCheckpoint(forged, expected)).toThrow();
    }
    const authored = e.checkpoint();
    authored.snapshot.surfaces[0].motion = structuredClone(surface.motion!);
    expect(() => assertWorld(authored.snapshot)).toThrow();
    expect(() => parseCheckpoint(authored, expected)).toThrow();
    const staticProgram = motionLaw({ motion: undefined }),
      stationary = new GameEngine();
    stationary.activate(staticProgram, hash);
    const injected = stationary.checkpoint();
    injected.snapshot.surfaces.find((s) => s.generated)!.motion = {
      travel: -140,
      speed: 1.25,
      anchorX: 800,
      startedAt: 0,
      previousX: 800,
    };
    expect(() => assertWorld(injected.snapshot)).not.toThrow();
    expect(() =>
      parseCheckpoint(injected, { program: staticProgram, sourceHash: hash }),
    ).toThrow();
  });

  it("counts moving creations in the existing per-clause and shared surface budgets", () => {
    const program = motionLaw({
        type: "spawnPlatform",
        lifetime: 600,
        maxCount: 8,
      }),
      e = new GameEngine();
    e.activate(program, hash);
    advance(e, 80);
    expect(e.world.surfaces.filter((surface) => surface.motion)).toHaveLength(
      8,
    );
    expect(
      e.world.surfaces.filter((surface) => surface.generated).length,
    ).toBeLessThanOrEqual(MAX_GENERATED_SURFACES);
    expect(e.diagnostics.surfacesSkipped).toBeGreaterThan(0);
    expect(e.diagnostics.globalSurfacesSkipped).toBe(0);
    expect(verifyRuleProgram(program).passed).toBe(true);
  });

  it("skips an out-of-world path and rejects global surface saturation", () => {
    const outside = motionLaw({
      offsetX: 300,
      width: 320,
      motion: { travel: 240, speed: 1.25 },
    });
    outside.rules[0].when = {
      compare: { left: { field: "x" }, op: "eq", right: 1840 },
    };
    const skipped = new GameEngine();
    skipped.activate(outside, hash);
    expect(skipped.world.surfaces.some((s) => s.motion)).toBe(false);
    expect(skipped.diagnostics.geometrySkipped).toBeGreaterThan(0);
    expect(verifyRuleProgram(outside).passed).toBe(false);
    const full = motionLaw({
      type: "spawnPlatform",
      lifetime: 600,
      maxCount: 8,
    });
    full.rules = Array.from({ length: 7 }, (_, i) => ({
      ...structuredClone(full.rules[0]),
      id: `budget-${i}`,
    }));
    const saturated = new GameEngine();
    saturated.activate(full, hash);
    advance(saturated, 12);
    expect(saturated.world.surfaces.filter((s) => s.motion)).toHaveLength(48);
    expect(saturated.diagnostics.globalSurfacesSkipped).toBeGreaterThan(0);
    expect(verifyRuleProgram(full).passed).toBe(false);
    const forged = saturated.checkpoint();
    forged.snapshot.surfaces.push({
      ...structuredClone(forged.snapshot.surfaces.find((s) => s.motion)!),
      id: "extra-ungranted",
    });
    expect(() => assertWorld(forged.snapshot)).toThrow();
  });

  it("passes held-input, ceiling, replay and motion checks alone and with both old samples", () => {
    const motion = motionLaw(),
      old = [REUSED_RULE_ARTIFACT, REUSED_STEP_ARTIFACT].map((artifact) =>
        compileRuleSource(artifact.source),
      );
    for (const programs of [[motion], [motion, old[0]], [motion, ...old]]) {
      const report =
        programs.length === 1
          ? verifyRuleProgram(motion)
          : verifyRuleComposition(programs);
      expect(report.checks.filter((check) => !check.passed)).toEqual([]);
      expect(report.passed).toBe(true);
      expect(
        report.checks.some((check) =>
          /horizontal motion.*continuation/i.test(check.name),
        ),
      ).toBe(true);
      expect(report.ticksSimulated).toBeGreaterThan(7290 + 1600);
    }
    expect(() => composeRulePrograms([motion, ...old, motion])).toThrow(
      /three/,
    );
  });

  it("documents generic motion, its rendered silhouette and crossing geometry without a preset or example law", () => {
    const prompt = buildGenerationPrompt("An unrelated bounded mechanic");
    expect(prompt).toContain(RULE_API_DOCUMENTATION);
    expect(prompt).toContain("motion?:{travel");
    expect(prompt).toContain("x610");
    expect(prompt).toContain("x950");
    expect(prompt).toContain("y448");
    expect(prompt).toContain("Lanterns are immovable anchors");
    expect(prompt).toContain(
      "SURFACE PRESENTATION: every generated surface with motion",
    );
    expect(prompt).toContain("tapered, wedge-shaped brass underside");
    expect(prompt).toContain("mint edging and a subtle motion trail/glow");
    expect(prompt).toContain("requires no separate shape action");
    expect(prompt).toContain(
      "Collision remains a flat horizontal top edge when solid",
    );
    expect(prompt).toContain(
      "Sloped walking surfaces and ramps are not supported",
    );
    expect(prompt).not.toMatch(
      /movingWedge|floating wedge|jump on, ride it, jump off/i,
    );
  });
});
