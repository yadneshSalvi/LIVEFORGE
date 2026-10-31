import type {
  GameCheckpoint,
  RuleProgram,
  VerificationReport,
} from "@/game/contracts";
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
  origin: "practice" | "twitch";
  createdAt: string;
  votes: number;
  status: "open" | "selected" | "hidden";
  messageId?: string;
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
  revision?: string;
  priorCandidateId?: string;
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
    kind: "runtime-generation" | "reused-generation";
    threadId: string;
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
export interface ShowState {
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
export interface PublicShowState {
  votingOpen: boolean;
  id: string;
  mode: ShowMode;
  phase: ShowState["phase"];
  round: number;
  revision: number;
  proposals: Proposal[];
  active: {
    name: string;
    description: string;
    author: string;
    sourceHash: string;
    programHash: string;
  } | null;
  generation: { status: JobStatus; message: string } | null;
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
    };
  };
}
export interface TwitchHealthRequest {
  status: "connected" | "gap" | "revoked" | "disconnected";
  message?: string;
}
