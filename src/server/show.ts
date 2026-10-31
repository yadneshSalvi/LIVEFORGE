import { randomUUID } from "node:crypto";
import { type GameCheckpoint } from "@/game/contracts";
import { GameEngine } from "@/game/core";
import { sanitizeGenerationFailure } from "./generation-failure";
import { parseCheckpoint } from "./checkpoint";
import { REUSED_RULE_ARTIFACT, REUSED_STEP_ARTIFACT } from "./reused-artifact";
import { compileRuleSource, verifyRuleProgram } from "@/game/rules";
import type {
  Candidate,
  GenerationJob,
  Proposal,
  PublicShowState,
  ShowMode,
  ShowState,
} from "./contracts";
import type { DocumentStore } from "./store";
import { getStore } from "./store";
import { assert } from "./errors";
import { digest, hashData, privateActor } from "./security";

export interface ShowRecord extends ShowState {
  ownerId: string;
  voters: Record<string, string>;
  seenMessages: string[];
  rates: Record<string, number[]>;
  idempotency: Record<string, { at: number; result: unknown }>;
  credentialId?: string;
  oauth?: { stateHash: string; expiresAt: number };
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
    ownerId,
    mode,
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
      message: "Connect an authorized channel to receive live proposals.",
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
    connection.message =
      "The active host tab has lost game authority. Twitch intake is paused until control resumes.";
  } else if (!Number.isFinite(heartbeat) || Date.now() - heartbeat > 70_000) {
    connection.status = "gap";
    connection.message =
      "The Twitch connector has missed its heartbeat. Reconnect chat; missed messages cannot be replayed.";
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
    ...state
  } = show;
  void _;
  void _v;
  void _s;
  void _r;
  void _i;
  void _c;
  void _o;
  return {
    ...state,
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
    queued: "The next law is queued.",
    starting: "An isolated workshop is starting.",
    generating: "Codex is composing the selected idea.",
    verifying: "Independent game checks are running.",
    ready: "Checks passed. The host is reviewing the next law.",
    failed:
      "The next law needs another attempt. The current game is preserved.",
    cancelled: "The host stopped forging. The current game continues.",
    stale: "The world changed. The next law needs a fresh review.",
    rejected: "The host chose to revise the candidate.",
  };
  return messages[status];
}
export function publicView(show: ShowRecord): PublicShowState {
  const candidate = show.candidates.find(
    (item) => item.id === show.activeCandidateId,
  );
  const proposal = show.proposals.find(
    (item) => item.id === candidate?.proposalId,
  );
  const job = show.jobs.at(-1);
  return {
    id: show.id,
    mode: show.mode,
    votingOpen: show.votingOpen,
    phase: show.phase,
    round: show.round,
    revision: show.revision,
    proposals: show.proposals
      .filter((p) => p.status !== "hidden")
      .map(({ messageId: _, ...p }) => p),
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
          message: job.reused
            ? "A previously generated law was loaded; no AI call was made in this show."
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
    if (Object.hasOwn(show.idempotency, key))
      return show.idempotency[key].result as R;
    const result = fn(show);
    show.updatedAt = now();
    show.idempotency[key] = { at: Date.now(), result };
    const keys = Object.keys(show.idempotency);
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
  origin: "practice" | "twitch" | "sample",
  messageId?: string,
): Proposal {
  assert(show.votingOpen, 409, "round_closed", "This round is closed.");
  const normalized = normalizeProposal(text);
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
      p.origin === origin &&
      p.text.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );
  if (duplicate) return duplicate;
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
  };
  show.proposals.push(proposal);
  event(
    show,
    "proposal.received",
    origin === "practice"
      ? "A practice idea joined the board."
      : origin === "sample"
        ? "A previously generated sample joined the board."
        : "A Twitch viewer proposed a new mechanic.",
    { proposalId: proposal.id },
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
    (p) => p.id === proposalId && p.status !== "hidden",
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
  const active = show.candidates.find((c) => c.id === show.activeCandidateId);
  return parseCheckpoint(value, {
    program: active?.program ?? null,
    sourceHash: active?.sourceHash ?? null,
  });
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
): GenerationJob {
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
    (p) => p.id === proposalId && p.status !== "hidden",
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
    status: "queued",
    createdAt: now(),
    updatedAt: now(),
    attempt: 0,
    model: process.env.CODEX_MODEL || "gpt-6.1-sol",
    message: "Queued for an isolated Codex workspace.",
    baseRevision: show.revision,
  };
  show.jobs.push(job);
  proposal.status = "selected";
  show.phase = "forging";
  show.votingOpen = false;
  event(
    show,
    "generation.queued",
    "The selected proposal is queued for Codex.",
    { proposalId },
  );
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
) {
  const candidate = show.candidates.find((c) => c.id === id);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    candidate.sourceHash === sourceHash &&
      candidate.programHash === programHash &&
      digest(candidate.source) === sourceHash &&
      hashData(candidate.program) === programHash &&
      hashData(compileRuleSource(candidate.source)) === programHash,
    409,
    "artifact_changed",
    "This candidate changed. Review the verified artifact again.",
  );
  assert(
    !candidate.rejectedAt,
    409,
    "candidate_rejected",
    "This candidate was rejected. Generate a revision to continue.",
  );
  assert(
    candidate.baseRevision === show.revision,
    409,
    "candidate_stale",
    "This candidate targets an earlier game revision. Generate again against the current world.",
  );
  assert(
    candidate.verification.passed &&
      verifyRuleProgram(candidate.program).passed,
    409,
    "verification_failed",
    "Only independently verified candidates can be approved.",
  );
  const preview = parseCheckpoint(previewCheckpoint, {
    program: candidate.program,
    sourceHash: candidate.sourceHash,
  });
  candidate.approvedPreviewHash = hashData(preview);
  candidate.approvedSourceHash = candidate.sourceHash;
  candidate.approvedProgramHash = candidate.programHash;
  candidate.approvedAt = now();
  candidate.approvedBy = show.ownerId;
  event(
    show,
    "candidate.approved",
    "The host approved this exact verified source.",
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
  requireLease(show, input.clientId, input.epoch);
  const candidate = show.candidates.find((c) => c.id === input.candidateId);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    !candidate.rejectedAt,
    409,
    "candidate_rejected",
    "This candidate was rejected. Generate a revision to continue.",
  );
  assert(
    candidate.approvedAt &&
      candidate.approvedBy === show.ownerId &&
      candidate.approvedPreviewHash,
    409,
    "approval_required",
    "Preview and approve this candidate first.",
  );
  assert(
    candidate.baseRevision === show.revision,
    409,
    "candidate_stale",
    "The world changed since this candidate was generated.",
  );
  assert(
    candidate.sourceHash === input.sourceHash &&
      candidate.programHash === input.programHash &&
      candidate.approvedSourceHash === input.sourceHash &&
      candidate.approvedProgramHash === input.programHash &&
      hashData(candidate.program) === candidate.programHash &&
      digest(candidate.source) === candidate.sourceHash &&
      hashData(compileRuleSource(candidate.source)) === candidate.programHash,
    409,
    "artifact_changed",
    "Activation must match the exact approved artifact.",
  );
  const checkpoint = validateCheckpoint(input.checkpoint, show);
  show.previousCheckpoint = checkpoint;
  show.previousCandidateId = show.activeCandidateId;
  show.activeCandidateId = candidate.id;
  const engine = new GameEngine();
  engine.restore(checkpoint);
  engine.activate(candidate.program, candidate.sourceHash);
  show.checkpoint = engine.checkpoint();
  show.revision++;
  show.phase = "live";
  candidate.activatedAt = now();
  openNextRound(show);
  event(
    show,
    "candidate.activated",
    `${candidate.program.name} entered the game at a saved checkpoint.`,
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
    input.faultedSourceHash !== undefined ||
    input.runtimeFaultReason !== undefined;
  if (runtimeFault) {
    const active = show.candidates.find(
      (candidate) => candidate.id === show.activeCandidateId,
    );
    assert(
      input.expectedRevision !== undefined &&
        typeof input.faultedSourceHash === "string" &&
        /^[a-f0-9]{64}$/.test(input.faultedSourceHash) &&
        input.faultedSourceHash === active?.sourceHash &&
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
      { sourceHash: active.sourceHash },
    );
  }
  assert(
    show.previousCheckpoint,
    409,
    "rollback_unavailable",
    "There is no previous activation checkpoint to restore.",
  );
  show.checkpoint = show.previousCheckpoint;
  show.activeCandidateId = show.previousCandidateId;
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
  if (/^!forge\s+/i.test(text))
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
  const back = /^!back\s+(P\d{1,3})\s*$/i.exec(text);
  if (back) {
    vote(show, back[1].toUpperCase(), actor);
    return { voted: true };
  }
  return { ignored: true };
}

export function importPracticeSample(
  show: ShowRecord,
  sample: "shadow" | "step" = "shadow",
) {
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
    "This show has reached its candidate limit. Start a fresh studio.",
  );
  rate(show, "sample", 6, 60_000);
  const artifact =
    sample === "step" ? REUSED_STEP_ARTIFACT : REUSED_RULE_ARTIFACT;
  const program = compileRuleSource(artifact.source);
  assert(
    digest(artifact.source) === artifact.sourceHash &&
      hashData(program) === artifact.programHash,
    503,
    "sample_integrity",
    "The saved sample failed its integrity check.",
  );
  const verification = verifyRuleProgram(program);
  assert(
    verification.passed,
    503,
    "sample_verification",
    "The previously generated sample no longer passes this engine version.",
  );
  show.votingOpen = true;
  const proposal = addProposal(
    show,
    artifact.proposal,
    "Previously generated sample",
    "sample-" + show.candidates.length,
    "sample",
  );
  proposal.status = "selected";
  show.votingOpen = false;
  const job: GenerationJob = {
    id: randomUUID(),
    proposalId: proposal.id,
    status: "ready",
    createdAt: now(),
    updatedAt: now(),
    attempt: 1,
    model: artifact.model,
    threadId: artifact.threadId,
    message:
      "Previously generated Codex sample imported and independently reverified. No model call was made in this run.",
    baseRevision: show.revision,
    reused: true,
  };
  const candidate: Candidate = {
    id: randomUUID(),
    jobId: job.id,
    proposalId: proposal.id,
    source: artifact.source,
    sourceHash: artifact.sourceHash,
    program,
    programHash: artifact.programHash,
    verification,
    createdAt: now(),
    baseRevision: show.revision,
    provenance: {
      kind: "reused-generation",
      threadId: artifact.threadId,
      model: artifact.model,
      generatedAt: artifact.generatedAt,
    },
  };
  job.candidateId = candidate.id;
  show.jobs.push(job);
  show.candidates.push(candidate);
  show.phase = "preview";
  event(
    show,
    "candidate.reused",
    "A real previously generated Codex sample was imported. This run did not generate new source.",
    {
      proposalId: proposal.id,
      candidateId: candidate.id,
      sourceHash: candidate.sourceHash,
      programHash: candidate.programHash,
    },
  );
  return candidate;
}

export function rejectCandidate(show: ShowRecord, id: string, reason?: string) {
  const candidate = show.candidates.find((c) => c.id === id);
  assert(candidate, 404, "candidate_not_found", "Candidate not found.");
  assert(
    candidate.id !== show.activeCandidateId,
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
