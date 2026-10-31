/** Hand-authored calibration fixtures. Never count these as real Codex generation evidence. */
import { measureIntent, measureProgramIntent } from "./intent-probes";
import { writeFile } from "node:fs/promises";
import {
  compileRuleSource,
  composeRulePrograms,
} from "../../../src/game/rules";
const yes = { compare: { left: 1, op: "eq", right: 1 } };
const near = (field: string, radius: number) => ({
  compare: { left: { field }, op: "lt", right: radius },
});
const rule = (
  id: string,
  each: string,
  actions: unknown[],
  when: unknown = yes,
  on?: string,
) => ({ id, each, when, actions, ...(on ? { on } : {}) });
const fixtures: Record<string, unknown[]> = {
  E01: [
    rule("moon", "player", [
      { type: "physics", target: "self", gravityScale: 0.35 },
    ]),
  ],
  E02: [
    rule("double", "player", [
      { type: "physics", target: "self", airJumps: 1 },
    ]),
  ],
  E03: [
    rule(
      "giant",
      "player",
      [{ type: "physics", target: "self", playerScale: 1.6 }],
      { compare: { left: { field: "inputInteract" }, op: "eq", right: 1 } },
    ),
  ],
  E04: [
    rule(
      "wind",
      "prop",
      [{ type: "physics", target: "self", windX: 0.15 }],
      near("distanceToLantern", 150),
    ),
  ],
  E05: [
    rule(
      "slow",
      "prop",
      [{ type: "physics", target: "self", timeScale: 0.5 }],
      near("distanceToPlayer", 150),
    ),
  ],
  E06: [
    rule(
      "rubber",
      "ember",
      [{ type: "material", target: "self", friction: 0.9, bounce: 0.8 }],
      { compare: { left: { field: "emberCarried" }, op: "eq", right: 0 } },
    ),
  ],
  E07: [
    rule(
      "step",
      "player",
      [
        {
          type: "spawnPlatform",
          offsetX: 60,
          offsetY: 0,
          width: 70,
          lifetime: 120,
          solid: true,
          maxCount: 4,
        },
      ],
      yes,
      "land",
    ),
  ],
  E08: [
    rule(
      "momentum",
      "player",
      [
        {
          type: "physics",
          target: "self",
          jumpStrength: {
            clamp: {
              value: {
                add: [
                  1,
                  {
                    mul: [
                      {
                        max: [{ field: "vx" }, { mul: [-1, { field: "vx" }] }],
                      },
                      0.12,
                    ],
                  },
                ],
              },
              min: 1,
              max: 1.6,
            },
          },
        },
      ],
      yes,
      "jump",
    ),
  ],
  E09: [
    rule(
      "touch-bounce",
      "prop",
      [
        {
          type: "material",
          target: "self",
          friction: 0.82,
          bounce: 0.7,
          lifetime: 180,
        },
      ],
      yes,
      "touch",
    ),
  ],
  E10: [
    rule(
      "shadow",
      "prop",
      [
        {
          type: "projectShadow",
          maxLength: 480,
          thickness: 8,
          lifetime: 1,
          solid: true,
        },
      ],
      { compare: { left: { field: "stationaryTicks" }, op: "gte", right: 30 } },
    ),
  ],
};
const records = [];
for (const [id, rules] of Object.entries(fixtures)) {
  try {
    const result = measureIntent(
      id,
      JSON.stringify({
        version: 1,
        name: "Explicit hand-authored probe calibration",
        description:
          "A synthetic fixture used only to validate the acceptance measurement, never counted as generation evidence.",
        rules,
      }),
    );
    records.push(result);
    console.log(
      JSON.stringify({
        id,
        passed: result.automatedIntentPassed,
        failed: result.checks.filter((c) => !c.passed),
      }),
    );
  } catch (e) {
    records.push({ caseId: id, error: String(e) });
    console.log(JSON.stringify({ id, error: String(e) }));
  }
}
const noOpSource = JSON.stringify({
  version: 1,
  name: "Deliberately unrelated calibration law",
  description: "Only glows. This must not count as requested physics.",
  rules: [
    rule("glow", "player", [
      { type: "cue", target: "self", color: "mint", intensity: 0.2 },
    ]),
  ],
});
const negatives = Object.keys(fixtures).map((id) => {
  try {
    return {
      id,
      incorrectlyPassed: measureIntent(id, noOpSource).automatedIntentPassed,
    };
  } catch {
    return { id, incorrectlyPassed: false };
  }
});
const combinations = [
  ["E01", "E02"],
  ["E01", "E02", "E03"],
].map((members) => {
  const program = composeRulePrograms(
    members.map((id) =>
      compileRuleSource(
        JSON.stringify({
          version: 1,
          name: "Hand-authored combination fixture",
          description: "Synthetic calibration only",
          rules: fixtures[id],
        }),
      ),
    ),
  );
  const measurements = members.map((id) =>
    measureProgramIntent(id, program, "c".repeat(64)),
  );
  return {
    members,
    passed: measurements.every((m) => m.automatedIntentPassed),
    measurements,
  };
});
console.log(
  JSON.stringify({
    calibrationCombinations: combinations.map(({ members, passed }) => ({
      members,
      passed,
    })),
  }),
);
await writeFile(
  ".local/intent-probe-calibration.json",
  JSON.stringify(
    {
      note: "HAND-AUTHORED synthetic fixtures. No provider calls. These validate the probe harness only, not L8 generation acceptance.",
      records,
      negatives,
      combinations,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    negativeFalsePositives: negatives.filter((n) => n.incorrectlyPassed).length,
  }),
);
