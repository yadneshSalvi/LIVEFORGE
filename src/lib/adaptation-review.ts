import type { ProposalAncestry } from "@/server/contracts";

export interface AlternativeRequest {
  showId: string;
  jobId: string;
  idempotencyKey: string;
  body: {
    text: string;
    expectedRevision: number;
    expectedJobUpdatedAt: string;
  };
}

/** A slow save response must not put an older world over a newer polled revision. */
export function keepNewerReviewState<
  T extends { id: string; revision: number },
>(current: T | null, received: T): T {
  return current?.id === received.id && current.revision > received.revision
    ? current
    : received;
}

/** Display normalization only; the server independently validates and moderates. */
export function normalizeAlternative(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function alternativeSource(
  text: string,
  suggestion?: string,
): NonNullable<ProposalAncestry["adaptationSource"]> {
  const original = normalizeAlternative(suggestion || "");
  if (!original) return "host-written";
  return normalizeAlternative(text) === original
    ? "model-suggested"
    : "host-edited";
}

/** An uncertain response must retry the exact command, including its old state tokens. */
export function alternativeRequest(
  previous: AlternativeRequest | null,
  input: {
    showId: string;
    jobId: string;
    text: string;
    revision: number;
    jobUpdatedAt: string;
  },
  createKey: () => string = () => crypto.randomUUID(),
): AlternativeRequest {
  const text = normalizeAlternative(input.text);
  if (
    previous?.showId === input.showId &&
    previous.jobId === input.jobId &&
    previous.body.text === text
  )
    return previous;
  return {
    showId: input.showId,
    jobId: input.jobId,
    idempotencyKey: createKey(),
    body: {
      text,
      expectedRevision: input.revision,
      expectedJobUpdatedAt: input.jobUpdatedAt,
    },
  };
}
