import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import artifact from "../docs/evidence/generation/evaluation-stationary-shadow.json";
import { compileRuleSource } from "../src/game/rules";
import { GameEngine } from "../src/game/core";
import { EMPTY_INPUT } from "../src/game/contracts";
const program = compileRuleSource(artifact.candidate.source);
const step = (engine: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) engine.step();
};
const create = () => {
  const engine = new GameEngine();
  engine.activate(program, artifact.candidate.sourceHash);
  return engine;
};
describe("exact independently generated stationary-shadow artifact", () => {
  it("tests the exact source whose hash is recorded in genuine SDK evidence", () => {
    expect(
      createHash("sha256").update(artifact.candidate.source).digest("hex"),
    ).toBe(artifact.candidate.sourceHash);
    expect(artifact.model).toBe("gpt-6.1-sol");
  });
  it("creates collision only after the source's thirty-tick stillness condition", () => {
    const engine = create();
    step(engine, 30);
    expect(engine.world.entities[1].stationaryTicks).toBe(30);
    expect(
      engine.world.surfaces.some(
        (s) => s.generated && s.owner === "counterweight",
      ),
    ).toBe(false);
    engine.step();
    expect(engine.world.surfaces.some((s) => s.generated && s.solid)).toBe(
      true,
    );
  });
  it("dissolves the collision when the owner moves or the lantern is extinguished", () => {
    const engine = create();
    step(engine, 32);
    engine.world.entities[1].vx = 2;
    step(engine, 2);
    expect(
      engine.world.surfaces.some(
        (s) => s.generated && s.owner === "counterweight",
      ),
    ).toBe(false);
    const dark = create();
    step(dark, 32);
    dark.world.lanternOn = false;
    step(dark, 2);
    expect(dark.world.surfaces.some((s) => s.generated)).toBe(false);
  });
  it("supports a real player crossing while its prop remains stationary", () => {
    const engine = create();
    step(engine, 32);
    engine.world.entities[0].x = 570;
    for (let i = 0; i < 135; i++) engine.step({ ...EMPTY_INPUT, right: true });
    expect(engine.world.checkpoint).toBe(1);
    expect(engine.world.deaths).toBe(0);
    expect(engine.world.entities[1].x).toBe(510);
  });
});
