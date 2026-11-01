"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
import { api, errorMessage } from "@/lib/api";
import type { HostShowResponse, ShowState } from "@/server/contracts";

export function ModerationPanel({
  open,
  onClose,
  show,
  repliesAuthorized,
  disabled,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  show: ShowState;
  repliesAuthorized: boolean;
  disabled: boolean;
  onUpdated: (show: ShowState) => void;
}) {
  const [blockedTerms, setBlockedTerms] = useState("");
  const [replies, setReplies] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"open" | "hidden" | "rejected">(
    "hidden",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!open) return;
    setBlockedTerms((show.settings?.blockedTerms || []).join("\n"));
    setReplies(show.settings?.chatRepliesEnabled || false);
    setSelectedId(null);
    setError(null);
    setSaved(false);
    // Drafts remain editable while routine host polling refreshes the same show.
  }, [open, show.id]);
  const selected = show.proposals.find(
    (proposal) => proposal.id === selectedId,
  );
  const submit = async (path: string, body: unknown) => {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/${path}`,
        body,
      );
      onUpdated(result.show);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Moderation"
      wide
    >
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="notice notice-success" role="status">
          <Check size={16} /> Saved
        </div>
      )}
      <div className="moderation-grid">
        <section className="moderation-settings">
          <h3>Settings</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit("settings", {
                blockedTerms: blockedTerms
                  .split(/\r?\n/)
                  .map((term) => term.trim())
                  .filter(Boolean),
                chatRepliesEnabled: replies,
              });
            }}
          >
            <label className="field-label" htmlFor="blocked-terms">
              Blocked terms · one per line
            </label>
            <textarea
              id="blocked-terms"
              className="proposal-textarea"
              value={blockedTerms}
              disabled={busy || disabled}
              onChange={(event) => {
                setBlockedTerms(event.target.value);
                setSaved(false);
              }}
              rows={5}
              maxLength={2500}
              placeholder="Blocked phrase"
            />
            <p className="rail-footnote">
              Blocked terms and reasons stay private.
            </p>
            <div className="reply-settings">
              <label>
                <input
                  type="checkbox"
                  checked={replies}
                  disabled={
                    busy ||
                    disabled ||
                    (!replies && (!repliesAuthorized || show.mode !== "twitch"))
                  }
                  onChange={(event) => {
                    setReplies(event.target.checked);
                    setSaved(false);
                  }}
                />
                <span>Allow chat replies</span>
              </label>
              <p>
                Replies post as your account and may appear in Shared Chat. Off
                by default; rate limited.
              </p>
              {show.mode !== "twitch" ? (
                <p>Twitch show required</p>
              ) : (
                !repliesAuthorized && (
                  <a
                    className="button button-outline button-small"
                    href={`/api/auth/twitch/login?showId=${show.id}&writeChat=1`}
                  >
                    Authorize replies <ArrowUpRight size={13} />
                  </a>
                )
              )}
            </div>
            <button
              className="button button-primary"
              disabled={busy || disabled}
              type="submit"
            >
              <ShieldCheck size={15} /> Save settings
            </button>
          </form>
        </section>
        <section className="moderation-proposals">
          <h3>Review an idea</h3>
          <div className="moderation-list">
            {show.proposals.length ? (
              show.proposals
                .slice()
                .reverse()
                .map((proposal) => (
                  <button
                    key={proposal.id}
                    className={selectedId === proposal.id ? "selected" : ""}
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(proposal.id);
                      setDecision(
                        proposal.status === "rejected"
                          ? "rejected"
                          : proposal.status === "hidden"
                            ? "hidden"
                            : "open",
                      );
                      setReason(proposal.moderationReason || "");
                      setSaved(false);
                    }}
                  >
                    <b>{proposal.id}</b>
                    <span>{proposal.text}</span>
                    <small>{proposal.status}</small>
                  </button>
                ))
            ) : (
              <p className="modal-copy">No ideas yet</p>
            )}
          </div>
          {selected && (
            <form
              className="moderation-decision"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(`proposals/${selected.id}/moderate`, {
                  status: decision,
                  reason: reason.trim() || undefined,
                });
              }}
            >
              <div className="moderation-original">
                <p>{selected.text}</p>
                <span>{selected.author}</span>
              </div>
              <label className="field-label" htmlFor="moderation-decision">
                Decision for {selected.id}
              </label>
              <select
                id="moderation-decision"
                className="dialog-field"
                value={decision}
                disabled={busy || disabled}
                onChange={(event) =>
                  setDecision(event.target.value as typeof decision)
                }
              >
                <option value="open">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="rejected">Rejected</option>
              </select>
              <label className="field-label" htmlFor="moderation-reason">
                Private reason · optional
              </label>
              <textarea
                id="moderation-reason"
                className="proposal-textarea"
                rows={2}
                maxLength={280}
                value={reason}
                disabled={busy || disabled}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                className="button button-outline"
                disabled={busy || disabled}
                type="submit"
              >
                Apply moderation
              </button>
            </form>
          )}
        </section>
      </div>
      <div className="modal-actions">
        <button
          className="button button-outline"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
