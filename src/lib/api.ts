export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? undefined
          : {
              "Content-Type": "application/json",
              "x-idempotency-key": crypto.randomUUID(),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        data.message ||
        data.error?.message ||
        "The request could not be completed. Please try again.";
      throw new ApiError(
        message,
        response.status,
        data.code ||
          data.error?.code ||
          (typeof data.error === "string" ? data.error : undefined),
      );
    }
    return data as T;
  } catch (error) {
    if (timedOut)
      throw new ApiError(
        "The connection is taking longer than expected. Please retry; your saved show is preserved.",
        408,
        "REQUEST_TIMEOUT",
      );
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError(
      "We couldn’t reach the studio. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", abort);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something interrupted this step. Please try again.";
}

export function shortHash(hash: string): string {
  return hash.slice(0, 10);
}
export function elapsed(from: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(from)) / 1000),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
