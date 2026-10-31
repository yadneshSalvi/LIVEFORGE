import {
  createShow,
  addProposal,
  createGeneration,
  showKey,
  type ShowRecord,
} from "../src/server/show";
import { getStore } from "../src/server/store";
import { runGeneration } from "../src/server/generation";
async function main() {
  /** Real billable Codex SDK + Vercel Sandbox probe. Never emits credentials. */
  const show = await createShow(
    "generation-probe-" + crypto.randomUUID(),
    "practice",
  );
  const job = await getStore().update<
    ShowRecord,
    ReturnType<typeof createGeneration>
  >(showKey(show.id), (record) => {
    const proposal = addProposal(
      record,
      process.argv[2] ||
        "When the courier stands close to a stationary prop, create a temporary step on its right and make the prop glow brass; remove the step when the courier moves away.",
      "Real generation probe",
      "probe",
      "practice",
    );
    return createGeneration(record, proposal.id);
  });
  console.log(
    JSON.stringify({
      showId: show.id,
      jobId: job.id,
      status: "starting",
      model: job.model,
    }),
  );
  await runGeneration(show.id, job.id);
  const final = await getStore().get<ShowRecord>(showKey(show.id));
  const complete = final!.jobs.find((j) => j.id === job.id)!;
  const candidate = final!.candidates.find((c) => c.jobId === job.id);
  console.log(
    JSON.stringify({
      showId: show.id,
      job: complete,
      candidate: candidate
        ? {
            source: candidate.source,
            sourceHash: candidate.sourceHash,
            programHash: candidate.programHash,
            verification: candidate.verification,
          }
        : null,
    }),
  );
  if (complete.status !== "ready") process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Probe failed",
    }),
  );
  process.exitCode = 1;
});
