/** Real billable held-out generation evaluation. Sequential short-lived sandboxes; no fixtures are substituted. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "../src/server/store";
import {
  addProposal,
  createGeneration,
  createShow,
  showKey,
  type ShowRecord,
} from "../src/server/show";
import {
  GENERATION_SDK_VERSION,
  runGeneration,
} from "../src/server/generation";
import { ENGINE_VERSION } from "../src/game/contracts";
const cases = [
  {
    id: "stationary-shadow",
    heldOut: false,
    proposal:
      "A movable prop casts a solid shadow only after staying still for 30 ticks; moving it should dissolve the shadow bridge immediately.",
  },
  {
    id: "springy-landing",
    heldOut: false,
    proposal:
      "While the courier is grounded, make their material springy with bounce 0.45 and a brass glow; keep normal material while airborne.",
  },
  {
    id: "timed-proximity-lift",
    heldOut: false,
    proposal:
      "When the courier is within 100 units of the stationary prop and its timer is zero, give the courier a small upward impulse and set the prop timer to 90 ticks; mark the prop coral.",
  },
  {
    id: "falling-stepping-stone",
    heldOut: true,
    proposal:
      "Only while the courier is falling faster than 1 unit per tick, create a one-tick solid stepping stone 70 units to their right and 15 units below their feet, and give the courier a mint glow. The stone should stop renewing when they rise or land.",
  },
];
async function main() {
  const output = path.join(process.cwd(), "docs/evidence/generation");
  await mkdir(output, { recursive: true });
  const startedAt = new Date().toISOString();
  const records: unknown[] = [];
  for (const entry of cases) {
    const show = await createShow("evaluation-" + randomUUID(), "practice");
    const job = await getStore().update<
      ShowRecord,
      ReturnType<typeof createGeneration>
    >(showKey(show.id), (s) => {
      const proposal = addProposal(
        s,
        entry.proposal,
        "Evaluation case (synthetic input)",
        entry.id,
        "practice",
      );
      return createGeneration(s, proposal.id);
    });
    console.log(
      JSON.stringify({
        caseId: entry.id,
        heldOut: entry.heldOut,
        showId: show.id,
        jobId: job.id,
        status: "starting",
      }),
    );
    await runGeneration(show.id, job.id);
    const result = (await getStore().get<ShowRecord>(showKey(show.id)))!;
    const final = result.jobs.find((j) => j.id === job.id)!;
    const candidate = result.candidates.find((c) => c.jobId === job.id);
    const record = {
      ...entry,
      inputOrigin: "synthetic-practice-evaluation",
      showId: show.id,
      jobId: job.id,
      status: final.status,
      attempts: final.attempt,
      model: final.model,
      sdkVersion: GENERATION_SDK_VERSION,
      engineVersion: ENGINE_VERSION,
      threadId: final.threadId || null,
      sandboxName: final.sandboxId || null,
      createdAt: final.createdAt,
      completedAt: final.updatedAt,
      elapsedMs: Date.parse(final.updatedAt) - Date.parse(final.createdAt),
      usage: final.usage || null,
      attemptEvidence: final.attemptEvidence || [],
      message: final.message,
      candidate: candidate
        ? {
            source: candidate.source,
            sourceHash: candidate.sourceHash,
            programHash: candidate.programHash,
            verification: candidate.verification,
          }
        : null,
    };
    records.push(record);
    await writeFile(
      path.join(output, "evaluation-" + entry.id + ".json"),
      JSON.stringify(record, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        caseId: entry.id,
        status: final.status,
        attempts: final.attempt,
        threadId: final.threadId,
        elapsedMs: record.elapsedMs,
        sourceHash: candidate?.sourceHash,
      }),
    );
  }
  await writeFile(
    path.join(output, "evaluation-summary.json"),
    JSON.stringify(
      {
        startedAt,
        completedAt: new Date().toISOString(),
        sampleCount: records.length,
        records,
      },
      null,
      2,
    ) + "\n",
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Evaluation failed",
    }),
  );
  process.exitCode = 1;
});
