import { randomUUID } from "node:crypto";
import { ENGINE_VERSION, type GameCheckpoint } from "@/game/contracts";
import { GameEngine, retireGeneratedCheckpoint } from "@/game/core";
import {
  activeIds,
  assertCurrentEngine,
  checkedComposition,
  expectedRuntime,
  prepareCandidateComposition,
  showEngine,
} from "./composition";
import { sanitizeGenerationFailure } from "./generation-failure";
import { parseCheckpoint } from "./checkpoint";
import { REUSED_RULE_ARTIFACT, REUSED_STEP_ARTIFACT } from "./reused-artifact";
import { compileRuleSource, verifyRuleProgram } from "@/game/rules";
import type {
  ActivationMode,
  ProposalAncestry,
  Candidate,
  GenerationJob,
  Proposal,
  PublicShowState,
  PublicProposal,
  ShowMode,
  ShowState,
} from "./contracts";
import type { DocumentStore } from "./store";
import { getStore } from "./store";
import { assert, HttpError } from "./errors";
import { digest, hashData, privateActor } from "./security";

export interface ShowRecord extends ShowState {
  ownerId: string;
  voters: Record<string, string>;
  seenMessages: string[];
  rates: Record<string, number[]>;
  idempotency: Record<
    string,
    {
      at: number;
      result: unknown;
      operation?: "generation/adapt";
      requestHash?: string;
    }
  >;
  credentialId?: string;
  oauth?: { stateHash: string; expiresAt: number; writeChat?: boolean };
  replyDeliveries?: Record<
    string,
    {
      at: number;
      status:
        | "reserved"
        | "sent"
        | "dropped"
        | "rate-limited"
        | "unknown"
        | "disabled";
      code?: string;
      userKey?: string;
    }
  >;
  engineArchives?: Array<{
    engineVersion: string;
    archivedAt: string;
    revision: number;
    checkpoint: unknown;
    previousCheckpoint: unknown;
    activeCandidateIds: string[];
    previousCandidateIds: string[];
  }>;
}
const now = () => new Date().toISOString();
export const AUTHORITY_LEASE_MS = 90_000;
export const showKey = (id: string) => "show:" + id;
export function event(
  show: ShowRecord,
  type: string,
  message: string,
  extra: Partial<ShowState["events"][number]> = {},
) {
  show.events.push({ id: randomUUID(), at: now(), type, message, ...extra });
  show.events = show.events.slice(-150);
  show.updatedAt = now();
}
export async function createShow(
  ownerId: string,
  mode: ShowMode,
  store = getStore(),
) {
  const createdAt = now();
  const show: ShowRecord = {
    id: randomUUID(),
    engineVersion: ENGINE_VERSION,
    activeCandidateIds: [],
    previousCandidateIds: [],
    activeArtifactHash: null,
    ownerId,
    mode,
    settings: { blockedTerms: [], chatRepliesEnabled: false },
    createdAt,
    updatedAt: createdAt,
    revision: 0,
    round: 1,
    phase: "collecting",
    proposals: [],
    jobs: [],
    candidates: [],
    activeCandidateId: null,
    previousCandidateId: null,
    checkpoint: null,
    previousCheckpoint: null,
    lease: null,
    twitch: {
      status: "disconnected",
      message: "Connect Twitch",
    },
    events: [],
    votingOpen: true,
    voters: {},
    seenMessages: [],
    rates: {},
    idempotency: {},
  };
  event(
    show,
    "show.created",
    mode === "practice"
      ? "Practice studio created. Inputs here are labeled practice."
      : "Twitch studio created. Awaiting channel connection.",
  );
  await store.create(showKey(show.id), show);
  await store.create("host-shows:" + ownerId, { ids: [] as string[] });
  await store.update<{ ids: string[] }, void>(
    "host-shows:" + ownerId,
    (index) => {
      index.ids = [show.id, ...index.ids.filter((id) => id !== show.id)].slice(
        0,
        40,
      );
    },
  );
  return hostView(show);
}
export async function recoverAbandonedJobs(id: string, store = getStore()) {
  const record = await store.get<ShowRecord>(showKey(id));
  if (!record) return null;
  if (
    !record.jobs.some(
      (j) =>
        ["queued", "starting", "generating", "verifying"].includes(j.status) &&
        Date.parse(j.updatedAt) < Date.now() - 360_000,
    )
  )
    return record;
  await store.update<ShowRecord, void>(showKey(id), (show) => {
    for (const job of show.jobs) {
      if (
        ["queued", "starting", "generating", "verifying"].includes(
          job.status,
        ) &&
        Date.parse(job.updatedAt) < Date.now() - 360_000
      ) {
        job.status = "failed";
        job.updatedAt = now();
        job.message =
          "The generation coordinator stopped before completing. The active game is preserved; retry when ready.";
        event(show, "generation.recovered", job.message, {
          proposalId: job.proposalId,
        });
      }
    }
    show.phase = show.activeCandidateId ? "live" : "collecting";
    show.votingOpen = true;
  });
  return store.get<ShowRecord>(showKey(id));
}
export async function ownedShow(
  id: string,
  ownerId: string,
  store = getStore(),
) {
  const show = await recoverAbandonedJobs(id, store);
  assert(
    show && show.ownerId === ownerId,
    404,
    "show_not_found",
    "This show was not found in your host session.",
  );
  return show;
}
/** Transport liveness is derived independently from the host's intentional voting policy. */
export function effectiveTwitchConnection(
  show: ShowRecord,
): ShowState["twitch"] {
  const connection = { ...show.twitch };
  if (show.mode !== "twitch" || connection.status !== "connected")
    return connection;
  const heartbeat = Date.parse(connection.lastHealthyAt || "");
  if (!show.lease || show.lease.expiresAt <= Date.now()) {
    connection.status = "gap";
    connection.message = "Intake paused — return to the game tab";
  } else if (!Number.isFinite(heartbeat) || Date.now() - heartbeat > 70_000) {
    connection.status = "gap";
    connection.message = "Chat disconnected — reconnect";
  }
  return connection;
}
export function setTwitchHealth(show: ShowRecord, status: unknown) {
  assert(
    show.mode === "twitch",
    409,
    "practice_mode",
    "This studio is in practice mode.",
  );
  assert(
    ["connected", "gap", "revoked", "disconnected"].includes(String(status)),
    400,
    "connection_status",
    "Invalid Twitch connection status.",
  );
  const previous = effectiveTwitchConnection(show).status;
  if (status === "connected") {
    assert(
      show.twitch.subscriptionId,
      409,
      "subscription_required",
      "Connect a real Twitch subscription first.",
    );
    show.twitch.lastHealthyAt = now();
    // A transport heartbeat cannot restore revoked or unvalidated OAuth authorization.
    if (show.twitch.status === "revoked" || show.twitch.authorizationPaused)
      return;
  }
  show.twitch.status = status as ShowState["twitch"]["status"];
  delete show.twitch.authorizationPaused;
  show.twitch.message =
    status === "gap"
      ? "Twitch connection interrupted. Missed messages cannot be replayed; live votes are paused."
      : status === "revoked"
        ? "Twitch revoked the subscription. Reauthorize your channel."
        : status === "connected"
          ? "Receiving genuine Twitch chat events."
          : "Twitch chat disconnected.";
  if (previous !== effectiveTwitchConnection(show).status)
    event(show, "twitch." + status, show.twitch.message);
}
export function hostView(show: ShowRecord): ShowState {
  const {
    ownerId: _,
    voters: _v,
    seenMessages: _s,
    rates: _r,
    idempotency: _i,
    credentialId: _c,
    oauth: _o,
    engineArchives: _a,
    replyDeliveries: _d,
    ...state
  } = show;
  void _;
  void _v;
  void _s;
  void _r;
  void _i;
  void _c;
  void _o;
  void _a;
  void _d;
  return {
    ...state,
    settings: show.settings || { blockedTerms: [], chatRepliesEnabled: false },
    engineVersion: showEngine(show),
    engineUpgradeRequired: showEngine(show) !== ENGINE_VERSION,
    activeCandidateIds: activeIds(show),
    previousCandidateIds:
      show.previousCandidateIds ??
      (show.previousCandidateId ? [show.previousCandidateId] : []),
    activeArtifactHash:
      show.activeArtifactHash ?? show.checkpoint?.artifactHash ?? null,
    twitch: effectiveTwitchConnection(show),
    jobs: state.jobs.map(({ requestHash: _, ...job }) => job),
    proposals: state.proposals.map(({ messageId: _, ...proposal }) => proposal),
    candidates: state.candidates.map(
      ({ approvedBy: _, ...candidate }) => candidate,
    ),
  };
}
export function publicGenerationMessage(
  status: GenerationJob["status"],
): string {
  const messages: Record<GenerationJob["status"], string> = {
    queued: "Queued",
    starting: "Starting…",
    generating: "Forging…",
    verifying: "Verifying…",
    ready: "Ready for review",
    failed: "Forge failed — try again",
    cancelled: "Forge cancelled",
    stale: "World changed — review again",
    rejected: "Revision requested",
  };
  return messages[status];
}
function publicAncestry(ancestry: ProposalAncestry) {
  return {
    kind: ancestry.kind,
    originalAuthor: ancestry.originalAuthor,
    ...(["model-suggested", "host-edited", "host-written"].includes(
      ancestry.adaptationSource || "",
    )
      ? { adaptationSource: ancestry.adaptationSource }
      : {}),
  };
}
function publicProposal(proposal: Proposal): PublicProposal {
  const {
    messageId: _,
    ancestry,
    moderationReason: _reason,
    ...rest
  } = proposal;
  return {
    ...rest,
    ...(ancestry
      ? {
          ancestry: publicAncestry(ancestry),
        }
      : {}),
  };
}
export function publicView(show: ShowRecord): PublicShowState {
  const candidate = show.candidates.find(
    (item) => item.id === show.activeCandidateId && Boolean(item.approvedAt),
  );
  const proposal = show.proposals.find(
    (item) => item.id === candidate?.proposalId,
  );
  const job = show.jobs.at(-1);
  return {
    id: show.id,
    createdAt: show.createdAt,
    updatedAt: show.updatedAt,
    engineVersion: showEngine(show),
    activeLaws: activeIds(show)
      .map((id) => show.candidates.find((c) => c.id === id && c.approvedAt))
      .filter((c): c is Candidate => Boolean(c))
      .map((c) => {
        const p = show.proposals.find((p) => p.id === c.proposalId);
        return {
          name: c.program.name,
          description: c.program.description,
          author: p?.author || "Community",
          origin: p?.origin || "practice",
          sourceHash: c.sourceHash,
          programHash: c.programHash,
          ...(p?.ancestry
            ? {
                ancestry: publicAncestry(p.ancestry),
              }
            : {}),
        };
      }),
    mode: show.mode,
    votingOpen: show.votingOpen,
    phase: show.phase,
    round: show.round,
    revision: show.revision,
    proposals: show.proposals
      .filter((p) => p.status !== "hidden")
      .map(publicProposal),
    active: candidate
      ? {
          name: candidate.program.name,
          description: candidate.program.description,
          author: proposal?.author || "Community",
          sourceHash: candidate.sourceHash,
          programHash: candidate.programHash,
        }
      : null,
    generation: job
      ? {
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          reused: job.reused,
          phases: job.phases
            ?.filter(
              (p) =>
                [
                  "snapshot-restored",
                  "workspace-ready",
                  "thread-started",
                  "turn-started",
                  "source-returned",
                  "verifier-started",
                  "verification-complete",
                ].includes(p.phase) &&
                Number.isInteger(p.attempt) &&
                p.attempt >= 1 &&
                p.attempt <= 3 &&
                typeof p.at === "string" &&
                Number.isFinite(Date.parse(p.at)),
            )
            .slice(0, 18)
            .map((p) => ({
              phase: p.phase,
              at: p.at,
              attempt: p.attempt,
              ...(p.phase === "verification-complete" &&
              Number.isInteger(p.checksPassed) &&
              Number.isInteger(p.totalChecks) &&
              p.checksPassed! >= 0 &&
              p.checksPassed! <= p.totalChecks! &&
              p.totalChecks! >= 1 &&
              p.totalChecks! <= 32
                ? { checksPassed: p.checksPassed, totalChecks: p.totalChecks }
                : {}),
            })),
          proposal: (() => {
            const p = show.proposals.find((p) => p.id === job.proposalId);
            return p && p.status !== "hidden" && p.status !== "rejected"
              ? { id: p.id, text: p.text, author: p.author, origin: p.origin }
              : undefined;
          })(),
          message: job.reused
            ? "Sample law loaded"
            : publicGenerationMessage(job.status),
        }
      : null,
    twitch: {
      status: effectiveTwitchConnection(show).status,
      channelLogin: show.twitch.channelLogin,
    },
    events: show.events
      .filter((e) => !e.type.startsWith("private."))
      .map((e) =>
        e.type === "generation.failed"
          ? { ...e, message: publicGenerationMessage("failed") }
          : e.type === "candidate.rejected"
            ? { ...e, message: "The host chose to revise this candidate." }
            : e,
      )
      .slice(-30),
  };
}
export function rate(
  show: ShowRecord,
  key: string,
  limit: number,
  windowMs: number,
) {
  const timestamps = (show.rates[key] || []).filter(
    (time) => time > Date.now() - windowMs,
  );
  assert(
    timestamps.length < limit,
    429,
    "rate_limit",
    "This action is arriving too quickly. Please wait a moment.",
  );
  timestamps.push(Date.now());
  show.rates[key] = timestamps;
  for (const name of Object.keys(show.rates)) {
    if (show.rates[name].every((t) => t < Date.now() - 3_600_000))
      delete show.rates[name];
  }
}
export async function mutate<R>(
  id: string,
  ownerId: string,
  key: string | undefined,
  fn: (show: ShowRecord) => R,
  store: DocumentStore = getStore(),
  binding?: { operation: "generation/adapt"; requestHash: string },
): Promise<R> {
  assert(
    key &&
      /^[\w-]{8,100}$/.test(key) &&
      !["__proto__", "constructor", "prototype"].includes(key),
    400,
    "idempotency_required",
    "Include a unique x-idempotency-key for this command.",
  );
  return store.update<ShowRecord, R>(showKey(id), (show) => {
    assert(
      show.ownerId === ownerId,
      404,
      "show_not_found",
      "This show was not found in your host session.",
    );
    if (Object.hasOwn(show.idempotency, key)) {
      const receipt = show.idempotency[key];
      assert(
        binding
          ? receipt.operation === binding.operation &&
              receipt.requestHash === binding.requestHash
          : receipt.operation !== "generation/adapt",
        409,
        "idempotency_conflict",
        "This request key belongs to another command or reviewed alternative. Use a new key for a new command.",
      );
      assert(
        (show.idempotency[key].result as { operation?: string } | undefined)
          ?.operation !== "twitch/session",
        409,
        "idempotency_conflict",
        "This request key belongs to a Twitch connection. Use a new key for this command.",
      );
      return show.idempotency[key].result as R;
    }
    const result = fn(show);
    show.updatedAt = now();
    show.idempotency[key] = { at: Date.now(), result, ...binding };
    // Provider-side connection attempts must never become replayable after ordinary receipts rotate.
    const keys = Object.keys(show.idempotency).filter(
      (k) =>
        (show.idempotency[k].result as { operation?: string } | undefined)
          ?.operation !== "twitch/session",
    );
    for (const k of keys.slice(0, Math.max(0, keys.length - 60)))
      delete show.idempotency[k];
    return result;
  });
}
export function normalizeProposal(text: unknown) {
  assert(
    typeof text === "string",
    400,
    "proposal_text",
    "Write a mechanic idea.",
  );
  const value = text
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  assert(
    value.length >= 8 && value.length <= 280,
    400,
    "proposal_length",
    "Mechanic ideas must be 8–280 characters.",
  );
  assert(
    !/https?:\/\/|www\.|```|<script|\b(?:api[_ -]?key|refresh[_ -]?token|system prompt)\b/i.test(
      value,
    ),
    400,
    "proposal_moderation",
    "Keep proposals to game mechanics, without links, code blocks, or credential instructions.",
  );
  return value;
}
export function addProposal(
  show: ShowRecord,
  text: unknown,
  author: string,
  actorId: string,
  origin: "practice" | "twitch" | "sample" | "library",
  messageId?: string,
  ancestry?: ProposalAncestry,
): Proposal {
  assert(show.votingOpen, 409, "round_closed", "This round is closed.");
  const normalized = normalizeProposal(text);
  assert(
    !blockedProposal(show, normalized),
    400,
    "proposal_blocked",
    "This proposal cannot join the board. Try a different game mechanic.",
  );
  assert(
    show.proposals.length < 300,
    429,
    "proposal_history_full",
    "This show's proposal history is full. Preserve it and start another show.",
  );
  assert(
    show.proposals.filter((p) => p.status !== "hidden").length < 60,
    429,
    "queue_full",
    "The proposal board is full for this show.",
  );
  rate(show, "proposal:" + actorId, 3, 60_000);
  rate(show, "proposal:channel", 60, 60_000);
  const duplicate = show.proposals.find(
    (p) =>
      p.status !== "hidden" &&
      p.status !== "rejected" &&
      p.origin === origin &&
      p.text.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );
  if (duplicate && !ancestry) return duplicate;
  const proposal: Proposal = {
    id: "P" + (show.proposals.length + 1),
    text: normalized,
    author:
      author.replace(/[\u0000-\u001f<>]/g, "").slice(0, 40) || "Community",
    origin,
    createdAt: now(),
    votes: 0,
    status: "open",
    ...(messageId ? { messageId } : {}),
    ...(ancestry ? { ancestry } : {}),
  };
  show.proposals.push(proposal);
  event(
    show,
    "proposal.received",
    ancestry?.kind === "adaptation"
      ? "Alternative added with original credit"
      : origin === "library"
        ? "Saved law added"
        : origin === "practice"
          ? "Practice idea added"
          : origin === "sample"
            ? "Sample law added"
            : "Idea received",
    { proposalId: proposal.id },
  );
  return proposal;
}
export function blockedProposal(show: ShowRecord, text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  return (show.settings?.blockedTerms || []).some((term) =>
    normalized.includes(term),
  );
}
export function updateShowSettings(
  show: ShowRecord,
  input: Record<string, unknown>,
) {
  const settings = show.settings || {
    blockedTerms: [],
    chatRepliesEnabled: false,
  };
  if (input.blockedTerms !== undefined) {
    assert(
      Array.isArray(input.blockedTerms) && input.blockedTerms.length <= 40,
      400,
      "blocked_terms",
      "Use at most forty blocked terms.",
    );
    const terms = input.blockedTerms.map((term) => {
      assert(
        typeof term === "string",
        400,
        "blocked_terms",
        "Each blocked term must be text.",
      );
      const value = term
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
      assert(
        value.length >= 2 && value.length <= 60,
        400,
        "blocked_terms",
        "Blocked terms must be 2–60 characters.",
      );
      return value;
    });
    settings.blockedTerms = [...new Set(terms)];
  }
  if (input.chatRepliesEnabled !== undefined) {
    assert(
      typeof input.chatRepliesEnabled === "boolean",
      400,
      "chat_replies",
      "Specify chat replies as on or off.",
    );
    if (input.chatRepliesEnabled && !settings.chatRepliesEnabled)
      settings.chatRepliesEnabledAt = now();
    if (!input.chatRepliesEnabled) delete settings.chatRepliesEnabledAt;
    settings.chatRepliesEnabled = input.chatRepliesEnabled;
  }
  show.settings = settings;
  event(
    show,
    "private.settings.changed",
    "The host updated moderation and chat reply settings.",
  );
  return settings;
}
export function moderateProposal(
  show: ShowRecord,
  id: string,
  status: unknown,
  reason?: unknown,
) {
  assert(
    status === "hidden" || status === "rejected" || status === "open",
    400,
    "moderation_status",
    "Choose hidden, rejected, or open.",
  );
  const proposal = show.proposals.find((p) => p.id === id);
  assert(proposal, 404, "proposal_not_found", "Proposal not found.");
  proposal.status = status;
  proposal.moderationReason =
    typeof reason === "string"
      ? sanitizeGenerationFailure(reason) || undefined
      : undefined;
  if (status !== "open") {
    proposal.votes = 0;
    for (const actor of Object.keys(show.voters))
      if (show.voters[actor] === id) delete show.voters[actor];
  }
  event(
    show,
    "private.proposal.moderated",
    "An authorized moderator updated a proposal.",
    { proposalId: id },
  );
  return proposal;
}
export function vote(show: ShowRecord, proposalId: string, actorId: string) {
  assert(
    show.votingOpen,
    409,
    "round_closed",
    "Voting is closed for this round.",
  );
  const proposal = show.proposals.find(
    (p) =>
      p.id === proposalId && p.status !== "hidden" && p.status !== "rejected",
  );
  assert(proposal, 404, "proposal_not_found", "Proposal not found.");
  rate(show, "vote:" + actorId, 15, 60_000);
  const key = show.round + ":" + actorId;
  const previous = show.voters[key];
  if (previous === proposalId) return;
  const old = show.proposals.find((p) => p.id === previous);
  if (old) old.votes = Math.max(0, old.votes - 1);
  show.voters[key] = proposalId;
  proposal.votes++;
}
export function acquireLease(
  show: ShowRecord,
  clientId: string,
  takeover = false,
) {
  assert(
    /^[\w-]{8,100}$/.test(clientId),
    400,
    "client_id",
    "Invalid game authority identifier.",
  );
  const old = show.lease;
  assert(
    takeover ||
      !old ||
      old.clientId === clientId ||
      old.expiresAt <= Date.now(),
    409,
    "authority_busy",
    "Another game tab currently owns this show. Pause it or wait for its lease to expire.",
  );
  show.lease = {
    clientId,
    epoch:
      !takeover && old?.clientId === clientId && old.expiresAt > Date.now()
        ? old.epoch
        : (old?.epoch || 0) + 1,
    expiresAt: Date.now() + AUTHORITY_LEASE_MS,
  };
  if (takeover)
    event(
      show,
      "authority.takeover",
      "The host explicitly moved game control to this tab.",
    );
  return show.lease;
}
export function releaseLease(
  show: ShowRecord,
  clientId: unknown,
  epoch: unknown,
) {
  if (
    !show.lease ||
    show.lease.clientId !== clientId ||
    show.lease.epoch !== epoch
  )
    return false;
  show.lease.expiresAt = 0;
  return true;
}
export function requireLease(
  show: ShowRecord,
  clientId: unknown,
  epoch: unknown,
) {
  assert(
    show.lease &&
      show.lease.clientId === clientId &&
      show.lease.epoch === epoch &&
      show.lease.expiresAt > Date.now(),
    409,
    "stale_authority",
    "Game authority expired. Reconnect the active game tab before changing the world.",
  );
}
export function validateCheckpoint(
  value: unknown,
  show: ShowRecord,
): GameCheckpoint {
  return parseCheckpoint(value, expectedRuntime(show));
}
export function createGeneration(
  show: ShowRecord,
  proposalId: string,
  revision?: string,
  priorCandidateId?: string,
  request?: {
    jobId: string;
    requestHash: string;
    quotaDay?: string;
    quotaExempt?: boolean;
  },
  mode: ActivationMode = "replace",
): GenerationJob {
  assertCurrentEngine(show);
  assert(
    mode === "append" || mode === "replace",
    400,
    "activation_mode",
    "Choose append or replace.",
  );
  if (mode === "append")
    assert(
      activeIds(show).length < 3,
      409,
      "law_stack_full",
      "Three laws are already retained. Replace the stack or retire one first.",
    );
  if (request) {
    const existing = show.jobs.find((job) => job.id === request.jobId);
    if (existing) {
      assert(
        existing.requestHash === request.requestHash,
        409,
        "idempotency_conflict",
        "This request key belongs to a different generation.",
      );
      return existing;
    }
  }
  const proposal = show.proposals.find(
    (p) =>
      p.id === proposalId && p.status !== "hidden" && p.status !== "rejected",
  );
  assert(
    proposal,
    404,
    "proposal_not_found",
    "Select a proposal before forging.",
  );
  assert(
    !show.jobs.some((j) =>
      ["queued", "starting", "generating", "verifying"].includes(j.status),
    ),
    409,
    "generation_busy",
    "A mechanic is already being forged.",
  );
  assert(
    show.jobs.length < 30,
    429,
    "generation_limit",
    "This show has reached its generation limit. Start a fresh show to continue.",
  );
  rate(show, "generation", 6, 3_600_000);
  if (priorCandidateId)
    assert(
      show.candidates.some(
        (c) => c.id === priorCandidateId && c.proposalId === proposalId,
      ),
      404,
      "candidate_not_found",
      "The revision must refer to a candidate for this original proposal.",
    );
  const job: GenerationJob = {
    ...(revision ? { revision: normalizeProposal(revision) } : {}),
    ...(priorCandidateId ? { priorCandidateId } : {}),
    ...(request
      ? {
          requestHash: request.requestHash,
          quotaDay: request.quotaDay,
          quotaExempt: request.quotaExempt,
        }
      : {}),
    id: request?.jobId ?? randomUUID(),
    proposalId,
    engineVersion: ENGINE_VERSION,
    activationMode: mode,
    baseCandidateIds: activeIds(show),
    status: "queued",
    createdAt: now(),
    updatedAt: now(),
    attempt: 0,
    model: process.env.CODEX_MODEL || "gpt-6.1-sol",
    message: "Queued",
    baseRevision: show.revision,
  };
  show.jobs.push(job);
  proposal.status = "selected";
  show.phase = "forging";
  show.votingOpen = false;
  event(show, "generation.queued", "Selected — forging now", { proposalId });
  return job;
}
export function cancelGeneration(show: ShowRecord, id: string) {
  const job = show.jobs.find((j) => j.id === id);
  assert(job, 404, "job_not_found", "Generation not found.");
  assert(
    !["ready", "failed", "stale"].includes(job.status),
    409,
    "job_finished",
    "This generation has already finished.",
  );
  job.status = "cancelled";
  job.message = "Cancelled by the host. The active game is unchanged.";
  job.updatedAt = now();
  show.phase = show.activeCandidateId ? "live" : "collecting";
  show.votingOpen = true;
  event(show, "generation.cancelled", job.message, {
    proposalId: job.proposalId,
  });
  return job;
}
export function approveCandidate(
  show: ShowRecord,
  id: string,
  sourceHash: unknown,
  programHash: unknown,
  previewCheckpoint: unknown,
  identity?: {
    compositionHash?: unknown;
    contextHash?: unknown;
    artifactHash?: unknown;
  },
) {
  const candidate = show.candidates.find((c) => c.id === id);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    show.proposals.find((p) => p.id === candidate.proposalId)?.status !==
      "rejected",
    409,
    "proposal_rejected",
    "This proposal was rejected. Reopen it explicitly or select another idea before approving or applying its law.",
  );
  assert(
    !candidate.rejectedAt,
    409,
    "candidate_rejected",
    "This candidate was rejected. Import or generate a revision.",
  );
  assert(
    candidate.sourceHash === sourceHash &&
      candidate.programHash === programHash,
    409,
    "artifact_changed",
    "This candidate changed. Review the verified source again.",
  );
  const composition = checkedComposition(show, candidate, true);
  assert(
    identity?.compositionHash === composition.compositionHash &&
      identity.contextHash === composition.contextHash &&
      identity.artifactHash === composition.artifactHash,
    409,
    "composition_approval_required",
    "Approval must identify the exact independently verified combination and world context.",
  );
  assert(
    candidate.verification.passed,
    409,
    "verification_failed",
    "Only independently verified combinations can be approved.",
  );
  const preview = parseCheckpoint(previewCheckpoint, {
    program: composition.program,
    sourceHash: composition.artifactHash,
  });
  candidate.approvedPreviewHash = hashData(preview);
  candidate.approvedSourceHash = candidate.sourceHash;
  candidate.approvedProgramHash = candidate.programHash;
  candidate.approvedCompositionHash = composition.compositionHash;
  candidate.approvedContextHash = composition.contextHash;
  candidate.approvedArtifactHash = composition.artifactHash;
  candidate.approvedAt = now();
  candidate.approvedBy = show.ownerId;
  event(
    show,
    "candidate.approved",
    "The host approved the exact source, retained combination, and preview.",
    {
      candidateId: id,
      sourceHash: candidate.sourceHash,
      programHash: candidate.programHash,
      previewHash: candidate.approvedPreviewHash,
    },
  );
  return candidate;
}
export function activateCandidate(
  show: ShowRecord,
  input: Record<string, unknown>,
) {
  assertCurrentEngine(show);
  requireLease(show, input.clientId, input.epoch);
  const candidate = show.candidates.find((c) => c.id === input.candidateId);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    show.proposals.find((p) => p.id === candidate.proposalId)?.status !==
      "rejected",
    409,
    "proposal_rejected",
    "This proposal was rejected. Reopen it explicitly or select another idea before approving or applying its law.",
  );
  assert(
    !candidate.rejectedAt,
    409,
    "candidate_rejected",
    "This candidate was rejected. Import or generate a revision.",
  );
  assert(
    candidate.approvedAt &&
      candidate.approvedBy === show.ownerId &&
      candidate.approvedPreviewHash,
    409,
    "approval_required",
    "Preview and approve this exact combination first.",
  );
  const composition = checkedComposition(show, candidate, true);
  assert(
    input.sourceHash === candidate.sourceHash &&
      input.programHash === candidate.programHash &&
      candidate.approvedSourceHash === candidate.sourceHash &&
      candidate.approvedProgramHash === candidate.programHash &&
      input.compositionHash === composition.compositionHash &&
      input.contextHash === composition.contextHash &&
      input.artifactHash === composition.artifactHash &&
      candidate.approvedCompositionHash === composition.compositionHash &&
      candidate.approvedContextHash === composition.contextHash &&
      candidate.approvedArtifactHash === composition.artifactHash,
    409,
    "artifact_changed",
    "Activation must match the exact approved source, combination and context.",
  );
  const checkpoint = validateCheckpoint(input.checkpoint, show);
  const engine = new GameEngine();
  engine.restore(checkpoint);
  engine.activate(composition.program, composition.artifactHash);
  show.previousCheckpoint = checkpoint;
  show.previousCandidateIds = activeIds(show);
  show.previousCandidateId = show.activeCandidateId;
  show.activeCandidateIds = composition.members.map((m) => m.candidateId);
  show.activeCandidateId = candidate.id;
  show.activeArtifactHash = composition.artifactHash;
  show.checkpoint = engine.checkpoint();
  show.revision++;
  show.phase = "live";
  candidate.activatedAt = now();
  openNextRound(show);
  event(
    show,
    "candidate.activated",
    `${candidate.program.name} entered the approved law stack at a saved checkpoint.`,
    {
      candidateId: candidate.id,
      sourceHash: candidate.sourceHash,
      programHash: candidate.programHash,
    },
  );
  return candidate;
}
export function openNextRound(show: ShowRecord) {
  show.round++;
  show.votingOpen = true;
  show.voters = {};
  for (const proposal of show.proposals) proposal.votes = 0;
}
export function rollback(show: ShowRecord, input: Record<string, unknown>) {
  assertCurrentEngine(show);
  requireLease(show, input.clientId, input.epoch);
  if (input.expectedRevision !== undefined)
    assert(
      Number.isInteger(input.expectedRevision) &&
        input.expectedRevision === show.revision,
      409,
      "rollback_stale",
      "The world changed before this rollback. Refresh the active law before trying again.",
    );
  const runtimeFault =
    input.faultedArtifactHash !== undefined ||
    input.faultedSourceHash !== undefined ||
    input.runtimeFaultReason !== undefined;
  if (runtimeFault) {
    const faultHash = input.faultedArtifactHash ?? input.faultedSourceHash;
    const currentRuntime = expectedRuntime(show);
    const active = show.candidates.find(
      (candidate) => candidate.id === show.activeCandidateId,
    );
    assert(
      input.expectedRevision !== undefined &&
        typeof faultHash === "string" &&
        /^[a-f0-9]{64}$/.test(faultHash) &&
        faultHash === currentRuntime.sourceHash &&
        typeof input.runtimeFaultReason === "string" &&
        input.runtimeFaultReason.trim().length > 0 &&
        input.runtimeFaultReason.length <= 1000,
      409,
      "runtime_fault_stale",
      "This runtime fault does not identify the currently active law. The newer world was preserved.",
    );
    event(
      show,
      "private.runtime.fault",
      sanitizeGenerationFailure(input.runtimeFaultReason) ||
        "The active law reported a runtime fault.",
      { sourceHash: active?.sourceHash },
    );
  }
  if (
    runtimeFault &&
    (input.retireAllLaws === true || !show.previousCheckpoint)
  ) {
    const repeated = !show.previousCheckpoint;
    show.checkpoint = retireGeneratedCheckpoint(
      show.checkpoint ?? new GameEngine().checkpoint(),
    );
    show.previousCheckpoint = null;
    show.activeCandidateIds = [];
    show.activeCandidateId = null;
    show.activeArtifactHash = null;
    show.previousCandidateIds = [];
    show.previousCandidateId = null;
    show.revision++;
    show.phase = "collecting";
    show.votingOpen = true;
    event(
      show,
      "world.rollback",
      repeated
        ? "All laws retired after repeated runtime faults."
        : "All laws retired after a runtime fault.",
    );
    return;
  }
  assert(
    show.previousCheckpoint,
    409,
    "rollback_unavailable",
    "There is no previous activation checkpoint to restore.",
  );
  show.checkpoint = show.previousCheckpoint;
  show.activeCandidateIds =
    show.previousCandidateIds ??
    (show.previousCandidateId ? [show.previousCandidateId] : []);
  show.activeCandidateId = show.activeCandidateIds.at(-1) ?? null;
  show.activeArtifactHash = show.checkpoint?.artifactHash ?? null;
  show.previousCandidateIds = [];
  show.previousCheckpoint = null;
  show.previousCandidateId = null;
  show.revision++;
  show.phase = show.activeCandidateId ? "live" : "collecting";
  show.votingOpen = true;
  event(
    show,
    "world.rollback",
    runtimeFault
      ? "Law retired after a runtime fault; world restored to the previous checkpoint."
      : "The previous activation checkpoint was restored. Progress after that checkpoint is reset.",
  );
}
export function ingestTwitch(show: ShowRecord, input: unknown) {
  const data = input as {
    metadata?: Record<string, unknown>;
    payload?: {
      subscription?: {
        id?: string;
        type?: string;
        condition?: Record<string, string>;
      };
      event?: {
        broadcaster_user_id?: string;
        chatter_user_id?: string;
        chatter_user_name?: string;
        message_id?: string;
        message?: { text?: string };
        badges?: Array<{ set_id?: unknown; id?: unknown; info?: unknown }>;
      };
    };
  };
  assert(
    show.mode === "twitch" && show.twitch.status === "connected",
    409,
    "twitch_disconnected",
    "Twitch intake is paused until the host reconnects.",
  );
  assert(
    show.lease && show.lease.expiresAt > Date.now(),
    409,
    "twitch_authority_expired",
    "Twitch intake is paused until the active host tab renews game control.",
  );
  const m = data.metadata;
  const subscription = data.payload?.subscription;
  const e = data.payload?.event;
  assert(e, 400, "twitch_event", "Missing Twitch chat event.");
  assert(
    m?.message_type === "notification" &&
      m.subscription_type === "channel.chat.message" &&
      subscription?.type === "channel.chat.message" &&
      subscription.id === show.twitch.subscriptionId &&
      e?.broadcaster_user_id === show.twitch.channelId &&
      subscription.condition?.broadcaster_user_id === show.twitch.channelId,
    400,
    "twitch_event",
    "This event does not belong to the authorized channel subscription.",
  );
  assert(
    typeof m.message_id === "string" &&
      m.message_id.length <= 100 &&
      typeof e.chatter_user_name === "string" &&
      e.chatter_user_name.length <= 100 &&
      typeof e.chatter_user_id === "string" &&
      /^\d{1,30}$/.test(e.chatter_user_id) &&
      typeof e.message?.text === "string" &&
      e.message.text.length <= 1000 &&
      typeof e.message_id === "string" &&
      e.message_id.length <= 100,
    400,
    "twitch_event",
    "Malformed chat event.",
  );
  const timestamp = Date.parse(String(m.message_timestamp));
  assert(
    Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) < 5 * 60_000,
    400,
    "twitch_event_age",
    "This chat event is too old to affect the current round.",
  );
  show.twitch.lastHealthyAt = now();
  const ids = [m.message_id, e.message_id];
  if (ids.some((id) => show.seenMessages.includes(id)))
    return { duplicate: true };
  show.seenMessages.push(...ids);
  show.seenMessages = show.seenMessages.slice(-4000);
  show.twitch.lastEventAt = now();
  const text = e.message.text.trim();
  if (!show.votingOpen && /^!(forge|back)\b/i.test(text))
    return { ignored: true, reason: "round_closed" };
  const actor = privateActor(e.chatter_user_id);
  const moderation = /^!(hide|reject)\s+(P\d{1,3})\s*$/i.exec(text);
  if (moderation) {
    const badges = e.badges;
    const moderator =
      Array.isArray(badges) &&
      badges.length <= 20 &&
      badges.some(
        (b) =>
          b &&
          (b.set_id === "moderator" ||
            b.set_id === "lead_moderator" ||
            b.set_id === "broadcaster") &&
          typeof b.id === "string" &&
          b.id.length <= 40 &&
          typeof b.info === "string" &&
          b.info.length <= 100,
      );
    if (!moderator) return { ignored: true, reason: "moderator_required" };
    const proposal = moderateProposal(
      show,
      moderation[2].toUpperCase(),
      moderation[1].toLowerCase() === "hide" ? "hidden" : "rejected",
      "Moderated by an authorized Twitch moderator.",
    );
    return { moderated: true, proposalId: proposal.id };
  }
  if (/^!forge\s+/i.test(text)) {
    try {
      return {
        proposal: addProposal(
          show,
          text.replace(/^!forge\s+/i, ""),
          e.chatter_user_name || "Twitch viewer",
          actor,
          "twitch",
          e.message_id,
        ),
      };
    } catch (error) {
      if (
        error instanceof HttpError &&
        [400, 409, 429].includes(error.status)
      ) {
        event(
          show,
          "private.proposal.refused",
          "An audience idea could not join the board.",
        );
        return { refused: true };
      }
      throw error;
    }
  }
  const back = /^!back\s+(P\d{1,3})\s*$/i.exec(text);
  if (back) {
    vote(show, back[1].toUpperCase(), actor);
    return { voted: true };
  }
  return { ignored: true };
}

export interface ExactSourceArtifact {
  source: string;
  sourceHash: string;
  programHash: string;
  model: string;
  threadId?: string;
  generatedAt: string;
  proposal: string;
}
export function importExactSource(
  show: ShowRecord,
  artifact: ExactSourceArtifact,
  options: {
    mode?: ActivationMode;
    origin: "sample" | "library";
    author: string;
    ancestry?: ProposalAncestry;
  },
) {
  assertCurrentEngine(show);
  assert(
    !show.jobs.some((j) =>
      ["queued", "starting", "generating", "verifying"].includes(j.status),
    ),
    409,
    "generation_busy",
    "Finish or cancel the current generation first.",
  );
  assert(
    show.candidates.length < 30,
    429,
    "candidate_limit",
    "This show has reached its candidate limit. Start a fresh studio and import the saved source there.",
  );
  rate(show, "source-import", 6, 60_000);
  const program = compileRuleSource(artifact.source);
  assert(
    digest(artifact.source) === artifact.sourceHash &&
      hashData(program) === artifact.programHash,
    409,
    "source_integrity",
    "The saved source failed its immutable identity check.",
  );
  const verification = verifyRuleProgram(program);
  assert(
    verification.passed,
    422,
    "source_verification",
    "This saved source does not pass the current engine. Its original artifact was preserved.",
  );
  const job: GenerationJob = {
    id: randomUUID(),
    proposalId: "pending",
    status: "ready",
    createdAt: now(),
    updatedAt: now(),
    attempt: 0,
    model: artifact.model,
    threadId: artifact.threadId,
    message: "Sample law loaded",
    baseRevision: show.revision,
    reused: true,
    engineVersion: ENGINE_VERSION,
    activationMode: options.mode || "replace",
    baseCandidateIds: activeIds(show),
  };
  const candidate: Candidate = {
    id: randomUUID(),
    jobId: job.id,
    proposalId: "pending",
    source: artifact.source,
    sourceHash: artifact.sourceHash,
    program,
    programHash: artifact.programHash,
    verification,
    createdAt: now(),
    baseRevision: show.revision,
    ancestry: options.ancestry,
    provenance: {
      kind:
        options.origin === "library" ? "library-import" : "reused-generation",
      threadId: artifact.threadId,
      model: artifact.model,
      generatedAt: artifact.generatedAt,
    },
  };
  prepareCandidateComposition(show, candidate, options.mode || "replace");
  show.votingOpen = true;
  const proposal = addProposal(
    show,
    artifact.proposal,
    options.author,
    "source-import:" + candidate.id,
    options.origin,
    undefined,
    options.ancestry,
  );
  proposal.status = "selected";
  job.proposalId = proposal.id;
  candidate.proposalId = proposal.id;
  show.votingOpen = false;
  job.candidateId = candidate.id;
  show.jobs.push(job);
  show.candidates.push(candidate);
  show.phase = "preview";
  event(show, "candidate.reused", "Sample law loaded", {
    proposalId: proposal.id,
    candidateId: candidate.id,
    sourceHash: candidate.sourceHash,
    programHash: candidate.programHash,
  });
  return candidate;
}
export function importPracticeSample(
  show: ShowRecord,
  sample: "shadow" | "step" = "shadow",
  mode: ActivationMode = "replace",
) {
  const artifact =
    sample === "step" ? REUSED_STEP_ARTIFACT : REUSED_RULE_ARTIFACT;
  return importExactSource(show, artifact, {
    mode,
    origin: "sample",
    author: "Previously generated sample",
  });
}

export function rejectCandidate(show: ShowRecord, id: string, reason?: string) {
  const candidate = show.candidates.find((c) => c.id === id);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    !activeIds(show).includes(candidate.id),
    409,
    "candidate_active",
    "Restore the previous checkpoint to retire an active rule.",
  );
  candidate.rejectedAt = now();
  candidate.rejectedReason = (
    reason || "The host chose to revise this mechanic."
  )
    .replace(/[\u0000-\u001f<>]/g, " ")
    .slice(0, 280);
  const job = show.jobs.find((j) => j.id === candidate.jobId);
  if (job) {
    job.status = "rejected";
    job.updatedAt = now();
    job.message =
      "The host rejected this candidate. The game is preserved; a revision can be generated.";
  }
  show.phase = show.activeCandidateId ? "live" : "collecting";
  show.votingOpen = true;
  event(show, "candidate.rejected", candidate.rejectedReason, {
    candidateId: id,
    proposalId: candidate.proposalId,
    sourceHash: candidate.sourceHash,
    programHash: candidate.programHash,
  });
  return candidate;
}

export async function listHostShows(
  ownerId: string,
  currentShowId: string,
  store = getStore(),
) {
  const index = await store.get<{ ids: string[] }>("host-shows:" + ownerId);
  const ids = Array.from(new Set([currentShowId, ...(index?.ids || [])])).slice(
    0,
    40,
  );
  const shows = await Promise.all(
    ids.map((id) => store.get<ShowRecord>(showKey(id))),
  );
  return shows
    .filter((show): show is ShowRecord =>
      Boolean(show && show.ownerId === ownerId),
    )
    .map((show) => ({
      id: show.id,
      mode: show.mode,
      createdAt: show.createdAt,
      updatedAt: show.updatedAt,
      phase: show.phase,
      revision: show.revision,
      activeRule:
        show.candidates.find((c) => c.id === show.activeCandidateId)?.program
          .name || null,
    }));
}

export function upgradeShowEngine(
  show: ShowRecord,
  input: Record<string, unknown>,
) {
  requireLease(show, input.clientId, input.epoch);
  assert(
    input.expectedRevision === show.revision &&
      input.targetEngineVersion === ENGINE_VERSION,
    409,
    "engine_upgrade_stale",
    "Confirm the current show revision and target engine before upgrading.",
  );
  const oldVersion = showEngine(show);
  assert(
    oldVersion !== ENGINE_VERSION,
    409,
    "engine_current",
    "This show already uses the current engine.",
  );
  assert(
    (show.engineArchives?.length || 0) < 3,
    409,
    "engine_archive_full",
    "This show's engine archive is full. Keep it for evidence and start a new show.",
  );
  const archivedAt = now();
  show.engineArchives ??= [];
  show.engineArchives.push({
    engineVersion: oldVersion,
    archivedAt,
    revision: show.revision,
    checkpoint: structuredClone(show.checkpoint),
    previousCheckpoint: structuredClone(show.previousCheckpoint),
    activeCandidateIds: activeIds(show),
    previousCandidateIds:
      show.previousCandidateIds ??
      (show.previousCandidateId ? [show.previousCandidateId] : []),
  });
  show.engineHistory ??= [];
  show.engineHistory.push({
    engineVersion: oldVersion,
    archivedAt,
    revision: show.revision,
  });
  for (const job of show.jobs)
    if (
      ["queued", "starting", "generating", "verifying"].includes(job.status)
    ) {
      job.status = "stale";
      job.updatedAt = now();
      job.message =
        "The host explicitly upgraded the engine. This old-engine job cannot publish a candidate.";
    }
  show.engineVersion = ENGINE_VERSION;
  show.activeCandidateIds = [];
  show.previousCandidateIds = [];
  show.activeCandidateId = null;
  show.previousCandidateId = null;
  show.activeArtifactHash = null;
  show.previousCheckpoint = null;
  show.checkpoint = new GameEngine().checkpoint();
  show.revision++;
  show.phase = "collecting";
  openNextRound(show);
  event(
    show,
    "engine.upgraded",
    "The host explicitly upgraded the engine. The old checkpoint and law history were archived; the new opening world is ready.",
  );
}
export interface ReviewedAdaptationInput {
  text: unknown;
  expectedRevision: unknown;
  expectedJobUpdatedAt: unknown;
}
export function reviewedAdaptationRequest(
  jobId: string,
  input: ReviewedAdaptationInput,
) {
  const text = normalizeProposal(input.text);
  assert(
    typeof input.expectedRevision === "number" &&
      Number.isInteger(input.expectedRevision) &&
      input.expectedRevision >= 0,
    400,
    "adaptation_revision",
    "Include the show revision you reviewed.",
  );
  assert(
    typeof input.expectedJobUpdatedAt === "string" &&
      Number.isFinite(Date.parse(input.expectedJobUpdatedAt)),
    400,
    "adaptation_job_token",
    "Include the failed generation update time you reviewed.",
  );
  return {
    text,
    expectedRevision: input.expectedRevision,
    expectedJobUpdatedAt: input.expectedJobUpdatedAt,
    requestHash: hashData({
      operation: "generation/adapt",
      jobId,
      text,
      expectedRevision: input.expectedRevision,
      expectedJobUpdatedAt: input.expectedJobUpdatedAt,
    }),
  };
}
export function acceptAdaptation(
  show: ShowRecord,
  jobId: string,
  input: ReviewedAdaptationInput,
) {
  const reviewed = reviewedAdaptationRequest(jobId, input);
  const job = show.jobs.find((j) => j.id === jobId);
  assert(
    job,
    409,
    "adaptation_unavailable",
    "This failed generation is unavailable for a reviewed alternative.",
  );
  if (job.adaptationProposalId) {
    const existing = show.proposals.find(
      (p) => p.id === job.adaptationProposalId,
    );
    assert(
      existing,
      409,
      "adaptation_missing",
      "The accepted adaptation is missing.",
    );
    assert(
      existing.text === reviewed.text,
      409,
      "adaptation_conflict",
      "This failed generation already has an immutable reviewed alternative. Forge that proposal or review another failed generation.",
    );
    return existing;
  }
  assertCurrentEngine(show);
  assert(
    job.engineVersion === ENGINE_VERSION && job.status === "failed",
    409,
    "adaptation_unavailable",
    "Only a failed generation from the current engine can receive a reviewed alternative.",
  );
  assert(
    show.revision === reviewed.expectedRevision,
    409,
    "stale_revision",
    "The world changed after you reviewed this alternative. Refresh and review it again.",
  );
  assert(
    job.updatedAt === reviewed.expectedJobUpdatedAt,
    409,
    "stale_job",
    "The generation changed after you reviewed this alternative. Refresh and review it again.",
  );
  assert(
    !show.jobs.some((j) =>
      ["queued", "starting", "generating", "verifying"].includes(j.status),
    ),
    409,
    "generation_busy",
    "A mechanic is already being forged.",
  );
  const original = show.proposals.find(
    (p) =>
      p.id === job.proposalId &&
      p.status !== "hidden" &&
      p.status !== "rejected",
  );
  assert(
    original,
    404,
    "proposal_not_found",
    "The original proposal is missing or unavailable.",
  );
  const suggestion =
    typeof job.adaptedProposal === "string"
      ? job.adaptedProposal
          .normalize("NFKC")
          .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const adapted = addProposal(
    show,
    reviewed.text,
    original.author,
    "adaptation:" + job.id,
    original.origin,
    undefined,
    {
      kind: "adaptation",
      adaptationSource: suggestion
        ? suggestion === reviewed.text
          ? "model-suggested"
          : "host-edited"
        : "host-written",
      originalAuthor: original.ancestry?.originalAuthor || original.author,
      originalText: original.ancestry?.originalText || original.text,
      originalProposalId: original.id,
      sourceJobId: job.id,
    },
  );
  job.adaptationProposalId = adapted.id;
  event(
    show,
    "proposal.adapted",
    "The host saved a reviewed alternative to the original contributor's idea.",
    { proposalId: adapted.id },
  );
  return adapted;
}
