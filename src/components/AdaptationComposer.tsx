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
      ? "Original unavailable — choose another idea."
      : ["hidden", "rejected"].includes(original.status)
        ? "Original moderated — restore it to continue."
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
          ? "World changed — review and retry. Your draft is saved."
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
        <h3 id={`${id}-title`}>
          {adaptationLabel(accepted.ancestry?.adaptationSource)} alternative
        </h3>
        <p className="adaptation-text">{accepted.text}</p>
        <p className="adaptation-credit">{ruleCredit(accepted)}</p>
        {moderated ? (
          <p className="adaptation-help" role="status">
            Alternative moderated — restore it to forge.
          </p>
        ) : (
          <button
            type="button"
            className="button button-outline button-full"
            disabled={busy}
            onClick={onSelect}
          >
            {selected ? <Check size={15} /> : <ArrowRight size={15} />}
            {selected ? `${accepted.id} selected` : `Select ${accepted.id}`}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="adaptation-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        {hasSuggestion ? "Review an alternative" : "Write an alternative"}
      </h3>
      {original && (
        <details className="adaptation-original">
          <summary>Original idea · {original.id}</summary>
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
          placeholder="Describe your alternative"
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
          Private draft. Publish a separate idea with original credit. Forge
          starts only when you choose it.
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
          {saving ? "Publishing…" : "Publish alternative"}
        </button>
      </form>
    </section>
  );
}
