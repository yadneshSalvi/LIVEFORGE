/** Real previously generated Codex artifacts; importing these samples makes no model call. */
export const REUSED_RULE_ARTIFACT = {
  source:
    'export default {\n  version: 1,\n  name: "Settled Prop Shadow Bridge",\n  description: "After a prop stays still for 30 ticks, its lantern-cast shadow becomes solid. The shadow lasts one tick and refreshes only while the prop remains still, so movement dissolves the bridge on the next simulation tick.",\n  rules: [\n    {\n      id: "settled-prop-shadow",\n      each: "prop",\n      when: {\n        all: [\n          { compare: { left: { field: "stationaryTicks" }, op: "gte", right: 30 } },\n          { compare: { left: { field: "speed" }, op: "eq", right: 0 } }\n        ]\n      },\n      actions: [\n        { type: "projectShadow", maxLength: 480, thickness: 12, lifetime: 1, solid: true }\n      ]\n    }\n  ]\n} satisfies RuleModule;',
  sourceHash:
    "5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc",
  programHash:
    "e2c587406b146dbed283c9bcec7fb620d377970a07211bc23ec907ef35956a6c",
  model: "gpt-6.1-sol",
  threadId: "01a191b2-a2cc-7aa2-ba97-bbf55d328fcf",
  sandboxId: "gold-suspicious-tortoise-azTxbC",
  generatedAt: "2026-10-31T11:23:10.573Z",
  proposal:
    "A movable prop casts a solid shadow only after staying still for 30 ticks; moving it should dissolve the shadow bridge immediately.",
  usage: {
    input_tokens: 9338,
    output_tokens: 407,
    cached_input_tokens: 0,
  },
} as const;
export const REUSED_STEP_ARTIFACT = {
  source:
    'export default {\n  version: 1,\n  name: "Brass Prop Step",\n  description: "A stationary prop glows brass while the courier is within 90 units. A solid step appears to its right, 32 units above its feet. The step lasts one tick and is renewed only while the courier remains nearby, so it expires when the courier moves away.",\n  rules: [\n    {\n      id: "nearby-stationary-prop-step",\n      each: "prop",\n      when: {\n        all: [\n          { compare: { left: { field: "speed" }, op: "eq", right: 0 } },\n          { compare: { left: { field: "distanceToPlayer" }, op: "lte", right: 90 } }\n        ]\n      },\n      actions: [\n        { type: "createSurface", offsetX: 56, offsetY: -32, width: 72, lifetime: 1, solid: true },\n        { type: "cue", target: "self", color: "brass", intensity: 0.8 }\n      ]\n    }\n  ]\n} satisfies RuleModule;',
  sourceHash:
    "94c0c2a1b2ac51ac2b88726bdf4b9bf2548466b4354b6e6e6651b320b190de4d",
  programHash:
    "2a93f7338748f89ac78e74e76cd6d56777e3a359d6e49018d412ad25defc1263",
  originalOrderDependentProgramHash:
    "26455e8381974e1a7197dcf33a6ac59741d55308c03b9b157dab2a196ee753be",
  model: "gpt-6.1-sol",
  threadId: "01a191ab-a99b-7363-a29b-0fafc45f5d0b",
  sandboxId: "salmon-damaged-lemur-5n6oz6",
  generatedAt: "2026-10-31T11:15:33.009Z",
  proposal:
    "When the courier stands close to a stationary prop, create a temporary step on its right and make the prop glow brass; remove the step when the courier moves away.",
  usage: {
    input_tokens: 9346,
    output_tokens: 428,
    cached_input_tokens: 0,
    reasoning_output_tokens: 137,
    cache_write_input_tokens: 9343,
  },
} as const;
