"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Code2,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { Modal } from "./Modal";
import { api, errorMessage, shortHash } from "@/lib/api";
import { ruleCredit } from "@/lib/rule-copy";
import type {
  ActivationMode,
  HostShowResponse,
  ShowState,
} from "@/server/contracts";
import type { LibraryEntry } from "@/server/library";

type SavedLaw = Omit<
  LibraryEntry,
  "source" | "sourceCandidateId" | "sourceShowId"
>;

export function LawLibrary({
  open,
  onClose,
  showId,
  mode,
  disabled,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  showId: string;
  mode: ActivationMode;
  disabled: boolean;
  onImported: (show: ShowState) => void;
}) {
  const [entries, setEntries] = useState<SavedLaw[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected(null);
    void api<{ entries: SavedLaw[] }>(
      "/api/library",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (alive) setEntries(result.entries);
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, attempt]);

  const importLaw = async (entry: SavedLaw) => {
    if (busy || disabled) return;
    setBusy(entry.id);
    setError(null);
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${showId}/library/import`,
        { entryId: entry.id, mode },
      );
      onImported(result.show);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const inspectSource = async (entry: SavedLaw) => {
    setBusy(`source-${entry.id}`);
    setError(null);
    try {
      const result = await api<{ entry: LibraryEntry }>(
        `/api/library/${entry.id}`,
      );
      setSelected(result.entry);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="A law worth coming back to."
      eyebrow="YOUR LAW LIBRARY"
      wide
    >
      <p className="modal-copy">
        Saved exact-source versions travel between your shows. Importing makes
        no model call: the source and its{" "}
        {mode === "append"
          ? "combination with your current laws"
          : "replacement world"}{" "}
        are tested against the current engine, then await a fresh preview and
        approval.
      </p>
      {error && (
        <div className="notice notice-error" role="alert">
          <div>{error}</div>
          <button
            className="button button-outline button-small"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry library
          </button>
        </div>
      )}
      {loading ? (
        <p className="modal-copy" role="status">
          <LoaderCircle size={18} className="spinner" /> Opening your saved
          laws…
        </p>
      ) : entries.length ? (
        <div className="library-grid">
          {entries.map((entry) => (
            <article key={entry.id} className="library-card">
              <div className="library-heading">
                <span className="pill pill-mint">
                  <Sparkles size={11} /> SAVED SOURCE
                </span>
                <code>{shortHash(entry.sourceHash)}</code>
              </div>
              <h3>{entry.name}</h3>
              <p>{entry.description}</p>
              <span className="library-credit">{ruleCredit(entry)}</span>
              <dl>
                <div>
                  <dt>Saved</dt>
                  <dd>{new Date(entry.savedAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt>Original engine</dt>
                  <dd>{entry.originalEngineVersion}</dd>
                </div>
              </dl>
              <div className="button-group">
                <button
                  className="button button-outline button-small"
                  disabled={Boolean(busy)}
                  onClick={() => void inspectSource(entry)}
                >
                  <Code2 size={14} /> Exact source
                </button>
                <button
                  className="button button-primary button-small"
                  disabled={disabled || Boolean(busy)}
                  onClick={() => void importLaw(entry)}
                >
                  {busy === entry.id ? (
                    <LoaderCircle size={14} className="spinner" />
                  ) : (
                    <ArrowRight size={14} />
                  )}{" "}
                  Import for review
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-forge">
            <BookOpen size={30} />
            <h3>Your favorite possibilities belong here.</h3>
            <p>
              Save an approved law from your studio. Its exact source, original
              contributor and generation provenance stay with it.
            </p>
          </div>
        )
      )}
      {disabled && (
        <p className="modal-copy">
          Imports unlock when the current action finishes and the world can
          accept your chosen law plan.
        </p>
      )}
      {selected && (
        <section className="library-source">
          <p className="field-label">{selected.name} · exact saved source</p>
          <p className="mono">SHA-256 {selected.sourceHash}</p>
          <pre>
            <code>{selected.source}</code>
          </pre>
        </section>
      )}
      <div className="modal-actions">
        <button
          className="button button-outline"
          disabled={Boolean(busy)}
          onClick={onClose}
        >
          Back to the studio
        </button>
      </div>
    </Modal>
  );
}
