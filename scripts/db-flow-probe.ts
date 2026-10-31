/** Genuine Neon CAS + persisted artifact approval/activation/rollback probe. No model call. */
import { randomUUID } from "node:crypto";
import { GameEngine } from "../src/game/core";
import { getStore, PostgresStore } from "../src/server/store";
import {
  acquireLease,
  activateCandidate,
  approveCandidate,
  createShow,
  importPracticeSample,
  rollback,
  showKey,
  type ShowRecord,
} from "../src/server/show";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL required for the real database probe");
  const owner = "db-flow-probe-" + randomUUID();
  const show = await createShow(owner, "practice");
  const key = showKey(show.id);
  const store = getStore();
  await store.update<ShowRecord, void>(key, (s) => {
    importPracticeSample(s);
    acquireLease(s, "db-flow-probe-tab");
  });
  // Re-read JSONB before approval: its key order differs from the source literal.
  let record = (await store.get<ShowRecord>(key))!;
  const candidate = record.candidates[0];
  const engine = new GameEngine();
  engine.activate(candidate.program, candidate.sourceHash);
  await store.update<ShowRecord, void>(key, (s) => {
    approveCandidate(
      s,
      candidate.id,
      candidate.sourceHash,
      candidate.programHash,
      engine.checkpoint(),
    );
  });
  await store.update<ShowRecord, void>(key, (s) => {
    activateCandidate(s, {
      candidateId: candidate.id,
      sourceHash: candidate.sourceHash,
      programHash: candidate.programHash,
      clientId: s.lease!.clientId,
      epoch: s.lease!.epoch,
      checkpoint: new GameEngine().checkpoint(),
    });
  });
  record = (await store.get<ShowRecord>(key))!;
  if (
    record.activeCandidateId !== candidate.id ||
    !record.checkpoint?.snapshot.ember
  )
    throw new Error("Persisted activation invariant failed");
  await store.update<ShowRecord, void>(key, (s) => {
    rollback(s, { clientId: s.lease!.clientId, epoch: s.lease!.epoch });
  });
  const independent = new PostgresStore(process.env.DATABASE_URL);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? store : independent).update<ShowRecord, void>(key, (s) => {
        s.round++;
      }),
    ),
  );
  record = (await store.get<ShowRecord>(key))!;
  if (
    record.round !== 10 ||
    record.activeCandidateId !== null ||
    record.checkpoint?.artifactHash !== null
  )
    throw new Error("Persisted rollback/CAS invariant failed");
  console.log(
    JSON.stringify({
      showId: show.id,
      storage: "real-neon-postgres",
      sampleSourceHash: candidate.sourceHash,
      programHash: candidate.programHash,
      previewApproved: true,
      persistedActivation: true,
      exactRollback: true,
      concurrentWriters: 8,
      finalRevision: record.revision,
      finalRound: record.round,
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.name : "Error",
      message:
        error instanceof Error ? error.message : "Database flow probe failed",
    }),
  );
  process.exitCode = 1;
});
