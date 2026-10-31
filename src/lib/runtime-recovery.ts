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

/** Retries the same fault with one durable receipt; server revision/hash checks fence late reports. */
export async function retireFaultedLaw(
  target: RuntimeRecoveryTarget,
  fault: WorkerRuntimeFaultContext,
  message: string,
): Promise<HostShowResponse> {
  if (fault.artifactHash !== target.artifactHash)
    throw new Error(
      "The fault belongs to a different law. Reload the saved world before resuming.",
    );
  let revision = target.revision;
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = `fault-${target.showId}-${revision}-${target.epoch}-${fault.tick}-${target.artifactHash.slice(0, 8)}`;
    try {
      return await api<HostShowResponse>(
        `/api/shows/${target.showId}/rollback`,
        {
          clientId: target.clientId,
          epoch: target.epoch,
          expectedRevision: revision,
          faultedSourceHash: target.artifactHash,
          runtimeFaultReason: message.slice(0, 280),
        },
        undefined,
        { idempotencyKey: key },
      );
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) throw error;
      const latest = await api<HostShowResponse>("/api/shows/current");
      if (latest.show.id !== target.showId) throw error;
      const active = latest.show.candidates.find(
        (candidate) => candidate.id === latest.show.activeCandidateId,
      );
      // A delayed report may restore current state, but can never retire a newer law.
      if (
        active?.sourceHash !== target.artifactHash ||
        active.id !== target.candidateId
      )
        return latest;
      if (
        latest.show.lease?.clientId !== target.clientId ||
        latest.show.lease?.epoch !== target.epoch ||
        latest.show.lease.expiresAt <= Date.now() ||
        latest.show.revision === revision ||
        attempt === 1
      )
        throw error;
      revision = latest.show.revision;
    }
  }
  throw new Error("Recovery needs another connection attempt.");
}
