"use client";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Code2, LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { StatusChip } from "./StatusChip";
import { api, errorMessage } from "@/lib/api";
import { isSampleLaw, ruleCredit } from "@/lib/rule-copy";
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
      title="Law library"
      wide
    >
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
          <LoaderCircle size={18} className="spinner" /> Loading…
        </p>
      ) : entries.length ? (
        <div className="library-grid">
          {entries.map((entry) => (
            <article key={entry.id} className="library-card">
              {isSampleLaw({ ...entry, origin: "library" }) && (
                <StatusChip>Sample</StatusChip>
              )}
              <h3>{entry.name}</h3>
              <p>{entry.description}</p>
              <span className="library-credit">{ruleCredit(entry)}</span>
              <div className="button-group">
                <button
                  className="button button-outline button-small"
                  disabled={Boolean(busy)}
                  onClick={() => void inspectSource(entry)}
                >
                  <Code2 size={14} /> Source
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
                  Import
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="empty-forge">
            <BookOpen size={30} />
            <p>No saved laws yet</p>
          </div>
        )
      )}
      {selected && (
        <section className="library-source">
          <p className="field-label">{selected.name} · exact saved source</p>
          <p className="mono">SHA-256 {selected.sourceHash}</p>
          <p className="mono">Engine {selected.engineVersion}</p>
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
          Close
        </button>
      </div>
    </Modal>
  );
}
