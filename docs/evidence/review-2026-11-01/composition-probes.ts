/** Pure-interpreter measurements; no server approval or browser observation is claimed here. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  compileRuleSource,
  composeRulePrograms,
  verifyRuleComposition,
} from "../../../src/game/rules";
import { ENGINE_VERSION } from "../../../src/game/contracts";
import { measureProgramIntent } from "./intent-probes";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: tsx composition-probes.ts <evaluation-summary.json> <new-output.json>",
  );
const raw = JSON.parse(await readFile(input, "utf8"));
const entries = Array.isArray(raw) ? raw : raw.records;
const plan = JSON.parse(
  await readFile(
    new URL("./composition-experiments.json", import.meta.url),
    "utf8",
  ),
);
const originals = JSON.parse(
  await readFile(
    new URL("./evaluation-proposals.json", import.meta.url),
    "utf8",
  ),
);
const records = plan.combinations.map(
  (combination: { id: string; members: string[] }) => {
    try {
      const sources = combination.members.map((id) => {
        const record = entries.find(
          (entry: { id?: string; caseId?: string }) =>
            (entry.id ?? entry.caseId) === id,
        );
        const original = originals.proposals.find(
          (p: { id: string }) => p.id === id,
        );
        if (
          !record?.candidate?.source ||
          (record.proposal ?? record.text) !== original.text
        )
          throw new Error("Missing original generated source for " + id);
        return record.candidate.source as string;
      });
      const memberSourceHashes = sources.map((source) =>
        createHash("sha256").update(source).digest("hex"),
      );
      const programs = sources.map(compileRuleSource);
      const program = composeRulePrograms(programs);
      const verification = verifyRuleComposition(programs);
      const simulationIdentity = createHash("sha256")
        .update(
          JSON.stringify({ evaluationOnly: true, memberSourceHashes, program }),
        )
        .digest("hex");
      const measurements = combination.members.map((id) =>
        measureProgramIntent(id, program, simulationIdentity),
      );
      return {
        ...combination,
        memberSourceHashes,
        simulationIdentity,
        verification,
        measurements,
        automatedCombinationPassed:
          verification.passed &&
          measurements.every((m) => m.automatedIntentPassed),
        serverActivationObserved: false,
        browserObserved: false,
      };
    } catch (error) {
      return {
        ...combination,
        automatedCombinationPassed: false,
        serverActivationObserved: false,
        browserObserved: false,
        error:
          error instanceof Error ? error.message : "Combination probe failed",
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
      note: "Synthetic controlled experiments on retained real sources. simulationIdentity is a test identity, not a server-approved context/activation artifact.",
      records,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify({ combinations: records.length, output }));
