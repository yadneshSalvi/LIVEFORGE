import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/game/core";
import { composeRulePrograms, type RuleProgram } from "../src/game/rules";
import { parseCheckpoint } from "../src/server/checkpoint";
const hash = "a".repeat(64),
  always = { compare: { left: 1, op: "eq", right: 1 } } as const;
const a: RuleProgram = {
  version: 1,
  name: "Moon",
  description: "Synthetic fixture",
  rules: [
    {
      id: "moon",
      each: "player",
      when: always,
      actions: [{ type: "physics", target: "self", gravityScale: 0.5 }],
    },
  ],
};
const b: RuleProgram = {
  version: 1,
  name: "Crates",
  description: "Synthetic fixture",
  rules: [
    {
      id: "crates",
      each: "player",
      when: always,
      actions: [
        {
          type: "spawnProp",
          offsetX: 60,
          offsetY: 0,
          lifetime: 120,
          cooldown: 1,
          maxCount: 2,
        },
      ],
    },
  ],
};
describe("engine2 strict checkpoint boundary", () => {
  it("round-trips exact ordered composition, timed physics and bounded spawn identities", () => {
    const e = new GameEngine(),
      program = composeRulePrograms([a, b]);
    e.activate(program, hash);
    e.step();
    const cp = JSON.parse(JSON.stringify(e.checkpoint()));
    expect(parseCheckpoint(cp, { program, sourceHash: hash })).toEqual(cp);
  });
  it("rejects unauthored entities and excessive authorized spawn counts", () => {
    const e = new GameEngine();
    e.activate(b, hash);
    e.step();
    const expected = { program: b, sourceHash: hash };
    const extra = e.checkpoint();
    extra.snapshot.entities.push({
      ...extra.snapshot.entities[3],
      id: "ungranted-prop",
    });
    expect(() => parseCheckpoint(extra, expected)).toThrow(/authored or/);
    const excess = e.checkpoint();
    excess.snapshot.tick = 10;
    const original = excess.snapshot.entities[8];
    for (const tick of [2, 3])
      excess.snapshot.entities.push({
        ...original,
        id: `spawn:crates:courier:0:${tick}`,
        expires: tick + 119,
      });
    expect(() => parseCheckpoint(excess, expected)).toThrow(/not authorized/);
    const global = e.checkpoint();
    global.snapshot.tick = 20;
    const spawned = global.snapshot.entities[8];
    for (let tick = 2; tick <= 13; tick++)
      global.snapshot.entities.push({
        ...spawned,
        id: `spawn:crates:courier:0:${tick}`,
        expires: tick + 119,
      });
    try {
      parseCheckpoint(global, expected);
      throw new Error("accepted forged global count");
    } catch (error) {
      expect(error).toMatchObject({ code: "checkpoint_grant" });
    }
  });
  it("round-trips granted air jumps and rejects fractional grants at the rule boundary", () => {
    for (const airJumps of [0, 1, 2]) {
      const program = structuredClone(a);
      program.rules[0].actions = [
        { type: "physics", target: "self", airJumps },
      ];
      const e = new GameEngine();
      e.activate(program, hash);
      expect(e.world.entities[0].physics.airJumps).toBe(airJumps);
      expect(() =>
        parseCheckpoint(e.checkpoint(), { program, sourceHash: hash }),
      ).not.toThrow();
    }
    const invalid = structuredClone(a);
    invalid.rules[0].actions = [
      { type: "physics", target: "self", airJumps: 0.5 },
    ];
    expect(() => new GameEngine().activate(invalid, hash)).toThrow();
  });
  it("accepts legitimate tick expressions after ten thousand ticks", () => {
    const program = structuredClone(a);
    program.rules[0].actions = [
      {
        type: "physics",
        target: "self",
        gravityScale: { mul: [{ field: "tick" }, 0.00005] },
      },
    ];
    const e = new GameEngine();
    e.world.tick = 20000;
    e.activate(program, hash);
    expect(e.world.entities[0].physics.gravityScale).toBe(1);
    expect(() =>
      parseCheckpoint(e.checkpoint(), { program, sourceHash: hash }),
    ).not.toThrow();
  });
  it("rejects authored identity/order changes, duplicate ember and forged spawned records", () => {
    const e = new GameEngine();
    e.activate(b, hash);
    e.step();
    const valid = e.checkpoint(),
      expected = { program: b, sourceHash: hash };
    const wrong = structuredClone(valid);
    [wrong.snapshot.entities[3], wrong.snapshot.entities[4]] = [
      wrong.snapshot.entities[4],
      wrong.snapshot.entities[3],
    ];
    expect(() => parseCheckpoint(wrong, expected)).toThrow();
    const duplicate = structuredClone(valid);
    duplicate.snapshot.entities.push({
      ...duplicate.snapshot.entities[7],
      id: "another-ember",
    });
    expect(() => parseCheckpoint(duplicate, expected)).toThrow();
    const forged = structuredClone(valid);
    forged.snapshot.entities[8].id = "spawn:other:courier:0:0";
    expect(() => parseCheckpoint(forged, expected)).toThrow();
    const expired = structuredClone(valid);
    expired.snapshot.entities[8].expires = 999999;
    expect(() => parseCheckpoint(expired, expected)).toThrow();
  });
  it("rejects forged composition rules, bad modifier fields and deleted baseline geometry", () => {
    const e = new GameEngine(),
      program = composeRulePrograms([a, b]);
    e.activate(program, hash);
    const expected = { program, sourceHash: hash },
      bad = e.checkpoint();
    bad.program!.rules[0].actions = [{ type: "timer", value: 1 }];
    expect(() => parseCheckpoint(bad, expected)).toThrow();
    const extreme = e.checkpoint();
    extreme.snapshot.entities[0].physics.gravityScale = Infinity;
    expect(() => parseCheckpoint(extreme, expected)).toThrow();
    const route = e.checkpoint();
    route.snapshot.surfaces = route.snapshot.surfaces.filter(
      (s) => s.id !== "arrival",
    );
    expect(() => parseCheckpoint(route, expected)).toThrow();
  });
  it("never accepts an engine1 restore or approval identity as engine2", () => {
    const e = new GameEngine(),
      old = e.checkpoint();
    (old.snapshot as { version: string }).version = "last-light/1.0.0";
    expect(() => e.restore(old)).toThrow(/version/);
    expect(() =>
      parseCheckpoint(old, { program: null, sourceHash: null }),
    ).toThrow();
  });
  it("rejects cue-only artifact injections of physics or solid geometry", () => {
    const program: RuleProgram = {
        version: 1,
        name: "Glow",
        description: "Synthetic grant attack fixture",
        rules: [
          {
            id: "glow",
            each: "player",
            when: always,
            actions: [
              { type: "cue", target: "self", color: "mint", intensity: 1 },
            ],
          },
        ],
      },
      e = new GameEngine();
    e.activate(program, hash);
    const expected = { program, sourceHash: hash },
      physics = e.checkpoint();
    physics.snapshot.modifiers.push({
      id: "glow:courier:0",
      entityId: "courier",
      expires: 0,
      physics: { gravityScale: 0.3 },
    });
    physics.snapshot.entities[0].physics.gravityScale = 0.3;
    expect(() => parseCheckpoint(physics, expected)).toThrow(/grants no timed/);
    const surface = e.checkpoint();
    surface.snapshot.surfaces.push({
      id: "glow:courier:0",
      owner: "courier",
      x: 200,
      y: 448,
      w: 100,
      h: 9,
      expires: 0,
      solid: true,
      generated: true,
    });
    expect(() => parseCheckpoint(surface, expected)).toThrow(
      /grants no surface/,
    );
    const direct = e.checkpoint();
    direct.snapshot.entities[0].physics.gravityScale = 0.3;
    expect(() => parseCheckpoint(direct, expected)).toThrow(/ungranted/);
  });
  it("binds surface dimensions, solidity, owner/action index and TTL to the exact grant", () => {
    const program: RuleProgram = {
        version: 1,
        name: "Surface",
        description: "Synthetic grant fixture",
        rules: [
          {
            id: "surface",
            each: "player",
            when: always,
            actions: [
              {
                type: "createSurface",
                offsetX: 50,
                offsetY: 0,
                width: 80,
                lifetime: 4,
                solid: false,
              },
            ],
          },
        ],
      },
      e = new GameEngine();
    e.activate(program, hash);
    const expected = { program, sourceHash: hash };
    expect(() =>
      parseCheckpoint(JSON.parse(JSON.stringify(e.checkpoint())), expected),
    ).not.toThrow();
    for (const change of [
      { w: 90 },
      { x: 2000 },
      { y: 0 },
      { solid: true },
      { owner: "counterweight" },
      { id: "surface:courier:5" },
      { expires: 4 },
    ]) {
      const cp = e.checkpoint();
      Object.assign(
        cp.snapshot.surfaces.find((s) => s.generated)!,
        change,
      );
      expect(() => parseCheckpoint(cp, expected)).toThrow();
    }
  });
  it("binds timed material/physics type, values, target and duration, preserving composition namespaces", () => {
    const material: RuleProgram = {
        version: 1,
        name: "Material",
        description: "Synthetic grant fixture",
        rules: [
          {
            id: "material",
            each: "prop",
            when: always,
            actions: [
              {
                type: "material",
                target: "self",
                friction: 0.8,
                bounce: 0.4,
                lifetime: 180,
              },
            ],
          },
        ],
      },
      program = composeRulePrograms([a, material]),
      e = new GameEngine();
    e.activate(program, hash);
    e.step();
    const expected = { program, sourceHash: hash };
    expect(() =>
      parseCheckpoint(JSON.parse(JSON.stringify(e.checkpoint())), expected),
    ).not.toThrow();
    const index = e.world.modifiers.findIndex((m) => Boolean(m.material));
    for (const change of [
      { entityId: "courier" },
      { expires: 1000 },
      { physics: { gravityScale: 0.5 } },
      { material: { friction: 0.8, bounce: 0.9 } },
      { id: "l1--material:counterweight:4" },
    ]) {
      const cp = e.checkpoint();
      Object.assign(cp.snapshot.modifiers[index], change);
      expect(() => parseCheckpoint(cp, expected)).toThrow();
    }
    const changed = e.checkpoint();
    changed.snapshot.modifiers.find((m) => m.physics)!.physics!.gravityScale =
      1;
    expect(() => parseCheckpoint(changed, expected)).toThrow(
      /expression grant/,
    );
  });
});
