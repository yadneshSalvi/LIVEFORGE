import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGINE_VERSION } from "@/game/contracts";
import { GameEngine } from "@/game/core";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  checkedComposition,
  LEGACY_ENGINE_VERSION,
} from "@/server/composition";
import {
  acquireLease,
  activateCandidate,
  approveCandidate,
  createGeneration,
  createShow,
  hostView,
  importPracticeSample,
  publicView,
  rollback,
  showKey,
  upgradeShowEngine,
  validateCheckpoint,
  type ShowRecord,
} from "@/server/show";
import {
  listLibrary,
  readLibraryEntry,
  saveLibraryCandidate,
  libraryAncestry,
} from "@/server/library";
import { importExactSource } from "@/server/show";
import { encryptToken } from "@/server/security";
import type { Candidate } from "@/server/contracts";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-composition-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "composition-test-secret-123456789012345");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 29).toString("base64"));
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture(owner = "owner") {
  const state = await createShow(owner, "practice", store);
  const show = (await store.get<ShowRecord>(showKey(state.id)))!;
  acquireLease(show, "client-one");
  return show;
}
function preview(candidate: Candidate) {
  const engine = new GameEngine();
  engine.activate(
    candidate.composition!.program,
    candidate.composition!.artifactHash,
  );
  return engine.checkpoint();
}
function approve(show: ShowRecord, c: Candidate) {
  return approveCandidate(
    show,
    c.id,
    c.sourceHash,
    c.programHash,
    preview(c),
    c.composition,
  );
}
function activate(show: ShowRecord, c: Candidate) {
  approve(show, c);
  activateCandidate(show, {
    candidateId: c.id,
    sourceHash: c.sourceHash,
    programHash: c.programHash,
    compositionHash: c.composition!.compositionHash,
    contextHash: c.composition!.contextHash,
    artifactHash: c.composition!.artifactHash,
    clientId: "client-one",
    epoch: show.lease!.epoch,
    checkpoint: show.checkpoint || new GameEngine().checkpoint(),
  });
}
describe("immutable source composition and runtime fault identity", () => {
  it("requires independent combination identity, not member approval alone", async () => {
    const show = await fixture();
    const c = importPracticeSample(show);
    expect(() =>
      approveCandidate(show, c.id, c.sourceHash, c.programHash, preview(c)),
    ).toThrow(/combination/);
    const wrong = preview(c);
    wrong.artifactHash = c.sourceHash;
    expect(() =>
      approveCandidate(
        show,
        c.id,
        c.sourceHash,
        c.programHash,
        wrong,
        c.composition,
      ),
    ).toThrow();
    const original = structuredClone(c.composition!);
    c.composition!.verification.checks[0].detail += " changed";
    expect(() => approve(show, c)).toThrow(/no longer matches/);
    c.composition = original;
    approve(show, c);
    expect(c.approvedArtifactHash).toBe(original.artifactHash);
  });
  it("retains three ordered originals, bounds a fourth and rejects changed stack context", async () => {
    const show = await fixture();
    const one = importPracticeSample(show);
    activate(show, one);
    const two = importPracticeSample(show, "step", "append");
    const originalSource = two.source;
    expect(two.composition!.members.map((m) => m.candidateId)).toEqual([
      one.id,
      two.id,
    ]);
    activate(show, two);
    const three = importPracticeSample(show, "shadow", "append");
    expect(three.composition!.verification.passed).toBe(true);
    const originalIDs = [...show.activeCandidateIds];
    show.activeCandidateIds.reverse();
    expect(() => approve(show, three)).toThrow(/ordered retained/);
    show.activeCandidateIds = originalIDs;
    activate(show, three);
    expect(show.activeCandidateIds).toEqual([one.id, two.id, three.id]);
    expect(two.source).toBe(originalSource);
    expect(() => importPracticeSample(show, "step", "append")).toThrow(/three/);
    expect(validateCheckpoint(show.checkpoint, show).artifactHash).toBe(
      three.composition!.artifactHash,
    );
  });
  it("reimporting identical source creates a new fault identity and restores prior stack on a current fault", async () => {
    const show = await fixture();
    const one = importPracticeSample(show);
    activate(show, one);
    const previousCheckpoint = structuredClone(show.checkpoint);
    const two = importPracticeSample(show);
    activate(show, two);
    expect(one.sourceHash).toBe(two.sourceHash);
    expect(one.composition!.artifactHash).not.toBe(
      two.composition!.artifactHash,
    );
    const fault = {
      clientId: "client-one",
      epoch: show.lease!.epoch,
      expectedRevision: show.revision,
      runtimeFaultReason: "trusted worker command budget",
    };
    expect(() =>
      rollback(show, {
        ...fault,
        faultedArtifactHash: one.composition!.artifactHash,
      }),
    ).toThrow(/newer world/);
    rollback(show, {
      ...fault,
      faultedArtifactHash: two.composition!.artifactHash,
    });
    expect(show.activeCandidateIds).toEqual([one.id]);
    expect(show.checkpoint).toEqual(previousCheckpoint);
    const saved = validateCheckpoint(show.checkpoint, show);
    const engine = new GameEngine();
    engine.restore(saved);
    engine.step({
      left: false,
      right: false,
      jump: false,
      interact: false,
      reset: false,
    });
    show.checkpoint = validateCheckpoint(engine.checkpoint(), show);
    expect(show.checkpoint.artifactHash).toBe(one.composition!.artifactHash);
    expect(() =>
      rollback(show, { clientId: "client-one", epoch: show.lease!.epoch }),
    ).toThrow(/no previous/);
    rollback(show, {
      clientId: "client-one",
      epoch: show.lease!.epoch,
      expectedRevision: show.revision,
      faultedArtifactHash: one.composition!.artifactHash,
      runtimeFaultReason: "Repeated trusted worker fault",
    });
    expect(show.activeCandidateIds).toEqual([]);
    expect(show.activeCandidateId).toBeNull();
    expect(show.activeArtifactHash).toBeNull();
    expect(show.phase).toBe("collecting");
    expect(show.checkpoint!.snapshot.modifiers).toEqual([]);
    expect(show.checkpoint!.snapshot.entities.some((e) => e.spawnRule)).toBe(
      false,
    );
    expect(show.checkpoint!.snapshot.surfaces.some((s) => s.generated)).toBe(
      false,
    );
    expect(show.events.at(-1)?.message).toBe(
      "All laws retired after repeated runtime faults.",
    );
    engine.restore(show.checkpoint!);
    engine.step();
    expect(() => validateCheckpoint(engine.checkpoint(), show)).not.toThrow();
  });
  it("explicitly archives an old engine without deserializing its old save or reusing approvals", async () => {
    const show = await fixture();
    const old = importPracticeSample(show);
    activate(show, old);
    show.engineVersion = LEGACY_ENGINE_VERSION;
    const opaque = { old: "opaque checkpoint never passed to engine2" };
    show.checkpoint = opaque as never;
    expect(hostView(show).engineUpgradeRequired).toBe(true);
    expect(() => createGeneration(show, old.proposalId)).toThrow(/upgrade/);
    expect(() => importPracticeSample(show)).toThrow(/upgrade/);
    expect(() =>
      upgradeShowEngine(show, {
        clientId: "client-one",
        epoch: show.lease!.epoch,
        expectedRevision: show.revision - 1,
        targetEngineVersion: ENGINE_VERSION,
      }),
    ).toThrow(/Confirm/);
    upgradeShowEngine(show, {
      clientId: "client-one",
      epoch: show.lease!.epoch,
      expectedRevision: show.revision,
      targetEngineVersion: ENGINE_VERSION,
    });
    expect(show.engineArchives![0].checkpoint).toEqual(opaque);
    expect(show.activeCandidateIds).toEqual([]);
    expect(show.candidates[0].source).toBe(old.source);
    expect(hostView(show)).not.toHaveProperty("engineArchives");
    expect(validateCheckpoint(show.checkpoint, show).snapshot.version).toBe(
      ENGINE_VERSION,
    );
    expect(() => approve(show, old)).toThrow(/world changed/);
  });
});
describe("private exact-source library", () => {
  it("saves only approved exact sources, preserves original credit, and imports with fresh composition approval", async () => {
    const show = await fixture();
    const c = importPracticeSample(show);
    await store.update<ShowRecord, void>(showKey(show.id), (s) =>
      Object.assign(s, show),
    );
    await expect(saveLibraryCandidate("owner", show.id, c.id)).rejects.toThrow(
      /approving/,
    );
    approve(show, c);
    await store.update<ShowRecord, void>(showKey(show.id), (s) =>
      Object.assign(s, show),
    );
    const entry = await saveLibraryCandidate("owner", show.id, c.id);
    expect(entry.sourceHash).toBe(c.sourceHash);
    expect(entry).not.toHaveProperty("source");
    expect(await listLibrary("intruder")).toEqual([]);
    await expect(readLibraryEntry("intruder", entry.id)).rejects.toThrow(
      /not found/,
    );
    expect(await listLibrary("owner")).toHaveLength(1);
    const exact = await readLibraryEntry("owner", entry.id);
    expect(exact.source).toBe(c.source);
    const destination = await fixture();
    const imported = importExactSource(destination, exact, {
      origin: "library",
      author: exact.author,
      ancestry: libraryAncestry(exact),
    });
    expect(imported.source).toBe(c.source);
    expect(imported.approvedAt).toBeUndefined();
    expect(imported.provenance?.threadId).toBe(c.provenance?.threadId);
    expect(imported.composition!.artifactHash).not.toBe(
      c.composition!.artifactHash,
    );
    approve(destination, imported);
    const publicJSON = JSON.stringify(publicView(destination));
    expect(publicJSON).not.toContain(entry.id);
    expect(publicJSON).not.toContain(c.source);
    expect(publicJSON).toContain("Previously generated sample");
  });
  it("shares an account-owned library only after independently validated ownership and closes revoked access", async () => {
    async function account(owner: string) {
      const credentialId = "credential:" + owner;
      await store.create("host-auth:" + owner, { credentialId, userId: "123" });
      await store.create(credentialId, {
        ownerId: owner,
        source: "oauth-code",
        clientId: "fixture-app",
        status: "ready",
        lastValidatedAt: Date.now(),
        createdAt: new Date().toISOString(),
        encrypted: encryptToken({
          clientId: "fixture-app",
          userId: "123",
          login: "fixture-host",
          scopes: ["user:read:chat"],
          accessToken: "fixture-private",
          expiresAt: Date.now() + 3600000,
        }),
      });
    }
    await account("owner");
    const original = await fixture();
    const c = importPracticeSample(original);
    approve(original, c);
    await store.update<ShowRecord, void>(showKey(original.id), (s) =>
      Object.assign(s, original),
    );
    const saved = await saveLibraryCandidate("owner", original.id, c.id);
    await account("new-browser");
    expect((await readLibraryEntry("new-browser", saved.id)).source).toBe(
      c.source,
    );
    await store.update<{ status: string }, void>(
      "credential:new-browser",
      (record) => {
        record.status = "revoked";
      },
    );
    expect(await listLibrary("new-browser")).toEqual([]);
    await expect(readLibraryEntry("new-browser", saved.id)).rejects.toThrow(
      /not found/,
    );
  });
  it("does not leak a hidden original's text or ancestry identifiers through a visible descendant", async () => {
    const show = await fixture();
    const c = importPracticeSample(show);
    show.proposals[0].status = "hidden";
    show.proposals[0].text = "hidden original unique private text";
    show.proposals.push({
      ...show.proposals[0],
      id: "P2",
      text: "A visible supported alternative uses motion.",
      status: "open",
      ancestry: {
        kind: "adaptation",
        originalAuthor: "Original inventor",
        originalText: show.proposals[0].text,
        sourceJobId: c.jobId,
        originalProposalId: "P1",
      },
    });
    const result = JSON.stringify(publicView(show));
    expect(result).not.toContain("hidden original unique private text");
    expect(result).not.toContain("sourceJobId");
    expect(result).not.toContain("originalProposalId");
    expect(result).toContain("Original inventor");
  });
  it("binds the combined program to immutable source hashes even after approval", async () => {
    const show = await fixture();
    const c = importPracticeSample(show);
    approve(show, c);
    c.source += "\n";
    expect(() => checkedComposition(show, c, true)).toThrow(
      /source artifact changed/,
    );
  });
});
