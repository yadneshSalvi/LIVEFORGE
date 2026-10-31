import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameEngine } from "@/game/core";
import {
  compileRuleSource,
  PRACTICE_RULE_SOURCE,
  verifyRuleProgram,
} from "@/game/rules";
import { prepareCandidateComposition } from "@/server/composition";
import { LocalFileStore } from "@/server/store";
import { parseCheckpoint } from "@/server/checkpoint";
import {
  acquireLease,
  activateCandidate as activateVerifiedCandidate,
  addProposal,
  approveCandidate as approveVerifiedCandidate,
  cancelGeneration,
  createGeneration,
  createShow,
  hostView,
  importPracticeSample,
  mutate,
  ownedShow,
  publicView,
  recoverAbandonedJobs,
  releaseLease,
  rejectCandidate,
  rollback,
  showKey,
  validateCheckpoint,
  vote,
  type ShowRecord,
} from "@/server/show";
import {
  cookieValue,
  decryptToken,
  digest,
  hashData,
  encryptToken,
  requireSameOrigin,
  sign,
  unsign,
} from "@/server/security";
import {
  CODEX_GUEST_RUNNER,
  GENERATION_NETWORK_ALLOWLIST,
} from "@/server/generation";
import type { Candidate } from "@/server/contracts";
function approveCandidate(
  ...args: Parameters<typeof approveVerifiedCandidate>
) {
  const c = args[0].candidates.find((c) => c.id === args[1]);
  return approveVerifiedCandidate(
    ...([
      args[0],
      args[1],
      args[2],
      args[3],
      args[4],
      args[5] ?? c?.composition,
    ] as Parameters<typeof approveVerifiedCandidate>),
  );
}
function activateCandidate(show: ShowRecord, input: Record<string, unknown>) {
  const c = show.candidates.find((c) => c.id === input.candidateId);
  return activateVerifiedCandidate(show, {
    compositionHash: c?.composition?.compositionHash,
    contextHash: c?.composition?.contextHash,
    artifactHash: c?.composition?.artifactHash,
    ...input,
  });
}
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-test-"));
  store = new LocalFileStore(directory);
  vi.stubEnv("SESSION_SECRET", "unit-test-only-session-secret-123456789");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 19).toString("base64"));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const state = await createShow("host-owner", "practice", store);
  return (await store.get<ShowRecord>(showKey(state.id)))!;
}
function candidate(show: ShowRecord) {
  addProposal(
    show,
    "Shadows become solid while their owner stays still.",
    "Practice author",
    "a",
    "practice",
  );
  const job = createGeneration(show, "P1");
  const program = compileRuleSource(PRACTICE_RULE_SOURCE);
  const result: Candidate = {
    id: "candidate-one",
    jobId: job.id,
    proposalId: "P1",
    source: PRACTICE_RULE_SOURCE,
    sourceHash: digest(PRACTICE_RULE_SOURCE),
    program,
    programHash: hashData(program),
    verification: verifyRuleProgram(program),
    baseRevision: show.revision,
    createdAt: new Date().toISOString(),
  };
  prepareCandidateComposition(show, result);
  show.candidates.push(result);
  job.status = "ready";
  return result;
}
function preview(c: Candidate) {
  const engine = new GameEngine();
  engine.activate(c.composition!.program, c.composition!.artifactHash);
  return engine.checkpoint();
}
describe("durable show authority", () => {
  it("serializes competing updates across independent local store instances", async () => {
    const show = await fixture();
    const other = new LocalFileStore(directory);
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        (i % 2 ? store : other).update<ShowRecord, void>(
          showKey(show.id),
          (s) => {
            s.round++;
          },
        ),
      ),
    );
    expect((await store.get<ShowRecord>(showKey(show.id)))!.round).toBe(16);
  });
  it("replays an idempotent mutation once and scopes records to their owner", async () => {
    const show = await fixture();
    const execute = () =>
      mutate(
        show.id,
        "host-owner",
        "mutation-key-001",
        (s) => {
          s.round++;
          return { round: s.round };
        },
        store,
      );
    expect(await execute()).toEqual({ round: 2 });
    expect(await execute()).toEqual({ round: 2 });
    await expect(ownedShow(show.id, "intruder", store)).rejects.toThrow(
      /not found/,
    );
  });
  it("keeps one current vote per account per round, allowing a change", async () => {
    const show = await fixture();
    addProposal(
      show,
      "A stationary prop can cast a temporary bridge.",
      "A",
      "a",
      "practice",
    );
    addProposal(
      show,
      "Jumping near the prop makes it glow coral.",
      "B",
      "b",
      "practice",
    );
    vote(show, "P1", "one-person");
    vote(show, "P1", "one-person");
    expect(show.proposals[0].votes).toBe(1);
    vote(show, "P2", "one-person");
    expect(show.proposals.map((p) => p.votes)).toEqual([0, 1]);
  });
  it("fences a late tab after authority expiry and takeover", async () => {
    const show = await fixture();
    const first = acquireLease(show, "client-one");
    expect(() => acquireLease(show, "client-two")).toThrow(/Another game tab/);
    show.lease!.expiresAt = Date.now() - 1;
    const second = acquireLease(show, "client-two");
    expect(second.epoch).toBe(first.epoch + 1);
    expect(() =>
      rollback(show, { clientId: first.clientId, epoch: first.epoch }),
    ).toThrow(/expired/);
  });
  it("recovers abandoned coordinator jobs without changing active game state", async () => {
    const show = await fixture();
    addProposal(
      show,
      "The stationary prop makes its shadow solid.",
      "A",
      "a",
      "practice",
    );
    const job = createGeneration(show, "P1");
    job.status = "generating";
    job.updatedAt = new Date(Date.now() - 7 * 60_000).toISOString();
    await store.update<ShowRecord, void>(showKey(show.id), (record) =>
      Object.assign(record, show),
    );
    const recovered = await recoverAbandonedJobs(show.id, store);
    expect(recovered!.jobs[0].status).toBe("failed");
    expect(recovered!.votingOpen).toBe(true);
    expect(recovered!.activeCandidateId).toBeNull();
  });
});
describe("explicit authority takeover", () => {
  it("fences the old owner immediately when the same-show host explicitly takes control", async () => {
    const show = await fixture();
    const first = acquireLease(show, "client-one");
    const second = acquireLease(show, "client-two", true);
    expect(second.epoch).toBe(first.epoch + 1);
    expect(() =>
      rollback(show, { clientId: first.clientId, epoch: first.epoch }),
    ).toThrow(/expired/);
    expect(releaseLease(show, first.clientId, first.epoch)).toBe(false);
    expect(show.lease?.clientId).toBe(second.clientId);
  });
  it("conditionally releases only the matching epoch and retains the fencing sequence", async () => {
    const show = await fixture();
    const first = acquireLease(show, "client-one");
    expect(releaseLease(show, first.clientId, first.epoch)).toBe(true);
    const second = acquireLease(show, "client-two");
    expect(second.epoch).toBe(first.epoch + 1);
    expect(releaseLease(show, first.clientId, first.epoch)).toBe(false);
  });
});
describe("exact artifact approval and checkpoint activation", () => {
  it("imports a real previously generated sample without claiming a new model call", async () => {
    const show = await fixture();
    const c = importPracticeSample(show);
    expect(c.sourceHash).toBe(
      "5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc",
    );
    expect(c.provenance?.kind).toBe("reused-generation");
    expect(c.provenance?.threadId).toBe("01a191b2-a2cc-7aa2-ba97-bbf55d328fcf");
    expect(show.jobs[0].reused).toBe(true);
    expect(c.verification.passed).toBe(true);
    expect(show.activeCandidateId).toBeNull();
  });

  it("requires preview and approval, then restores exactly the pre-activation checkpoint", async () => {
    const show = await fixture();
    const c = candidate(show);
    const lease = acquireLease(show, "client-one");
    const cp = new GameEngine().checkpoint();
    const input = {
      clientId: lease.clientId,
      epoch: lease.epoch,
      candidateId: c.id,
      sourceHash: c.sourceHash,
      programHash: c.programHash,
      checkpoint: cp,
    };
    expect(() => activateCandidate(show, input)).toThrow(/approve/);
    expect(() =>
      approveCandidate(show, c.id, c.sourceHash, c.programHash, undefined),
    ).toThrow(/Checkpoint/);
    approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c));
    activateCandidate(show, input);
    expect(show.checkpoint?.program).toEqual(c.program);
    expect(show.checkpoint?.snapshot.ember).toBe(true);
    rollback(show, input);
    expect(show.checkpoint).toEqual(cp);
    expect(show.activeCandidateId).toBeNull();
  });
  it("rejects source tampering and program-only tampering after approval", async () => {
    const show = await fixture();
    const c = candidate(show);
    approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c));
    const lease = acquireLease(show, "client-one");
    c.program.name = "Tampered program";
    expect(() =>
      activateCandidate(show, {
        candidateId: c.id,
        clientId: lease.clientId,
        epoch: lease.epoch,
        sourceHash: c.sourceHash,
        programHash: c.programHash,
        checkpoint: new GameEngine().checkpoint(),
      }),
    ).toThrow(/changed|approved|no longer matches/);
  });
  it("survives JSONB key reordering without changing program identity", async () => {
    const show = await fixture();
    const c = candidate(show);
    const reverse = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverse)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reverse(v)]),
            )
          : value;
    c.program = reverse(c.program) as typeof c.program;
    expect(() =>
      approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c)),
    ).not.toThrow();
  });
  it("rejects old approval even if candidate hashes are rewritten consistently", async () => {
    const show = await fixture();
    const c = candidate(show);
    approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c));
    const lease = acquireLease(show, "client-one");
    c.source = c.source.replace("Stillness makes a way", "Changed artifact");
    c.program = compileRuleSource(c.source);
    c.sourceHash = digest(c.source);
    c.programHash = hashData(c.program);
    expect(() =>
      activateCandidate(show, {
        candidateId: c.id,
        clientId: lease.clientId,
        epoch: lease.epoch,
        sourceHash: c.sourceHash,
        programHash: c.programHash,
        checkpoint: new GameEngine().checkpoint(),
      }),
    ).toThrow(/changed|approved|no longer matches/);
  });
  it("does not make candidates stale during lease or checkpoint renewals", async () => {
    const show = await fixture();
    const c = candidate(show);
    acquireLease(show, "client-one");
    show.checkpoint = validateCheckpoint(new GameEngine().checkpoint(), show);
    approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c));
    expect(c.baseRevision).toBe(show.revision);
    show.revision++;
    expect(() =>
      approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c)),
    ).toThrow(/world changed|earlier game revision/);
  });
  it("keeps rejected artifacts inspectable while blocking approval/activation", async () => {
    const show = await fixture();
    const c = candidate(show);
    rejectCandidate(show, c.id, "The creator wants a clearer trigger.");
    expect(c.rejectedAt).toBeDefined();
    expect(show.jobs[0].status).toBe("rejected");
    expect(show.candidates[0].source).toBe(PRACTICE_RULE_SOURCE);
    expect(() =>
      approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c)),
    ).toThrow(/rejected/);
  });
  it("records a creator-approved revision against the original proposal attribution", async () => {
    const show = await fixture();
    const c = candidate(show);
    rejectCandidate(show, c.id);
    const revised = createGeneration(
      show,
      "P1",
      "Require the prop to remain stationary for 30 ticks before projecting its shadow.",
      c.id,
    );
    expect(revised.priorCandidateId).toBe(c.id);
    expect(revised.revision).toContain("30 ticks");
    expect(show.proposals[0].author).toBe("Practice author");
  });
  it("cancellation leaves no candidate or automatic activation", async () => {
    const show = await fixture();
    addProposal(
      show,
      "Make the prop glow when the courier moves closer.",
      "A",
      "a",
      "practice",
    );
    const job = createGeneration(show, "P1");
    cancelGeneration(show, job.id);
    expect(job.status).toBe("cancelled");
    expect(show.candidates).toEqual([]);
    expect(show.activeCandidateId).toBeNull();
    expect(show.votingOpen).toBe(true);
  });
  it.each([
    "ember",
    "identities",
    "dimensions",
    "surface",
    "checkpoint",
    "velocity",
    "timer",
    "unknown",
  ])("rejects tampered checkpoint: %s", (change) => {
    const cp = new GameEngine().checkpoint();
    if (change === "ember") cp.snapshot.ember = false;
    if (change === "identities") cp.snapshot.entities[0].id = "impostor";
    if (change === "dimensions") cp.snapshot.entities[0].w = -1;
    if (change === "surface") cp.snapshot.surfaces[0].y = Infinity;
    if (change === "checkpoint") cp.snapshot.checkpoint = -1;
    if (change === "velocity") cp.snapshot.entities[1].vx = 999;
    if (change === "timer") cp.snapshot.entities[0].timer = 1e9;
    if (change === "unknown")
      (cp.snapshot as unknown as Record<string, unknown>).arbitraryExecutable =
        "alert(1)";
    expect(() =>
      parseCheckpoint(cp, { program: null, sourceHash: null }),
    ).toThrow();
  });
  it("strips private evidence, identity hashes, credentials, and authority from public state", async () => {
    const show = await fixture();
    show.credentialId = "private-credential";
    show.ownerId = "private-owner";
    show.voters["secret-actor"] = "P1";
    show.oauth = { stateHash: "private-oauth", expiresAt: Date.now() };
    const publicJson = JSON.stringify(publicView(show));
    const hostJson = JSON.stringify(hostView(show));
    expect(publicJson + hostJson).not.toMatch(
      /private-credential|private-owner|secret-actor|private-oauth/,
    );
    expect(publicView(show)).not.toHaveProperty("checkpoint");
    expect(publicView(show)).not.toHaveProperty("lease");
  });
});
describe("session, origin, and isolation boundaries", () => {
  it("rejects tampered signatures and cross-origin host mutations", () => {
    const signed = sign({ hostId: "host", showId: "show" });
    expect(unsign(signed)).toEqual({ hostId: "host", showId: "show" });
    expect(unsign(signed + "x")).toBeNull();
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3100/api/shows", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(/origin/);
    expect(
      cookieValue(
        new Request("http://localhost:3100", {
          headers: { cookie: "other=x; liveforge_host=abc" },
        }),
      ),
    ).toBe("abc");
  });
  it("encrypts grants and rejects modified ciphertext", () => {
    const encrypted = encryptToken({
      accessToken: "fixture-access-value",
      refreshToken: "fixture-refresh-value",
    });
    expect(encrypted).not.toContain("fixture");
    expect(decryptToken(encrypted)).toEqual({
      accessToken: "fixture-access-value",
      refreshToken: "fixture-refresh-value",
    });
    const buffer = Buffer.from(encrypted, "base64url");
    buffer[30] ^= 1;
    expect(() => decryptToken(buffer.toString("base64url"))).toThrow();
  });
  it("guest has a narrowly scoped provider-only environment and no candidate evaluation", () => {
    expect(GENERATION_NETWORK_ALLOWLIST).toEqual(["api.openai.com"]);
    expect(CODEX_GUEST_RUNNER).toContain("shell_tool:false");
    expect(CODEX_GUEST_RUNNER).toContain("sandboxMode:'read-only'");
    expect(CODEX_GUEST_RUNNER).not.toMatch(
      /TWITCH|DATABASE_URL|VERCEL_TOKEN|process\.env\s*[,}]/,
    );
    expect(CODEX_GUEST_RUNNER).not.toMatch(
      /eval\(|new Function|import\(.*rule/,
    );
  });
});
