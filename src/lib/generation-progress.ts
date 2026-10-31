import type { GenerationJob } from "@/server/contracts";

const PHASE_COPY = {
  "thread-started": "Authoring thread started",
  "turn-started": "Codex began writing this idea",
  "source-returned": "Source returned for independent checks",
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
    .slice(-3)
    .map((item) => ({
      key: `${item.attempt}-${item.phase}`,
      label: PHASE_COPY[item.phase],
      attempt: item.attempt,
      at: item.at,
      seconds: Math.floor((Date.parse(item.at) - started) / 1000),
    }));
}
