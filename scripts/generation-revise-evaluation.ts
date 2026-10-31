/** Genuine creator-style revision of a verified-but-imperfect evaluation candidate. */
import { readFile, writeFile } from "node:fs/promises";
import { getStore } from "../src/server/store";
import {
  createGeneration,
  rejectCandidate,
  showKey,
  type ShowRecord,
} from "../src/server/show";
import {
  GENERATION_SDK_VERSION,
  runGeneration,
} from "../src/server/generation";
async function main() {
  const original = JSON.parse(
    await readFile(
      "docs/evidence/generation/evaluation-springy-landing.json",
      "utf8",
    ),
  );
  const showId = original.showId;
  const key = showKey(showId);
  const revision =
    "When grounded use friction 0.9 and bounce 0.45 with a brass glow. When airborne restore baseline friction exactly 0.82, bounce 0, and no visible glow.";
  const job = await getStore().update<
    ShowRecord,
    ReturnType<typeof createGeneration>
  >(key, (show) => {
    const previous = show.candidates.find((c) => c.jobId === original.jobId);
    if (!previous) throw new Error("Original evaluated candidate missing");
    rejectCandidate(
      show,
      previous.id,
      "Source review found airborne friction 0.9 instead of the requested normal baseline 0.82.",
    );
    return createGeneration(show, previous.proposalId, revision, previous.id);
  });
  console.log(
    JSON.stringify({ showId, jobId: job.id, stage: "creator-revision" }),
  );
  await runGeneration(showId, job.id);
  const show = (await getStore().get<ShowRecord>(key))!;
  const result = show.jobs.find((j) => j.id === job.id)!;
  const candidate = show.candidates.find((c) => c.jobId === job.id);
  const evidence = {
    inputOrigin: "synthetic-practice-evaluation",
    case: "springy-landing-explicit-creator-revision",
    originalJobId: original.jobId,
    originalIntentReview:
      "Airborne material friction differs from the requested baseline.",
    showId,
    job: result,
    sdkVersion: GENERATION_SDK_VERSION,
    elapsedMs: Date.parse(result.updatedAt) - Date.parse(result.createdAt),
    candidate: candidate
      ? {
          source: candidate.source,
          sourceHash: candidate.sourceHash,
          programHash: candidate.programHash,
          verification: candidate.verification,
        }
      : null,
  };
  await writeFile(
    "docs/evidence/generation/evaluation-springy-landing-revision.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: result.status,
      threadId: result.threadId,
      sourceHash: candidate?.sourceHash,
      elapsedMs: evidence.elapsedMs,
    }),
  );
  if (result.status !== "ready") process.exitCode = 1;
}
main().catch(() => {
  console.error("Creator revision evaluation failed; inspect the stored job.");
  process.exitCode = 1;
});
