import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import { GameEngine } from "@/game/core";
import {
  acquireLease,
  activateCandidate,
  addProposal,
  approveCandidate,
  AUTHORITY_LEASE_MS,
  createShow,
  hostView,
  importPracticeSample,
  openNextRound,
  publicView,
  rollback,
  showKey,
  validateCheckpoint,
  vote,
  type ShowRecord,
} from "@/server/show";
import {
  readGenerationFailure,
  sanitizeGenerationFailure,
} from "@/server/generation-failure";
import { REUSED_RULE_ARTIFACT } from "@/server/reused-artifact";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-review-"));
  store = new LocalFileStore(directory);
  vi.stubEnv("SESSION_SECRET", "review-session-signing-secret-123456789");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture(mode: "practice" | "twitch" = "practice") {
  const state = await createShow("host", mode, store);
  return (await store.get<ShowRecord>(showKey(state.id)))!;
}
function activate(show: ShowRecord, sample: "shadow" | "step" = "shadow") {
  const candidate = importPracticeSample(show, sample);
  const engine = new GameEngine();
  if (show.checkpoint) engine.restore(show.checkpoint);
  const before = engine.checkpoint();
  engine.activate(
    candidate.composition!.program,
    candidate.composition!.artifactHash,
  );
  approveCandidate(
    show,
    candidate.id,
    candidate.sourceHash,
    candidate.programHash,
    engine.checkpoint(),
    candidate.composition,
  );
  activateCandidate(show, {
    clientId: show.lease!.clientId,
    epoch: show.lease!.epoch,
    candidateId: candidate.id,
    compositionHash: candidate.composition!.compositionHash,
    contextHash: candidate.composition!.contextHash,
    artifactHash: candidate.composition!.artifactHash,
    sourceHash: candidate.sourceHash,
    programHash: candidate.programHash,
    checkpoint: before,
  });
  return candidate;
}
describe("P0 live state repair", () => {
  it("uses a90second authority lease without changing fencing", async () => {
    const show = await fixture();
    const start = Date.now();
    const lease = acquireLease(show, "review-active-tab");
    expect(AUTHORITY_LEASE_MS).toBe(90_000);
    expect(lease.expiresAt - start).toBeGreaterThanOrEqual(90_000);
    expect(lease.expiresAt - start).toBeLessThan(90_100);
  });
  it("clears per-round votes and identities when a new round opens", async () => {
    const show = await fixture();
    addProposal(
      show,
      "The stationary prop casts a solid shadow.",
      "Viewer",
      "actor",
      "practice",
    );
    vote(show, "P1", "one-viewer");
    expect(show.proposals[0].votes).toBe(1);
    openNextRound(show);
    expect(show.voters).toEqual({});
    expect(show.proposals[0].votes).toBe(0);
    vote(show, "P1", "one-viewer");
    vote(show, "P1", "one-viewer");
    expect(show.proposals[0].votes).toBe(1);
  });
  it("resets current tallies on activation but preserves proposal attribution", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    addProposal(
      show,
      "The stationary prop casts a solid shadow.",
      "Original viewer",
      "actor",
      "practice",
    );
    vote(show, "P1", "one-viewer");
    activate(show);
    expect(show.round).toBe(2);
    expect(show.proposals[0]).toMatchObject({
      author: "Original viewer",
      votes: 0,
    });
    expect(show.voters).toEqual({});
  });
  it("imports a labeled sample in Twitch without stealing an identical viewer proposal", async () => {
    const show = await fixture("twitch");
    const chat = addProposal(
      show,
      REUSED_RULE_ARTIFACT.proposal,
      "Actual viewer",
      "chat-actor",
      "twitch",
      "message-one",
    );
    const candidate = importPracticeSample(show);
    const sample = show.proposals.find((p) => p.id === candidate.proposalId)!;
    expect(sample.id).not.toBe(chat.id);
    expect(sample).toMatchObject({
      origin: "sample",
      author: "Previously generated sample",
    });
    expect(show.jobs.at(-1)?.reused).toBe(true);
    expect(publicView(show).generation?.message).toBe("Sample law loaded");
  });
  it("rolls the exact current fault back on the server and accepts the next checkpoint", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    const before = new GameEngine().checkpoint();
    const candidate = activate(show);
    rollback(show, {
      clientId: show.lease!.clientId,
      epoch: show.lease!.epoch,
      expectedRevision: show.revision,
      faultedArtifactHash: candidate.composition!.artifactHash,
      runtimeFaultReason: "The worker rejected an invalid surface.",
    });
    expect(show.activeCandidateId).toBeNull();
    expect(show.checkpoint).toEqual(before);
    const resumed = new GameEngine();
    resumed.restore(show.checkpoint!);
    resumed.step();
    expect(() => {
      show.checkpoint = validateCheckpoint(resumed.checkpoint(), show);
    }).not.toThrow();
    expect(show.events.at(-1)?.message).toContain(
      "Law retired after a runtime fault",
    );
  });
  it("explicitly retires all laws after a matching fault even with a previous checkpoint", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    const candidate = activate(show);
    expect(show.previousCheckpoint).not.toBeNull();
    rollback(show, {
      clientId: show.lease!.clientId,
      epoch: show.lease!.epoch,
      expectedRevision: show.revision,
      faultedArtifactHash: candidate.composition!.artifactHash,
      runtimeFaultReason: "Worker fault",
      retireAllLaws: true,
    });
    expect(show.previousCheckpoint).toBeNull();
    expect(show.activeCandidateIds).toEqual([]);
    expect(show.phase).toBe("collecting");
    expect(() => validateCheckpoint(show.checkpoint, show)).not.toThrow();
  });
  it("projects only trusted generation phases and valid verification counts", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    activate(show);
    const at = new Date().toISOString();
    show.jobs.at(-1)!.phases = [
      ...[
        "snapshot-restored",
        "workspace-ready",
        "thread-started",
        "turn-started",
        "source-returned",
        "verifier-started",
      ].map((phase) => ({
        phase,
        at,
        attempt: 1,
        checksPassed: 2,
        totalChecks: 2,
        secret: "private fixture",
      })),
      {
        phase: "verification-complete",
        at,
        attempt: 1,
        checksPassed: 3,
        totalChecks: 4,
        secret: "private fixture",
      },
      ...[
        [-1, 4],
        [5, 4],
        [1, 0],
        [1, 33],
        [1.5, 4],
      ].map(([checksPassed, totalChecks]) => ({
        phase: "verification-complete",
        at,
        attempt: 1,
        checksPassed,
        totalChecks,
      })),
      { phase: "untrusted", at, attempt: 1 },
      { phase: "thread-started", at: "invalid", attempt: 1 },
      { phase: "thread-started", at, attempt: 4 },
    ] as (typeof show.jobs)[number]["phases"];
    const projected = publicView(show).generation!.phases!;
    expect(projected).toHaveLength(12);
    expect(projected[6]).toEqual({
      phase: "verification-complete",
      at,
      attempt: 1,
      checksPassed: 3,
      totalChecks: 4,
    });
    expect(projected[0]).toEqual({
      phase: "snapshot-restored",
      at,
      attempt: 1,
    });
    expect(
      projected
        .slice(7)
        .every(
          (p) => p.checksPassed === undefined && p.totalChecks === undefined,
        ),
    ).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("private fixture");
    show.jobs.at(-1)!.phases = Array.from({ length: 30 }, () => ({
      phase: "thread-started",
      at,
      attempt: 1,
    }));
    expect(publicView(show).generation!.phases).toHaveLength(18);
  });
  it("never exposes hidden or rejected generation proposal text", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    const candidate = activate(show);
    const proposal = show.proposals.find((p) => p.id === candidate.proposalId)!;
    for (const status of ["hidden", "rejected"] as const) {
      proposal.status = status;
      expect(publicView(show).generation?.proposal).toBeUndefined();
    }
  });
  it("rejects delayed faults after a newer law activates", async () => {
    const show = await fixture();
    acquireLease(show, "review-active-tab");
    const old = activate(show);
    const oldRevision = show.revision;
    const next = activate(show, "step");
    expect(() =>
      rollback(show, {
        clientId: show.lease!.clientId,
        epoch: show.lease!.epoch,
        expectedRevision: oldRevision,
        faultedArtifactHash: old.composition!.artifactHash,
        runtimeFaultReason: "Delayed old worker fault",
      }),
    ).toThrow(/world changed/);
    expect(show.activeCandidateId).toBe(next.id);
    expect(() =>
      rollback(show, {
        clientId: show.lease!.clientId,
        epoch: show.lease!.epoch,
        expectedRevision: show.revision,
        faultedArtifactHash: old.composition!.artifactHash,
        runtimeFaultReason: "Wrong law",
      }),
    ).toThrow(/does not identify/);
    expect(show.activeCandidateId).toBe(next.id);
  });
});
describe("private generation diagnostics", () => {
  it("independently redacts secrets and bounds the guest's failure file", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-actual-provider-secret");
    const reason = await readGenerationFailure(async () =>
      Buffer.from(
        JSON.stringify({
          message:
            "401 invalid key fixture-actual-provider-secret; Bearer opaque-value; api_key=other-value",
        }),
      ),
    );
    expect(reason).toContain("401 invalid key");
    expect(reason).not.toMatch(
      /fixture-actual-provider-secret|opaque-value|other-value/,
    );
    expect(
      await readGenerationFailure(async () => Buffer.alloc(4097)),
    ).toBeNull();
    expect(
      await readGenerationFailure(async () => Buffer.from("not json")),
    ).toBeNull();
    expect(
      sanitizeGenerationFailure("x".repeat(8000))?.length,
    ).toBeLessThanOrEqual(350);
  });
  it("retains host-only specifics while public status/events stay generic", async () => {
    const show = await fixture();
    const candidate = importPracticeSample(show);
    const job = show.jobs[0];
    job.reused = false;
    job.status = "failed";
    job.message = "Sensitive unreviewed model refusal text";
    show.events.push(
      {
        id: "failure",
        at: new Date().toISOString(),
        type: "generation.failed",
        message: job.message,
      },
      {
        id: "private-fault",
        at: new Date().toISOString(),
        type: "private.runtime.fault",
        message: "private runtime details",
      },
    );
    expect(JSON.stringify(hostView(show))).toContain(job.message);
    expect(JSON.stringify(publicView(show))).not.toMatch(
      /Sensitive unreviewed|private runtime details/,
    );
    expect(candidate.sourceHash).toBeDefined();
  });
});
