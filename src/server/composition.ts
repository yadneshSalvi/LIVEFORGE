import {
  ENGINE_VERSION,
  type RuleProgram,
  type VerificationReport,
} from "@/game/contracts";
import {
  compileRuleSource,
  composeRulePrograms,
  verifyRuleComposition,
} from "@/game/rules";
import { assert } from "./errors";
import { digest, hashData } from "./security";
import type {
  ActivationMode,
  Candidate,
  CandidateComposition,
  CompositionMember,
  ShowState,
} from "./contracts";
export const LEGACY_ENGINE_VERSION = "last-light/1.0.0";
export function showEngine(
  show: Pick<ShowState, "engineVersion" | "checkpoint">,
) {
  return (
    show.engineVersion ||
    show.checkpoint?.snapshot.version ||
    LEGACY_ENGINE_VERSION
  );
}
export function assertCurrentEngine(
  show: Pick<ShowState, "engineVersion" | "checkpoint">,
) {
  assert(
    showEngine(show) === ENGINE_VERSION,
    409,
    "engine_upgrade_required",
    "This saved show uses an earlier engine. Explicitly upgrade it before generating, importing, approving, or applying a law.",
  );
}
export function activeIds(
  show: Pick<ShowState, "activeCandidateIds" | "activeCandidateId">,
): string[] {
  return [
    ...(show.activeCandidateIds ??
      (show.activeCandidateId ? [show.activeCandidateId] : [])),
  ];
}
function member(candidate: Candidate): CompositionMember {
  return {
    candidateId: candidate.id,
    sourceHash: candidate.sourceHash,
    programHash: candidate.programHash,
  };
}
function sourceProgram(candidate: Candidate): RuleProgram {
  assert(
    digest(candidate.source) === candidate.sourceHash &&
      hashData(candidate.program) === candidate.programHash,
    409,
    "artifact_changed",
    "An original source artifact changed. Review a freshly imported or generated candidate.",
  );
  const program = compileRuleSource(candidate.source);
  assert(
    hashData(program) === candidate.programHash,
    409,
    "artifact_changed",
    "The source and program identity no longer match.",
  );
  return program;
}
function byId(candidates: Candidate[], id: string) {
  const candidate = candidates.find((c) => c.id === id);
  assert(
    candidate,
    409,
    "composition_member_missing",
    "A retained source artifact is missing. Restore a checkpoint or replace the law stack.",
  );
  return candidate;
}
function envelope(
  candidates: Candidate[],
  candidate: Candidate,
  mode: ActivationMode,
  baseRevision: number,
  baseMembers: CompositionMember[],
): CandidateComposition {
  const ids =
    mode === "append"
      ? [...baseMembers.map((m) => m.candidateId), candidate.id]
      : [candidate.id];
  assert(
    ids.length <= 3 && new Set(ids).size === ids.length,
    409,
    "law_stack_full",
    "A show can retain at most three distinct laws. Replace the current stack or retire a law first.",
  );
  for (const base of baseMembers) {
    const current = byId(candidates, base.candidateId);
    sourceProgram(current);
    assert(
      hashData(member(current)) === hashData(base),
      409,
      "composition_context_changed",
      "A retained source artifact changed since this candidate was prepared.",
    );
  }
  const members = ids.map((id) =>
    member(id === candidate.id ? candidate : byId(candidates, id)),
  );
  const programs = ids.map((id) =>
    sourceProgram(id === candidate.id ? candidate : byId(candidates, id)),
  );
  const program = composeRulePrograms(programs);
  const verification: VerificationReport = verifyRuleComposition(programs);
  assert(
    verification.passed,
    422,
    "composition_verification_failed",
    "These laws do not pass independent combined verification. Replace the stack or choose a different law.",
  );
  const contextHash = hashData({
    engineVersion: ENGINE_VERSION,
    mode,
    baseRevision,
    baseMembers,
  });
  const programHash = hashData(program);
  const compositionHash = hashData({
    engineVersion: ENGINE_VERSION,
    mode,
    baseRevision,
    baseMembers,
    members,
    contextHash,
    programHash,
    verificationHash: hashData(verification),
  });
  const artifactHash = hashData({
    kind: "liveforge-runtime-composition/v1",
    engineVersion: ENGINE_VERSION,
    compositionHash,
    members,
  });
  return {
    engineVersion: ENGINE_VERSION,
    mode,
    baseRevision,
    baseMembers,
    members,
    contextHash,
    compositionHash,
    program,
    programHash,
    artifactHash,
    verification,
  };
}
export function prepareCandidateComposition(
  show: ShowState,
  candidate: Candidate,
  mode: ActivationMode = "replace",
): Candidate {
  assertCurrentEngine(show);
  const baseMembers = activeIds(show).map((id) =>
    member(byId(show.candidates, id)),
  );
  const composition = envelope(
    show.candidates,
    candidate,
    mode,
    show.revision,
    baseMembers,
  );
  candidate.engineVersion = ENGINE_VERSION;
  candidate.baseRevision = show.revision;
  candidate.composition = composition;
  candidate.verification = composition.verification;
  return candidate;
}
export function checkedComposition(
  show: ShowState,
  candidate: Candidate,
  requireCurrentContext: boolean,
): CandidateComposition {
  assertCurrentEngine(show);
  const saved = candidate.composition;
  assert(
    candidate.engineVersion === ENGINE_VERSION &&
      saved?.engineVersion === ENGINE_VERSION,
    409,
    "candidate_engine_stale",
    "This candidate targets an earlier engine. Import its original source for fresh verification.",
  );
  if (requireCurrentContext) {
    assert(
      candidate.baseRevision === show.revision &&
        saved.baseRevision === show.revision,
      409,
      "candidate_stale",
      "The world changed since this candidate was prepared. Generate or import a fresh candidate.",
    );
    const currentBase = activeIds(show).map((id) =>
      member(byId(show.candidates, id)),
    );
    assert(
      hashData(currentBase) === hashData(saved.baseMembers),
      409,
      "composition_context_changed",
      "The ordered retained laws changed. Review a fresh combination.",
    );
  }
  const rebuilt = envelope(
    show.candidates,
    candidate,
    saved.mode,
    saved.baseRevision,
    saved.baseMembers,
  );
  assert(
    rebuilt.contextHash === saved.contextHash &&
      rebuilt.compositionHash === saved.compositionHash &&
      rebuilt.artifactHash === saved.artifactHash &&
      rebuilt.programHash === saved.programHash &&
      hashData(rebuilt.program) === hashData(saved.program) &&
      hashData(rebuilt.members) === hashData(saved.members) &&
      hashData(rebuilt.verification) === hashData(saved.verification),
    409,
    "composition_changed",
    "This combination no longer matches its independently verified context and source identities.",
  );
  return rebuilt;
}
export function expectedRuntime(show: ShowState): {
  program: RuleProgram | null;
  sourceHash: string | null;
} {
  assertCurrentEngine(show);
  const ids = activeIds(show);
  if (!ids.length) return { program: null, sourceHash: null };
  const latest = byId(show.candidates, ids.at(-1)!);
  const composition = checkedComposition(show, latest, false);
  assert(
    hashData(composition.members.map((m) => m.candidateId)) === hashData(ids),
    409,
    "composition_context_changed",
    "The active law stack no longer matches its approved runtime identity.",
  );
  return { program: composition.program, sourceHash: composition.artifactHash };
}

export function activationMode(value: unknown): ActivationMode {
  assert(
    value === undefined || value === "append" || value === "replace",
    400,
    "activation_mode",
    "Choose append or replace.",
  );
  return value === undefined ? "replace" : value;
}
