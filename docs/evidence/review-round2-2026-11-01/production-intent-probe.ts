import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GameEngine } from "../../../src/game/core";
import { EMPTY_INPUT } from "../../../src/game/contracts";
import { compileRuleSource } from "../../../src/game/rules";
const evidence = JSON.parse(await readFile(process.argv[2], "utf8"));
const source = evidence.candidate.source;
const hash = createHash("sha256").update(source).digest("hex");
if (hash !== evidence.candidate.sourceHash)
  throw new Error("Source identity mismatch");
const program = compileRuleSource(source);
const make = (active: boolean) => {
  const e = new GameEngine();
  for (let i = 0; i < 30; i++) e.step({ ...EMPTY_INPUT });
  if (active) e.activate(program, hash);
  return e;
};
const e = make(true);
const idleScale = e.world.entities[0].physics.gravityScale;
const held: number[] = [];
for (let i = 0; i < 10; i++) {
  e.step({ ...EMPTY_INPUT, interact: true });
  held.push(e.world.entities[0].physics.gravityScale);
}
e.step({ ...EMPTY_INPUT });
const releasedScale = e.world.entities[0].physics.gravityScale;
function flight(active: boolean, hold: boolean) {
  const e = make(active);
  const start = e.world.entities[0].y;
  e.step({ ...EMPTY_INPUT, jump: true, interact: hold });
  let apex = e.world.entities[0].y,
    ticks = 1;
  while (!e.world.entities[0].grounded && ticks < 900) {
    e.step({ ...EMPTY_INPUT, interact: hold });
    apex = Math.min(apex, e.world.entities[0].y);
    ticks++;
  }
  return {
    height: start - apex,
    airtime: ticks,
    landed: e.world.entities[0].grounded,
  };
}
const baseline = flight(false, false),
  ordinary = flight(true, false),
  heldFlight = flight(true, true);
const checks = {
  heldNearOneThird: held.every((x) => Math.abs(x - 1 / 3) < 0.005),
  releaseRestoresNormal: releasedScale === 1,
  unheldJumpMatchesBaseline:
    Math.abs(ordinary.height - baseline.height) < 0.001 &&
    ordinary.airtime === baseline.airtime,
  heldJumpHigherAndLonger:
    heldFlight.height > baseline.height * 1.5 &&
    heldFlight.airtime > baseline.airtime * 1.5,
  landsAgain: heldFlight.landed,
};
const result = {
  at: new Date().toISOString(),
  sourceHash: hash,
  proposal: evidence.proposal.text,
  purpose:
    "Independent intent measurements on exact real generated source; deterministic simulation, not a browser or viewer count",
  measurements: {
    idleScale,
    held,
    releasedScale,
    baseline,
    ordinary,
    heldFlight,
  },
  checks,
  passed: Object.values(checks).every(Boolean),
};
await writeFile(
  "docs/evidence/review-round2-2026-11-01/production-intent.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
