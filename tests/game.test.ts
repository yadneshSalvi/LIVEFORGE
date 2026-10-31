import { describe, it, expect } from "vitest";
import { GameEngine } from "../src/game/core";
import { EMPTY_INPUT } from "../src/game/contracts";
import { compileRuleSource, PRACTICE_RULE_SOURCE } from "../src/game/rules";
const step = (e: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) e.step({ ...EMPTY_INPUT });
};
describe("authoritative fixed-step world", () => {
  it("has no solid shadow geometry before a rule directs it", () => {
    const e = new GameEngine();
    step(e, 90);
    expect(e.world.surfaces.some((s) => s.generated)).toBe(false);
    expect(e.world.ember).toBe(true);
  });
  it("projects a physical bridge from a stationary prop and supports the courier", () => {
    const e = new GameEngine();
    e.activate(compileRuleSource(PRACTICE_RULE_SOURCE), "practice");
    step(e, 30);
    const bridge = e.world.surfaces.find((s) => s.generated)!;
    expect(bridge.x).toBe(530);
    expect(bridge.x + bridge.w).toBeGreaterThan(950);
    e.world.entities[0].x = 710;
    e.world.entities[0].y = 390;
    e.world.entities[0].vy = 3;
    step(e, 12);
    expect(e.world.entities[0].y).toBe(400);
    expect(e.world.entities[0].grounded).toBe(true);
  });
  it("removes the stillness-conditioned collision after moving the owner", () => {
    const e = new GameEngine();
    e.activate(compileRuleSource(PRACTICE_RULE_SOURCE), "practice");
    step(e, 30);
    e.world.entities[1].vx = 2;
    step(e, 4);
    expect(
      e.world.surfaces.some((s) => s.generated && s.owner === "counterweight"),
    ).toBe(false);
  });
  it("rollback restores the exact activation checkpoint including progress and ember", () => {
    const e = new GameEngine();
    e.world.progress = 0.4;
    e.world.checkpoint = 1;
    const before = e.checkpoint();
    e.activate(compileRuleSource(PRACTICE_RULE_SOURCE), "approved-hash");
    step(e, 100);
    e.rollback();
    expect(e.checkpoint()).toEqual(before);
  });
  it("serializes a checkpoint through JSON and restores deterministically", () => {
    const e = new GameEngine();
    step(e, 60);
    const checkpoint = JSON.parse(JSON.stringify(e.checkpoint()));
    const other = new GameEngine();
    other.restore(checkpoint);
    step(e, 60);
    step(other, 60);
    expect(e.checkpoint()).toEqual(other.checkpoint());
  });
  it("has a jumpable lower path without a generated law", () => {
    const e = new GameEngine();
    const p = e.world.entities[0];
    p.x = 567;
    for (let t = 0; t < 330; t++) {
      const jump =
        p.grounded &&
        ((p.x > 590 && p.x < 650) ||
          (p.x > 710 && p.x < 760) ||
          (p.x > 860 && p.x < 950));
      e.step({ ...EMPTY_INPUT, right: true, jump });
      if (e.world.checkpoint === 1) break;
    }
    expect(e.world.checkpoint).toBe(1);
    expect(e.world.deaths).toBe(0);
  });
  it("recovers to the latest checkpoint without erasing progress", () => {
    const e = new GameEngine();
    e.world.checkpoint = 1;
    e.world.progress = 0.6;
    e.world.entities[0].y = 670;
    e.step();
    expect(e.world.entities[0].x).toBe(1080);
    expect(e.world.progress).toBe(0.6);
    expect(e.world.ember).toBe(true);
  });
  it("completes all three encounters on the baseline stepping-stone route", () => {
    const e = new GameEngine();
    for (let t = 0; t < 1200 && !e.world.completed; t++) {
      const p = e.world.entities[0];
      const jump =
        p.grounded &&
        ((p.x > 590 && p.x < 650) ||
          (p.x > 860 && p.x < 950) ||
          (p.x > 1450 && p.x < 1510) ||
          (p.x > 1710 && p.x < 1800));
      e.step({ ...EMPTY_INPUT, right: true, jump, interact: p.x > 1160 });
    }
    expect(e.world.completed).toBe(true);
    expect(e.world.checkpoint).toBe(2);
    expect(e.world.encounters).toEqual({ counterweight: true, guardian: true });
    expect(e.world.deaths).toBe(0);
    expect(e.world.ember).toBe(true);
  });
  it("rejects corrupt checkpoint geometry before replacing the live world", () => {
    const e = new GameEngine(),
      before = e.checkpoint(),
      bad = e.checkpoint();
    bad.snapshot.surfaces[0].w = Infinity;
    expect(() => e.restore(bad)).toThrow();
    expect(e.checkpoint()).toEqual(before);
  });

  it("treats repeated exact activation as idempotent and rejects changed content under one identity", () => {
    const e = new GameEngine(),
      program = compileRuleSource(PRACTICE_RULE_SOURCE),
      before = e.checkpoint();
    e.activate(program, "immutable-1");
    step(e, 60);
    e.activate(structuredClone(program), "immutable-1");
    const changed = structuredClone(program);
    changed.name = "Changed";
    expect(() => e.activate(changed, "immutable-1")).toThrow(/identity/);
    e.rollback();
    expect(e.checkpoint()).toEqual(before);
  });

  it("removes generated shadow collision when the lantern is off", () => {
    const e = new GameEngine();
    e.activate(compileRuleSource(PRACTICE_RULE_SOURCE), "practice");
    step(e, 30);
    expect(e.world.surfaces.some((s) => s.generated)).toBe(true);
    e.world.lanternOn = false;
    step(e, 3);
    expect(e.world.surfaces.some((s) => s.generated)).toBe(false);
  });
  it("lets the player walk across the actual projected shadow while the owner stays still", () => {
    const e = new GameEngine();
    e.activate(compileRuleSource(PRACTICE_RULE_SOURCE), "practice");
    step(e, 30);
    e.world.entities[0].x = 570;
    for (let t = 0; t < 135; t++) e.step({ ...EMPTY_INPUT, right: true });
    expect(e.world.checkpoint).toBe(1);
    expect(e.world.deaths).toBe(0);
    expect(e.world.entities[1].x).toBe(510);
  });
  it("requires the courier to perform both later authored interactions", () => {
    const e = new GameEngine();
    e.world.entities[0].x = 1320;
    for (let t = 0; t < 20; t++) e.step({ ...EMPTY_INPUT, right: true });
    expect(e.world.entities[0].x).toBe(1335);
    e.step({ ...EMPTY_INPUT, interact: true });
    expect(e.world.encounters.counterweight).toBe(true);
    expect(e.world.surfaces.some((s) => s.id === "hall-causeway")).toBe(true);
    e.world.entities[0].x = 2110;
    for (let t = 0; t < 20; t++) e.step({ ...EMPTY_INPUT, right: true });
    expect(e.world.entities[0].x).toBe(2120);
    e.step({ ...EMPTY_INPUT, interact: true });
    expect(e.world.encounters.guardian).toBe(true);
  });
});
