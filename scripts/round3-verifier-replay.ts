/** Offline only: replay frozen provider sources without importing provider/server APIs. */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  compileRuleSource,
  verifyRuleProgram,
  verifyRuleComposition,
} from "../src/game/rules";
import type { RuleProgram } from "../src/game/contracts";
const output = "docs/evidence/review-round3-2026-11-01";
const providers = [
  "review-2026-11-01/provider-5ac7482-originals",
  "review-round2-2026-11-01/provider-3a74ae3",
];
const records = [];
for (const provider of providers) {
  const programs: RuleProgram[] = [];
  const singles = [];
  for (let i = 1; i <= 10; i++) {
    const id = `E${String(i).padStart(2, "0")}`;
    const file = `docs/evidence/${provider}/evaluation-${id}.json`;
    const original = JSON.parse(await readFile(file, "utf8"));
    const source = original.candidate.source;
    const program = compileRuleSource(source);
    programs.push(program);
    singles.push({
      id,
      file,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      historicalOriginalSuccess: original.originalSuccess,
      historicalStatus: original.status,
      historicalVerification: original.candidate.verification,
      replayVerification: verifyRuleProgram(program),
    });
  }
  const fixture = (parameters: Record<string, number>): RuleProgram => ({
    version: 1,
    name: "Synthetic bounded physics",
    description: "Explicit review acceptance fixture; not provider generated.",
    rules: [
      {
        id: "physics",
        each: "player",
        when: { compare: { left: 1, op: "eq", right: 1 } },
        actions: [{ type: "physics", target: "self", ...parameters }],
      },
    ],
  });
  const stacks = [
    { name: "E01 + E02", programs: programs.slice(0, 2) },
    { name: "E01 + E02 + E03", programs: programs.slice(0, 3) },
    {
      name: "synthetic gravity 0.5 + jump 1.4",
      programs: [
        fixture({ gravityScale: 0.5 }),
        fixture({ jumpStrength: 1.4 }),
      ],
    },
    {
      name: "synthetic gravity 0.4 + air jump 1",
      programs: [fixture({ gravityScale: 0.4 }), fixture({ airJumps: 1 })],
    },
  ].map(({ name, programs }) => ({
    name,
    verification: verifyRuleComposition(programs),
  }));
  records.push({
    provider,
    singlesPassed: singles.filter((s) => s.replayVerification.passed).length,
    singlesTotal: singles.length,
    stacksPassed: stacks.filter((s) => s.verification.passed).length,
    stacksTotal: stacks.length,
    singles,
    stacks,
  });
}
const hashes = Object.fromEntries(
  await Promise.all(
    [
      "src/game/runtime.ts",
      "src/game/verifier.ts",
      "src/game/core.ts",
      "src/game/contracts.ts",
    ].map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ]),
  ),
);
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/verifier-replay.json`,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      mode: "offline frozen-source replay; no provider calls",
      runtimeSha256: hashes,
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    records.map(
      ({
        provider,
        singlesPassed,
        singlesTotal,
        stacksPassed,
        stacksTotal,
      }) => ({
        provider,
        singlesPassed,
        singlesTotal,
        stacksPassed,
        stacksTotal,
      }),
    ),
    null,
    2,
  ),
);
