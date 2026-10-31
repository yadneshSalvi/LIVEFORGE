/** Independent acceptance measurements. Generated text is parsed as data, never executed. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { GameEngine } from "../../../src/game/core";
import {
  ENGINE_VERSION,
  EMPTY_INPUT,
  type Entity,
  type RuleProgram,
  type TickInput,
} from "../../../src/game/contracts";
import {
  compileRuleSource,
  verifyRuleProgram,
  verifyRuleComposition,
} from "../../../src/game/rules";

type Check = { name: string; passed: boolean; measurements: unknown };
type Probe = (program: RuleProgram, hash: string) => Check[];
const check = (
  name: string,
  passed: boolean,
  measurements: unknown,
): Check => ({
  name,
  passed,
  measurements,
});
const player = (e: GameEngine) => e.world.entities[0];
const crates = (e: GameEngine) =>
  e.world.entities.filter((x) => x.kind === "prop");
const idle = (e: GameEngine, count: number) => {
  for (let i = 0; i < count; i++) e.step({ ...EMPTY_INPUT });
};
function settled() {
  const e = new GameEngine();
  idle(e, 30);
  return e;
}
function active(program: RuleProgram, hash: string) {
  const e = settled();
  e.activate(program, hash);
  return e;
}
function place(e: Entity, x: number, y: number, vx = 0) {
  e.x = e.previousX = x;
  e.y = e.previousY = y;
  e.vx = vx;
  e.vy = 0;
  e.grounded = e.wasGrounded = true;
  e.stationaryTicks = 60;
}
function clone(e: GameEngine) {
  const copy = new GameEngine();
  copy.restore(e.checkpoint());
  return copy;
}
function jump(e: GameEngine, extra: Partial<TickInput> = {}) {
  e.step({ ...EMPTY_INPUT, ...extra, jump: true });
}
function flight(e: GameEngine) {
  const start = player(e).y;
  jump(e);
  let apex = player(e).y;
  let ticks = 1;
  while (!player(e).grounded && ticks < 900) {
    e.step({ ...EMPTY_INPUT });
    apex = Math.min(apex, player(e).y);
    ticks++;
  }
  return { airtime: ticks, height: start - apex, landed: player(e).grounded };
}
const probes: Record<string, Probe> = {
  E01(program, hash) {
    const baseline = flight(settled());
    const law = flight(active(program, hash));
    return [
      check(
        "Moon gravity visibly extends a jump",
        law.airtime > baseline.airtime * 1.15 ||
          law.height > baseline.height * 1.15,
        { baseline, law },
      ),
      check("The courier lands again", law.landed && law.airtime < 900, law),
    ];
  },
  E02(program, hash) {
    const e = active(program, hash);
    jump(e);
    for (let releaseTicks = 0; releaseTicks < 900; releaseTicks++) {
      idle(e, 1);
      if (player(e).vy >= 0 || player(e).grounded) break;
    }
    const noSecond = clone(e);
    noSecond.step({ ...EMPTY_INPUT });
    jump(e);
    const second = {
      withPress: player(e).vy,
      withoutPress: player(noSecond).vy,
    };
    for (let releaseTicks = 0; releaseTicks < 900; releaseTicks++) {
      idle(e, 1);
      if (player(e).vy >= 0 || player(e).grounded) break;
    }
    const noThird = clone(e);
    noThird.step({ ...EMPTY_INPUT });
    jump(e);
    const third = { withPress: player(e).vy, withoutPress: player(noThird).vy };
    let landingTicks = 0;
    while (!player(e).grounded && landingTicks++ < 900) idle(e, 1);
    jump(e);
    for (let releaseTicks = 0; releaseTicks < 900; releaseTicks++) {
      idle(e, 1);
      if (player(e).vy >= 0 || player(e).grounded) break;
    }
    const newFlight = clone(e);
    newFlight.step({ ...EMPTY_INPUT });
    jump(e);
    return [
      check(
        "A second airborne press adds upward motion",
        second.withPress < second.withoutPress - 2,
        second,
      ),
      check(
        "A third airborne press grants no extra jump",
        Math.abs(third.withPress - third.withoutPress) < 0.001,
        third,
      ),
      check(
        "Landing replenishes the extra jump",
        landingTicks < 900 && player(e).vy < player(newFlight).vy - 2,
        {
          landingTicks,
          renewedVy: player(e).vy,
          withoutPress: player(newFlight).vy,
        },
      ),
    ];
  },
  E03(program, hash) {
    const e = active(program, hash);
    const base = { w: player(e).baseW, h: player(e).baseH };
    for (let i = 0; i < 6; i++) e.step({ ...EMPTY_INPUT, interact: true });
    const held = { w: player(e).w, h: player(e).h };
    idle(e, 4);
    const released = { w: player(e).w, h: player(e).h };
    const ceiling = active(program, hash);
    // The existing foundry top is an overhead collision plane in this controlled arrangement.
    // Do not add or change protected route geometry merely to make a fixture convenient.
    place(player(ceiling), 1000, 462);
    ceiling.step({ ...EMPTY_INPUT, interact: true });
    const p = player(ceiling);
    const overlapsCeiling =
      p.x < 1470 && p.x + p.w > 950 && p.y < 448 && p.y + p.h > 448;
    return [
      check(
        "Holding interact enlarges the courier",
        held.w > base.w * 1.15 && held.h > base.h * 1.15,
        { base, held },
      ),
      check(
        "Release restores ordinary dimensions",
        released.w === base.w && released.h === base.h,
        released,
      ),
      check("Growth cannot intersect an overhead solid", !overlapsCeiling, {
        player: { y: p.y, h: p.h },
        ceilingY: 448,
      }),
    ];
  },
  E04(program, hash) {
    const e = settled();
    const props = crates(e);
    [350, 1060, 2400].forEach((x, i) => place(props[i], x, 384));
    const before = props.map((x) => x.x);
    e.activate(program, hash);
    idle(e, 12);
    const displacement = crates(e).map((x, i) => x.x - before[i]);
    return [
      check(
        "Every nearby crate moves right",
        displacement[0] > 0.15 && displacement[1] > 0.15,
        {
          displacement,
          fixture:
            "Two crates about 40 units from lamps; third more than 500 units away",
        },
      ),
      check(
        "A distant crate does not receive the same wind",
        Math.abs(displacement[2]) < 0.05,
        { distantDisplacement: displacement[2] },
      ),
    ];
  },
  E05(program, hash) {
    const base = settled();
    place(crates(base)[0], 220, 384, 4);
    place(crates(base)[1], 1150, 384, 4);
    const law = clone(base);
    law.activate(program, hash);
    idle(base, 5);
    idle(law, 5);
    const baseline = {
      near: crates(base)[0].x - 220,
      far: crates(base)[1].x - 1150,
    };
    const changed = {
      near: crates(law)[0].x - 220,
      far: crates(law)[1].x - 1150,
    };
    place(crates(law)[0], 1150, 384, 4);
    const restoredControl = settled();
    place(crates(restoredControl)[0], 1150, 384, 4);
    idle(law, 5);
    idle(restoredControl, 5);
    const restored = {
      law: crates(law)[0].x - 1150,
      control: crates(restoredControl)[0].x - 1150,
    };
    return [
      check(
        "Nearby motion is slower than the equal-speed control",
        changed.near > 0 && changed.near < baseline.near * 0.9,
        { baseline, changed },
      ),
      check(
        "Far motion stays normal",
        Math.abs(changed.far - baseline.far) < 0.05,
        { baseline, changed },
      ),
      check(
        "Moving out of range restores normal progression",
        Math.abs(restored.law - restored.control) < 0.05,
        restored,
      ),
    ];
  },
  E06(program, hash) {
    const e = active(program, hash);
    e.step({ ...EMPTY_INPUT, drop: true });
    let previousVy = 0;
    let reboundTick: number | null = null;
    for (let i = 0; i < 180; i++) {
      idle(e, 1);
      const ember = e.world.entities.find((x) => x.kind === "ember")!;
      if (previousVy > 0.5 && ember.vy < -0.5) {
        reboundTick = e.world.tick;
        break;
      }
      previousVy = ember.vy;
    }
    const ember = e.world.entities.find((x) => x.kind === "ember")!;
    place(player(e), ember.x - player(e).w - 5, 400);
    e.step({ ...EMPTY_INPUT, drop: true });
    idle(e, 5);
    const carried = e.world.entities.find((x) => x.kind === "ember")!;
    return [
      check("A dropped ember rebounds from the floor", reboundTick !== null, {
        reboundTick,
      }),
      check(
        "Pickup stops independent motion and preserves the objective",
        e.world.emberCarried &&
          e.world.ember &&
          carried.vx === 0 &&
          carried.vy === 0,
        {
          carried: e.world.emberCarried,
          objectivePresent: e.world.ember,
          velocity: { x: carried.vx, y: carried.vy },
        },
      ),
    ];
  },
  E07(program, hash) {
    const e = active(program, hash);
    const before = e.world.surfaces.filter((s) => s.generated).length;
    flight(e);
    idle(e, 2);
    const atLanding = e.world.surfaces.filter((s) => s.generated);
    const firstIds = new Set(atLanding.map((s) => s.id));
    const maxExpiry = Math.max(
      e.world.tick,
      ...atLanding.map((s) => s.expires),
    );
    let createdWhileStill = 0;
    let maximum = atLanding.length;
    const stillTicks = Math.min(700, maxExpiry - e.world.tick + 3);
    for (let i = 0; i < stillTicks; i++) {
      idle(e, 1);
      const surfaces = e.world.surfaces.filter((s) => s.generated);
      maximum = Math.max(maximum, surfaces.length);
      createdWhileStill += surfaces.filter((s) => !firstIds.has(s.id)).length;
    }
    // Advance to the observed expiry independently of any shrinking loop bound.
    while (e.world.tick <= maxExpiry + 2) idle(e, 1);
    const afterExpiry = e.world.surfaces.filter((s) => s.generated).length;
    for (let i = 0; i < 5; i++) {
      flight(e);
      idle(e, 2);
      maximum = Math.max(
        maximum,
        e.world.surfaces.filter((s) => s.generated).length,
      );
    }
    return [
      check(
        "An actual landing creates a nearby solid platform",
        atLanding.length > before &&
          atLanding.some((s) => s.solid && Math.abs(s.x - player(e).x) <= 350),
        {
          before,
          atLanding: atLanding.map((s) => ({
            x: s.x,
            y: s.y,
            expires: s.expires,
            solid: s.solid,
          })),
        },
      ),
      check(
        "Standing still does not create a platform flood",
        createdWhileStill === 0,
        { createdWhileStill, maximum },
      ),
      check(
        "The temporary platform expires and repeated landings stay bounded",
        afterExpiry === 0 && maximum <= 48,
        { maxExpiry, afterExpiry, maximum },
      ),
    ];
  },
  E08(program, hash) {
    const measurements = [0, 2, 4.2].map((speed) => {
      const e = settled();
      player(e).vx = speed;
      e.activate(program, hash);
      jump(e, { right: speed > 0 });
      return { speed, upwardVelocity: -player(e).vy };
    });
    return [
      check(
        "Running speed produces a monotonic, bounded stronger jump",
        measurements[1].upwardVelocity >= measurements[0].upwardVelocity &&
          measurements[2].upwardVelocity >= measurements[1].upwardVelocity &&
          measurements[2].upwardVelocity >
            measurements[0].upwardVelocity + 0.5 &&
          measurements.every((m) => m.upwardVelocity <= 20),
        measurements,
      ),
    ];
  },
  E09(program, hash) {
    const e = settled();
    place(crates(e)[0], 230, 384);
    e.activate(program, hash);
    let touchedAt: number | null = null;
    for (let i = 0; i < 30; i++) {
      e.step({ ...EMPTY_INPUT, right: true });
      if (crates(e)[0].bounce > 0) {
        touchedAt = e.world.tick;
        break;
      }
    }
    const bounceAtTouch = crates(e)[0].bounce;
    place(player(e), 100, 400);
    const start = touchedAt ?? e.world.tick;
    let bounceAt179 = 0;
    while (e.world.tick < start + 181) {
      idle(e, 1);
      if (e.world.tick === start + 179) bounceAt179 = crates(e)[0].bounce;
    }
    const bounceAt181 = crates(e)[0].bounce;
    return [
      check(
        "New contact makes the crate bouncy",
        touchedAt !== null && bounceAtTouch > 0,
        { touchedAt, bounceAtTouch },
      ),
      check(
        "Bounce lasts three seconds, then normal material returns",
        bounceAt179 > 0 && bounceAt181 === 0,
        { ticksPerSecond: 60, bounceAt179, bounceAt181 },
      ),
    ];
  },
  E10(program, hash) {
    const e = active(program, hash);
    idle(e, 120);
    const crate = crates(e)[0];
    const bridge = e.world.surfaces.find(
      (s) => s.generated && s.solid && s.owner === crate.id && s.x + s.w > 640,
    );
    if (!bridge)
      return [
        check("A still crate creates a solid shadow beyond the ledge", false, {
          generatedSurfaces: e.world.surfaces.filter((s) => s.generated).length,
        }),
      ];
    const crossing = clone(e);
    place(player(crossing), Math.max(620, bridge.x + 5), bridge.y - 160);
    player(crossing).grounded = player(crossing).wasGrounded = false;
    idle(crossing, 45);
    const supported =
      player(crossing).grounded &&
      Math.abs(player(crossing).y + player(crossing).h - bridge.y) < 0.01;
    const moving = clone(e);
    crates(moving)[0].vx = 2;
    idle(moving, 1);
    const lastAllowedExpiry = Math.max(
      moving.world.tick,
      ...moving.world.surfaces
        .filter((s) => s.generated && s.owner === crate.id)
        .map((s) => s.expires),
    );
    let movingTicks = 1;
    while (moving.world.tick <= lastAllowedExpiry + 2 && movingTicks < 605) {
      crates(moving)[0].vx = 2;
      idle(moving, 1);
      movingTicks++;
    }
    const remains = moving.world.surfaces.some(
      (s) => s.generated && s.solid && s.owner === crate.id,
    );
    return [
      check("The shadow supports the courier over the gap", supported, {
        bridge: { x: bridge.x, width: bridge.w, y: bridge.y },
        courier: {
          x: player(crossing).x,
          y: player(crossing).y,
          grounded: player(crossing).grounded,
        },
      }),
      check("Moving the crate dissolves its shadow bridge", !remains, {
        remainedAfterMovingTicks: 8,
        remains,
      }),
    ];
  },
};

export function measureIntent(caseId: string, source: string) {
  const hash = createHash("sha256").update(source).digest("hex");
  const program = compileRuleSource(source);
  return { ...measureProgramIntent(caseId, program, hash), sourceHash: hash };
}

/** Test-only simulation identity; server approval and activation remain separate gates. */
export function measureProgramIntent(
  caseId: string,
  program: RuleProgram,
  hash: string,
) {
  const verification = program.composition
    ? verifyRuleComposition(program.composition.members)
    : verifyRuleProgram(program);
  const measurements = probes[caseId]?.(program, hash) ?? [
    check("Known predeclared case", false, { caseId }),
  ];
  const e = settled();
  const before = e.checkpoint();
  e.activate(program, hash);
  idle(e, 20);
  const restored = clone(e);
  const replay = Array.from({ length: 90 }, (_, tick): TickInput => ({
    ...EMPTY_INPUT,
    right: tick < 10,
    jump: tick === 3,
    interact: tick >= 40 && tick < 45,
  }));
  for (const input of replay) {
    e.step(input);
    restored.step(input);
  }
  const deterministic =
    JSON.stringify(e.checkpoint()) === JSON.stringify(restored.checkpoint());
  e.rollback();
  const rollbackExact =
    JSON.stringify(e.checkpoint()) === JSON.stringify(before);
  return {
    caseId,
    engineVersion: ENGINE_VERSION,
    simulationIdentity: hash,
    verifierPassed: verification.passed,
    checks: [
      ...measurements,
      check("Checkpoint replay is deterministic", deterministic, {
        replayTicks: replay.length,
      }),
      check(
        "Rollback restores the exact pre-activation checkpoint",
        rollbackExact,
        null,
      ),
    ],
    automatedIntentPassed:
      verification.passed &&
      deterministic &&
      rollbackExact &&
      measurements.every((x) => x.passed),
    browserObserved: false,
  };
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: tsx intent-probes.ts <evaluation-summary.json> <new-output.json>",
    );
  const raw = JSON.parse(await readFile(input, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.records;
  if (!Array.isArray(entries)) throw new Error("Expected evaluation records");
  const declared = JSON.parse(
    await readFile(
      new URL("./evaluation-proposals.json", import.meta.url),
      "utf8",
    ),
  );
  const results = declared.proposals.map(
    (proposal: { id: string; text: string }) => {
      const record = entries.find(
        (r: { id?: string; caseId?: string }) =>
          (r.id ?? r.caseId) === proposal.id,
      );
      try {
        if (!record?.candidate?.source)
          throw new Error(
            "No generated candidate retained for this original request",
          );
        if ((record.proposal ?? record.text) !== proposal.text)
          throw new Error(
            "Recorded proposal differs from the predeclared original request",
          );
        return {
          ...measureIntent(proposal.id, record.candidate.source),
          originalProposal: proposal.text,
          generationStatus: record.status,
          inputOrigin: record.inputOrigin,
        };
      } catch (error) {
        return {
          caseId: proposal.id,
          originalProposal: proposal.text,
          automatedIntentPassed: false,
          browserObserved: false,
          error: error instanceof Error ? error.message : "Probe failed",
        };
      }
    },
  );
  await writeFile(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        input,
        engineVersion: ENGINE_VERSION,
        note: "Trusted-interpreter measurements with synthetic control fixtures. These do not substitute for browser gameplay, human intent review, or proof of fresh provider generation.",
        results,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      total: results.length,
      automatedIntentPassed: results.filter(
        (r: { automatedIntentPassed: boolean }) => r.automatedIntentPassed,
      ).length,
      output,
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
