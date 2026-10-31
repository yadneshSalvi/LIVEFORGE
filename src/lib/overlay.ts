import type { PublicShowState } from "@/server/contracts";
import { generationMilestones } from "./generation-progress";

const PHASES = {
  queued: "An idea is on its way",
  starting: "Preparing the forge",
  generating: "Codex is writing the law",
  verifying: "Testing the new possibility",
  ready: "The creator is reviewing",
  failed: "That idea needs another approach",
  cancelled: "The creator stopped this attempt",
  stale: "The world changed; ready for another idea",
  rejected: "The creator is refining the idea",
} as const;

/** Only trusted phase labels and approved law descriptions belong on a broadcast. */
export function overlayView(show: PublicShowState, now = Date.now()) {
  const ranked = show.proposals
    .filter((proposal) => !["hidden", "rejected"].includes(proposal.status))
    .slice()
    .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 3);
  const maxVotes = Math.max(1, ...ranked.map((proposal) => proposal.votes));
  const job = show.generation;
  const milestones = job ? generationMilestones(job) : [];
  const working = Boolean(
    job &&
    ["queued", "starting", "generating", "verifying"].includes(job.status),
  );
  const startedAt = Date.parse(job?.createdAt || "");
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : null;
  const laws =
    show.activeLaws ||
    (show.active ? [{ ...show.active, origin: "twitch" as const }] : []);
  const recent = show.events
    .slice()
    .reverse()
    .find((event) =>
      ["candidate.approved", "candidate.activated", "world.rollback"].includes(
        event.type,
      ),
    );
  const moment =
    recent?.type === "world.rollback"
      ? "Previous world restored"
      : recent?.type === "candidate.activated"
        ? "A new possibility is live"
        : recent?.type === "candidate.approved"
          ? "A law is approved for the world"
          : null;
  return {
    ranked,
    maxVotes,
    laws,
    working,
    elapsedSeconds,
    moment,
    milestones,
    phase: job
      ? show.phase === "live" && job.status === "ready"
        ? "A community law is live"
        : job.status === "generating" && milestones.length
          ? milestones.at(-1)!.label
          : PHASES[job.status]
      : show.votingOpen
        ? "The next idea could be yours"
        : "The creator is choosing",
  };
}

export function overlayDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
