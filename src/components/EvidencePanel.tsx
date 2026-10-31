"use client";
import { useState } from "react";
import { Code2, Download, FileCheck2, GitBranch } from "lucide-react";
import { Modal } from "./Modal";
import { VerificationChecks } from "./CandidatePreview";
import type { Candidate, ShowState } from "@/server/contracts";

export function downloadEvidence(show: ShowState, candidate: Candidate) {
  const proposal = show.proposals.find(
    (item) => item.id === candidate.proposalId,
  );
  const job = show.jobs.find((item) => item.id === candidate.jobId);
  const bundle = {
    format: "liveforge.evidence/1",
    exportedAt: new Date().toISOString(),
    mode: show.mode,
    proposal: proposal
      ? {
          id: proposal.id,
          text: proposal.text,
          author: proposal.author,
          origin: proposal.origin,
          createdAt: proposal.createdAt,
        }
      : null,
    generation: job
      ? {
          id: job.id,
          model: job.model,
          threadId: job.threadId,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          attempt: job.attempt,
          usage: job.usage,
        }
      : null,
    candidate: {
      id: candidate.id,
      source: candidate.source,
      sourceHash: candidate.sourceHash,
      program: candidate.program,
      programHash: candidate.programHash,
      verification: candidate.verification,
      approvedAt: candidate.approvedAt,
      activatedAt: candidate.activatedAt,
    },
    events: show.events.filter(
      (event) =>
        event.candidateId === candidate.id ||
        event.proposalId === candidate.proposalId,
    ),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `liveforge-${candidate.sourceHash.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EvidencePanel({
  open,
  onClose,
  show,
  candidate,
}: {
  open: boolean;
  onClose: () => void;
  show: ShowState;
  candidate?: Candidate | null;
}) {
  const [tab, setTab] = useState<"story" | "source" | "checks">("story");
  const selected = candidate || show.candidates.at(-1);
  const job = selected && show.jobs.find((item) => item.id === selected.jobId);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Every law has a story."
      eyebrow="THE EVIDENCE DRAWER"
      wide
    >
      <div
        className="evidence-tabs"
        role="tablist"
        aria-label="Evidence sections"
      >
        {(
          [
            ["story", GitBranch, "Lineage"],
            ["source", Code2, "Source"],
            ["checks", FileCheck2, "Verification"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      {tab === "story" && (
        <div role="tabpanel">
          <p className="modal-copy">
            These events record what this show actually did. Practice events
            remain labeled; no viewer activity is simulated.
          </p>
          <dl className="evidence-meta">
            <div>
              <dt>Show</dt>
              <dd>{show.id}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>
                {show.mode === "practice"
                  ? "Local practice / host-authored ideas"
                  : `Twitch / ${show.twitch.channelLogin || "awaiting connection"}`}
              </dd>
            </div>
            {selected && (
              <>
                <div>
                  <dt>Source SHA-256</dt>
                  <dd>{selected.sourceHash}</dd>
                </div>
                <div>
                  <dt>Program SHA-256</dt>
                  <dd>{selected.programHash}</dd>
                </div>
              </>
            )}
            {job && (
              <>
                <div>
                  <dt>Generation model</dt>
                  <dd>{job.model}</dd>
                </div>
                <div>
                  <dt>Actual Codex thread</dt>
                  <dd>{job.threadId || "Not returned by this job yet"}</dd>
                </div>
              </>
            )}
          </dl>
          <ul className="evidence-timeline">
            {show.events
              .slice()
              .reverse()
              .slice(0, 30)
              .map((event) => (
                <li key={event.id}>
                  <span className="timeline-dot" />
                  <div>
                    <p>{event.message}</p>
                    <time dateTime={event.at}>
                      {new Date(event.at).toLocaleString()}
                    </time>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}
      {tab === "source" && (
        <div role="tabpanel">
          {selected ? (
            <>
              <p className="modal-copy">
                Codex generated this TypeScript literal. The compiler accepts a
                bounded rule language; imports, functions, loops, and arbitrary
                JavaScript are rejected.
              </p>
              <pre className="evidence-source">
                <code>{selected.source}</code>
              </pre>
            </>
          ) : (
            <div className="evidence-empty">
              Your first completed generation will appear here, with its exact
              source and hash.
            </div>
          )}
        </div>
      )}
      {tab === "checks" && (
        <div role="tabpanel">
          {selected ? (
            <>
              <p className="modal-copy">
                {selected.verification.summary} These checks run in the trusted
                verifier, independently of the generated artifact.
              </p>
              <VerificationChecks report={selected.verification} />
              <dl className="evidence-meta">
                <div>
                  <dt>Engine</dt>
                  <dd>{selected.verification.engineVersion}</dd>
                </div>
                <div>
                  <dt>Ticks simulated</dt>
                  <dd>
                    {selected.verification.ticksSimulated.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="evidence-empty">
              There is no generated candidate to verify yet. The baseline game
              remains playable.
            </div>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button
          className="button button-outline"
          disabled={!selected}
          onClick={() => selected && downloadEvidence(show, selected)}
        >
          <Download size={15} /> Export evidence
        </button>
        <button className="button button-primary" onClick={onClose}>
          Back to the world
        </button>
      </div>
    </Modal>
  );
}
