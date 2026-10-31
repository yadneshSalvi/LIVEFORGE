/** Public, serializable capability language. Generated source is DATA, never JavaScript. */
export const ENGINE_VERSION = "last-light/1.0.0" as const;
export type EntityKind = "player" | "prop" | "lantern";
export type ScalarField =
  | "x"
  | "y"
  | "speed"
  | "vx"
  | "vy"
  | "stationaryTicks"
  | "grounded"
  | "distanceToPlayer"
  | "tick"
  | "timer";
export type Scalar = number | { field: ScalarField };
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | {
      compare: {
        left: Scalar;
        op: "lt" | "lte" | "eq" | "gte" | "gt";
        right: Scalar;
      };
    };
export type RuleAction =
  | {
      type: "projectShadow";
      maxLength: number;
      thickness: number;
      lifetime: number;
      solid: boolean;
    }
  | {
      type: "createSurface";
      offsetX: number;
      offsetY: number;
      width: number;
      lifetime: number;
      solid: boolean;
    }
  | { type: "impulse"; target: "self" | "player"; x: number; y: number }
  | {
      type: "material";
      target: "self" | "player";
      friction: number;
      bounce: number;
    }
  | {
      type: "cue";
      target: "self" | "player";
      color: "mint" | "coral" | "brass";
      intensity: number;
    }
  | { type: "timer"; value: number };
export interface RuleClause {
  id: string;
  each: EntityKind;
  when: Condition;
  actions: RuleAction[];
}
export interface RuleProgram {
  version: 1;
  name: string;
  description: string;
  rules: RuleClause[];
}
export type RuleModule = RuleProgram;
export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}
export interface VerificationReport {
  passed: boolean;
  engineVersion: string;
  checks: VerificationCheck[];
  ticksSimulated: number;
  summary: string;
  effects: {
    surfacesCreated: number;
    impulsesApplied: number;
    cuesApplied: number;
  };
}
export interface Entity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  stationaryTicks: number;
  timer: number;
  friction: number;
  bounce: number;
  cue?: { color: "mint" | "coral" | "brass"; intensity: number };
}
export interface Surface {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  expires: number;
  solid: boolean;
  generated?: boolean;
  owner?: string;
}
export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  interact: boolean;
  reset: boolean;
}
export interface TickInput extends InputState {
  pressed?: { jump: boolean; interact: boolean; reset: boolean };
}
export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  interact: false,
  reset: false,
};
export interface GameSnapshot {
  version: typeof ENGINE_VERSION;
  tick: number;
  entities: Entity[];
  surfaces: Surface[];
  checkpoint: number;
  progress: number;
  ember: boolean;
  completed: boolean;
  deaths: number;
  activeHash: string | null;
  ruleName: string | null;
  interaction: string;
  lanternOn: boolean;
  encounters: { counterweight: boolean; guardian: boolean };
}
export interface GameCheckpoint {
  snapshot: GameSnapshot;
  program: RuleProgram | null;
  artifactHash: string | null;
}
export type WorkerCommand =
  | { type: "input"; input: InputState }
  | { type: "pause"; value: boolean }
  | { type: "reset" }
  | { type: "restore"; checkpoint: GameCheckpoint }
  | { type: "checkpoint"; requestId: number }
  | { type: "activate"; program: RuleProgram; artifactHash: string }
  | { type: "rollback" };
export type WorkerEvent =
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "checkpoint"; checkpoint: GameCheckpoint; requestId?: number }
  | { type: "fault"; message: string }
  | { type: "ready" };
