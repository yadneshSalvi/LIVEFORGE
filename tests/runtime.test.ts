import { describe, it, expect } from "vitest";
import {
  compileRuleSource,
  PRACTICE_RULE_SOURCE,
  verifyRuleProgram,
  validateRuleProgram,
} from "../src/game/rules";
import { GameEngine } from "../src/game/core";
import { EMPTY_INPUT, type RuleProgram } from "../src/game/contracts";
const sample = () => compileRuleSource(PRACTICE_RULE_SOURCE);
describe("bounded generated-rule compiler", () => {
  it("parses the disclosed prewritten TypeScript literal and JSON identically", () => {
    const program = sample();
    expect(compileRuleSource(JSON.stringify(program))).toEqual(program);
  });
  it.each([
    "import fs from 'fs'; export default {}",
    "export default (()=>{while(true){}})()",
    "export default {get name(){return process.env}}",
    "export default {...globalThis}",
    "export default {name: fetch('https://example.test')}",
    "export default {__proto__: {}}",
    "export default {version:1,version:1}",
    "export default `hello ${process.env}`",
  ])("rejects executable or ambiguous syntax: %s", (source) => {
    expect(() => compileRuleSource(source)).toThrow();
  });
  it("rejects extra capabilities, nonfinite values, excessive sizes and nesting", () => {
    expect(() =>
      validateRuleProgram({ ...sample(), network: "fetch" }),
    ).toThrow();
    const p = sample();
    p.rules[0].actions = [
      { type: "impulse", target: "player", x: Infinity, y: 0 },
    ];
    expect(() => validateRuleProgram(p)).toThrow();
    expect(() => compileRuleSource(" ".repeat(24001))).toThrow();
    expect(() =>
      compileRuleSource("[".repeat(25) + "0" + "]".repeat(25)),
    ).toThrow();
  });
  it("checks actual effects independently and reports observed simulation counts", () => {
    const report = verifyRuleProgram(sample());
    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
    expect(report.ticksSimulated).toBe(4890);
    expect(report.effects.surfacesCreated).toBeGreaterThan(0);
  });
  it("rejects bounded syntax that still drives the courier outside protected bounds", () => {
    const p = sample();
    p.rules = [
      {
        id: "lift",
        each: "player",
        when: { compare: { left: 1, op: "eq", right: 1 } },
        actions: [{ type: "impulse", target: "self", x: 0, y: -2 }],
      },
    ];
    expect(verifyRuleProgram(p).passed).toBe(false);
  });
  it("supports a different composition without any mechanic catalog entry", () => {
    const p: RuleProgram = {
      version: 1,
      name: "Nearness glows",
      description: "The lantern answers a nearby courier.",
      rules: [
        {
          id: "near-lamp",
          each: "lantern",
          when: {
            compare: {
              left: { field: "distanceToPlayer" },
              op: "lt",
              right: 250,
            },
          },
          actions: [
            { type: "cue", target: "self", color: "coral", intensity: 0.6 },
          ],
        },
      ],
    };
    const e = new GameEngine();
    e.activate(p, "novel");
    e.step();
    expect(e.world.entities[2].cue?.color).toBe("coral");
    expect(verifyRuleProgram(p).passed).toBe(true);
  });
  it("preserves the original world if a whole action batch fails", () => {
    const e = new GameEngine();
    const before = e.checkpoint();
    const p = sample();
    p.rules[0].when = { compare: { left: 1, op: "eq", right: 1 } };
    p.rules[0].actions = [
      {
        type: "createSurface",
        offsetX: 0,
        offsetY: -200,
        width: 320,
        lifetime: 1,
        solid: true,
      },
    ];
    e.world.entities[1].y = -500;
    const altered = e.checkpoint();
    expect(() => e.activate(p, "bad-geometry")).toThrow();
    expect(e.checkpoint()).toEqual(altered);
    e.restore(before);
  });
  it("rejects an impossible-condition candidate and a zero-impulse no-op", () => {
    const p = sample();
    p.rules[0].when = { compare: { left: 1, op: "gt", right: 2 } };
    expect(verifyRuleProgram(p).passed).toBe(false);
    p.rules[0].when = { compare: { left: 1, op: "eq", right: 1 } };
    p.rules[0].actions = [{ type: "impulse", target: "self", x: 0, y: 0 }];
    expect(verifyRuleProgram(p).passed).toBe(false);
  });
  it("recognizes actual material and timer state changes as supported behavior", () => {
    const p = sample();
    p.rules[0].when = { compare: { left: 1, op: "eq", right: 1 } };
    p.rules[0].actions = [
      { type: "material", target: "player", friction: 0.7, bounce: 0.1 },
      { type: "timer", value: 40 },
    ];
    expect(verifyRuleProgram(p).passed).toBe(true);
  });
});
