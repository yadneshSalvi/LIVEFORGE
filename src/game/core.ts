import {
  ENGINE_VERSION,
  EMPTY_INPUT,
  type Entity,
  type GameCheckpoint,
  type GameSnapshot,
  type TickInput,
  type RuleProgram,
  type Surface,
} from "./contracts";
import { applyRuleProgram, type EffectCounts } from "./runtime";
export const LEVEL_SURFACES: Surface[] = [
  {
    id: "arrival",
    x: -100,
    y: 448,
    w: 710,
    h: 60,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "foundry",
    x: 950,
    y: 448,
    w: 520,
    h: 60,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "observatory",
    x: 1790,
    y: 448,
    w: 810,
    h: 60,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "lower-1",
    x: 665,
    y: 535,
    w: 80,
    h: 24,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "lower-2",
    x: 810,
    y: 540,
    w: 85,
    h: 24,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "lower-3",
    x: 1515,
    y: 535,
    w: 75,
    h: 24,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "lower-4",
    x: 1655,
    y: 535,
    w: 80,
    h: 24,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "stair-1",
    x: 895,
    y: 490,
    w: 60,
    h: 18,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
  {
    id: "stair-2",
    x: 1735,
    y: 490,
    w: 60,
    h: 18,
    expires: Number.MAX_SAFE_INTEGER,
    solid: true,
  },
];
const entity = (
  id: string,
  kind: Entity["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
): Entity => ({
  id,
  kind,
  x,
  y,
  w,
  h,
  vx: 0,
  vy: 0,
  grounded: true,
  stationaryTicks: 0,
  timer: 0,
  friction: 0.82,
  bounce: 0,
});
export function createWorld(): GameSnapshot {
  return {
    version: ENGINE_VERSION,
    tick: 0,
    entities: [
      entity("courier", "player", 170, 400, 25, 48),
      entity("counterweight", "prop", 510, 384, 40, 64),
      entity("lamp", "lantern", 320, 357, 25, 91),
    ],
    surfaces: structuredClone(LEVEL_SURFACES),
    checkpoint: 0,
    progress: 0,
    ember: true,
    completed: false,
    deaths: 0,
    activeHash: null,
    ruleName: null,
    interaction: "Carry the last ember to the Astral Hearth.",
    lanternOn: true,
    encounters: { counterweight: false, guardian: false },
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export class GameEngine {
  world: GameSnapshot = createWorld();
  program: RuleProgram | null = null;
  artifactHash: string | null = null;
  effects: EffectCounts = {
    surfacesCreated: 0,
    impulsesApplied: 0,
    cuesApplied: 0,
  };
  private previousInput = { ...EMPTY_INPUT };
  private rollbackPoint: GameCheckpoint | null = null;
  checkpoint(): GameCheckpoint {
    return structuredClone({
      snapshot: this.world,
      program: this.program,
      artifactHash: this.artifactHash,
    });
  }
  restore(checkpoint: GameCheckpoint) {
    if (checkpoint.snapshot.version !== ENGINE_VERSION)
      throw new Error("Checkpoint engine version mismatch");
    assertWorld(checkpoint.snapshot);
    this.world = structuredClone(checkpoint.snapshot);
    this.program = structuredClone(checkpoint.program);
    this.artifactHash = checkpoint.artifactHash;
    this.previousInput = { ...EMPTY_INPUT };
  }
  reset() {
    this.world = createWorld();
    this.program = null;
    this.artifactHash = null;
    this.rollbackPoint = null;
    this.previousInput = { ...EMPTY_INPUT };
  }
  activate(program: RuleProgram, artifactHash: string) {
    if (artifactHash === this.artifactHash) {
      if (JSON.stringify(program) !== JSON.stringify(this.program))
        throw new Error(
          "Artifact identity cannot be reused for a changed program",
        );
      return;
    }
    if (!artifactHash || artifactHash.length > 128)
      throw new Error("An immutable artifact identity is required");
    const before = this.checkpoint();
    const clean = structuredClone(this.world);
    clean.surfaces = clean.surfaces.filter((s) => !s.generated);
    const candidate = applyRuleProgram(clean, program).world;
    assertWorld(candidate);
    this.rollbackPoint = before;
    this.program = structuredClone(program);
    this.artifactHash = artifactHash;
    this.world = candidate;
    this.world.activeHash = artifactHash;
    this.world.ruleName = program.name;
  }
  rollback() {
    if (this.rollbackPoint) {
      const point = this.rollbackPoint;
      this.rollbackPoint = null;
      this.restore(point);
    } else {
      this.program = null;
      this.artifactHash = null;
      this.world.activeHash = null;
      this.world.ruleName = null;
      this.world.surfaces = this.world.surfaces.filter((s) => !s.generated);
    }
  }
  step(input: TickInput = { ...EMPTY_INPUT }): GameSnapshot {
    if (input.pressed?.reset || (input.reset && !this.previousInput.reset))
      this.respawn();
    const w = this.world;
    w.tick++;
    w.surfaces = w.surfaces.filter((s) => !s.generated || s.expires >= w.tick);
    if (this.program) {
      const result = applyRuleProgram(w, this.program);
      this.world = result.world;
      for (const key of Object.keys(this.effects) as (keyof EffectCounts)[])
        this.effects[key] += result.effects[key];
    }
    const world = this.world,
      p = world.entities[0],
      prop = world.entities[1],
      lamp = world.entities[2];
    if (!world.completed) {
      const direction = Number(input.right) - Number(input.left);
      p.vx = direction
        ? clamp(p.vx + direction * 0.7, -4.2, 4.2)
        : p.vx * p.friction;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      if (
        (input.pressed?.jump || (input.jump && !this.previousInput.jump)) &&
        p.grounded
      ) {
        p.vy = -11.4;
        p.grounded = false;
      }
      if (
        input.interact &&
        p.grounded &&
        Math.abs(p.x - 1260) < 100 &&
        !world.encounters.counterweight
      ) {
        world.encounters.counterweight = true;
        world.interaction =
          "The counterweight rises. A brass causeway unfolds across the void.";
        world.surfaces.push({
          id: "hall-causeway",
          x: 1465,
          y: 448,
          w: 330,
          h: 18,
          expires: Number.MAX_SAFE_INTEGER,
          solid: true,
        });
      }
      if (
        input.interact &&
        p.grounded &&
        Math.abs(p.x - 2070) < 105 &&
        !world.encounters.guardian
      ) {
        world.encounters.guardian = true;
        world.interaction =
          "The Warden recognizes your ember. The final passage is open.";
      }
      const propDistance = Math.abs(p.x + p.w / 2 - (prop.x + prop.w / 2));
      if (
        input.interact &&
        propDistance < 100 &&
        Math.abs(p.y - prop.y) < 100
      ) {
        prop.vx = direction * 2.7;
        if (!direction) prop.vx = (p.x < prop.x ? 1 : -1) * 2.4;
        world.interaction = "The counterweight is moving. Its shadow follows.";
      } else if (
        (input.pressed?.interact ||
          (input.interact && !this.previousInput.interact)) &&
        Math.abs(p.x - lamp.x) < 85
      ) {
        world.lanternOn = !world.lanternOn;
        world.interaction = world.lanternOn
          ? "Lantern lit. Every object casts a shadow."
          : "Lantern dimmed. The shadow has gone.";
      }
    }
    for (const e of world.entities) {
      if (e.kind === "lantern") continue;
      const oldY = e.y,
        oldX = e.x;
      e.vy = clamp(e.vy + 0.48, -12, 12);
      e.x = clamp(e.x + e.vx, 20, 2470 - e.w);
      e.y += e.vy;
      e.grounded = false;
      for (const s of world.surfaces) {
        if (!s.solid) continue;
        if (e.kind === "prop" && s.generated && s.owner === e.id) continue;
        if (
          e.x + e.w > s.x + 1 &&
          e.x < s.x + s.w - 1 &&
          oldY + e.h <= s.y + 3 &&
          e.y + e.h >= s.y &&
          e.vy >= 0
        ) {
          e.y = s.y - e.h;
          e.vy = e.bounce ? -e.vy * e.bounce : 0;
          e.grounded = true;
        }
      }
      if (e.kind === "prop") {
        e.vx *= 0.75;
        if (Math.abs(e.vx) < 0.04) e.vx = 0;
        if (e.y > 650) {
          e.x = 510;
          e.y = 384;
          e.vx = 0;
          e.vy = 0;
        }
      }
      e.stationaryTicks =
        Math.abs(e.x - oldX) < 0.05 && Math.abs(e.y - oldY) < 0.05
          ? Math.min(10000, e.stationaryTicks + 1)
          : 0;
      e.timer = Math.max(0, e.timer - 1);
    }
    if (!world.encounters.counterweight && p.x > 1335 && p.x < 1430) {
      p.x = 1335;
      p.vx = Math.min(0, p.vx);
      world.interaction =
        "COUNTERWEIGHT HALL · Press E beside the great crank to lift the causeway";
    }
    if (!world.encounters.guardian && p.x > 2120) {
      p.x = 2120;
      p.vx = 0;
      world.interaction =
        "THE WARDEN · Press E to offer the last ember and awaken the guardian";
    }
    if (p.y > 660) this.respawn();
    const oldCheckpoint = world.checkpoint;
    if (p.x > 1040 && p.grounded)
      world.checkpoint = Math.max(world.checkpoint, 1);
    if (p.x > 1850 && p.grounded) world.checkpoint = 2;
    world.progress = Math.max(world.progress, clamp((p.x - 170) / 2170, 0, 1));
    if (p.x > 2330 && p.grounded) {
      world.completed = true;
      world.progress = 1;
      world.interaction =
        "The Astral Hearth burns again. You brought the last light home.";
    } else if (world.checkpoint > oldCheckpoint)
      world.interaction =
        world.checkpoint === 1
          ? "Checkpoint reached · Counterweight Hall"
          : "Checkpoint reached · The Beacon Guardian";
    else if (!world.encounters.counterweight && Math.abs(p.x - 1260) < 110)
      world.interaction =
        "Press E to turn the great crank · raise the counterweight";
    else if (!world.encounters.guardian && Math.abs(p.x - 2070) < 120)
      world.interaction = "Press E to offer your ember to the sleeping Warden";
    else if (Math.abs(p.x - prop.x) < 100)
      world.interaction = "Hold E + ← / → to move the counterweight";
    this.previousInput = { ...input };
    assertWorld(world);
    return world;
  }
  private respawn() {
    const w = this.world,
      p = w.entities[0];
    p.x = [170, 1080, 1870][w.checkpoint];
    p.y = 380;
    p.vx = 0;
    p.vy = 0;
    p.grounded = false;
    w.deaths++;
    w.interaction = "Ember recovered · returned to your last checkpoint";
  }
}
export function assertWorld(w: GameSnapshot) {
  if (
    w.version !== ENGINE_VERSION ||
    w.entities.length !== 3 ||
    w.entities[0].kind !== "player" ||
    w.entities[1].kind !== "prop" ||
    w.entities[2].kind !== "lantern" ||
    !w.ember ||
    !Number.isFinite(w.progress) ||
    w.progress < 0 ||
    w.progress > 1 ||
    !Number.isInteger(w.checkpoint) ||
    w.checkpoint < 0 ||
    w.checkpoint > 2
  )
    throw new Error("Protected world invariant failed");
  for (const e of w.entities)
    if (
      ![e.x, e.y, e.vx, e.vy].every(Number.isFinite) ||
      Math.abs(e.x) > 4000 ||
      Math.abs(e.y) > 2000 ||
      Math.abs(e.vx) > 12.01 ||
      Math.abs(e.vy) > 12.01
    )
      throw new Error("Entity escaped the protected simulation bounds");
  for (const s of w.surfaces)
    if (
      ![s.x, s.y, s.w, s.h, s.expires].every(Number.isFinite) ||
      s.w <= 0 ||
      s.w > 1000 ||
      s.h <= 0 ||
      s.h > 100 ||
      s.x < -500 ||
      s.x + s.w > 3100 ||
      s.y < -100 ||
      s.y > 900
    )
      throw new Error("Invalid checkpoint geometry");
  if (w.surfaces.length > LEVEL_SURFACES.length + 49)
    throw new Error("World surface budget exceeded");
}
