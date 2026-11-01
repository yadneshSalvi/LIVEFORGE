import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorld } from "../src/game/core";
import { applyRuleProgram } from "../src/game/runtime";
import { type RuleAction, type RuleProgram } from "../src/game/contracts";
import {
  compileRuleSource,
  verifyRuleComposition,
  verifyRuleProgram,
} from "../src/game/rules";
const always = { compare: { left: 1, op: "eq", right: 1 } } as const;
const law = (
  actions: RuleAction[],
  each: "player" | "ember" = "player",
): RuleProgram => ({
  version: 1,
  name: "Round three fixture",
  description: "Synthetic regression fixture.",
  rules: [{ id: "fixture", each, when: always, actions }],
});
const physics = (gravityScale: number) =>
  law([{ type: "physics", target: "self", gravityScale }]);
const providers = [
  "review-2026-11-01/provider-5ac7482-originals",
  "review-round2-2026-11-01/provider-3a74ae3",
];
describe("round three trusted verifier", () => {
  it.each(providers)(
    "accepts original moon/extra-jump and grow stacks from %s",
    (provider) => {
      const programs = [1, 2, 3].map((id) =>
        compileRuleSource(
          JSON.parse(
            readFileSync(
              `docs/evidence/${provider}/evaluation-E0${id}.json`,
              "utf8",
            ),
          ).candidate.source,
        ),
      );
      expect(verifyRuleComposition(programs.slice(0, 2)).passed).toBe(true);
      expect(verifyRuleComposition(programs).passed).toBe(true);
    },
  );
  it.each([
    [0.5, { jumpStrength: 1.4 }],
    [0.4, { airJumps: 1 }],
  ] as const)(
    "accepts bounded gravity %s with a legal jump law",
    (gravity, jump) => {
      expect(
        verifyRuleComposition([
          physics(gravity),
          law([{ type: "physics", target: "self", ...jump }]),
        ]).passed,
      ).toBe(true);
    },
  );
  it("measures dropped ember physics", () => {
    expect(
      verifyRuleProgram(
        law([{ type: "physics", target: "self", gravityScale: 0.3 }], "ember"),
      ).passed,
    ).toBe(true);
  });
  it("measures gravity enabled after tick 300", () => {
    const program = physics(0.5);
    program.rules[0].when = {
      compare: { left: { field: "tick" }, op: "gt", right: 300 },
    };
    expect(verifyRuleProgram(program).passed).toBe(true);
  });
  it("measures dropped ember gravity enabled after tick 300", () => {
    const program = law(
      [{ type: "physics", target: "self", gravityScale: 0.3 }],
      "ember",
    );
    program.rules[0].when = {
      compare: { left: { field: "tick" }, op: "gt", right: 300 },
    };
    expect(verifyRuleProgram(program).passed).toBe(true);
  });
  it("still rejects negligible gravity", () =>
    expect(verifyRuleProgram(physics(0.999)).passed).toBe(false));
  it("accepts spawn skips at the law's own limit", () => {
    expect(
      verifyRuleProgram(
        law([
          {
            type: "spawnProp",
            offsetX: 60,
            offsetY: 0,
            cooldown: 60,
            maxCount: 2,
            lifetime: 600,
          },
        ]),
      ).passed,
    ).toBe(true);
  });
  it.each(["surfaces", "spawns"] as const)(
    "own %s limits take priority at an exactly full global budget",
    (kind) => {
      const program = law([
        kind === "surfaces"
          ? {
              type: "spawnPlatform",
              offsetX: 0,
              offsetY: 0,
              width: 50,
              lifetime: 600,
              solid: true,
              maxCount: 8,
            }
          : {
              type: "spawnProp",
              offsetX: 60,
              offsetY: 0,
              cooldown: 1,
              lifetime: 600,
              maxCount: 4,
            },
      ]);
      program.rules = Array.from(
        { length: kind === "surfaces" ? 6 : 3 },
        (_, id) => ({ ...program.rules[0], id: `boundary-${id}` }),
      );
      let world = createWorld();
      for (let tick = 0; tick < 10; tick++) {
        world.tick = tick;
        const result = applyRuleProgram(world, program);
        expect(result.diagnostics.globalSurfacesSkipped).toBe(0);
        expect(result.diagnostics.globalSpawnsSkipped).toBe(0);
        world = result.world;
      }
      expect(
        kind === "surfaces"
          ? world.surfaces.filter((s) => s.generated).length
          : world.entities.filter((e) => e.spawnRule).length,
      ).toBe(kind === "surfaces" ? 48 : 12);
    },
  );
  it.each(["commands", "surfaces", "spawns"] as const)(
    "rejects the global %s budget overflow",
    (kind) => {
      const actions: RuleAction[] =
        kind === "commands"
          ? Array.from({ length: 6 }, () => ({
              type: "cue",
              target: "self",
              color: "mint",
              intensity: 1,
            }))
          : [
              kind === "surfaces"
                ? {
                    type: "spawnPlatform",
                    offsetX: 0,
                    offsetY: 0,
                    width: 50,
                    lifetime: 600,
                    solid: true,
                    maxCount: 8,
                  }
                : {
                    type: "spawnProp",
                    offsetX: 60,
                    offsetY: 0,
                    cooldown: 1,
                    lifetime: 600,
                    maxCount: 4,
                  },
            ];
      const program = law(actions);
      program.rules = Array.from({ length: 8 }, (_, id) => ({
        ...program.rules[0],
        id: `rule-${id}`,
        each: kind === "commands" ? "prop" : "player",
      }));
      const report = verifyRuleComposition([program, program, program]);
      expect(report.passed).toBe(false);
      const counter =
        kind === "commands"
          ? "commandsSkipped"
          : kind === "surfaces"
            ? "globalSurfacesSkipped"
            : "globalSpawnsSkipped";
      expect(
        report.checks.some(
          (check) => !check.passed && check.detail.includes(counter),
        ),
      ).toBe(true);
    },
  );
});
const stored = (provider: string, id: string) =>
  compileRuleSource(
    JSON.parse(
      readFileSync(`docs/evidence/${provider}/evaluation-${id}.json`, "utf8"),
    ).candidate.source,
  );
const ceilingDetail = "sustained ceiling contact for more than 30 ticks";
describe("sustained ceiling contact is rejected in every scenario", () => {
  it.each(
    providers.flatMap((provider) =>
      [
        ["E02", "E03"],
        ["E01", "E03"],
      ].map((ids) => [ids.join(" + "), provider, ids] as const),
    ),
  )("accepts original %s from %s", (_name, provider, ids) => {
    const report = verifyRuleComposition(ids.map((id) => stored(provider, id)));
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });
  it.each(
    providers.flatMap((provider) =>
      Array.from(
        { length: 10 },
        (_, i) => [`E${String(i + 1).padStart(2, "0")}`, provider] as const,
      ),
    ),
  )("accepts stored single %s from %s", (id, provider) => {
    const report = verifyRuleProgram(stored(provider, id));
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });
  const up: RuleAction = { type: "impulse", target: "self", x: 0, y: -2 };
  const pinning: [string, RuleProgram][] = [
    [
      "air-jump then float forever",
      {
        version: 1,
        name: "Pinning fixture",
        description: "Synthetic regression fixture.",
        rules: [
          {
            id: "grant",
            each: "player",
            when: always,
            actions: [{ type: "physics", target: "self", airJumps: 1 }],
          },
          {
            id: "float",
            each: "player",
            when: {
              compare: { left: { field: "airJumpsUsed" }, op: "gte", right: 1 },
            },
            actions: [up],
          },
        ],
      },
    ],
    [
      "float while the ember is dropped",
      {
        version: 1,
        name: "Pinning fixture",
        description: "Synthetic regression fixture.",
        rules: [
          {
            id: "float",
            each: "player",
            when: {
              compare: { left: { field: "emberCarried" }, op: "eq", right: 0 },
            },
            actions: [up],
          },
        ],
      },
    ],
  ];
  it.each(pinning)("rejects %s outside held-input stress", (_name, program) => {
    const report = verifyRuleProgram(program);
    expect(report.passed).toBe(false);
    const pinned = report.checks.filter(
      (check) => !check.passed && check.detail.includes(ceilingDetail),
    );
    expect(
      pinned.some(
        (check) => check.name !== "Held input stress and soft runtime budgets",
      ),
    ).toBe(true);
  });
});
