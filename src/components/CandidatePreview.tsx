"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  CircleCheck,
  FlaskConical,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { GameViewport, type GameViewportHandle } from "./GameViewport";
import { Modal } from "./Modal";
import { StatusChip } from "./StatusChip";
import type { Candidate, Proposal } from "@/server/contracts";
import type {
  GameCheckpoint,
  RuleProgram,
  VerificationReport,
} from "@/game/contracts";
import { errorMessage } from "@/lib/api";
import { isSampleLaw, ruleCredit, ruleDescription } from "@/lib/rule-copy";

export function CandidatePreview({
  open,
  onClose,
  candidate,
  proposal,
  baseline,
  onApprove,
  onReject,
  onRevise,
  busy = false,
  existingCandidates = [],
}: {
  open: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  proposal?: Proposal;
  baseline: GameCheckpoint | null;
  onApprove: (checkpoint: GameCheckpoint) => Promise<void>;
  onReject: () => Promise<void>;
  onRevise: (revision: string) => Promise<void>;
  busy?: boolean;
  existingCandidates?: Candidate[];
}) {
  if (!candidate) return null;
  return (
    <Modal open={open} onClose={onClose} title={candidate.program.name} wide>
      <PreviewContent
        key={candidate.composition?.compositionHash || candidate.sourceHash}
        candidate={candidate}
        proposal={proposal}
        baseline={baseline}
        onApprove={onApprove}
        onReject={onReject}
        onRevise={onRevise}
        onClose={onClose}
        busy={busy}
        existingCandidates={existingCandidates}
      />
    </Modal>
  );
}

function PreviewContent({
  candidate,
  proposal,
  baseline,
  onApprove,
  onReject,
  onRevise,
  busy,
  existingCandidates,
}: {
  candidate: Candidate;
  proposal?: Proposal;
  baseline: GameCheckpoint | null;
  onApprove: (checkpoint: GameCheckpoint) => Promise<void>;
  onReject: () => Promise<void>;
  onRevise: (revision: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
  existingCandidates: Candidate[];
}) {
  const game = useRef<GameViewportHandle>(null);
  const [comparison, setComparison] = useState<"candidate" | "baseline">(
    "candidate",
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [revision, setRevision] = useState("");
  const runtimeProgram = candidate.composition?.program || candidate.program;
  const runtimeHash =
    candidate.composition?.artifactHash || candidate.sourceHash;
  const report = candidate.composition?.verification || candidate.verification;
  const initialize = () => {
    if (baseline) game.current?.restore(baseline);
    game.current?.activate(runtimeProgram, runtimeHash);
  };
  const compare = (mode: "candidate" | "baseline") => {
    setComparison(mode);
    setReady(false);
    if (baseline) game.current?.restore(baseline);
    else game.current?.reset();
    if (mode === "candidate")
      game.current?.activate(runtimeProgram, runtimeHash);
  };
  const approve = async () => {
    try {
      if (!game.current) return;
      const checkpoint = await game.current.checkpoint();
      if (checkpoint.artifactHash !== runtimeHash)
        throw new Error(
          "Return to the candidate view before approving this version.",
        );
      await onApprove(checkpoint);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <>
      {error && (
        <div role="alert" className="notice notice-error">
          <X size={15} />
          <div>{error}</div>
        </div>
      )}
      <div className="preview-grid">
        <div className="preview-game">
          <div className="preview-switch">
            <button
              className={comparison === "baseline" ? "active" : ""}
              aria-pressed={comparison === "baseline"}
              onClick={() => compare("baseline")}
            >
              Original
            </button>
            <button
              className={comparison === "candidate" ? "active" : ""}
              aria-pressed={comparison === "candidate"}
              onClick={() => compare("candidate")}
            >
              <FlaskConical size={13} /> With law
            </button>
          </div>
          <GameViewport
            ref={game}
            preview
            onReady={initialize}
            onSnapshot={(snapshot) => {
              if (snapshot.activeHash === runtimeHash) setReady(true);
            }}
            onFault={setError}
          />
        </div>
        <div className="preview-details">
          {(isSampleLaw(proposal) ||
            candidate.provenance?.kind === "reused-generation" ||
            candidate.provenance?.kind === "library-import") && (
            <StatusChip variant="warm">Sample</StatusChip>
          )}
          <p>
            {ruleDescription(
              candidate.program.description,
              candidate.sourceHash,
            )}
          </p>
          {ruleCredit(proposal) && (
            <p className="preview-attribution">{ruleCredit(proposal)}</p>
          )}
          {candidate.composition && (
            <details className="preview-combination">
              <summary>
                {candidate.composition.mode === "append"
                  ? "Law stack"
                  : "Replacement"}
              </summary>
              <ol>
                {candidate.composition.members.map((member) => {
                  const item =
                    member.candidateId === candidate.id
                      ? candidate
                      : existingCandidates.find(
                          (entry) => entry.id === member.candidateId,
                        );
                  return (
                    <li key={member.candidateId}>
                      <span>
                        {item?.program.name || "Previously approved law"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}
          {proposal?.ancestry?.kind === "adaptation" && (
            <details className="preview-combination">
              <summary>Original idea</summary>
              <p>{proposal.ancestry.originalText}</p>
            </details>
          )}
          <details className="verification-disclosure">
            <summary className="chip status-chip status-chip--good">
              <CircleCheck size={14} /> Verified
            </summary>
            <VerificationChecks report={report} />
            <dl className="evidence-meta">
              <div>
                <dt>Source SHA-256</dt>
                <dd>{candidate.sourceHash}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>{report.engineVersion}</dd>
              </div>
              <div>
                <dt>Ticks simulated</dt>
                <dd>{report.ticksSimulated.toLocaleString()}</dd>
              </div>
            </dl>
          </details>
        </div>
      </div>
      {revising && (
        <form
          style={{ marginTop: 20 }}
          onSubmit={(event) => {
            event.preventDefault();
            void onRevise(revision).catch((e) => setError(errorMessage(e)));
          }}
        >
          <label className="field-label" htmlFor="rule-revision">
            Revision
          </label>
          <textarea
            id="rule-revision"
            className="proposal-textarea"
            maxLength={500}
            minLength={8}
            required
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            placeholder="Keep the same idea, but make the surface disappear immediately when the prop moves."
          />
          <div className="proposal-form-footer">
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => setRevising(false)}
            >
              Cancel revision
            </button>
            <button
              className="button button-outline button-small"
              type="submit"
              disabled={busy || revision.trim().length < 8}
            >
              Forge revision <ArrowRight size={13} />
            </button>
          </div>
        </form>
      )}
      <div className="preview-decision">
        <div className="button-group">
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() =>
              void onReject().catch((e) => setError(errorMessage(e)))
            }
          >
            Reject
          </button>
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => setRevising((value) => !value)}
          >
            Revise
          </button>
          <button
            className="button button-primary"
            disabled={
              busy ||
              !ready ||
              comparison !== "candidate" ||
              !candidate.verification.passed
            }
            onClick={approve}
          >
            {busy ? (
              <LoaderCircle size={16} className="spinner" />
            ) : (
              <ShieldCheck size={16} />
            )}{" "}
            Approve <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export function VerificationChecks({
  report,
  compact = false,
}: {
  report: VerificationReport;
  compact?: boolean;
}) {
  return (
    <ul className="verification-list">
      {report.checks.map((check) => (
        <li key={check.name} className={check.passed ? "" : "failed"}>
          {check.passed ? <CircleCheck size={15} /> : <X size={15} />}
          <div>
            <strong>{check.name}</strong>
            {!compact && <span>{check.detail}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SamplePreview({
  open,
  onClose,
  program,
}: {
  open: boolean;
  onClose: () => void;
  program: RuleProgram;
}) {
  return (
    <Modal open={open} onClose={onClose} title={program.name} wide>
      <div className="preview-grid">
        <div className="preview-game">
          <GameViewport
            program={program}
            artifactHash="practice-example"
            preview
          />
        </div>
        <div className="preview-details">
          <StatusChip variant="warm">Sample</StatusChip>
          <p>{program.description}</p>
        </div>
      </div>
      <div className="modal-actions">
        <button className="button button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
