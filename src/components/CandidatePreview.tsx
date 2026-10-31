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
import { ruleDescription } from "@/lib/rule-copy";

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
        key={candidate.sourceHash}
        candidate={candidate}
        proposal={proposal}
        baseline={baseline}
        onApprove={onApprove}
        onReject={onReject}
        onRevise={onRevise}
        onClose={onClose}
        busy={busy}
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
}: {
  candidate: Candidate;
  proposal?: Proposal;
  baseline: GameCheckpoint | null;
  onApprove: (checkpoint: GameCheckpoint) => Promise<void>;
  onReject: () => Promise<void>;
  onRevise: (revision: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const game = useRef<GameViewportHandle>(null);
  const [comparison, setComparison] = useState<"candidate" | "baseline">(
    "candidate",
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [revision, setRevision] = useState("");
  const initialize = () => {
    if (baseline) game.current?.restore(baseline);
    game.current?.activate(candidate.program, candidate.sourceHash);
  };
  const compare = (mode: "candidate" | "baseline") => {
    setComparison(mode);
    setReady(false);
    if (baseline) game.current?.restore(baseline);
    else game.current?.reset();
    if (mode === "candidate")
      game.current?.activate(candidate.program, candidate.sourceHash);
  };
  const approve = async () => {
    try {
      if (!game.current) return;
      const checkpoint = await game.current.checkpoint();
      if (checkpoint.artifactHash !== candidate.sourceHash)
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
              if (snapshot.activeHash === candidate.sourceHash) setReady(true);
            }}
            onFault={setError}
          />
          <p className="preview-hint">
            Click the world to play. A / D to move · Space to jump · E to
            interact. Your live world is paused while you test.
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
              Invented by {proposal?.author || "the host"}
            </span>
          </div>
          <VerificationChecks report={candidate.verification} compact />
          <p className="preview-identity">
            VERSION {shortHash(candidate.sourceHash)}
            <br />
            ENGINE {candidate.verification.engineVersion}
            <br />
            {candidate.verification.ticksSimulated.toLocaleString()} independent
            simulation ticks
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
          Approval belongs to this exact source and preview. The law enters your
          live world only when you activate it at a checkpoint.
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
