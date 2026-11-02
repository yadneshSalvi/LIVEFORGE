import { z } from "zod";
import type { Condition, Scalar, RuleProgram } from "./contracts";
import { SURFACE_MOTION_LIMITS } from "./surface-motion";
export type { RuleProgram, RuleModule, VerificationReport } from "./contracts";
export { verifyRuleProgram, verifyRuleComposition } from "./verifier";
const number = z.number().finite();
const scalar: z.ZodType<Scalar> = z.lazy(() =>
  z.union([
    number.min(-10000).max(10000),
    z
      .object({
        field: z.enum([
          "x",
          "y",
          "speed",
          "vx",
          "vy",
          "stationaryTicks",
          "grounded",
          "distanceToPlayer",
          "distanceToLantern",
          "tick",
          "timer",
          "inputJump",
          "inputInteract",
          "emberCarried",
          "airJumpsUsed",
        ]),
      })
      .strict(),
    z.object({ add: z.array(scalar).min(2).max(4) }).strict(),
    z.object({ mul: z.array(scalar).min(2).max(4) }).strict(),
    z.object({ min: z.array(scalar).min(2).max(4) }).strict(),
    z.object({ max: z.array(scalar).min(2).max(4) }).strict(),
    z
      .object({
        clamp: z
          .object({
            value: scalar,
            min: number.min(-10000).max(10000),
            max: number.min(-10000).max(10000),
          })
          .strict()
          .refine((v) => v.min <= v.max),
      })
      .strict(),
  ]),
);
const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(condition).min(1).max(6) }).strict(),
    z.object({ any: z.array(condition).min(1).max(6) }).strict(),
    z.object({ not: condition }).strict(),
    z
      .object({
        compare: z
          .object({
            left: scalar,
            op: z.enum(["lt", "lte", "eq", "gte", "gt"]),
            right: scalar,
          })
          .strict(),
      })
      .strict(),
  ]),
);
const target = z.enum(["self", "player"]),
  life = number.int().min(1).max(600);
const motion = z
  .object({
    travel: number
      .min(-SURFACE_MOTION_LIMITS.maxTravel)
      .max(SURFACE_MOTION_LIMITS.maxTravel)
      .refine((value) => Math.abs(value) >= SURFACE_MOTION_LIMITS.minTravel),
    speed: number
      .min(SURFACE_MOTION_LIMITS.minSpeed)
      .max(SURFACE_MOTION_LIMITS.maxSpeed),
  })
  .strict();
const action = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("projectShadow"),
      maxLength: number.min(20).max(480),
      thickness: number.min(4).max(18),
      lifetime: life,
      solid: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["createSurface", "spawnPlatform"]),
      offsetX: number.min(-300).max(300),
      offsetY: number.min(-200).max(200),
      width: number.min(12).max(320),
      lifetime: life,
      solid: z.boolean(),
      maxCount: number.int().min(1).max(8).optional(),
      motion: motion.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("spawnProp"),
      offsetX: number.min(-300).max(300),
      offsetY: number.min(-200).max(200),
      lifetime: life,
      cooldown: number.int().min(1).max(600),
      maxCount: number.int().min(1).max(4),
    })
    .strict(),
  z
    .object({ type: z.literal("impulse"), target, x: scalar, y: scalar })
    .strict(),
  z
    .object({
      type: z.literal("physics"),
      target,
      gravityScale: scalar.optional(),
      jumpStrength: scalar.optional(),
      airJumps: number.int().min(0).max(2).optional(),
      playerScale: scalar.optional(),
      timeScale: scalar.optional(),
      windX: scalar.optional(),
      lifetime: life.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("material"),
      target,
      friction: number.min(0.65).max(0.99),
      bounce: number.min(0).max(0.95),
      lifetime: life.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("cue"),
      target,
      color: z.enum(["mint", "coral", "brass"]),
      intensity: number.min(0).max(1),
    })
    .strict(),
  z
    .object({ type: z.literal("timer"), value: number.int().min(0).max(600) })
    .strict(),
]);
export const ruleProgramSchema: z.ZodType<RuleProgram> = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(70),
    description: z.string().min(1).max(350),
    rules: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
            each: z.enum(["player", "prop", "lantern", "ember"]),
            on: z
              .enum(["tick", "jump", "land", "interact", "enterZone", "touch"])
              .optional(),
            zone: z
              .object({
                x: number.min(0).max(2500),
                y: number.min(-1000).max(900),
                width: number.positive().max(2500),
                height: number.positive().max(2000),
              })
              .strict()
              .optional(),
            when: condition,
            actions: z.array(action).min(1).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
function treeBudget(value: unknown, maxNodes = 1600, maxDepth = 16) {
  let nodes = 0;
  function walk(v: unknown, depth: number) {
    if (depth > maxDepth || ++nodes > maxNodes)
      throw new Error("Rule exceeds the bounded tree budget");
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          throw new Error("Reserved property");
        walk(x, depth + 1);
      }
  }
  walk(value, 0);
}
export function validateRuleProgram(value: unknown): RuleProgram {
  treeBudget(value);
  const p = ruleProgramSchema.parse(value);
  if (new Set(p.rules.map((r) => r.id)).size !== p.rules.length)
    throw new Error("Rule IDs must be unique");
  for (const r of p.rules) {
    if (r.on === "enterZone" && !r.zone)
      throw new Error("enterZone requires a bounded zone");
    for (const a of r.actions) {
      if (a.type === "physics") {
        const bounds = {
          gravityScale: [0.3, 2],
          jumpStrength: [0.5, 1.6],
          playerScale: [0.6, 1.6],
          timeScale: [0.5, 1.5],
          windX: [-0.18, 0.18],
        } as const;
        let values = 0;
        for (const k of Object.keys(bounds) as (keyof typeof bounds)[]) {
          const v = a[k];
          if (v !== undefined) {
            values++;
            if (typeof v === "number" && (v < bounds[k][0] || v > bounds[k][1]))
              throw new Error("Physics constant outside capability bounds");
          }
        }
        if (!values && a.airJumps === undefined)
          throw new Error("Physics action requires a modifier");
      }
      if (a.type === "impulse")
        for (const v of [a.x, a.y])
          if (typeof v === "number" && Math.abs(v) > 2)
            throw new Error("Impulse constant outside capability bounds");
    }
  }
  return p;
}
function combined(sources: RuleProgram[]): RuleProgram {
  return {
    version: 1,
    name: sources
      .map((p) => p.name)
      .join(" + ")
      .slice(0, 70),
    description: `Ordered composition of ${sources.length} independently sourced laws. Later matching modifiers take precedence; creation and execution budgets are shared.`,
    composition: { members: structuredClone(sources) },
    rules: sources.flatMap((p, i) =>
      p.rules.map((rule) => ({
        ...structuredClone(rule),
        id: `l${i}--${rule.id}`,
      })),
    ),
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  // This local serialization only compares a composition with its rebuilt IR.
  // Security hashes use canonicalJson in src/server/security.ts.
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",")}`;
  return JSON.stringify(value);
}
/** Rebuild the entire derived IR from strict members; a marker grants no extra capabilities. */
export function validateRuntimeRuleProgram(value: unknown): RuleProgram {
  if (!(value && typeof value === "object" && "composition" in value))
    return validateRuleProgram(value);
  treeBudget(value, 10000, 20);
  const outer = z
    .object({
      version: z.literal(1),
      name: z.string().min(1).max(70),
      description: z.string().min(1).max(350),
      rules: z.array(z.unknown()).min(1).max(24),
      composition: z
        .object({ members: z.array(z.unknown()).min(2).max(3) })
        .strict(),
    })
    .strict()
    .parse(value);
  const sources = outer.composition.members.map(validateRuleProgram);
  const expected = combined(sources);
  if (canonical(expected) !== canonical(value))
    throw new Error(
      "Derived composition differs from its ordered strict source members",
    );
  // Each source is bounded separately; total original and expanded data are bounded by three sources.
  return expected;
}
export function composeRulePrograms(programs: RuleProgram[]): RuleProgram {
  if (programs.length < 1 || programs.length > 3)
    throw new Error("A stack contains one to three source laws");
  const sources = programs.map(validateRuleProgram);
  return sources.length === 1 ? structuredClone(sources[0]) : combined(sources);
}
/** A deliberately small literal parser. It has no identifier evaluation or executable grammar. */
export function compileRuleSource(source: string): RuleProgram {
  if (typeof source !== "string" || source.length > 24000)
    throw new Error("Rule source must be at most 24,000 characters");
  let text = source.trim();
  if (text.startsWith("```")) {
    const match = /^```(?:typescript|ts|json)?\s*([\s\S]*?)\s*```$/.exec(text);
    if (!match) throw new Error("Invalid source fence");
    text = match[1];
  }
  text = text.replace(/^export\s+default\s+/, "");
  let i = 0,
    nodes = 0;
  const ws = () => {
    while (i < text.length) {
      if (/\s/.test(text[i])) {
        i++;
        continue;
      }
      if (text.slice(i, i + 2) === "//") {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (text.slice(i, i + 2) === "/*") {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) throw new Error("Unclosed comment");
        i = end + 2;
        continue;
      }
      break;
    }
  };
  function str() {
    const quote = text[i++];
    let out = "";
    while (i < text.length) {
      const c = text[i++];
      if (c === quote) return out;
      if (c === "\\") {
        const e = text[i++];
        const escapes: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          b: "\b",
          f: "\f",
          "\\": "\\",
          '"': '"',
          "'": "'",
          "/": "/",
        };
        if (e === "u") {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-f]{4}$/i.test(hex))
            throw new Error("Invalid unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (e in escapes) out += escapes[e];
        else throw new Error("Invalid escape");
      } else {
        if (c.charCodeAt(0) < 32)
          throw new Error("Control character in literal");
        out += c;
      }
    }
    throw new Error("Unclosed string");
  }
  function value(depth: number): unknown {
    ws();
    if (depth > 16 || ++nodes > 1600)
      throw new Error("Literal budget exceeded");
    const c = text[i];
    if (c === '"' || c === "'") return str();
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = Object.create(null);
      ws();
      while (text[i] !== "}") {
        ws();
        let key: string;
        if (text[i] === '"' || text[i] === "'") key = str();
        else {
          const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
          if (!m) throw new Error("Expected literal property");
          key = m[0];
          i += key.length;
        }
        if (
          ["__proto__", "prototype", "constructor"].includes(key) ||
          Object.hasOwn(out, key)
        )
          throw new Error("Reserved or duplicate property");
        ws();
        if (text[i++] !== ":")
          throw new Error("Only literal properties are supported");
        out[key] = value(depth + 1);
        ws();
        if (text[i] !== ",") break;
        i++;
        ws();
      }
      if (text[i++] !== "}") throw new Error("Expected object close");
      return out;
    }
    if (c === "[") {
      i++;
      const out: unknown[] = [];
      ws();
      while (text[i] !== "]") {
        out.push(value(depth + 1));
        ws();
        if (text[i] !== ",") break;
        i++;
        ws();
      }
      if (text[i++] !== "]") throw new Error("Expected array close");
      return out;
    }
    const token =
      /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\b/.exec(
        text.slice(i),
      );
    if (!token)
      throw new Error(
        "Executable syntax is not permitted; use a literal RuleModule",
      );
    i += token[0].length;
    return JSON.parse(token[0]);
  }
  const parsed = value(0);
  ws();
  const suffix = text.slice(i).trim();
  if (suffix && !/^satisfies\s+RuleModule\s*;?$/.test(suffix) && suffix !== ";")
    throw new Error("Only a RuleModule literal is permitted");
  return validateRuleProgram(parsed);
}
export const PRACTICE_RULE_SOURCE = `export default {
  version: 1,
  name: "Stillness makes a way",
  description: "A stationary movable prop casts a solid shadow. Move the prop and its bridge disappears.",
  rules: [{
    id: "resting-shadow",
    each: "prop",
    when: { all: [
      { compare: { left: { field: "stationaryTicks" }, op: "gte", right: 24 } },
      { compare: { left: { field: "grounded" }, op: "eq", right: 1 } }
    ] },
    actions: [
      { type: "projectShadow", maxLength: 480, thickness: 10, lifetime: 1, solid: true },
      { type: "cue", target: "self", color: "mint", intensity: 0.8 }
    ]
  }]
} satisfies RuleModule;`;
export const RULE_API_DOCUMENTATION = `ENGINE last-light/2.0.0. Return only JSON or export default {...} satisfies RuleModule. This is literal DATA, not executed JS. No functions, imports, variables, loops, expressions written as JS, spreads, getters or executable code. RuleProgram={version:1,name:string1..70,description:string1..350,rules:RuleClause[1..8]}. Each clause={id:lowercase-hyphen-id<=40,each:'player'|'prop'|'lantern'|'ember',on?:'tick'|'jump'|'land'|'interact'|'enterZone'|'touch',zone?:{x:0..2500,y:-1000..900,width:1..2500,height:1..2000},when:Condition,actions:Action[1..6]}. Default on='tick'. enterZone requires zone. land fires once on the tick AFTER an actual landing; touch fires when entering contact with courier, not each tick held in contact; jump fires on an allowed jump press; interact is a rising press near each entity (player always). Zone entry compares previous/current entity position. Conditions={all:Condition[1..6]}|{any:Condition[1..6]}|{not:Condition}|{compare:{left:Scalar,op:'lt'|'lte'|'eq'|'gte'|'gt',right:Scalar}}. Use compare 1 eq 1 for unconditional. Scalar=finite number[-10000,10000]|{field:FIELD}|{add:Scalar[2..4]}|{mul:Scalar[2..4]}|{min:Scalar[2..4]}|{max:Scalar[2..4]}|{clamp:{value:Scalar,min:number,max:number}}. Arithmetic is saturated to +/-10000, depth<=12, no division. FIELD=x,y,vx,vy,speed,stationaryTicks,grounded,distanceToPlayer,distanceToLantern,tick,timer,inputJump,inputInteract,emberCarried,airJumpsUsed. grounded/input/emberCarried are1/0. Distance is world units. inputInteract is HELD state: use for giant-while-held. Physics resets to defaults when no timed modifier remains. ALWAYS apply airJumps on tick to allow an extra airborne jump; do not only enable it on a jump event.
ACTIONS:
{type:'physics',target:'self'|'player',gravityScale?:Scalar[.3..2],jumpStrength?:Scalar[.5..1.6],airJumps?:integer0..2,playerScale?:Scalar[.6..1.6],timeScale?:Scalar[.5..1.5],windX?:Scalar[-.18...18],lifetime?:integer1..600}. At least one modifier. playerScale affects courier collision and visible size, anchored at feet, refuses growth through solid geometry. timeScale controls local entity integration, not simulation clock. windX adds horizontal force each tick; use each:'prop' and distanceToLantern conditions for nearby crates. Constant values outside bounds reject; arithmetic results saturate to action bounds. Default lifetime1 tick, later matching modifiers override earlier ones. airJumps is number of EXTRA jumps; landing resets usage. Use jumpStrength arithmetic based on speed for stronger running jumps.
{type:'material',target:'self'|'player',friction:.65...99,bounce:0...95,lifetime?:1..600}. Default1 tick; lifetime180 lasts three seconds at60Hz. An on:'touch' prop rule with lifetime180 makes contact-triggered temporary bounce. Ember material/physics is applied only while DROPPED; carried ember physics is ignored.
{type:'impulse',target,x:Scalar[-2..2],y:Scalar[-2..2]} adds bounded velocity; speed cap20.
{type:'projectShadow',maxLength:20..480,thickness:4..18,lifetime:1..600,solid:boolean} projects entity silhouette from nearest enabled lantern onto supporting feet plane and creates collision only if solid. Stillness relation belongs in generated when conditions. At most8 surfaces per clause.
{type:'createSurface',offsetX:-300..300,offsetY:-200..200,width:12..320,lifetime:1..600,solid:boolean,maxCount?:1..8,motion?:{travel:number[-240..240],speed:number[.3..2.5]}} creates/refreshes one surface relative to entity feet, per-clause cap default8.
{type:'spawnPlatform',offsetX,offsetY,width,lifetime,solid,maxCount?:1..8,motion?:{travel,speed}} has the same geometry and motion limits and creates a distinct temporary platform per trigger/tick, per-clause cap default4.
SURFACE MOTION: optional, horizontal only. Absolute travel must be20..240; positive travel goes right of the initial anchor and negative travel goes left. speed is world units per simulation tick. Position ping-pongs between initial anchorX and anchorX+travel with a deterministic triangle wave of the absolute world tick; a one-way sweep lasts abs(travel)/speed ticks. The entire path including width must remain inside x0..2500. Initial anchorX=entity.x+offsetX and topY=entity.y+entity.h+offsetY are fixed for the surface lifetime; createSurface refresh preserves that initial anchor, height and phase even when its owner moves. Refresh every tick with lifetime1 to persist only while the condition holds. Without refresh it expires normally; motion never extends lifetime. Grounded courier, props and a dropped ember are carried horizontally by solid moving surfaces and can move or jump normally. A prop cannot stand on its own generated surface. No vertical motion or new action type.
SURFACE PRESENTATION: every generated surface with motion is rendered with a flat horizontal top and a tapered, wedge-shaped brass underside, with mint edging and a subtle motion trail/glow. This shared appearance is automatic in Preview and live play and requires no separate shape action. Collision remains a flat horizontal top edge when solid. Sloped walking surfaces and ramps are not supported. The law controls the documented placement, width, lifetime, solidity and motion; it does not define custom geometry or artwork.
{type:'spawnProp',offsetX:-300..300,offsetY:-200..200,lifetime:1..600,cooldown:integer1..600,maxCount:integer1..4} spawns a28x40 crate relative to feet, only at tick multiples of cooldown; spawned props cannot recursively spawn. Per-clause and global caps skip creation at capacity. IDs deterministic. Prefer event triggers to per-tick creation.
{type:'cue',target,color:'mint'|'coral'|'brass',intensity:0..1}; {type:'timer',value:integer0..600} sets each entity countdown.
SAFETY AND VERIFICATION: all surface creation shares the48-surface cap; excess commands, modifiers, surfaces or props are safely skipped with diagnostics, and out-of-world surfaces are skipped. Any saturation or vertical ceiling recovery rejects verification. Continuous held jump/interact/left/right inputs are tested for600 ticks; do not apply repeated upward impulses that force entities above y=-80. Physics must produce a noticeable change in play (more than4 world units of position or size in controlled comparisons), not merely change metadata or add a cosmetic cue. Extra air jumps must be usable after an explicit second jump press while airborne. Tiny numerical changes fail with "No noticeable effect on play." Keep the original requested behavior; do not replace it to satisfy checks.
WORLD: courier,3 authored crates at510/1130/1950,3 lanterns at320/1030/1840,exactly1 protected physical ember. Lanterns are immovable anchors at x320 (lamp), x1030 (hall-lamp), x1840 (guardian-lamp), each y357,height91,feet448. Crates move when pushed. The Broken Crossing arrival ledge ends at x610 and the foundry ledge starts at x950; both tops are y448, leaving a340-unit gap. Lower stepping stones are at x665/y535 and x810/y540; a stair begins x895/y490. Courier size25x48, max run4.2/tick, baseline jump velocity-11.4 and gravity.48/tick squared. A/D arrows move,Space jumps,E pushes nearest crate/toggles lantern/operates authored encounter, Q drops or picks up nearby ember,R checkpoint recovery. y increases down, floor448,width2500. The ember is an authored protected entity; rules can never drop,pick up,spawn,delete or steal it. Objective requires ember carried. Source<=24000chars,1600tree nodes,depth16;32queriedentities,128actions per tick,48generatedsurfaces,12spawnedprops (20totalentities),48timedmodifiers,source<=8clauses. Up to3 approved laws can compose as trusted namespaced IR<=24clauses with SHARED global budgets; never emit composition metadata in source. No network,files,process,DOM,teleport,inventory/progress/checkpoint edits. Describe supported behavior honestly and request adaptation for unsupported ideas.`;

export const RULE_CAPABILITY_HINTS = [
  {
    title: "Reversible physics",
    detail:
      "Change gravity, jump strength, extra air jumps, courier size, local speed or wind within bounded ranges. Timed effects expire.",
  },
  {
    title: "Events and held input",
    detail:
      "React to jumps, landings, interaction, contact or entry into a bounded zone. Conditions can read held input and nearby entities.",
  },
  {
    title: "Temporary creations",
    detail:
      "Spawn capped props or platforms for up to ten seconds, or project a physical shadow from an existing lantern.",
  },
  {
    title: "Moving platforms",
    detail:
      "Move surfaces horizontally along bounded paths. Riders travel with them and can walk or jump off; refresh a surface to keep it around.",
  },
  {
    title: "Arithmetic and conditions",
    detail:
      "Compose bounded add, multiply, minimum, maximum and clamp expressions with entity fields and all/any/not comparisons.",
  },
  {
    title: "Three ordered laws",
    detail:
      "Retain up to three approved laws in one verified composition, sharing the same execution and resource limits.",
  },
] as const;
