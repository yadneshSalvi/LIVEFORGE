import type {
  Condition,
  Entity,
  GameSnapshot,
  RuleAction,
  RuleProgram,
  Scalar,
  Surface,
} from "./contracts";
export interface EffectCounts {
  surfacesCreated: number;
  impulsesApplied: number;
  cuesApplied: number;
}
function scalar(value: Scalar, entity: Entity, world: GameSnapshot): number {
  if (typeof value === "number") return value;
  switch (value.field) {
    case "speed":
      return Math.hypot(entity.vx, entity.vy);
    case "grounded":
      return Number(entity.grounded);
    case "distanceToPlayer": {
      const p = world.entities[0];
      return Math.hypot(entity.x - p.x, entity.y - p.y);
    }
    case "tick":
      return world.tick;
    default:
      return entity[value.field];
  }
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
export function projectShadow(
  entity: Entity,
  world: GameSnapshot,
  maxLength: number,
  thickness: number,
): Pick<Surface, "x" | "y" | "w" | "h"> | null {
  if (!world.lanternOn) return null;
  const light = world.entities
    .filter((e) => e.kind === "lantern")
    .sort((a, b) => Math.abs(a.x - entity.x) - Math.abs(b.x - entity.x))[0];
  if (!light) return null;
  const foot = entity.y + entity.h,
    center = entity.x + entity.w / 2,
    lx = light.x + light.w / 2,
    ly = light.y + 8;
  const silhouetteX = center + (center >= lx ? entity.w / 2 : -entity.w / 2),
    silhouetteY = entity.y;
  const denominator = silhouetteY - ly;
  if (denominator <= 4) return null;
  const end = lx + ((silhouetteX - lx) * (foot - ly)) / denominator;
  const distance = Math.max(-maxLength, Math.min(maxLength, end - center));
  if (Math.abs(distance) < 12) return null;
  return {
    x: Math.min(center, center + distance),
    y: foot,
    w: Math.abs(distance),
    h: thickness,
  };
}
/** Compute against a copied snapshot and commit only after the full budget/invariant pass. */
export function applyRuleProgram(
  world: GameSnapshot,
  program: RuleProgram,
): { world: GameSnapshot; effects: EffectCounts } {
  const next = structuredClone(world);
  const effects: EffectCounts = {
    surfacesCreated: 0,
    impulsesApplied: 0,
    cuesApplied: 0,
  };
  for (const e of next.entities) {
    e.cue = undefined;
    e.friction = 0.82;
    e.bounce = 0;
  }
  const commands: { entity: Entity; action: RuleAction; id: string }[] = [];
  for (const rule of program.rules)
    for (const e of world.entities.slice(0, 16))
      if (e.kind === rule.each && condition(rule.when, e, world)) {
        for (let i = 0; i < rule.actions.length; i++) {
          if (commands.length >= 128)
            throw new Error("Rule action budget exceeded");
          commands.push({
            entity: e,
            action: rule.actions[i],
            id: `${rule.id}:${e.id}:${i}`,
          });
        }
      }
  for (const { entity, action: a, id } of commands) {
    const self = next.entities.find((e) => e.id === entity.id)!;
    const target =
      "target" in a && a.target === "player" ? next.entities[0] : self;
    if (a.type === "projectShadow" || a.type === "createSurface") {
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
        const surface: Surface = {
          id,
          ...geometry,
          expires: world.tick + a.lifetime,
          solid: a.solid,
          generated: true,
          owner: entity.id,
        };
        next.surfaces = next.surfaces.filter((s) => s.id !== id);
        next.surfaces.push(surface);
        effects.surfacesCreated++;
      }
    } else if (a.type === "impulse") {
      target.vx = Math.max(-12, Math.min(12, target.vx + a.x));
      target.vy = Math.max(-12, Math.min(12, target.vy + a.y));
      effects.impulsesApplied++;
    } else if (a.type === "material") {
      target.friction = a.friction;
      target.bounce = a.bounce;
    } else if (a.type === "cue") {
      target.cue = { color: a.color, intensity: a.intensity };
      effects.cuesApplied++;
    } else if (a.type === "timer") self.timer = a.value;
  }
  if (next.surfaces.filter((s) => s.generated).length > 48)
    throw new Error("Generated surface budget exceeded");
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
  return { world: next, effects };
}
