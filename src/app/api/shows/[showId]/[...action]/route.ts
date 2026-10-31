import {
  requireChatReplyGrant,
  deliverRecentChatReplies,
} from "@/server/twitch-replies";
import { activationMode, assertCurrentEngine } from "@/server/composition";
import {
  readLibraryEntry,
  saveLibraryCandidate,
  libraryAncestry,
  type LibraryEntry,
} from "@/server/library";
import {
  generationRequest,
  reserveGenerationQuota,
} from "@/server/generation-quota";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import {
  addProposal,
  acquireLease,
  activateCandidate,
  approveCandidate,
  cancelGeneration,
  createGeneration,
  event,
  updateShowSettings,
  moderateProposal,
  hostView,
  setTwitchHealth,
  ingestTwitch,
  importPracticeSample,
  importExactSource,
  upgradeShowEngine,
  acceptAdaptation,
  reviewedAdaptationRequest,
  mutate,
  ownedShow,
  rate,
  requireLease,
  releaseLease,
  rejectCandidate,
  rollback,
  showKey,
  validateCheckpoint,
  vote,
  type ShowRecord,
} from "@/server/show";
import { assert } from "@/server/errors";
import {
  jsonBody,
  jsonError,
  requireSameOrigin,
  session,
  sessionCookie,
} from "@/server/security";
import { getStore } from "@/server/store";
import {
  captureSandboxCredentials,
  type SandboxCredentials,
  runGeneration,
  stopGenerationSandbox,
} from "@/server/generation";
import {
  connectTwitchSession,
  requireGenerationHost,
  maintainTwitchSession,
} from "@/server/twitch";
export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ showId: string; action: string[] }> };
interface TwitchSessionReceipt {
  operation: "twitch/session";
  sessionId: string;
  reconnect: boolean;
  attemptOwner: string;
  status: "pending" | "completed" | "unknown";
}
async function claimTwitchConnection(
  showId: string,
  ownerId: string,
  key: string,
  sessionId: string,
  reconnect: boolean,
) {
  const attemptOwner = randomUUID();
  return getStore().update<
    ShowRecord,
    { start: boolean; receipt: TwitchSessionReceipt }
  >(showKey(showId), (show) => {
    assert(
      show.ownerId === ownerId,
      404,
      "show_not_found",
      "This show was not found in your host session.",
    );
    const saved = show.idempotency[key]?.result as
      TwitchSessionReceipt | undefined;
    if (Object.hasOwn(show.idempotency, key)) {
      assert(
        saved?.operation === "twitch/session" &&
          saved.sessionId === sessionId &&
          saved.reconnect === reconnect,
        409,
        "idempotency_conflict",
        "This request key belongs to another command or Twitch connection. Use a new key for a new connection.",
      );
      assert(
        saved.status === "completed",
        409,
        "twitch_connection_attempt_consumed",
        "This connection attempt is pending or has an unknown outcome. Open a fresh Twitch connection and use a new request key; this key will not retry a subscription.",
      );
      return { start: false, receipt: saved };
    }
    assert(
      Object.values(show.idempotency).filter(
        (entry) =>
          (entry.result as Partial<TwitchSessionReceipt> | undefined)
            ?.operation === "twitch/session",
      ).length < 128,
      429,
      "twitch_connection_history_full",
      "This show's bounded Twitch connection history is full. Preserve it and start another Twitch studio.",
    );
    rate(show, "twitch-session", 8, 60_000);
    const receipt: TwitchSessionReceipt = {
      operation: "twitch/session",
      sessionId,
      reconnect,
      attemptOwner,
      status: "pending",
    };
    show.idempotency[key] = { at: Date.now(), result: receipt };
    show.updatedAt = new Date().toISOString();
    return { start: true, receipt };
  });
}
async function finishTwitchConnection(
  showId: string,
  ownerId: string,
  key: string,
  claimed: TwitchSessionReceipt,
  status: "completed" | "unknown",
) {
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    assert(
      show.ownerId === ownerId,
      404,
      "show_not_found",
      "This show was not found in your host session.",
    );
    const receipt = show.idempotency[key]?.result as
      TwitchSessionReceipt | undefined;
    // Fencing prevents a delayed finisher from completing another operation or attempt.
    assert(
      receipt?.operation === "twitch/session" &&
        receipt.attemptOwner === claimed.attemptOwner &&
        receipt.sessionId === claimed.sessionId &&
        receipt.reconnect === claimed.reconnect,
      409,
      "twitch_connection_fenced",
      "This connection receipt changed; open a fresh Twitch connection.",
    );
    if (receipt.status === "pending") receipt.status = status;
  });
}
export async function GET(request: Request, context: Context) {
  try {
    const { showId, action } = await context.params;
    const host = session(request);
    const show = await ownedShow(showId, host.hostId);
    assert(
      action[0] === "generations" && action.length === 2,
      404,
      "route_not_found",
      "Endpoint not found.",
    );
    const job = show.jobs.find((j) => j.id === action[1]);
    assert(job, 404, "job_not_found", "Generation not found.");
    return Response.json(
      {
        job: hostView(show).jobs.find((j) => j.id === job.id),
        show: hostView(show),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const host = session(request);
    const { showId, action } = await context.params;
    const owned = await ownedShow(showId, host.hostId);
    const body = await jsonBody(request);
    const idempotency = request.headers.get("x-idempotency-key") || undefined;
    assert(
      idempotency &&
        /^[\w-]{8,100}$/.test(idempotency) &&
        !["__proto__", "constructor", "prototype"].includes(idempotency),
      400,
      "idempotency_required",
      "Include a unique x-idempotency-key for this command.",
    );
    const path = action.join("/");
    const reviewedAdaptation =
      action.length === 3 &&
      action[0] === "generations" &&
      action[2] === "adapt"
        ? reviewedAdaptationRequest(action[1], {
            text: body.text,
            expectedRevision: body.expectedRevision,
            expectedJobUpdatedAt: body.expectedJobUpdatedAt,
          })
        : undefined;
    let sandboxAuthentication: SandboxCredentials | undefined;
    let generationMetadata:
      | {
          jobId: string;
          requestHash: string;
          quotaDay?: string;
          quotaExempt?: boolean;
        }
      | undefined;
    let libraryEntry: LibraryEntry | undefined;
    let savedLibraryEntry:
      Awaited<ReturnType<typeof saveLibraryCandidate>> | undefined;
    let jobToRun: string | undefined;
    let stopName: string | undefined;
    if (path === "twitch/events") await maintainTwitchSession(owned);
    if (path === "settings" && body.chatRepliesEnabled === true)
      await requireChatReplyGrant(owned);
    if (path === "library/import") {
      assert(
        typeof body.entryId === "string",
        400,
        "library_entry",
        "Choose a saved law.",
      );
      libraryEntry = await readLibraryEntry(host.hostId, body.entryId);
    }
    if (path === "library/save") {
      assert(
        typeof body.candidateId === "string",
        400,
        "candidate_id",
        "Choose an approved candidate to save.",
      );
      savedLibraryEntry = await saveLibraryCandidate(
        host.hostId,
        showId,
        body.candidateId,
        idempotency,
      );
    }
    if (path === "generate") {
      assertCurrentEngine(owned);
      const mode = activationMode(body.mode);
      const identity = await requireGenerationHost(host.hostId);
      assert(
        process.env.OPENAI_API_KEY,
        503,
        "generation_unconfigured",
        "Codex generation requires the OpenAI key and Vercel Sandbox identity. Use a previously generated law while setup is checked.",
      );
      sandboxAuthentication = await captureSandboxCredentials();
      const requestDescriptor = generationRequest(
        showId,
        host.hostId,
        idempotency,
        {
          proposalId: body.proposalId,
          revision: body.revision,
          priorCandidateId: body.priorCandidateId,
          mode,
        },
      );
      assert(
        typeof body.proposalId === "string",
        400,
        "proposal_id",
        "Select a proposal.",
      );
      const previous = owned.idempotency[idempotency!];
      if (previous)
        assert(
          (previous.result as { jobId?: string })?.jobId ===
            requestDescriptor.jobId,
          409,
          "idempotency_conflict",
          "This request key was already used for another command. Use a new key for a new generation.",
        );
      // Validate before reserving a daily slot; the authoritative mutation rechecks against competing commands.
      const prospective = createGeneration(
        structuredClone(owned),
        body.proposalId,
        typeof body.revision === "string" ? body.revision : undefined,
        typeof body.priorCandidateId === "string"
          ? body.priorCandidateId
          : undefined,
        requestDescriptor,
        mode,
      );
      if (owned.jobs.some((job) => job.id === prospective.id))
        generationMetadata = {
          jobId: prospective.id,
          requestHash: requestDescriptor.requestHash,
          quotaDay: prospective.quotaDay,
          quotaExempt: prospective.quotaExempt,
        };
      else {
        const reservation = await reserveGenerationQuota(
          identity,
          requestDescriptor,
        );
        generationMetadata = {
          jobId: reservation.jobId,
          requestHash: reservation.requestHash,
          quotaDay: reservation.day,
          quotaExempt: reservation.exempt,
        };
      }
    }
    if (path === "twitch/session") {
      assert(
        owned.mode === "twitch",
        409,
        "practice_mode",
        "Live Twitch chat is available in Twitch studios.",
      );
      assert(
        typeof body.sessionId === "string" &&
          /^[A-Za-z0-9_=:.-]{8,300}$/.test(body.sessionId),
        400,
        "twitch_session",
        "Open a valid Twitch WebSocket connection first.",
      );
      assert(
        body.reconnect === undefined || typeof body.reconnect === "boolean",
        400,
        "twitch_reconnect",
        "Specify planned reconnect as a boolean.",
      );
      const claim = await claimTwitchConnection(
        showId,
        host.hostId,
        idempotency,
        body.sessionId,
        body.reconnect === true,
      );
      if (claim.start) {
        try {
          await connectTwitchSession(
            showId,
            host.hostId,
            claim.receipt.sessionId,
            claim.receipt.reconnect,
          );
          await finishTwitchConnection(
            showId,
            host.hostId,
            idempotency,
            claim.receipt,
            "completed",
          );
        } catch (error) {
          await finishTwitchConnection(
            showId,
            host.hostId,
            idempotency,
            claim.receipt,
            "unknown",
          ).catch(() => undefined);
          throw error;
        }
      }
    } else if (reviewedAdaptation) {
      await mutate(
        showId,
        host.hostId,
        idempotency,
        (show) => ({
          proposalId: acceptAdaptation(show, action[1], reviewedAdaptation).id,
        }),
        getStore(),
        {
          operation: "generation/adapt",
          requestHash: reviewedAdaptation.requestHash,
        },
      );
    } else if (path !== "library/save") {
      const result = await mutate(showId, host.hostId, idempotency, (show) => {
        if (path === "resume") return { resumed: true };
        if (path === "settings") {
          updateShowSettings(show, body);
          return { updated: true };
        }
        if (path === "upgrade") {
          const stopName = show.jobs.find((j) =>
            ["starting", "generating", "verifying"].includes(j.status),
          )?.sandboxId;
          upgradeShowEngine(show, body);
          return { upgraded: true, stopName };
        }
        if (path === "library/import") {
          const entry = libraryEntry!;
          const candidate = importExactSource(show, entry, {
            mode: activationMode(body.mode),
            origin: "library",
            author: entry.author,
            ancestry: libraryAncestry(entry),
          });
          return { candidateId: candidate.id };
        }
        if (path === "practice/sample") {
          assert(
            body.sample === undefined ||
              body.sample === "shadow" ||
              body.sample === "step",
            400,
            "sample_id",
            "Choose the shadow or step practice artifact.",
          );
          const candidate = importPracticeSample(
            show,
            body.sample === "step" ? "step" : "shadow",
            activationMode(body.mode),
          );
          return { candidateId: candidate.id };
        }
        if (path === "proposals") {
          assert(
            show.mode === "practice",
            409,
            "twitch_input",
            "Twitch ideas come from genuine channel chat. Use !forge followed by an idea.",
          );
          const proposal = addProposal(
            show,
            body.text,
            typeof body.author === "string" ? body.author : "Practice inventor",
            host.hostId,
            "practice",
          );
          return { proposalId: proposal.id };
        }
        if (path === "votes") {
          assert(
            show.mode === "practice",
            409,
            "twitch_input",
            "Live support comes from !back commands in Twitch chat.",
          );
          assert(
            typeof body.proposalId === "string",
            400,
            "proposal_id",
            "Choose a proposal.",
          );
          vote(show, body.proposalId, host.hostId);
          return {};
        }
        if (path === "generate") {
          assert(
            typeof body.proposalId === "string",
            400,
            "proposal_id",
            "Select a proposal.",
          );
          const job = createGeneration(
            show,
            body.proposalId,
            typeof body.revision === "string" ? body.revision : undefined,
            typeof body.priorCandidateId === "string"
              ? body.priorCandidateId
              : undefined,
            generationMetadata,
            activationMode(body.mode),
          );
          return { jobId: job.id };
        }
        if (path === "lease") {
          assert(
            typeof body.clientId === "string",
            400,
            "client_id",
            "A game tab identifier is required.",
          );
          assert(
            body.takeover === undefined || typeof body.takeover === "boolean",
            400,
            "takeover_flag",
            "Specify takeover as a boolean.",
          );
          if (body.takeover) rate(show, "authority-takeover", 10, 60_000);
          return {
            lease: acquireLease(show, body.clientId, body.takeover === true),
          };
        }
        if (path === "lease/release")
          return { released: releaseLease(show, body.clientId, body.epoch) };
        if (path === "checkpoint") {
          requireLease(show, body.clientId, body.epoch);
          show.checkpoint = validateCheckpoint(body.checkpoint, show);
          return { saved: true };
        }
        if (path === "activate") {
          const candidate = activateCandidate(show, body);
          return { candidateId: candidate.id };
        }
        if (path === "rollback") {
          rollback(show, body);
          return { restored: true };
        }
        if (path === "twitch/events") {
          return ingestTwitch(show, body);
        }
        if (path === "twitch/health") {
          setTwitchHealth(show, body.status);
          return {};
        }
        if (path === "round") {
          assert(
            typeof body.votingOpen === "boolean",
            400,
            "round_state",
            "Specify whether voting is open.",
          );
          show.votingOpen = body.votingOpen;
          return {};
        }
        if (
          action.length === 3 &&
          action[0] === "proposals" &&
          action[2] === "moderate"
        ) {
          moderateProposal(show, action[1], body.status, body.reason);
          return {};
        }
        if (
          action.length === 3 &&
          action[0] === "generations" &&
          action[2] === "cancel"
        ) {
          const job = cancelGeneration(show, action[1]);
          return { stopName: job.sandboxId };
        }
        if (
          action.length === 3 &&
          action[0] === "candidates" &&
          action[2] === "reject"
        ) {
          const candidate = rejectCandidate(
            show,
            action[1],
            typeof body.reason === "string" ? body.reason : undefined,
          );
          return { candidateId: candidate.id };
        }
        if (
          action.length === 3 &&
          action[0] === "candidates" &&
          action[2] === "approve"
        ) {
          const candidate = approveCandidate(
            show,
            action[1],
            body.sourceHash,
            body.programHash,
            body.previewCheckpoint,
            {
              compositionHash: body.compositionHash,
              contextHash: body.contextHash,
              artifactHash: body.artifactHash,
            },
          );
          return { candidateId: candidate.id };
        }
        assert(false, 404, "route_not_found", "Endpoint not found.");
      });
      if (path === "generate") jobToRun = (result as { jobId: string }).jobId;
      if (path.endsWith("/cancel") || path === "upgrade")
        stopName = (result as { stopName?: string }).stopName;
    }
    if (jobToRun) {
      const jobId = jobToRun;
      const authentication = sandboxAuthentication;
      after(() => runGeneration(showId, jobId, authentication));
    }
    if (stopName) {
      const name = stopName;
      try {
        sandboxAuthentication ??= await captureSandboxCredentials();
      } catch {
        /* Durable cancellation still wins; sandbox also has a hard lifetime. */
      }
      const authentication = sandboxAuthentication;
      after(() => stopGenerationSandbox(name, authentication));
    }
    const show = await ownedShow(showId, host.hostId);
    if (
      show.settings?.chatRepliesEnabled &&
      ![
        "checkpoint",
        "lease",
        "lease/release",
        "twitch/health",
        "resume",
        "settings",
      ].includes(path)
    )
      after(() => deliverRecentChatReplies(showId));
    return Response.json(
      {
        show: hostView(show),
        ...(savedLibraryEntry ? { entry: savedLibraryEntry } : {}),
        ...(jobToRun
          ? { job: hostView(show).jobs.find((j) => j.id === jobToRun) }
          : {}),
      },
      {
        status: jobToRun ? 202 : 200,
        headers: {
          "Cache-Control": "no-store",
          ...(path === "resume"
            ? { "Set-Cookie": sessionCookie({ ...host, showId }) }
            : {}),
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
