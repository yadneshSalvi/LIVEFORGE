import type { GenerationJob } from "@/server/contracts";

const PHASE_COPY = {
  "snapshot-restored": "Clean dependency snapshot restored",
  "workspace-ready": "Isolated authoring workspace ready",
  "thread-started": "Authoring thread started",
  "turn-started": "Codex began writing this idea",
  "source-returned": "Source returned for independent checks",
  "verifier-started": "Independent gameplay checks started",
  "verification-complete": "Independent gameplay checks complete",
} as const;

/** Render only recorded, allowlisted milestones; model text is never a progress label. */
export function generationMilestones(job: {
  createdAt?: string;
  phases?: GenerationJob["phases"];
}) {
  const started = Date.parse(job.createdAt || "");
  if (!Number.isFinite(started)) return [];
  return (job.phases || [])
    .filter(
      (item) =>
        Object.hasOwn(PHASE_COPY, item.phase) &&
        Number.isInteger(item.attempt) &&
        item.attempt >= 1 &&
        item.attempt <= 3 &&
        Number.isFinite(Date.parse(item.at)) &&
        Date.parse(item.at) >= started,
    )
    .slice(-5)
    .map((item) => ({
      key: `${item.attempt}-${item.phase}`,
      label:
        item.phase === "verification-complete" &&
        Number.isInteger(item.checksPassed) &&
        Number.isInteger(item.totalChecks) &&
        item.totalChecks! >= 1 &&
        item.totalChecks! <= 32 &&
        item.checksPassed! >= 0 &&
        item.checksPassed! <= item.totalChecks!
          ? `${PHASE_COPY[item.phase]} (${item.checksPassed}/${item.totalChecks} passed)`
          : PHASE_COPY[item.phase],
      attempt: item.attempt,
      at: item.at,
      seconds: Math.floor((Date.parse(item.at) - started) / 1000),
    }));
}
