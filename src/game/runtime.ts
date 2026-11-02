import type {
  Condition,
  Entity,
  EntityKind,
  GameSnapshot,
  PhysicsState,
  RuleAction,
  RuleClause,
  RuleProgram,
  Scalar,
  Surface,
  SurfaceMotionState,
  TimedModifier,
} from "./contracts";
import { SURFACE_MOTION_LIMITS, surfaceMotionX } from "./surface-motion";
export interface EffectCounts {
  surfacesCreated: number;
  impulsesApplied: number;
  cuesApplied: number;
  modifiersApplied: number;
  entitiesSpawned: number;
}
export const MAX_SPAWNED_ENTITIES = 12;
export const MAX_GENERATED_SURFACES = 48;
export const MAX_RULE_SURFACES = 8;
export const MAX_RUNTIME_COMMANDS = 128;
export interface RuntimeDiagnostics {
  commandsSkipped: number;
  surfacesSkipped: number;
  globalSurfacesSkipped: number;
  modifiersSkipped: number;
  spawnsSkipped: number;
  globalSpawnsSkipped: number;
  geometrySkipped: number;
  worldBoundsRecoveries: number;
}
export const emptyDiagnostics = (): RuntimeDiagnostics => ({
  commandsSkipped: 0,
  surfacesSkipped: 0,
  globalSurfacesSkipped: 0,
  modifiersSkipped: 0,
  spawnsSkipped: 0,
  globalSpawnsSkipped: 0,
  geometrySkipped: 0,
  worldBoundsRecoveries: 0,
});
export const emptyEffects = (): EffectCounts => ({
  surfacesCreated: 0,
  impulsesApplied: 0,
  cuesApplied: 0,
  modifiersApplied: 0,
  entitiesSpawned: 0,
});
export const PHYSICS_LIMITS = {
  gravityScale: [0.3, 2],
  jumpStrength: [0.5, 1.6],
  airJumps: [0, 2],
  playerScale: [0.6, 1.6],
  timeScale: [0.5, 1.5],
  windX: [-0.18, 0.18],
} as const;
export const defaultPhysics = (): PhysicsState => ({
  gravityScale: 1,
  jumpStrength: 1,
  airJumps: 0,
  playerScale: 1,
  timeScale: 1,
  windX: 0,
});
export function makeEntity(
  id: string,
  kind: EntityKind,
  x: number,
  y: number,
  w: number,
  h: number,
): Entity {
  return {
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
    previousX: x,
    previousY: y,
    wasGrounded: true,
    airJumpsUsed: 0,
    baseW: w,
    baseH: h,
    physics: defaultPhysics(),
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function scalar(
  value: Scalar,
  e: Entity,
  w: GameSnapshot,
  depth = 0,
): number {
  if (depth > 12) throw new Error("Expression depth budget exceeded");
  if (typeof value === "number") return value;
  if ("field" in value) {
    switch (value.field) {
      case "speed":
        return Math.hypot(e.vx, e.vy);
      case "grounded":
        return Number(e.grounded);
      case "distanceToPlayer":
        return Math.hypot(e.x - w.entities[0].x, e.y - w.entities[0].y);
      case "distanceToLantern":
        return Math.min(
          10000,
          ...w.entities
            .filter((x) => x.kind === "lantern" && w.lanternOn)
            .map((l) => Math.hypot(e.x - l.x, e.y - l.y)),
        );
      case "tick":
        return w.tick;
      case "inputJump":
        return Number(w.input.jump);
      case "inputInteract":
        return Number(w.input.interact);
      case "emberCarried":
        return Number(w.emberCarried);
      default:
        return e[value.field];
    }
  }
  let result: number;
  if ("clamp" in value)
    result = clamp(
      scalar(value.clamp.value, e, w, depth + 1),
      value.clamp.min,
      value.clamp.max,
    );
  else {
    const key = (
      "add" in value
        ? "add"
        : "mul" in value
          ? "mul"
          : "min" in value
            ? "min"
            : "max"
    ) as "add";
    const items: Scalar[] =
      "add" in value
        ? value.add
        : "mul" in value
          ? value.mul
          : "min" in value
            ? value.min
            : value.max;
    const xs = items.map((v) => scalar(v, e, w, depth + 1));
    result =
      key === "add"
        ? xs.reduce((a, b) => a + b, 0)
        : key === "mul"
          ? xs.reduce((a, b) => a * b, 1)
          : key === "min"
            ? Math.min(...xs)
            : Math.max(...xs);
  }
  if (!Number.isFinite(result))
    throw new Error("Expression produced a nonfinite result");
  return clamp(result, -10000, 10000);
}
function condition(c: Condition, e: Entity, w: GameSnapshot): boolean {
  if ("all" in c) return c.all.every((x) => condition(x, e, w));
  if ("any" in c) return c.any.some((x) => condition(x, e, w));
  if ("not" in c) return !condition(c.not, e, w);
  const a = scalar(c.compare.left, e, w),
    b = scalar(c.compare.right, e, w);
  switch (c.compare.op) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "eq":
      return a === b;
    case "gte":
      return a >= b;
    case "gt":
      return a > b;
  }
}
const overlap = (a: Entity, b: Entity, previous = false) => {
  const ax = previous ? a.previousX : a.x,
    ay = previous ? a.previousY : a.y,
    bx = previous ? b.previousX : b.x,
    by = previous ? b.previousY : b.y;
  return (
    ax + a.w >= bx - 5 &&
    ax <= bx + b.w + 5 &&
    ay + a.h >= by - 5 &&
    ay <= by + b.h + 5
  );
};
function triggered(r: RuleClause, e: Entity, w: GameSnapshot): boolean {
  const p = w.entities[0];
  switch (r.on ?? "tick") {
    case "tick":
      return true;
    case "jump":
      return (
        e.kind === "player" &&
        Boolean(
          w.input.pressed?.jump || (w.input.jump && !w.previousInput.jump),
        ) &&
        (e.grounded || e.airJumpsUsed < e.physics.airJumps)
      );
    case "land":
      return e.grounded && !e.wasGrounded;
    case "interact":
      return (
        Boolean(
          w.input.pressed?.interact ||
          (w.input.interact && !w.previousInput.interact),
        ) &&
        (e.kind === "player" || Math.hypot(e.x - p.x, e.y - p.y) < 110)
      );
    case "touch":
      return e.kind === "player"
        ? w.entities.some(
            (x) => x.kind === "prop" && overlap(e, x) && !overlap(e, x, true),
          )
        : overlap(e, p) && !overlap(e, p, true);
    case "enterZone": {
      if (!r.zone) return false;
      const z = r.zone,
        inside = (x: number, y: number) =>
          x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height;
      return inside(e.x, e.y) && !inside(e.previousX, e.previousY);
    }
  }
}
export function projectShadow(
  e: Entity,
  w: GameSnapshot,
  maxLength: number,
  thickness: number,
): Pick<Surface, "x" | "y" | "w" | "h"> | null {
  if (!w.lanternOn) return null;
  const light = w.entities
    .filter((x) => x.kind === "lantern")
    .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
  if (!light) return null;
  const foot = e.y + e.h,
    center = e.x + e.w / 2,
    lx = light.x + light.w / 2,
    ly = light.y + 8,
    denominator = e.y - ly;
  if (denominator <= 4) return null;
  const end =
      lx +
      ((center + (center >= lx ? e.w / 2 : -e.w / 2) - lx) * (foot - ly)) /
        denominator,
    distance = clamp(end - center, -maxLength, maxLength);
  if (Math.abs(distance) < 12) return null;
  return {
    x: Math.min(center, center + distance),
    y: foot,
    w: Math.abs(distance),
    h: thickness,
  };
}
function applyModifier(e: Entity, m: TimedModifier) {
  if (m.physics) Object.assign(e.physics, m.physics);
  if (m.material) Object.assign(e, m.material);
}
/** Atomic copied batch; source members share one global action and creation budget. */
export function applyRuleProgram(
  world: GameSnapshot,
  program: RuleProgram,
  previousSurfaces: readonly Surface[] = world.surfaces,
): {
  world: GameSnapshot;
  effects: EffectCounts;
  diagnostics: RuntimeDiagnostics;
} {
  const next = structuredClone(world),
    effects = emptyEffects(),
    diagnostics = emptyDiagnostics();
  next.modifiers = next.modifiers.filter(
    (m) =>
      m.expires >= world.tick &&
      next.entities.some((e) => e.id === m.entityId) &&
      next.entities.some(
        (e) =>
          m.id.slice(m.id.indexOf(":") + 1, m.id.lastIndexOf(":")) === e.id,
      ),
  );
  for (const e of next.entities) {
    e.cue = undefined;
    e.friction = 0.82;
    e.bounce = 0;
    e.physics = defaultPhysics();
    for (const m of next.modifiers)
      if (m.entityId === e.id) applyModifier(e, m);
  }
  const commands: {
    entity: Entity;
    action: RuleAction;
    id: string;
    rule: string;
  }[] = [];
  for (const rule of program.rules)
    for (const e of world.entities.slice(0, 32))
      if (
        e.kind === rule.each &&
        triggered(rule, e, world) &&
        condition(rule.when, e, world)
      )
        for (let i = 0; i < rule.actions.length; i++) {
          if (commands.length >= MAX_RUNTIME_COMMANDS) {
            diagnostics.commandsSkipped++;
            continue;
          }
          commands.push({
            entity: e,
            action: rule.actions[i],
            id: `${rule.id}:${e.id}:${i}`,
            rule: rule.id,
          });
        }
  for (const { entity, action: a, id, rule } of commands) {
    const self = next.entities.find((e) => e.id === entity.id)!;
    const target =
      "target" in a && a.target === "player" ? next.entities[0] : self;
    if (
      a.type === "projectShadow" ||
      a.type === "createSurface" ||
      a.type === "spawnPlatform"
    ) {
      const geometry =
        a.type === "projectShadow"
          ? projectShadow(entity, world, a.maxLength, a.thickness)
          : {
              x: entity.x + a.offsetX,
              y: entity.y + entity.h + a.offsetY,
              w: a.width,
              h: 9,
            };
      if (geometry) {
        const key = a.type === "spawnPlatform" ? `${id}:${world.tick}` : id;
        let motion: SurfaceMotionState | undefined;
        if (a.type !== "projectShadow" && a.motion) {
          const previous = previousSurfaces.find(
            (s) => s.id === key && s.motion,
          );
          const anchorX = previous?.motion?.anchorX ?? geometry.x;
          // Refresh extends a moving surface's lifetime, never its path. In
          // particular, a rider must not drag the anchor along with itself.
          geometry.y = previous?.y ?? geometry.y;
          geometry.x = surfaceMotionX(anchorX, a.motion, world.tick);
          motion = {
            ...a.motion,
            anchorX,
            startedAt: previous?.motion?.startedAt ?? world.tick,
            previousX: previous?.x ?? geometry.x,
          };
        }
        const replacing = next.surfaces.some((s) => s.id === key);
        const cap =
          a.type === "projectShadow"
            ? MAX_RULE_SURFACES
            : (a.maxCount ??
              (a.type === "spawnPlatform" ? 4 : MAX_RULE_SURFACES));
        if (
          !replacing &&
          (next.surfaces.filter((s) => s.generated).length >=
            MAX_GENERATED_SURFACES ||
            next.surfaces.filter(
              (s) => s.generated && s.id.startsWith(rule + ":"),
            ).length >= cap)
        ) {
          diagnostics.surfacesSkipped++;
          if (
            next.surfaces.filter((s) => s.generated).length >=
              MAX_GENERATED_SURFACES &&
            next.surfaces.filter(
              (s) => s.generated && s.id.startsWith(rule + ":"),
            ).length < cap
          )
            diagnostics.globalSurfacesSkipped++;
          continue;
        }
        if (
          ![geometry.x, geometry.y, geometry.w, geometry.h].every(
            Number.isFinite,
          ) ||
          geometry.w <= 0 ||
          geometry.x < -500 ||
          geometry.x + geometry.w > 3100 ||
          geometry.y < -100 ||
          geometry.y > 900 ||
          (motion &&
            (Math.min(motion.anchorX, motion.anchorX + motion.travel) <
              SURFACE_MOTION_LIMITS.minX ||
              Math.max(motion.anchorX, motion.anchorX + motion.travel) +
                geometry.w >
                SURFACE_MOTION_LIMITS.maxX))
        ) {
          diagnostics.geometrySkipped++;
          continue;
        }
        next.surfaces = next.surfaces.filter((s) => s.id !== key);
        next.surfaces.push({
          id: key,
          ...geometry,
          expires: world.tick + a.lifetime - 1,
          solid: a.solid,
          generated: true,
          owner: entity.id,
          ...(motion ? { motion } : {}),
        });
        effects.surfacesCreated++;
      }
    } else if (a.type === "spawnProp") {
      if (self.spawnRule || world.tick % a.cooldown !== 0) continue;
      if (
        next.entities.filter((e) => e.spawnRule === rule).length >=
          a.maxCount ||
        next.entities.filter((e) => e.spawnRule).length >= MAX_SPAWNED_ENTITIES
      ) {
        diagnostics.spawnsSkipped++;
        if (
          next.entities.filter((e) => e.spawnRule).length >=
            MAX_SPAWNED_ENTITIES &&
          next.entities.filter((e) => e.spawnRule === rule).length < a.maxCount
        )
          diagnostics.globalSpawnsSkipped++;
        continue;
      }
      const spawned = makeEntity(
        `spawn:${id}:${world.tick}`,
        "prop",
        entity.x + a.offsetX,
        entity.y + entity.h + a.offsetY - 40,
        28,
        40,
      );
      spawned.expires = world.tick + a.lifetime - 1;
      spawned.spawnRule = rule;
      next.entities.push(spawned);
      effects.entitiesSpawned++;
    } else if (a.type === "impulse") {
      if (target.kind === "ember" && world.emberCarried) continue;
      target.vx = clamp(
        target.vx + clamp(scalar(a.x, entity, world), -2, 2),
        -20,
        20,
      );
      target.vy = clamp(
        target.vy + clamp(scalar(a.y, entity, world), -2, 2),
        -20,
        20,
      );
      effects.impulsesApplied++;
    } else if (a.type === "physics" || a.type === "material") {
      if (target.kind === "ember" && world.emberCarried) continue;
      if (
        !next.modifiers.some((m) => m.id === id) &&
        next.modifiers.length >= 48
      ) {
        diagnostics.modifiersSkipped++;
        continue;
      }
      const modifier: TimedModifier = {
        id,
        entityId: target.id,
        expires: world.tick + (a.lifetime ?? 1) - 1,
      };
      if (a.type === "material")
        modifier.material = { friction: a.friction, bounce: a.bounce };
      else {
        modifier.physics = {};
        for (const key of Object.keys(
          PHYSICS_LIMITS,
        ) as (keyof PhysicsState)[]) {
          const value = a[key];
          if (value !== undefined) {
            const limits = PHYSICS_LIMITS[key];
            const bounded = clamp(
              typeof value === "number" ? value : scalar(value, entity, world),
              limits[0],
              limits[1],
            );
            modifier.physics[key] =
              key === "airJumps" ? Math.floor(bounded) : bounded;
          }
        }
      }
      next.modifiers = next.modifiers.filter((m) => m.id !== id);
      next.modifiers.push(modifier);
      applyModifier(target, modifier);
      effects.modifiersApplied++;
    } else if (a.type === "cue") {
      target.cue = { color: a.color, intensity: a.intensity };
      effects.cuesApplied++;
    } else if (a.type === "timer") self.timer = a.value;
  }
  if (
    next.surfaces.filter((s) => s.generated).length > 48 ||
    next.modifiers.length > 48 ||
    next.entities.length > 20
  )
    throw new Error("Shared runtime resource budget exceeded");
  for (const s of next.surfaces)
    if (
      ![s.x, s.y, s.w, s.h].every(Number.isFinite) ||
      s.w <= 0 ||
      s.x < -500 ||
      s.x + s.w > 3100 ||
      s.y < -100 ||
      s.y > 900
    )
      throw new Error("Surface outside protected world bounds");
  for (const e of next.entities)
    if (
      ![e.x, e.y, e.vx, e.vy].every(Number.isFinite) ||
      Math.abs(e.x) > 4000 ||
      Math.abs(e.y) > 2000 ||
      Math.abs(e.vx) > 20.01 ||
      Math.abs(e.vy) > 20.01
    )
      throw new Error("Rule entity batch outside protected bounds");
  return { world: next, effects, diagnostics };
}
