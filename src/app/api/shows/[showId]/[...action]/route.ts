import {
  generationRequest,
  reserveGenerationQuota,
} from "@/server/generation-quota";
import { after } from "next/server";
import {
  addProposal,
  acquireLease,
  activateCandidate,
  approveCandidate,
  cancelGeneration,
  createGeneration,
  event,
  hostView,
  setTwitchHealth,
  ingestTwitch,
  importPracticeSample,
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
      { job, show: hostView(show) },
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
    const path = action.join("/");
    let sandboxAuthentication: SandboxCredentials | undefined;
    let generationMetadata:
      | {
          jobId: string;
          requestHash: string;
          quotaDay?: string;
          quotaExempt?: boolean;
        }
      | undefined;
    let jobToRun: string | undefined;
    let stopName: string | undefined;
    if (path === "twitch/events") await maintainTwitchSession(owned);
    if (path === "generate") {
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
      await mutate(showId, host.hostId, idempotency, (show) => {
        rate(show, "twitch-session", 8, 60_000);
        return { requested: true };
      });
      assert(
        typeof body.sessionId === "string",
        400,
        "twitch_session",
        "Open a Twitch WebSocket connection first.",
      );
      await connectTwitchSession(
        showId,
        host.hostId,
        body.sessionId,
        body.reconnect === true,
      );
    } else {
      const result = await mutate(showId, host.hostId, idempotency, (show) => {
        if (path === "resume") return { resumed: true };
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
          const proposal = show.proposals.find((p) => p.id === action[1]);
          assert(proposal, 404, "proposal_not_found", "Proposal not found.");
          assert(
            body.status === "hidden" || body.status === "open",
            400,
            "moderation_status",
            "Choose hidden or open.",
          );
          proposal.status = body.status;
          event(
            show,
            "private.proposal.moderated",
            "The host moderated a proposal.",
            { proposalId: proposal.id },
          );
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
          );
          return { candidateId: candidate.id };
        }
        assert(false, 404, "route_not_found", "Endpoint not found.");
      });
      if (path === "generate") jobToRun = (result as { jobId: string }).jobId;
      if (path.endsWith("/cancel"))
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
    return Response.json(
      {
        show: hostView(show),
        ...(jobToRun ? { job: show.jobs.find((j) => j.id === jobToRun) } : {}),
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
