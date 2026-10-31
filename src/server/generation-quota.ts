import { assert } from "./errors";
import { hashData } from "./security";
import { getStore, type DocumentStore } from "./store";

export interface GenerationIdentity {
  actorId: string;
  exempt: boolean;
}
export interface GenerationQuotaView {
  day: string;
  resetsAt: string;
  exempt: boolean;
  perUserLimit: number;
  globalLimit: number;
  userRemaining: number | null;
  globalRemaining: number | null;
  exhausted: boolean;
}
export interface GenerationRequest {
  jobId: string;
  reservationId: string;
  requestHash: string;
  showId: string;
}
interface Reservation {
  requestHash: string;
  showId: string;
  actorId: string;
  day: string;
}
interface QuotaLedger {
  days: Record<string, { total: number; users: Record<string, number> }>;
  reservations: Record<string, Reservation>;
}
const LEDGER_ID = "generation-quota:v1";
const DAY_MS = 86_400_000;
function limit(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  assert(
    /^\d+$/.test(raw) &&
      Number.isSafeInteger(Number(raw)) &&
      Number(raw) <= 2_000,
    503,
    "quota_configuration",
    "Daily generation limits are not configured correctly. Use a previously generated law while the owner checks setup.",
  );
  return Number(raw);
}
function limits() {
  return {
    perUserLimit: limit("LIVEFORGE_GENERATIONS_PER_USER_PER_DAY", 3),
    globalLimit: limit("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", 40),
  };
}
function dayOf(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
function projection(
  ledger: QuotaLedger | null,
  identity: GenerationIdentity,
  timestamp: number,
): GenerationQuotaView {
  const day = dayOf(timestamp);
  const { perUserLimit, globalLimit } = limits();
  const usage = ledger?.days[day];
  const userRemaining = identity.exempt
    ? null
    : Math.max(0, perUserLimit - (usage?.users[identity.actorId] || 0));
  const globalRemaining = identity.exempt
    ? null
    : Math.max(0, globalLimit - (usage?.total || 0));
  return {
    day,
    resetsAt: new Date(
      Date.parse(day + "T00:00:00.000Z") + DAY_MS,
    ).toISOString(),
    exempt: identity.exempt,
    perUserLimit,
    globalLimit,
    userRemaining,
    globalRemaining,
    exhausted:
      !identity.exempt && (userRemaining === 0 || globalRemaining === 0),
  };
}
export function generationRequest(
  showId: string,
  ownerId: string,
  key: unknown,
  input: {
    proposalId: unknown;
    revision?: unknown;
    priorCandidateId?: unknown;
  },
): GenerationRequest {
  assert(
    typeof key === "string" &&
      /^[\w-]{8,100}$/.test(key) &&
      !["__proto__", "constructor", "prototype"].includes(key),
    400,
    "idempotency_required",
    "Include a unique x-idempotency-key for this command.",
  );
  const reservationId = hashData({ showId, ownerId, key });
  const h = reservationId.slice(0, 32);
  return {
    showId,
    reservationId,
    jobId: [
      h.slice(0, 8),
      h.slice(8, 12),
      h.slice(12, 16),
      h.slice(16, 20),
      h.slice(20),
    ].join("-"),
    requestHash: hashData(input),
  };
}
export async function generationQuota(
  identity: GenerationIdentity,
  store: DocumentStore = getStore(),
  timestamp = Date.now(),
) {
  return projection(
    await store.get<QuotaLedger>(LEDGER_ID),
    identity,
    timestamp,
  );
}
/** User and global debits commit together in one CAS ledger, with a durable request receipt across midnight. */
export async function reserveGenerationQuota(
  identity: GenerationIdentity,
  request: GenerationRequest,
  store: DocumentStore = getStore(),
  timestamp = Date.now(),
) {
  if (identity.exempt)
    return {
      jobId: request.jobId,
      requestHash: request.requestHash,
      showId: request.showId,
      actorId: identity.actorId,
      day: dayOf(timestamp),
      exempt: true,
    };
  await store.create<QuotaLedger>(LEDGER_ID, { days: {}, reservations: {} });
  return store.update<
    QuotaLedger,
    Reservation & { jobId: string; exempt: boolean }
  >(LEDGER_ID, (ledger) => {
    const previous = ledger.reservations[request.reservationId];
    if (previous) {
      assert(
        previous.actorId === identity.actorId &&
          previous.requestHash === request.requestHash &&
          previous.showId === request.showId,
        409,
        "idempotency_conflict",
        "This generation request key already belongs to a different request. Use a new key for a new idea.",
      );
      return { ...previous, jobId: request.jobId, exempt: false };
    }
    const quota = projection(ledger, identity, timestamp);
    assert(
      !quota.exhausted,
      429,
      "generation_quota",
      quota.userRemaining === 0
        ? "Your daily generation allowance is used up. It resets at midnight UTC; use a previously generated law now."
        : "The shared daily generation allowance is used up. It resets at midnight UTC; use a previously generated law now.",
    );
    const day = quota.day;
    if (!identity.exempt) {
      const bucket = (ledger.days[day] ??= { total: 0, users: {} });
      bucket.total++;
      bucket.users[identity.actorId] =
        (bucket.users[identity.actorId] || 0) + 1;
    }
    const reservation: Reservation = {
      requestHash: request.requestHash,
      showId: request.showId,
      actorId: identity.actorId,
      day,
    };
    ledger.reservations[request.reservationId] = reservation;
    const cutoff = dayOf(timestamp - DAY_MS);
    for (const date of Object.keys(ledger.days))
      if (date < cutoff) delete ledger.days[date];
    for (const [id, item] of Object.entries(ledger.reservations))
      if (item.day < cutoff) delete ledger.reservations[id];
    return { ...reservation, jobId: request.jobId, exempt: false };
  });
}
