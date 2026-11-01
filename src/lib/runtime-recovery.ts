import { api, ApiError } from "./api";
import type { WorkerRuntimeFaultContext } from "@/game/contracts";
import type { HostShowResponse } from "@/server/contracts";

export interface RuntimeRecoveryTarget {
  showId: string;
  revision: number;
  artifactHash: string;
  candidateId: string | null;
  clientId: string;
  epoch: number;
}

/** One attempt per user action; a conflict never causes another automatic retirement. */
export async function retireFaultedLaw(
  target: RuntimeRecoveryTarget,
  fault: WorkerRuntimeFaultContext,
  message: string,
  options: { retireAllLaws?: boolean } = {},
): Promise<HostShowResponse> {
  if (fault.artifactHash !== target.artifactHash)
    throw new Error(
      "The fault belongs to a different law. Reload the saved world before resuming.",
    );
  const key = `fault-${target.showId}-${target.revision}-${target.epoch}-${fault.tick}-${target.artifactHash.slice(0, 8)}${options.retireAllLaws ? "-all" : ""}`;
  try {
    return await api<HostShowResponse>(
      `/api/shows/${target.showId}/rollback`,
      {
        clientId: target.clientId,
        epoch: target.epoch,
        expectedRevision: target.revision,
        faultedArtifactHash: target.artifactHash,
        runtimeFaultReason: message.slice(0, 280),
        ...(options.retireAllLaws ? { retireAllLaws: true } : {}),
      },
      undefined,
      { idempotencyKey: key },
    );
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
    const latest = await api<HostShowResponse>("/api/shows/current").catch(
      () => {
        throw error;
      },
    );
    if (latest.show.id !== target.showId) throw error;
    const active = latest.show.candidates.find(
      (candidate) => candidate.id === latest.show.activeCandidateId,
    );
    const runtimeHash =
      latest.show.activeArtifactHash ??
      latest.show.checkpoint?.artifactHash ??
      active?.sourceHash;
    // A delayed report may restore current state, but can never retire a newer law.
    if (
      runtimeHash !== target.artifactHash ||
      active?.id !== target.candidateId
    )
      return latest;
    throw error;
  }
}

/** Explicit recovery refreshes the revision, but cannot retire a different, newer law. */
export async function continueWithoutLaws(
  target: RuntimeRecoveryTarget,
  fault: WorkerRuntimeFaultContext,
  message: string,
): Promise<HostShowResponse> {
  const latest = await api<HostShowResponse>("/api/shows/current");
  if (latest.show.id !== target.showId)
    throw new Error("The open show changed. Reload it before continuing.");
  const active = latest.show.candidates.find(
    (candidate) => candidate.id === latest.show.activeCandidateId,
  );
  const runtimeHash =
    latest.show.activeArtifactHash ??
    latest.show.checkpoint?.artifactHash ??
    active?.sourceHash;
  if (runtimeHash !== target.artifactHash || active?.id !== target.candidateId)
    return latest;
  return retireFaultedLaw(
    { ...target, revision: latest.show.revision },
    fault,
    message,
    { retireAllLaws: true },
  );
}
