import { ENGINE_VERSION } from "@/game/contracts";
import { compileRuleSource, verifyRuleProgram } from "@/game/rules";
import type { ProposalAncestry } from "./contracts";
import { assert } from "./errors";
import { digest, hashData, privateActor } from "./security";
import { getStore } from "./store";
import {
  event,
  mutate,
  ownedShow,
  showKey,
  type ExactSourceArtifact,
  type ShowRecord,
} from "./show";
import { ensureOAuthGrant } from "./twitch-grants";
export interface LibraryEntry extends ExactSourceArtifact {
  id: string;
  name: string;
  description: string;
  author: string;
  origin: string;
  engineVersion: string;
  originalEngineVersion: string;
  savedAt: string;
  ancestry?: ProposalAncestry;
  sourceCandidateId: string;
  sourceShowId: string;
}
interface LibraryRecord {
  entries: LibraryEntry[];
}
interface LibrarySaveClaim {
  operation: "library/save";
  candidateId: string;
  sourceHash: string;
  programHash: string;
  scope: string;
  entryId: string;
  savedAt: string;
  completed?: boolean;
}
async function scopes(ownerId: string): Promise<string[]> {
  const keys = ["law-library:host:" + privateActor("library-host:" + ownerId)];
  const auth = await getStore().get<{ credentialId: string; userId: string }>(
    "host-auth:" + ownerId,
  );
  if (auth) {
    try {
      const grant = await ensureOAuthGrant(auth.credentialId, ownerId);
      if (grant.userId === auth.userId)
        keys.push(
          "law-library:twitch:" + privateActor("library-user:" + grant.userId),
        );
    } catch {
      /* Revoked account grants cannot expose the account library; this browser's host library remains owned. */
    }
  }
  return keys;
}
function summary(entry: LibraryEntry) {
  const {
    source: _,
    sourceCandidateId: _c,
    sourceShowId: _s,
    ...metadata
  } = entry;
  return metadata;
}
export async function listLibrary(ownerId: string) {
  const records = await Promise.all(
    (await scopes(ownerId)).map((key) => getStore().get<LibraryRecord>(key)),
  );
  return records
    .flatMap((record) => record?.entries || [])
    .map(summary)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function readLibraryEntry(
  ownerId: string,
  id: string,
): Promise<LibraryEntry> {
  assert(
    /^[a-f0-9]{64}$/.test(id),
    404,
    "library_not_found",
    "Saved law not found in your library.",
  );
  for (const key of await scopes(ownerId)) {
    const record = await getStore().get<LibraryRecord>(key);
    const entry = record?.entries.find((item) => item.id === id);
    if (entry) return entry;
  }
  assert(
    false,
    404,
    "library_not_found",
    "Saved law not found in your library.",
  );
}
export async function saveLibraryCandidate(
  ownerId: string,
  showId: string,
  candidateId: string,
  idempotencyKey?: string,
) {
  const show = await ownedShow(showId, ownerId);
  const candidate = show.candidates.find((c) => c.id === candidateId);
  assert(
    candidate &&
      candidate.approvedAt &&
      candidate.approvedSourceHash === candidate.sourceHash &&
      candidate.approvedProgramHash === candidate.programHash,
    409,
    "library_approval_required",
    "Save a candidate only after approving its exact verified source and combination.",
  );
  assert(
    Buffer.byteLength(candidate.source) <= 32_000 &&
      digest(candidate.source) === candidate.sourceHash,
    409,
    "library_source",
    "The exact source cannot be saved within this library's bounded artifact budget.",
  );
  const program = compileRuleSource(candidate.source);
  assert(
    hashData(program) === candidate.programHash &&
      verifyRuleProgram(program).passed,
    409,
    "library_verification",
    "This original source no longer passes independent verification. The original show history was preserved.",
  );
  const proposal = show.proposals.find((p) => p.id === candidate.proposalId);
  assert(
    proposal,
    404,
    "proposal_not_found",
    "Original contribution not found.",
  );
  const job = show.jobs.find((j) => j.id === candidate.jobId);
  const owners = await scopes(ownerId);
  let key = owners.at(-1)!;
  let id = hashData({
    key,
    showId,
    candidateId,
    sourceHash: candidate.sourceHash,
  });
  let savedAt = new Date().toISOString();
  if (idempotencyKey) {
    // Claim the command before the cross-document write. Retries keep the same
    // destination, source identity and saved timestamp even after lost responses.
    const claim = await mutate<LibrarySaveClaim>(
      showId,
      ownerId,
      idempotencyKey,
      (current) => {
        const exact = current.candidates.find(
          (item) => item.id === candidateId,
        );
        assert(
          exact?.approvedAt &&
            exact.sourceHash === candidate.sourceHash &&
            exact.programHash === candidate.programHash,
          409,
          "library_approval_required",
          "Review the unchanged source before saving it.",
        );
        return {
          operation: "library/save",
          candidateId,
          sourceHash: candidate.sourceHash,
          programHash: candidate.programHash,
          scope: key,
          entryId: id,
          savedAt,
        };
      },
    );
    assert(
      claim?.operation === "library/save" &&
        claim.candidateId === candidateId &&
        claim.sourceHash === candidate.sourceHash &&
        claim.programHash === candidate.programHash,
      409,
      "idempotency_conflict",
      "This request key belongs to another command. Use a new key to save a different law.",
    );
    assert(
      owners.includes(claim.scope),
      403,
      "library_scope_changed",
      "Reconnect the account that owns this save before retrying it.",
    );
    key = claim.scope;
    id = claim.entryId;
    savedAt = claim.savedAt;
  }
  const entry: LibraryEntry = {
    id,
    source: candidate.source,
    sourceHash: candidate.sourceHash,
    programHash: candidate.programHash,
    model: candidate.provenance?.model || job?.model || "historical-source",
    threadId: candidate.provenance?.threadId || job?.threadId,
    generatedAt: candidate.provenance?.generatedAt || candidate.createdAt,
    proposal: proposal.text,
    name: program.name,
    description: program.description,
    author: proposal.author,
    origin: proposal.origin,
    engineVersion: ENGINE_VERSION,
    originalEngineVersion:
      candidate.engineVersion || candidate.verification.engineVersion,
    savedAt,
    ancestry: proposal.ancestry,
    sourceCandidateId: candidate.id,
    sourceShowId: show.id,
  };
  assert(
    Buffer.byteLength(JSON.stringify(entry)) <= 60_000,
    413,
    "library_entry_budget",
    "This exact artifact and metadata exceed the bounded library entry budget. The source remains in its original show.",
  );
  await getStore().create<LibraryRecord>(key, { entries: [] });
  const result = await getStore().update<
    LibraryRecord,
    ReturnType<typeof summary>
  >(key, (record) => {
    const existing = record.entries.find((e) => e.id === id);
    if (existing) return summary(existing);
    assert(
      record.entries.length < 30,
      429,
      "library_full",
      "This library has thirty exact-source entries. Keep the existing evidence and start with a different saved law.",
    );
    record.entries.push(entry);
    return summary(entry);
  });
  if (idempotencyKey) {
    // The library write is itself idempotent by entry ID. A crash here is safe to
    // retry, and history claims a save only after that durable write succeeds.
    await getStore().update<ShowRecord, void>(showKey(showId), (current) => {
      const claim = current.idempotency[idempotencyKey]?.result as
        LibrarySaveClaim | undefined;
      if (
        claim?.operation === "library/save" &&
        claim.entryId === id &&
        !claim.completed
      ) {
        claim.completed = true;
        event(
          current,
          "private.library.saved",
          "The host saved an approved exact-source law to their private library.",
          { candidateId, sourceHash: candidate.sourceHash },
        );
      }
    });
  }
  return result;
}
export function libraryAncestry(entry: LibraryEntry): ProposalAncestry {
  return {
    kind: "library",
    originalAuthor: entry.ancestry?.originalAuthor || entry.author,
    originalText: entry.ancestry?.originalText || entry.proposal,
    libraryEntryId: entry.id,
  };
}
