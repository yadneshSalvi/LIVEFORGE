import { describe, it, expect } from "vitest";
import { InputLatch } from "../src/game/input";
import { GameEngine } from "../src/game/core";
import { EMPTY_INPUT } from "../src/game/contracts";
describe("fixed-step input edge retention", () => {
  it("preserves an E down/up between ticks and turns the Hall crank exactly once", () => {
    const engine = new GameEngine(),
      input = new InputLatch();
    engine.world.entities[0].x = 1260;
    input.update({ ...EMPTY_INPUT, interact: true });
    input.update({ ...EMPTY_INPUT });
    engine.step(input.consume());
    expect(engine.world.encounters.counterweight).toBe(true);
    engine.step(input.consume());
    expect(
      engine.world.surfaces.filter((s) => s.id === "hall-causeway"),
    ).toHaveLength(1);
  });
  it("preserves quick jump and recovery taps without holding either action", () => {
    const engine = new GameEngine(),
      input = new InputLatch();
    input.update({ ...EMPTY_INPUT, jump: true });
    input.update({ ...EMPTY_INPUT });
    engine.step(input.consume());
    expect(engine.world.entities[0].vy).toBeLessThan(0);
    expect(input.consume().jump).toBe(false);
    input.update({ ...EMPTY_INPUT, reset: true });
    input.update({ ...EMPTY_INPUT });
    engine.step(input.consume());
    expect(engine.world.deaths).toBe(1);
    engine.step(input.consume());
    expect(engine.world.deaths).toBe(1);
  });
  it("keeps movement and prop pushing held while consuming each rising edge once", () => {
    const input = new InputLatch();
    input.update({ ...EMPTY_INPUT, right: true, interact: true });
    expect(input.consume()).toMatchObject({
      right: true,
      interact: true,
      pressed: { interact: true },
    });
    expect(input.consume()).toMatchObject({
      right: true,
      interact: true,
      pressed: { interact: false },
    });
    input.update({ ...EMPTY_INPUT, right: true });
    input.update({ ...EMPTY_INPUT, right: true, interact: true });
    expect(input.consume().pressed?.interact).toBe(true);
  });
  it("clears queued actions on pause/restore boundary", () => {
    const input = new InputLatch();
    input.update({ ...EMPTY_INPUT, jump: true, interact: true });
    input.clear();
    expect(input.consume()).toMatchObject({
      ...EMPTY_INPUT,
      pressed: { jump: false, interact: false, reset: false },
    });
  });
});
