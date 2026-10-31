/** Export only bounded factual evidence; never show ownership, grants, chat identity hashes or raw SDK logs. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "../src/server/store";
import { showKey, type ShowRecord } from "../src/server/show";
import { GENERATION_SDK_VERSION } from "../src/server/generation";
import { compileRuleSource } from "../src/game/rules";
import { hashData } from "../src/server/security";
async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error("Pass one or more selected show IDs");
  const directory = path.join(process.cwd(), "docs/evidence/generation");
  await mkdir(directory, { recursive: true });
  for (const id of ids) {
    const show = await getStore().get<ShowRecord>(showKey(id));
    if (!show) throw new Error("Selected evidence show not found");
    const records = show.jobs.map((job) => {
      const proposal = show.proposals.find((p) => p.id === job.proposalId);
      const candidate = show.candidates.find((c) => c.jobId === job.id);
      return {
        proposal: proposal?.text,
        origin: proposal?.origin,
        revision: job.revision || null,
        jobId: job.id,
        status: job.status,
        attempts: job.attempt,
        model: job.model,
        sdk: { package: "@openai/codex-sdk", version: GENERATION_SDK_VERSION },
        threadId: job.threadId || null,
        sandboxName: job.sandboxId || null,
        createdAt: job.createdAt,
        completedAt: job.updatedAt,
        elapsedMs: Date.parse(job.updatedAt) - Date.parse(job.createdAt),
        message: job.message,
        usage: job.usage || null,
        attemptEvidence: job.attemptEvidence || [],
        candidate: candidate
          ? {
              source: candidate.source,
              sourceHash: candidate.sourceHash,
              recordedProgramHash: candidate.programHash,
              canonicalProgramHash: hashData(
                compileRuleSource(candidate.source),
              ),
              verification: candidate.verification,
            }
          : null,
      };
    });
    await writeFile(
      path.join(directory, id + ".json"),
      JSON.stringify(
        {
          showId: id,
          mode: show.mode,
          recordedAt: new Date().toISOString(),
          records,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({ exported: true, showId: id, records: records.length }),
    );
  }
}
main().catch(() => {
  console.error("Could not export selected evidence.");
  process.exitCode = 1;
});
