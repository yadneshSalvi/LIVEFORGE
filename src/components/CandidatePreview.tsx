"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  FlaskConical,
  LoaderCircle,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { GameViewport, type GameViewportHandle } from "./GameViewport";
import { Modal } from "./Modal";
import type { Candidate, Proposal } from "@/server/contracts";
import type {
  GameCheckpoint,
  RuleProgram,
  VerificationReport,
} from "@/game/contracts";
import { errorMessage, shortHash } from "@/lib/api";
import { adaptationLabel, ruleCredit, ruleDescription } from "@/lib/rule-copy";

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
    <Modal
      open={open}
      onClose={onClose}
      title="A new law. Your call."
      eyebrow="THE PREVIEW ROOM"
      wide
    >
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
              onClick={() => compare("baseline")}
            >
              Original world
            </button>
            <button
              className={comparison === "candidate" ? "active" : ""}
              onClick={() => compare("candidate")}
            >
              <FlaskConical size={13} /> With your law
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
          <p className="preview-hint">
            Click the world to play. A / D to move · Space to jump · E to
            interact · Q to drop or pick up the ember. Your live world is paused
            while you test.
          </p>
        </div>
        <div className="preview-details">
          <p className="eyebrow">THE PROPOSED LAW</p>
          <h3>{candidate.program.name}</h3>
          <p>
            {ruleDescription(
              candidate.program.description,
              candidate.sourceHash,
            )}
          </p>
          <div className="preview-attribution">
            <span className="author-chip">
              <span className="author-avatar">
                {(proposal?.author || "H")[0].toUpperCase()}
              </span>
              {ruleCredit(proposal)}
            </span>
          </div>
          {candidate.composition && (
            <div className="preview-combination">
              <p className="field-label">
                {candidate.composition.mode === "append"
                  ? "This law joins the current world"
                  : "This law replaces the current laws"}
              </p>
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
                      <code>{shortHash(member.sourceHash)}</code>
                    </li>
                  );
                })}
              </ol>
              <p>
                The complete ordered combination was tested. Later laws take
                precedence where modifiers overlap.
              </p>
            </div>
          )}
          {proposal?.ancestry?.kind === "adaptation" && (
            <div className="preview-combination">
              <p className="field-label">
                {adaptationLabel(proposal.ancestry.adaptationSource)}{" "}
                alternative
                {" · "}original idea by {proposal.ancestry.originalAuthor}
              </p>
              <p>{proposal.ancestry.originalText}</p>
            </div>
          )}
          <VerificationChecks report={report} compact />
          <p className="preview-identity">
            VERSION {shortHash(candidate.sourceHash)}
            <br />
            ENGINE {report.engineVersion}
            <br />
            {report.ticksSimulated.toLocaleString()} independent simulation
            ticks
          </p>
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
            What should change? This starts a fresh generation and preserves the
            original idea’s credit.
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
              Generate revision <ArrowRight size={13} />
            </button>
          </div>
        </form>
      )}
      <div className="preview-decision">
        <p>
          Approval belongs to this exact source, ordered combination and
          preview. Changing the active laws requires a new preview and approval.
          Activation happens at a checkpoint.
        </p>
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
            className="button button-outline"
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
            Approve this version <ArrowRight size={16} />
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
    <Modal
      open={open}
      onClose={onClose}
      title="Stillness makes a bridge."
      eyebrow="PRACTICE SAMPLE · PREWRITTEN"
      wide
    >
      <p className="preview-sample-note">
        This sample was written with the engine to demonstrate its primitives.
        It is not a new generation or a Twitch contribution. Use your own idea
        in the studio to run a real Codex job.
      </p>
      <div className="preview-grid">
        <div className="preview-game">
          <GameViewport
            program={program}
            artifactHash="practice-example"
            preview
          />
          <p className="preview-hint">
            Stand beside the wooden prop, then hold E while moving it. Leave it
            still beside the lantern and cross its solid shadow.
          </p>
        </div>
        <div className="preview-details">
          <p className="eyebrow">TRY SOMETHING IMPOSSIBLE</p>
          <h3>
            A little stillness.
            <br />A whole new way across.
          </h3>
          <p>
            When a movable prop stays still in the lantern’s light, its
            projected shadow becomes a solid surface. Move the prop and the
            bridge disappears.
          </p>
          <div className="capability-chips">
            <span>Entity queries</span>
            <span>Conditions</span>
            <span>Light projection</span>
            <span>Temporary geometry</span>
          </div>
          <p>
            Generated laws compose these same bounded primitives. No preset
            selector stands in for generation.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button className="button button-primary" onClick={onClose}>
          <Check size={16} /> Back to my show <Play size={14} />
        </button>
      </div>
    </Modal>
  );
}
