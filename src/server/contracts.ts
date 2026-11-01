import type {
  GameCheckpoint,
  RuleProgram,
  VerificationReport,
} from "@/game/contracts";
export type ActivationMode = "append" | "replace";
export interface CompositionMember {
  candidateId: string;
  sourceHash: string;
  programHash: string;
}
export interface CandidateComposition {
  engineVersion: string;
  mode: ActivationMode;
  baseRevision: number;
  baseMembers: CompositionMember[];
  members: CompositionMember[];
  contextHash: string;
  compositionHash: string;
  program: RuleProgram;
  programHash: string;
  artifactHash: string;
  verification: VerificationReport;
}
export interface ProposalAncestry {
  kind: "adaptation" | "library";
  adaptationSource?: "model-suggested" | "host-edited" | "host-written";
  originalAuthor: string;
  originalText: string;
  originalProposalId?: string;
  sourceJobId?: string;
  libraryEntryId?: string;
}
export type ShowMode = "practice" | "twitch";
export type JobStatus =
  | "queued"
  | "starting"
  | "generating"
  | "verifying"
  | "ready"
  | "failed"
  | "cancelled"
  | "stale"
  | "rejected";
export interface Proposal {
  id: string;
  text: string;
  author: string;
  origin: "practice" | "twitch" | "sample" | "library";
  createdAt: string;
  votes: number;
  status: "open" | "selected" | "hidden" | "rejected";
  /** Host-only; omitted from every public projection. */
  moderationReason?: string;
  messageId?: string;
  ancestry?: ProposalAncestry;
}
export interface SandboxFailureDiagnostic {
  stage:
    | "snapshot-lookup"
    | "snapshot-validation"
    | "vm-create"
    | "dependency-install"
    | "network-policy"
    | "clean-audit"
    | "snapshot-capture"
    | "cache-publish"
    | "cache-lease";
  category:
    | "http-error"
    | "timeout"
    | "network-error"
    | "invalid-image"
    | "dirty-image"
    | "command-failed"
    | "lease-busy"
    | "lease-lost"
    | "store-error"
    | "unknown";
  httpStatus?: number;
}
export interface GenerationJob {
  id: string;
  proposalId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  model: string;
  candidateId?: string;
  message: string;
  threadId?: string;
  sandboxId?: string;
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
  baseRevision: number;
  reused?: boolean;
  engineVersion?: string;
  activationMode?: ActivationMode;
  baseCandidateIds?: string[];
  adaptedProposal?: string;
  adaptationProposalId?: string;
  sandboxTimings?: {
    mode: "cold" | "snapshot";
    cacheHit: boolean;
    setupMs: number;
    createMs: number;
    installMs: number;
    snapshotMs: number;
    fallback: boolean;
    failures?: SandboxFailureDiagnostic[];
  };
  phases?: Array<{
    phase:
      | "snapshot-restored"
      | "workspace-ready"
      | "thread-started"
      | "turn-started"
      | "source-returned"
      | "verifier-started"
      | "verification-complete";
    checksPassed?: number;
    totalChecks?: number;
    at: string;
    attempt: number;
  }>;
  revision?: string;
  priorCandidateId?: string;
  /** Internal request fingerprint; stripped from host/public projections. */
  requestHash?: string;
  quotaDay?: string;
  quotaExempt?: boolean;
  attemptEvidence?: Array<{
    attempt: number;
    status: "unsupported" | "verification-failed" | "verified";
    threadId?: string;
    sourceHash?: string;
    diagnostic?: string;
    verification?: VerificationReport;
    usage?: {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
    };
  }>;
}
export interface Candidate {
  engineVersion?: string;
  composition?: CandidateComposition;
  approvedCompositionHash?: string;
  approvedContextHash?: string;
  approvedArtifactHash?: string;
  ancestry?: ProposalAncestry;
  id: string;
  jobId: string;
  proposalId: string;
  source: string;
  sourceHash: string;
  program: RuleProgram;
  programHash: string;
  verification: VerificationReport;
  createdAt: string;
  baseRevision: number;
  approvedAt?: string;
  approvedBy?: string;
  approvedPreviewHash?: string;
  approvedSourceHash?: string;
  approvedProgramHash?: string;
  activatedAt?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  provenance?: {
    kind: "runtime-generation" | "reused-generation" | "library-import";
    threadId?: string;
    model: string;
    generatedAt: string;
  };
}
export interface AuthorityLease {
  clientId: string;
  epoch: number;
  expiresAt: number;
}
export interface ShowEvent {
  id: string;
  at: string;
  type: string;
  message: string;
  proposalId?: string;
  candidateId?: string;
  sourceHash?: string;
  programHash?: string;
  previewHash?: string;
}
export interface TwitchConnection {
  authorizationPaused?: boolean;
  status: "disconnected" | "connecting" | "connected" | "gap" | "revoked";
  channelLogin?: string;
  channelId?: string;
  sessionId?: string;
  subscriptionId?: string;
  lastEventAt?: string;
  lastHealthyAt?: string;
  message: string;
}
export interface ShowSettings {
  blockedTerms: string[];
  chatRepliesEnabled: boolean;
  chatRepliesEnabledAt?: string;
}
export interface ShowState {
  settings: ShowSettings;
  engineVersion: string;
  engineUpgradeRequired?: boolean;
  activeCandidateIds: string[];
  previousCandidateIds: string[];
  activeArtifactHash: string | null;
  engineHistory?: Array<{
    engineVersion: string;
    archivedAt: string;
    revision: number;
  }>;
  id: string;
  mode: ShowMode;
  createdAt: string;
  updatedAt: string;
  revision: number;
  round: number;
  phase: "collecting" | "forging" | "preview" | "live";
  proposals: Proposal[];
  jobs: GenerationJob[];
  candidates: Candidate[];
  activeCandidateId: string | null;
  previousCandidateId: string | null;
  checkpoint: GameCheckpoint | null;
  previousCheckpoint: GameCheckpoint | null;
  lease: AuthorityLease | null;
  twitch: TwitchConnection;
  events: ShowEvent[];
  votingOpen: boolean;
}
export interface HostShowResponse {
  show: ShowState;
}
export type PublicProposal = Omit<
  Proposal,
  "ancestry" | "messageId" | "moderationReason"
> & {
  ancestry?: Pick<
    ProposalAncestry,
    "kind" | "originalAuthor" | "adaptationSource"
  >;
};
export interface PublicShowState {
  createdAt?: string;
  updatedAt?: string;
  engineVersion?: string;
  activeLaws?: Array<{
    name: string;
    description: string;
    author: string;
    origin: Proposal["origin"];
    sourceHash: string;
    programHash: string;
    ancestry?: {
      kind: ProposalAncestry["kind"];
      originalAuthor: string;
      adaptationSource?: ProposalAncestry["adaptationSource"];
    };
  }>;
  votingOpen: boolean;
  id: string;
  mode: ShowMode;
  phase: ShowState["phase"];
  round: number;
  revision: number;
  proposals: PublicProposal[];
  active: {
    name: string;
    description: string;
    author: string;
    sourceHash: string;
    programHash: string;
  } | null;
  generation: {
    status: JobStatus;
    message: string;
    createdAt?: string;
    updatedAt?: string;
    proposal?: {
      id: string;
      author: string;
      origin: Proposal["origin"];
      text: string;
    };
    reused?: boolean;
    phases?: NonNullable<GenerationJob["phases"]>;
  } | null;
  twitch: { status: TwitchConnection["status"]; channelLogin?: string };
  events: ShowEvent[];
}
export interface TwitchSessionRequest {
  sessionId: string;
  reconnect?: boolean;
}
/** Browser forwards only actual EventSub notification envelopes; no token ever enters it. */
export interface TwitchNotificationRequest {
  metadata: {
    message_id: string;
    message_type: "notification";
    message_timestamp: string;
    subscription_type: "channel.chat.message";
  };
  payload: {
    subscription: {
      id: string;
      type: "channel.chat.message";
      condition: { broadcaster_user_id: string; user_id: string };
      transport?: { method: string; session_id?: string };
    };
    event: {
      broadcaster_user_id: string;
      chatter_user_id: string;
      chatter_user_name: string;
      message_id: string;
      message: { text: string };
      badges?: Array<{ set_id: string; id: string; info: string }>;
    };
  };
}
export interface TwitchHealthRequest {
  status: "connected" | "gap" | "revoked" | "disconnected";
  message?: string;
}
