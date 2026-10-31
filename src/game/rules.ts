import { z } from "zod";
import type { Condition, RuleProgram } from "./contracts";
export type { RuleProgram, RuleModule, VerificationReport } from "./contracts";
export { verifyRuleProgram } from "./verifier";
const number = z.number().finite();
const scalar = z.union([
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
        "tick",
        "timer",
      ]),
    })
    .strict(),
]);
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
const target = z.enum(["self", "player"]);
const action = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("projectShadow"),
      maxLength: number.min(20).max(480),
      thickness: number.min(4).max(18),
      lifetime: number.int().min(1).max(120),
      solid: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("createSurface"),
      offsetX: number.min(-300).max(300),
      offsetY: number.min(-200).max(200),
      width: number.min(12).max(320),
      lifetime: number.int().min(1).max(120),
      solid: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("impulse"),
      target,
      x: number.min(-2).max(2),
      y: number.min(-2).max(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("material"),
      target,
      friction: number.min(0.65).max(0.99),
      bounce: number.min(0).max(0.6),
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
            each: z.enum(["player", "prop", "lantern"]),
            when: condition,
            actions: z.array(action).min(1).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export function validateRuleProgram(value: unknown): RuleProgram {
  let nodes = 0;
  function walk(v: unknown, depth: number) {
    if (depth > 16 || ++nodes > 1600)
      throw new Error("Rule exceeds the bounded tree budget");
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          throw new Error("Reserved property");
        walk(x, depth + 1);
      }
    }
  }
  walk(value, 0);
  const program = ruleProgramSchema.parse(value);
  if (new Set(program.rules.map((r) => r.id)).size !== program.rules.length)
    throw new Error("Rule IDs must be unique");
  return program;
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
export const RULE_API_DOCUMENTATION = `Generate only JSON or export default { ... } satisfies RuleModule. This source is parsed as literal data; no functions, imports, variables, loops, arithmetic expressions, spreads, getters, classes, or arbitrary JS are accepted. RuleProgram={version:1,name:string<=70,description:string<=350,rules:RuleClause[1..8]}. RuleClause={id:/^[a-z][a-z0-9-]{0,39}$/,each:'player'|'prop'|'lantern',when:Condition,actions:Action[1..6]}. Conditions are {all:Condition[1..6]}, {any:Condition[1..6]}, {not:Condition}, or {compare:{left:Scalar,op:'lt'|'lte'|'eq'|'gte'|'gt',right:Scalar}}. Scalar is finite number [-10000,10000] or {field:'x'|'y'|'speed'|'vx'|'vy'|'stationaryTicks'|'grounded'|'distanceToPlayer'|'tick'|'timer'}. Fields read the each entity, grounded is 1/0, speed is absolute velocity length, timer is per-entity countdown. Every tick every matching entity is queried, max 16 entities. Actions: {type:'projectShadow',maxLength:20..480,thickness:4..18,lifetime:integer1..120,solid:boolean} projects each entity's silhouette from the nearest enabled lantern onto its supporting plane and creates a temporary surface; {type:'createSurface',offsetX:-300..300,offsetY:-200..200,width:12..320,lifetime:integer1..120,solid:boolean} creates relative to each entity's feet; {type:'impulse',target:'self'|'player',x:-2..2,y:-2..2} adds bounded velocity, player maximum speed 12; {type:'material',target,friction:0.65..0.99,bounce:0..0.6}; {type:'cue',target,color:'mint'|'coral'|'brass',intensity:0..1}; {type:'timer',value:integer0..600}. The only mutation capabilities are these six generic primitives. At most 128 actions and 48 generated surfaces per tick; command application is atomic. Source <=24000 chars; tree <=1600 nodes and depth<=16. No capability to remove player/ember, teleport, edit progress, modify checkpoints, access network/files/process, or execute code. Generated relations must be composed by the candidate, never named preset mechanics. The world contains a player, a movable prop at x510 on the first island, and a lantern at x320. E pushes the nearby prop and toggles lantern when nearest; no input field is currently exposed. Propose supported behavior honestly. Coordinates: y increases downward, floor y448, world width2500. Shadows are created only by projectShadow actions; cosmetic baseline shadows have no collision.`;
