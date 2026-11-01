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
import {
  applyRuleProgram,
  defaultPhysics,
  makeEntity,
  type EffectCounts,
  emptyEffects,
  emptyDiagnostics,
} from "./runtime";
import { validateRuntimeRuleProgram } from "./rules";
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
export const AUTHORED_ENTITIES = [
  makeEntity("courier", "player", 170, 400, 25, 48),
  makeEntity("counterweight", "prop", 510, 384, 40, 64),
  makeEntity("lamp", "lantern", 320, 357, 25, 91),
  makeEntity("hall-crate", "prop", 1130, 384, 40, 64),
  makeEntity("guardian-crate", "prop", 1950, 384, 40, 64),
  makeEntity("hall-lamp", "lantern", 1030, 357, 25, 91),
  makeEntity("guardian-lamp", "lantern", 1840, 357, 25, 91),
  makeEntity("ember", "ember", 201, 425, 12, 12),
];
export function createWorld(): GameSnapshot {
  return {
    version: ENGINE_VERSION,
    tick: 0,
    entities: structuredClone(AUTHORED_ENTITIES),
    surfaces: structuredClone(LEVEL_SURFACES),
    checkpoint: 0,
    progress: 0,
    ember: true,
    emberCarried: true,
    input: { ...EMPTY_INPUT },
    previousInput: { ...EMPTY_INPUT },
    modifiers: [],
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
  effects: EffectCounts = emptyEffects();
  diagnostics = emptyDiagnostics();
  private recordRuntime(result: ReturnType<typeof applyRuleProgram>) {
    for (const key of Object.keys(this.effects) as (keyof EffectCounts)[])
      this.effects[key] += result.effects[key];
    for (const key of Object.keys(
      this.diagnostics,
    ) as (keyof typeof this.diagnostics)[])
      this.diagnostics[key] += result.diagnostics[key];
  }

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
    if (checkpoint.program) validateRuntimeRuleProgram(checkpoint.program);
    this.world = structuredClone(checkpoint.snapshot);
    this.program = structuredClone(checkpoint.program);
    this.artifactHash = checkpoint.artifactHash;
    this.rollbackPoint = null;
  }
  reset() {
    this.world = createWorld();
    this.program = null;
    this.artifactHash = null;
    this.rollbackPoint = null;
  }
  activate(program: RuleProgram, artifactHash: string) {
    program = validateRuntimeRuleProgram(program);
    if (artifactHash === this.artifactHash) {
      if (JSON.stringify(program) !== JSON.stringify(this.program))
        throw new Error(
          "Artifact identity cannot be reused for a changed program",
        );
      return;
    }
    if (!this.world.entities[0].grounded)
      throw new Error("Activate only at a grounded checkpoint");
    if (!artifactHash || artifactHash.length > 128)
      throw new Error("An immutable artifact identity is required");
    const before = this.checkpoint();
    const clean = structuredClone(this.world);
    clean.surfaces = clean.surfaces.filter((s) => !s.generated);
    clean.entities = clean.entities.filter((e) => !e.spawnRule);
    clean.modifiers = [];
    const result = applyRuleProgram(clean, program);
    const candidate = result.world;
    assertWorld(candidate);
    this.recordRuntime(result);
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
      this.world.entities = this.world.entities.filter((e) => !e.spawnRule);
      this.world.modifiers = [];
      for (const e of this.world.entities) {
        const foot = e.y + e.h;
        e.physics = defaultPhysics();
        e.w = e.baseW;
        e.h = e.baseH;
        e.y = foot - e.h;
        e.friction = 0.82;
        e.bounce = 0;
        e.cue = undefined;
      }
    }
  }
  step(input: TickInput = { ...EMPTY_INPUT }): GameSnapshot {
    if (
      input.pressed?.reset ||
      (input.reset && !this.world.previousInput.reset)
    )
      this.respawn();
    const w = this.world;
    w.input = { ...input };
    w.tick++;
    w.entities = w.entities.filter(
      (e) => e.expires === undefined || e.expires >= w.tick,
    );
    w.surfaces = w.surfaces.filter(
      (s) =>
        !s.generated ||
        (s.expires >= w.tick && w.entities.some((e) => e.id === s.owner)),
    );
    if (this.program) {
      const result = applyRuleProgram(w, this.program);
      this.world = result.world;
      this.recordRuntime(result);
    }
    const world = this.world,
      p = world.entities[0],
      prop = world.entities
        .filter((e) => e.kind === "prop")
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0],
      lamp = world.entities
        .filter((e) => e.kind === "lantern")
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    for (const e of world.entities) {
      const foot = e.y + e.h,
        cx = e.x + e.w / 2,
        scale = e.kind === "player" ? e.physics.playerScale : 1,
        nw = e.baseW * scale,
        nh = e.baseH * scale;
      const nx = cx - nw / 2,
        ny = foot - nh;
      const blocked =
        nh > e.h &&
        world.surfaces.some(
          (s) =>
            s.solid &&
            s.y > ny + 2 &&
            s.y < foot - 2 &&
            nx + nw > s.x &&
            nx < s.x + s.w,
        );
      if (!blocked) {
        e.x = nx;
        e.y = ny;
        e.w = nw;
        e.h = nh;
      }
    }
    const ember = world.entities.find((e) => e.kind === "ember")!;
    if (input.pressed?.drop || (input.drop && !world.previousInput.drop)) {
      if (world.emberCarried) {
        world.emberCarried = false;
        ember.x = p.x + p.w + 5;
        ember.y = p.y + 12;
        ember.vx = p.vx + 1.5;
        ember.vy = -2;
        ember.grounded = false;
        world.interaction = "Ember released · press Q nearby to pick it up";
      } else if (Math.hypot(ember.x - p.x, ember.y - p.y) < 95) {
        world.emberCarried = true;
        ember.vx = 0;
        ember.vy = 0;
        world.interaction = "The last ember is safe in your hands";
      }
    }
    if (!world.completed) {
      const direction = Number(input.right) - Number(input.left);
      p.vx = direction
        ? clamp(p.vx + direction * 0.7, -4.2, 4.2)
        : p.vx * p.friction;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      if (
        (input.pressed?.jump ||
          (input.jump && !this.world.previousInput.jump)) &&
        (p.grounded || p.airJumpsUsed < p.physics.airJumps)
      ) {
        if (!p.grounded) p.airJumpsUsed++;
        p.vy = -11.4 * p.physics.jumpStrength;
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
        !world.encounters.guardian &&
        world.emberCarried
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
          (input.interact && !this.world.previousInput.interact)) &&
        Math.abs(p.x - lamp.x) < 85
      ) {
        world.lanternOn = !world.lanternOn;
        world.interaction = world.lanternOn
          ? "Lantern lit. Every object casts a shadow."
          : "Lantern dimmed. The shadow has gone.";
      }
    }
    for (const e of world.entities) {
      if (e.kind === "lantern" || (e.kind === "ember" && world.emberCarried))
        continue;
      e.wasGrounded = e.grounded;
      e.previousX = e.x;
      e.previousY = e.y;
      const oldY = e.y,
        oldX = e.x;
      const dt = e.physics.timeScale;
      e.vx = clamp(e.vx + e.physics.windX * dt, -20, 20);
      e.vy = clamp(e.vy + 0.48 * e.physics.gravityScale * dt, -20, 20);
      e.x = clamp(e.x + e.vx * dt, 20, 2470 - e.w);
      e.y += e.vy * dt;
      if (e.y < -80) {
        e.y = -80;
        e.vy = Math.max(0, e.vy);
        this.diagnostics.worldBoundsRecoveries++;
      }
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
          e.airJumpsUsed = 0;
        }
      }
      if (e.kind === "prop") {
        e.vx *= Math.pow(
          e.friction === 0.82 ? 0.75 : e.friction,
          e.physics.timeScale,
        );
        if (Math.abs(e.vx) < 0.04) e.vx = 0;
        if (e.y > 650) {
          const home =
            AUTHORED_ENTITIES.find((x) => x.id === e.id) ??
            AUTHORED_ENTITIES[1];
          e.x = home.x;
          e.y = home.y;
          e.vx = 0;
          e.vy = 0;
          world.surfaces = world.surfaces.filter(
            (s) => !s.generated || s.owner !== e.id,
          );
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
    if (ember.y > 660) {
      world.emberCarried = true;
      ember.vx = 0;
      ember.vy = 0;
    }
    if (world.emberCarried) {
      ember.x = p.x + p.w + 5;
      ember.y = p.y + 18;
      ember.vx = 0;
      ember.vy = 0;
      ember.grounded = false;
    }
    if (p.y > 660) this.respawn();
    const oldCheckpoint = world.checkpoint;
    if (p.x > 1040 && p.grounded)
      world.checkpoint = Math.max(world.checkpoint, 1);
    if (p.x > 1850 && p.grounded) world.checkpoint = 2;
    world.progress = Math.max(world.progress, clamp((p.x - 170) / 2170, 0, 1));
    if (p.x > 2330 && p.grounded && world.emberCarried) {
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
    world.previousInput = {
      left: input.left,
      right: input.right,
      jump: input.jump,
      interact: input.interact,
      reset: input.reset,
      drop: Boolean(input.drop),
    };
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
    w.emberCarried = true;
    w.surfaces = w.surfaces.filter((s) => !s.generated || s.owner !== p.id);
    w.deaths++;
    w.interaction = "Ember recovered · returned to your last checkpoint";
  }
}
export function assertWorld(w: GameSnapshot) {
  if (
    w.version !== ENGINE_VERSION ||
    w.entities.length < 8 ||
    w.entities.length > 20 ||
    !w.ember ||
    !Number.isFinite(w.progress) ||
    w.progress < 0 ||
    w.progress > 1 ||
    !Number.isInteger(w.checkpoint) ||
    w.checkpoint < 0 ||
    w.checkpoint > 2
  )
    throw new Error("Protected world invariant failed");
  if (new Set(w.entities.map((e) => e.id)).size !== w.entities.length)
    throw new Error("Duplicate entity identity");
  for (let i = 0; i < AUTHORED_ENTITIES.length; i++) {
    const a = AUTHORED_ENTITIES[i],
      e = w.entities[i];
    if (
      !e ||
      e.id !== a.id ||
      e.kind !== a.kind ||
      e.baseW !== a.baseW ||
      e.baseH !== a.baseH ||
      e.spawnRule ||
      (a.kind === "lantern" && (e.x !== a.x || e.y !== a.y)) ||
      e.expires !== undefined
    )
      throw new Error("Protected authored entity identity changed");
  }
  if (w.entities.filter((e) => e.kind === "ember").length !== 1)
    throw new Error("Exactly one protected ember is required");
  const hall = w.surfaces.find((s) => s.id === "hall-causeway");
  if (
    Boolean(hall) !== w.encounters.counterweight ||
    (hall &&
      (hall.x !== 1465 ||
        hall.y !== 448 ||
        hall.w !== 330 ||
        hall.h !== 18 ||
        !hall.solid ||
        hall.generated ||
        hall.expires !== Number.MAX_SAFE_INTEGER))
  )
    throw new Error("Authored encounter geometry changed");
  for (const original of LEVEL_SURFACES) {
    const surface = w.surfaces.find((s) => s.id === original.id);
    if (
      !surface ||
      ["x", "y", "w", "h", "expires", "solid"].some(
        (k) => surface[k as "x"] !== original[k as "x"],
      ) ||
      surface.generated
    )
      throw new Error("Authored route geometry changed");
  }
  for (const e of w.entities) {
    for (const [key, limits] of Object.entries({
      gravityScale: [0.3, 2],
      jumpStrength: [0.5, 1.6],
      airJumps: [0, 2],
      playerScale: [0.6, 1.6],
      timeScale: [0.5, 1.5],
      windX: [-0.18, 0.18],
    })) {
      const value = e.physics?.[key as keyof typeof e.physics];
      if (!Number.isFinite(value) || value < limits[0] || value > limits[1])
        throw new Error("Invalid physics state");
    }
    if (
      ![e.x, e.y, e.vx, e.vy, e.w, e.h, e.previousX, e.previousY].every(
        Number.isFinite,
      ) ||
      Math.abs(e.x) > 4000 ||
      Math.abs(e.y) > 2000 ||
      Math.abs(e.vx) > 20.01 ||
      Math.abs(e.vy) > 20.01 ||
      e.w <= 0 ||
      e.h <= 0 ||
      e.w > 100 ||
      e.h > 150
    )
      throw new Error("Entity escaped the protected simulation bounds");
    if (
      e.spawnRule &&
      (!e.id.startsWith("spawn:") ||
        e.baseW !== 28 ||
        e.baseH !== 40 ||
        e.w !== 28 ||
        e.h !== 40 ||
        e.kind !== "prop" ||
        !Number.isSafeInteger(e.expires) ||
        e.expires! < w.tick ||
        e.expires! > w.tick + 600)
    )
      throw new Error("Invalid bounded spawned entity");
  }
  for (const s of w.surfaces)
    if (
      !s.generated &&
      !LEVEL_SURFACES.some((base) => base.id === s.id) &&
      s.id !== "hall-causeway"
    )
      throw new Error("Unknown authored route surface");
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
      s.y > 900 ||
      (s.generated && (s.expires < w.tick || s.expires > w.tick + 600))
    )
      throw new Error("Invalid checkpoint geometry");
  if (w.surfaces.length > 58 || w.modifiers.length > 48)
    throw new Error("World resource budget exceeded");
  for (const m of w.modifiers)
    if (
      !w.entities.some((e) => e.id === m.entityId) ||
      !Number.isSafeInteger(m.expires) ||
      m.expires < w.tick ||
      m.expires > w.tick + 600
    )
      throw new Error("Invalid timed modifier");
}

/** Remove generated grants from a trusted saved world while preserving show progress. */
export function retireGeneratedCheckpoint(
  checkpoint: GameCheckpoint,
): GameCheckpoint {
  const engine = new GameEngine();
  engine.restore(checkpoint);
  engine.rollback();
  for (const entity of engine.world.entities) {
    entity.timer = 0;
    entity.airJumpsUsed = 0;
  }
  const ember = engine.world.entities.find((e) => e.kind === "ember")!;
  if (engine.world.emberCarried) {
    const player = engine.world.entities[0];
    ember.x = player.x + player.w + 5;
    ember.y = player.y + 18;
  }
  assertWorld(engine.world);
  return engine.checkpoint();
}
