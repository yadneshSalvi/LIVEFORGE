import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
import { after } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGINE_VERSION } from "@/game/contracts";
import { GameEngine } from "@/game/core";
import {
  compileRuleSource,
  PRACTICE_RULE_SOURCE,
  verifyRuleProgram,
} from "@/game/rules";
import { prepareCandidateComposition } from "@/server/composition";
import type { Candidate, GenerationJob } from "@/server/contracts";
import { listLibrary, readLibraryEntry } from "@/server/library";
import { digest, hashData, sessionCookie } from "@/server/security";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import * as generation from "@/server/generation";
import * as twitch from "@/server/twitch";
import { buildChatReply } from "@/server/twitch-replies";
import {
  acquireLease,
  addProposal,
  createGeneration,
  createShow,
  hostView,
  mutate,
  publicView,
  showKey,
  type ShowRecord,
} from "@/server/show";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";

let directory: string, store: LocalFileStore;
const owner = "adaptation-owner";
const originalText = "Let the courier jump higher when microphone pitch rises.";
const alternative = "Each time the courier jumps, glow mint for a moment.";
const suggestion = "Stationary props cast solid shadows after 24 ticks.";
const failure = "The requested microphone pitch input is unsupported.";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-adaptation-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "adaptation-session-test-secret-1234567890");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
  vi.stubEnv("OPENAI_API_KEY", "fixture-provider-key");
  vi.spyOn(twitch, "requireGenerationHost").mockResolvedValue({
    actorId: "fixture-authorized-host",
    exempt: true,
  });
  vi.spyOn(generation, "captureSandboxCredentials").mockResolvedValue({
    token: "fixture-control-token",
    teamId: "fixture-team",
    projectId: "fixture-project",
  });
  vi.spyOn(generation, "runGeneration").mockResolvedValue(undefined);
  vi.mocked(after).mockClear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function fixture(modelSuggestion?: string | null) {
  const state = await createShow(owner, "practice", store);
  const job = await store.update<ShowRecord, GenerationJob>(
    showKey(state.id),
    (show) => {
      const original = addProposal(
        show,
        originalText,
        "Original inventor",
        "original-inventor",
        "practice",
      );
      const job = createGeneration(show, original.id);
      job.status = "failed";
      job.message = failure;
      job.threadId = "private-failed-model-thread";
      job.updatedAt = new Date().toISOString();
      if (modelSuggestion !== undefined)
        job.adaptedProposal = modelSuggestion as string;
      show.phase = "collecting";
      show.votingOpen = true;
      return job;
    },
  );
  const body = {
    text: alternative,
    expectedRevision: state.revision,
    expectedJobUpdatedAt: job.updatedAt,
  };
  const path = `generations/${job.id}/adapt`;
  return {
    id: state.id,
    job,
    body,
    path,
    post: (input: unknown = body, key = "reviewed-alternative-one") =>
      post(state.id, path, input, key),
    read: () => store.get<ShowRecord>(showKey(state.id)).then((show) => show!),
    change: (fn: (show: ShowRecord) => void) =>
      store.update<ShowRecord, void>(showKey(state.id), fn),
  };
}
function post(
  showId: string,
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
  hostId = owner,
  origin: string | null = "http://localhost:3100",
) {
  return POST(
    new Request(`http://localhost:3100/api/shows/${showId}/${path}`, {
      method: "POST",
      headers: {
        ...(origin ? { Origin: origin } : {}),
        Cookie: sessionCookie({
          hostId,
          showId,
          expiresAt: Date.now() + 60_000,
        }).split(";")[0],
        "Content-Type": "application/json",
        "x-idempotency-key": key,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ showId, action: path.split("/") }) },
  );
}
async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect((await response.json()).error).toBe(code);
}
async function verifiedCandidate(showId: string, jobId: string) {
  return store.update<ShowRecord, Candidate>(showKey(showId), (show) => {
    const job = show.jobs.find((job) => job.id === jobId)!;
    const program = compileRuleSource(PRACTICE_RULE_SOURCE);
    const candidate: Candidate = {
      id: "verified-reviewed-alternative",
      jobId,
      proposalId: job.proposalId,
      source: PRACTICE_RULE_SOURCE,
      sourceHash: digest(PRACTICE_RULE_SOURCE),
      program,
      programHash: hashData(program),
      verification: verifyRuleProgram(program),
      engineVersion: ENGINE_VERSION,
      baseRevision: show.revision,
      createdAt: new Date().toISOString(),
    };
    prepareCandidateComposition(show, candidate);
    show.candidates.push(candidate);
    job.candidateId = candidate.id;
    job.status = "ready";
    show.phase = "preview";
    return candidate;
  });
}

describe("host-reviewed alternatives to failed generations", () => {
  it.each(["twitch", "sample", "library"] as const)(
    "keeps activity credit truthful when the original idea has %s origin",
    async (origin) => {
      const f = await fixture();
      await f.change((show) => {
        show.proposals[0].origin = origin;
      });
      expect((await f.post()).status).toBe(200);
      const show = await f.read();
      const received = show.events.find(
        (item) => item.type === "proposal.received" && item.proposalId === "P2",
      )!;
      expect(received.message).toBe(
        "The host reviewed a separate alternative with the original contributor’s credit.",
      );
      expect(received.message).not.toContain("Twitch viewer");
      if (origin === "twitch") {
        const reply = buildChatReply(show, received);
        expect(reply).toContain("host-written alternative");
        expect(reply).not.toContain("your idea is P2");
        expect(reply).not.toContain(alternative);
        expect(reply).not.toContain(failure);
      }
    },
  );
  it.each([undefined, null, "", "   "])(
    "accepts a host-written alternative with model suggestion %s and preserves failed evidence",
    async (modelSuggestion) => {
      const f = await fixture(modelSuggestion);
      const before = await f.read();
      const response = await f.post();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const after = await f.read();
      expect(after.proposals).toHaveLength(2);
      expect(after.proposals[0]).toEqual(before.proposals[0]);
      expect(after.proposals[1]).toMatchObject({
        text: alternative,
        author: "Original inventor",
        status: "open",
        votes: 0,
        ancestry: {
          kind: "adaptation",
          adaptationSource: "host-written",
          originalAuthor: "Original inventor",
          originalText,
          originalProposalId: "P1",
          sourceJobId: f.job.id,
        },
      });
      expect(after.jobs).toEqual([
        { ...before.jobs[0], adaptationProposalId: after.proposals[1].id },
      ]);
      expect(after.candidates).toEqual([]);
      expect(after.revision).toBe(before.revision);
      expect(after.activeCandidateId).toBeNull();
      expect(generation.captureSandboxCredentials).not.toHaveBeenCalled();
      expect(generation.runGeneration).not.toHaveBeenCalled();
      expect(twitch.requireGenerationHost).not.toHaveBeenCalled();
      expect(
        after.events.filter((e) => e.type === "proposal.adapted"),
      ).toHaveLength(1);
    },
  );

  it.each([
    [suggestion, "model-suggested"],
    [alternative, "host-edited"],
  ] as const)(
    "records %s with %s provenance",
    async (text, adaptationSource) => {
      const f = await fixture(suggestion);
      expect((await f.post({ ...f.body, text })).status).toBe(200);
      const show = await f.read();
      expect(show.proposals[1].ancestry?.adaptationSource).toBe(
        adaptationSource,
      );
      expect(show.jobs[0].adaptedProposal).toBe(suggestion);
    },
  );

  it.each([
    [undefined, "proposal_text"],
    [null, "proposal_text"],
    [42, "proposal_text"],
    [{ text: alternative }, "proposal_text"],
    ["", "proposal_length"],
    ["  \n\t", "proposal_length"],
    ["short", "proposal_length"],
    ["x".repeat(281), "proposal_length"],
    ["Open https://example.com for a game mechanic", "proposal_moderation"],
  ])(
    "refuses invalid text %s without consuming the key",
    async (text, code) => {
      const f = await fixture();
      const before = await f.read();
      await expectError(await f.post({ ...f.body, text }), 400, code as string);
      expect(await f.read()).toEqual(before);
      expect((await f.post()).status).toBe(200);
    },
  );

  it.each([
    [{ expectedRevision: undefined }, "adaptation_revision"],
    [{ expectedRevision: "0" }, "adaptation_revision"],
    [{ expectedRevision: 0.5 }, "adaptation_revision"],
    [{ expectedJobUpdatedAt: undefined }, "adaptation_job_token"],
    [{ expectedJobUpdatedAt: null }, "adaptation_job_token"],
    [{ expectedJobUpdatedAt: "invalid" }, "adaptation_job_token"],
  ])("requires review tokens %s", async (tokens, code) => {
    const f = await fixture();
    const before = await f.read();
    await expectError(await f.post({ ...f.body, ...tokens }), 400, code);
    expect(await f.read()).toEqual(before);
  });

  it("normalizes whitespace, controls and Unicode for concurrent retries and model attribution", async () => {
    const f = await fixture("Ｃourier jumps make mint sparks.");
    const text = "Courier jumps make mint sparks.";
    const responses = await Promise.all([
      f.post({ ...f.body, text: "\tＣourier  jumps\nmake mint sparks.  " }),
      f.post({ ...f.body, text }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const show = await f.read();
    expect(show.proposals).toHaveLength(2);
    expect(show.proposals[1]).toMatchObject({
      text,
      ancestry: { adaptationSource: "model-suggested" },
    });
    expect(
      show.events.filter((e) => e.type === "proposal.adapted"),
    ).toHaveLength(1);
    expect(Object.keys(show.idempotency)).toHaveLength(1);
  });

  it("recovers an exact completed key after unrelated state and freshness changes", async () => {
    const f = await fixture();
    expect((await f.post()).status).toBe(200);
    await f.change((show) => {
      show.revision++;
      show.jobs[0].updatedAt = "2026-11-01T12:00:00.000Z";
      show.proposals[0].status = "hidden";
      show.engineVersion = "old-engine";
    });
    const before = await f.read();
    expect((await f.post()).status).toBe(200);
    expect(await f.read()).toEqual(before);
  });

  it.each(["text", "revision", "job-token", "job"])(
    "rejects a request key rebound to another %s atomically",
    async (field) => {
      const f = await fixture();
      expect((await f.post()).status).toBe(200);
      const before = await f.read();
      const input = {
        ...f.body,
        ...(field === "text" ? { text: suggestion } : {}),
        ...(field === "revision" ? { expectedRevision: 1 } : {}),
        ...(field === "job-token"
          ? { expectedJobUpdatedAt: "2026-11-01T12:00:00.000Z" }
          : {}),
      };
      await expectError(
        field === "job"
          ? await post(
              f.id,
              "generations/another-failed-job/adapt",
              input,
              "reviewed-alternative-one",
            )
          : await f.post(input),
        409,
        "idempotency_conflict",
      );
      expect(await f.read()).toEqual(before);
    },
  );

  it("keeps one immutable accepted text per job with fresh keys and after receipt rotation", async () => {
    const f = await fixture();
    expect((await f.post()).status).toBe(200);
    await expectError(
      await f.post({ ...f.body, text: suggestion }, "different-text-key"),
      409,
      "adaptation_conflict",
    );
    for (let i = 0; i < 65; i++)
      await mutate(
        f.id,
        owner,
        `rotate-receipt-${i}`,
        () => ({ resumed: true }),
        store,
      );
    expect(
      (await f.read()).idempotency["reviewed-alternative-one"],
    ).toBeUndefined();
    expect((await f.post()).status).toBe(200);
    expect((await f.post(f.body, "same-text-new-key")).status).toBe(200);
    await expectError(
      await f.post({ ...f.body, text: suggestion }, "new-conflicting-key"),
      409,
      "adaptation_conflict",
    );
    const show = await f.read();
    expect(show.proposals).toHaveLength(2);
    expect(
      show.events.filter((e) => e.type === "proposal.adapted"),
    ).toHaveLength(1);
    expect(Object.keys(show.idempotency)).toHaveLength(60);
  });

  it("arbitrates concurrent different text on the same failed job", async () => {
    const f = await fixture();
    const responses = await Promise.all([
      f.post(),
      f.post({ ...f.body, text: suggestion }, "competing-alternative"),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await f.read()).proposals).toHaveLength(2);
  });

  it("atomically rejects competing bodies under the same request key", async () => {
    const f = await fixture();
    const responses = await Promise.all([
      f.post(),
      f.post({ ...f.body, text: suggestion }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((r) => r.status === 409)!;
    expect((await conflict.json()).error).toBe("idempotency_conflict");
    const show = await f.read();
    expect(show.proposals).toHaveLength(2);
    expect(Object.keys(show.idempotency)).toHaveLength(1);
    expect(
      show.events.filter((e) => e.type === "proposal.adapted"),
    ).toHaveLength(1);
  });

  it.each(["adapt-first", "other-first"])(
    "rejects cross-operation key reuse %s",
    async (order) => {
      const f = await fixture();
      const key = "cross-operation-key";
      const other = () =>
        post(f.id, "settings", { blockedTerms: ["shadows"] }, key);
      const first = order === "adapt-first" ? () => f.post(f.body, key) : other;
      const second =
        order === "adapt-first" ? other : () => f.post(f.body, key);
      expect((await first()).status).toBe(200);
      const before = await f.read();
      await expectError(await second(), 409, "idempotency_conflict");
      expect(await f.read()).toEqual(before);
    },
  );

  it.each([
    ["revision", "stale_revision", 409],
    ["job-token", "stale_job", 409],
    ["status", "adaptation_unavailable", 409],
    ["active-generation", "generation_busy", 409],
    ["hidden", "proposal_not_found", 404],
    ["rejected", "proposal_not_found", 404],
    ["missing-original", "proposal_not_found", 404],
    ["engine", "engine_upgrade_required", 409],
    ["job-engine", "adaptation_unavailable", 409],
    ["blocked", "proposal_blocked", 400],
  ] as const)(
    "rejects changed %s before new acceptance",
    async (change, code, status) => {
      const f = await fixture();
      await f.change((show) => {
        if (change === "revision") show.revision++;
        if (change === "job-token")
          show.jobs[0].updatedAt = "2026-11-01T12:00:00.000Z";
        if (change === "status") show.jobs[0].status = "ready";
        if (change === "active-generation")
          show.jobs.push({ ...show.jobs[0], id: "busy-job", status: "queued" });
        if (change === "hidden" || change === "rejected")
          show.proposals[0].status = change;
        if (change === "missing-original") show.proposals = [];
        if (change === "engine") show.engineVersion = "earlier-engine";
        if (change === "job-engine")
          show.jobs[0].engineVersion = "earlier-engine";
        if (change === "blocked") show.settings.blockedTerms = ["mint"];
      });
      const before = await f.read();
      await expectError(await f.post(), status, code);
      expect(await f.read()).toEqual(before);
    },
  );

  it("rejects another owner and missing or foreign same-origin evidence", async () => {
    const f = await fixture();
    const before = await f.read();
    await expectError(
      await post(f.id, f.path, f.body, "wrong-owner-key", "intruder"),
      404,
      "show_not_found",
    );
    await expectError(
      await post(f.id, f.path, f.body, "missing-origin-key", owner, null),
      403,
      "origin",
    );
    await expectError(
      await post(
        f.id,
        f.path,
        f.body,
        "foreign-origin-key",
        owner,
        "https://foreign.example",
      ),
      403,
      "origin",
    );
    expect(await f.read()).toEqual(before);
  });

  it("publishes only accepted safe provenance and preserves the original evidence in the host view", async () => {
    const f = await fixture(suggestion);
    expect(JSON.stringify(publicView(await f.read()))).not.toContain(
      suggestion,
    );
    expect((await f.post()).status).toBe(200);
    await f.change((show) => {
      show.proposals[0].status = "hidden";
    });
    const show = await f.read();
    const host = hostView(show);
    expect(host.jobs[0]).toMatchObject({
      message: failure,
      adaptedProposal: suggestion,
    });
    expect(host.proposals[1].ancestry).toMatchObject({
      originalText,
      sourceJobId: f.job.id,
    });
    const projected = publicView(show);
    expect(projected.proposals[0].ancestry).toEqual({
      kind: "adaptation",
      originalAuthor: "Original inventor",
      adaptationSource: "host-edited",
    });
    const serialized = JSON.stringify(projected);
    for (const privateValue of [
      failure,
      suggestion,
      originalText,
      f.job.id,
      "sourceJobId",
      "originalText",
      "private-failed-model-thread",
      "requestHash",
    ])
      expect(serialized).not.toContain(privateValue);
  });

  it.each([
    [undefined, alternative, "host-written"],
    [suggestion, alternative, "host-edited"],
    [suggestion, suggestion, "model-suggested"],
  ] as const)(
    "retains %s provenance through fresh forging, exact approval, activation and library reuse",
    async (modelSuggestion, text, adaptationSource) => {
      const f = await fixture(modelSuggestion);
      expect((await f.post({ ...f.body, text })).status).toBe(200);
      const accepted = (await f.read()).proposals[1];
      expect(accepted.status).toBe("open");
      const generated = await post(
        f.id,
        "generate",
        { proposalId: accepted.id },
        "forge-reviewed-proposal",
      );
      expect(generated.status).toBe(202);
      const freshJob = (await generated.json()).job as GenerationJob;
      expect(freshJob.proposalId).toBe(accepted.id);
      expect(freshJob.id).not.toBe(f.job.id);
      expect(freshJob.status).toBe("queued");
      expect((await f.read()).jobs[0].message).toBe(failure);
      const candidate = await verifiedCandidate(f.id, freshJob.id);
      const previewEngine = new GameEngine();
      previewEngine.activate(
        candidate.composition!.program,
        candidate.composition!.artifactHash,
      );
      const previewCheckpoint = previewEngine.checkpoint();
      const approval = {
        sourceHash: candidate.sourceHash,
        programHash: candidate.programHash,
        previewCheckpoint,
        compositionHash: candidate.composition!.compositionHash,
        contextHash: candidate.composition!.contextHash,
        artifactHash: candidate.composition!.artifactHash,
      };
      await f.change((show) => {
        acquireLease(show, "game-authority");
      });
      const showWithLease = await f.read();
      const activation = {
        ...approval,
        candidateId: candidate.id,
        checkpoint: new GameEngine().checkpoint(),
        clientId: "game-authority",
        epoch: showWithLease.lease!.epoch,
      };
      await expectError(
        await post(f.id, "activate", activation),
        409,
        "approval_required",
      );
      await expectError(
        await post(f.id, `candidates/${candidate.id}/approve`, {
          ...approval,
          sourceHash: "wrong-source-hash",
        }),
        409,
        "artifact_changed",
      );
      expect(
        (await post(f.id, `candidates/${candidate.id}/approve`, approval))
          .status,
      ).toBe(200);
      expect((await post(f.id, "activate", activation)).status).toBe(200);
      const activeShow = await f.read();
      const activationEvent = activeShow.events.find(
        (item) =>
          item.type === "candidate.activated" &&
          item.candidateId === candidate.id,
      )!;
      const reply = buildChatReply(activeShow, activationEvent);
      expect(reply).toContain(adaptationSource);
      expect(reply).not.toContain("invented by");
      expect(reply).not.toContain(failure);
      expect(reply).not.toContain(text);
      expect(
        publicView(await f.read()).activeLaws![0].ancestry?.adaptationSource,
      ).toBe(adaptationSource);
      expect(
        (await post(f.id, "library/save", { candidateId: candidate.id }))
          .status,
      ).toBe(200);
      const entries = await listLibrary(owner);
      expect(entries).toHaveLength(1);
      expect(entries[0].author).toBe("Original inventor");
      expect(entries[0].ancestry?.adaptationSource).toBe(adaptationSource);
      const exact = await readLibraryEntry(owner, entries[0].id);
      expect(exact.sourceHash).toBe(candidate.sourceHash);
      const target = await createShow(owner, "practice", store);
      const imported = await post(target.id, "library/import", {
        entryId: exact.id,
      });
      expect(imported.status).toBe(200);
      const importedShow = (await imported.json()).show as ShowRecord;
      expect(importedShow.proposals[0]).toMatchObject({
        author: "Original inventor",
        ancestry: { kind: "library", adaptationSource },
      });
      expect(
        importedShow.events.find((item) => item.type === "proposal.received")
          ?.message,
      ).toBe("A saved law joined the board for fresh review.");
      const publicImport = publicView(importedShow);
      expect(publicImport.proposals[0].ancestry).toEqual({
        kind: "library",
        originalAuthor: "Original inventor",
        adaptationSource,
      });
      expect(JSON.stringify(publicImport)).not.toContain("sourceJobId");
      expect(JSON.stringify(publicImport)).not.toContain(originalText);
      expect(generation.runGeneration).not.toHaveBeenCalled();
    },
  );
});
