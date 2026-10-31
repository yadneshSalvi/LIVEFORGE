/** Export a selected already-generated probe artifact, without any private show fields. */
import { writeFile } from "node:fs/promises";
import { hashData } from "../src/server/security";
import { compileRuleSource } from "../src/game/rules";
import { getStore } from "../src/server/store";
import { showKey, type ShowRecord } from "../src/server/show";
async function main() {
  const showId = process.argv[2];
  if (!showId) throw new Error("Pass the selected generated show ID");
  const show = await getStore().get<ShowRecord>(showKey(showId));
  if (!show) throw new Error("Expected real probe not found");
  const candidate = show.candidates[0],
    job = show.jobs[0],
    proposal = show.proposals[0];
  const artifact = {
    source: candidate.source,
    sourceHash: candidate.sourceHash,
    programHash: hashData(compileRuleSource(candidate.source)),
    originalOrderDependentProgramHash: candidate.programHash,
    model: job.model,
    threadId: job.threadId,
    sandboxId: job.sandboxId,
    generatedAt: candidate.createdAt,
    proposal: proposal.text,
    usage: job.usage,
  };
  await writeFile(
    "src/server/reused-artifact.ts",
    "/** Real previously generated Codex artifact; importing this sample does not call the model. */\nexport const REUSED_RULE_ARTIFACT = " +
      JSON.stringify(artifact, null, 2) +
      " as const;\n",
  );
  console.log(
    JSON.stringify({
      exported: true,
      sourceHash: artifact.sourceHash,
      threadId: artifact.threadId,
    }),
  );
}
main().catch(() => {
  console.error("Selected generation evidence was unavailable.");
  process.exitCode = 1;
});
