"use client";
import { useId, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import {
  alternativeRequest,
  alternativeSource,
  normalizeAlternative,
  type AlternativeRequest,
} from "@/lib/adaptation-review";
import { adaptationLabel, ruleCredit } from "@/lib/rule-copy";
import type { GenerationJob, Proposal } from "@/server/contracts";

export function AdaptationComposer({
  showId,
  job,
  revision,
  original,
  accepted,
  selected,
  busy,
  disabledReason,
  onCreate,
  onSelect,
}: {
  showId: string;
  job: Pick<GenerationJob, "id" | "updatedAt" | "adaptedProposal">;
  revision: number;
  original?: Proposal;
  accepted?: Proposal;
  selected: boolean;
  busy: boolean;
  disabledReason?: string;
  onCreate: (request: AlternativeRequest) => Promise<void>;
  onSelect: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(job.adaptedProposal || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AlternativeRequest | null>(null);
  const inFlight = useRef(false);
  const normalized = normalizeAlternative(draft);
  const source = alternativeSource(draft, job.adaptedProposal);
  const hasSuggestion = Boolean(
    normalizeAlternative(job.adaptedProposal || ""),
  );
  const unavailable =
    disabledReason ||
    (!original
      ? "The original idea is unavailable. Choose another idea from the board."
      : ["hidden", "rejected"].includes(original.status)
        ? "The original idea was moderated. Restore it on the board before creating an alternative."
        : undefined);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || saving || inFlight.current || unavailable || accepted) return;
    if (normalized.length < 8 || normalized.length > 280) {
      setError("Describe your alternative in 8–280 characters.");
      return;
    }
    const request = alternativeRequest(pending.current, {
      showId,
      jobId: job.id,
      text: draft,
      revision,
      jobUpdatedAt: job.updatedAt,
    });
    pending.current = request;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onCreate(request);
      pending.current = null;
    } catch (cause) {
      // A definite validation/conflict response permits a new state-bound request.
      // Network/time-out/server failures retain the exact key and body for retry.
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408
      )
        pending.current = null;
      setError(
        cause instanceof ApiError &&
          ["stale_revision", "stale_job"].includes(cause.code || "")
          ? "The world or failed run changed. Your draft is still here. Review the current state, then try creating the alternative again."
          : errorMessage(cause),
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (accepted) {
    const moderated = ["hidden", "rejected"].includes(accepted.status);
    return (
      <section className="adaptation-card" aria-labelledby={`${id}-title`}>
        <p className="field-label">REVIEWED ALTERNATIVE · {accepted.id}</p>
        <h3 id={`${id}-title`}>
          {adaptationLabel(accepted.ancestry?.adaptationSource)} alternative
        </h3>
        <p className="adaptation-text">{accepted.text}</p>
        <p className="adaptation-credit">{ruleCredit(accepted)}</p>
        <p className="adaptation-help">
          Your original idea and failed run are preserved. This separate idea
          needs a fresh forge, preview and exact-version approval.
        </p>
        {moderated ? (
          <p className="adaptation-help" role="status">
            This alternative was moderated. Restore it on the board before
            forging.
          </p>
        ) : (
          <button
            type="button"
            className="button button-outline button-full"
            disabled={busy}
            onClick={onSelect}
          >
            {selected ? <Check size={15} /> : <ArrowRight size={15} />}
            {selected
              ? `${accepted.id} selected · go to Forge`
              : `Select ${accepted.id} to forge`}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="adaptation-card" aria-labelledby={`${id}-title`}>
      <p className="field-label">KEEP THE IDEA. CHOOSE A NEW APPROACH.</p>
      <h3 id={`${id}-title`}>
        {hasSuggestion ? "Review an alternative" : "Write an alternative"}
      </h3>
      <p className="adaptation-help">
        {hasSuggestion
          ? "Codex suggested the wording below. Review or edit it before creating a separate proposal."
          : "Codex did not suggest an alternative. You can write one using the world’s supported controls, physics and objects."}
      </p>
      {original && (
        <details className="adaptation-original">
          <summary>Request that failed · {original.id}</summary>
          <p>{original.text}</p>
          <p>{ruleCredit(original)}</p>
        </details>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <label className="field-label" htmlFor={`${id}-draft`}>
          Alternative to review
        </label>
        <textarea
          id={`${id}-draft`}
          className="proposal-textarea"
          placeholder="Describe an alternative using the controls and capabilities below."
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          disabled={busy || saving || Boolean(unavailable)}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          aria-invalid={Boolean(error)}
          minLength={8}
          maxLength={280}
          required
        />
        <div className="adaptation-draft-meta">
          <span>{adaptationLabel(source)} wording</span>
          <span>{normalized.length}/280</span>
        </div>
        <p id={`${id}-help`} className="adaptation-help">
          Only you can see this draft. Creating it publishes a separate proposal
          with the original contributor’s credit. No generation starts until you
          choose Forge.
        </p>
        {unavailable && (
          <p className="adaptation-help" role="status">
            {unavailable}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="adaptation-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button button-outline button-full"
          disabled={
            busy ||
            saving ||
            Boolean(unavailable) ||
            normalized.length < 8 ||
            normalized.length > 280
          }
        >
          {saving ? (
            <LoaderCircle className="spinner" size={15} />
          ) : (
            <ArrowRight size={15} />
          )}
          {saving
            ? "Saving reviewed alternative…"
            : "Create reviewed alternative"}
        </button>
      </form>
    </section>
  );
}
