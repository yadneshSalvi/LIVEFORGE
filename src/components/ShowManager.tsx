"use client";
import { useEffect, useState } from "react";
import { ArrowRight, FlaskConical, LoaderCircle, Radio } from "lucide-react";
import { Modal } from "./Modal";
import { StatusChip } from "./StatusChip";
import { api, errorMessage } from "@/lib/api";
import type { HostShowResponse, ShowMode, ShowState } from "@/server/contracts";
interface Summary {
  id: string;
  mode: ShowMode;
  updatedAt: string;
  phase: string;
  activeRule: string | null;
}
export function ShowManager({
  open,
  onClose,
  currentId,
  onResume,
  onCreate,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  onResume: (show: ShowState) => Promise<void>;
  onCreate: (mode: ShowMode) => Promise<void>;
  disabled?: boolean;
}) {
  const [shows, setShows] = useState<Summary[]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    api<{ shows: Summary[] }>("/api/shows")
      .then((result) => {
        if (alive) setShows(result.shows);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);
  const resume = async (id: string) => {
    if (busy || disabled) return;
    setBusy(id);
    setError(null);
    try {
      const result = await api<HostShowResponse>(`/api/shows/${id}/resume`, {});
      await onResume(result.show);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const create = async (mode: ShowMode) => {
    if (busy || disabled) return;
    setBusy(mode);
    setError(null);
    try {
      await onCreate(mode);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
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
      title="Shows"
    >
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <p className="modal-copy" role="status">
          Opening…
        </p>
      )}
      {disabled && !busy && (
        <p className="modal-copy" role="status">
          Action in progress
        </p>
      )}
      <div className="show-list">
        {loading ? (
          <p className="modal-copy">Loading…</p>
        ) : (
          shows.map((show) => (
            <button
              key={show.id}
              className={`show-list-item${show.id === currentId ? " current" : ""}`}
              disabled={disabled || Boolean(busy) || show.id === currentId}
              onClick={() => void resume(show.id)}
            >
              <span className="show-list-icon">
                {show.mode === "twitch" ? (
                  <Radio size={18} />
                ) : (
                  <FlaskConical size={18} />
                )}
              </span>
              <span>
                <strong>{show.activeRule || "The Last Light"}</strong>
                <span>
                  {show.mode === "twitch" ? (
                    "Twitch show"
                  ) : (
                    <StatusChip>Practice</StatusChip>
                  )}{" "}
                  ·{" "}
                  {new Date(show.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {show.phase}
                </span>
              </span>
              {show.id === currentId ? (
                <StatusChip variant="good">Current</StatusChip>
              ) : busy === show.id ? (
                <LoaderCircle size={16} className="spinner" />
              ) : (
                <ArrowRight size={16} />
              )}
            </button>
          ))
        )}
      </div>
      <div className="modal-actions">
        <button
          className="button button-outline"
          disabled={disabled || Boolean(busy)}
          onClick={() => void create("practice")}
        >
          <FlaskConical size={15} />
          New practice
        </button>
        <button
          className="button button-primary"
          disabled={disabled || Boolean(busy)}
          onClick={() => void create("twitch")}
        >
          <Radio size={15} />
          New Twitch show
        </button>
      </div>
    </Modal>
  );
}
