/** Bounded generated DATA; source is never executed as JavaScript. */
export const ENGINE_VERSION = "last-light/2.0.0" as const;
export type EntityKind = "player" | "prop" | "lantern" | "ember";
export type ScalarField =
  | "x"
  | "y"
  | "speed"
  | "vx"
  | "vy"
  | "stationaryTicks"
  | "grounded"
  | "distanceToPlayer"
  | "distanceToLantern"
  | "tick"
  | "timer"
  | "inputJump"
  | "inputInteract"
  | "emberCarried"
  | "airJumpsUsed";
export type Scalar =
  | number
  | { field: ScalarField }
  | { add: Scalar[] }
  | { mul: Scalar[] }
  | { min: Scalar[] }
  | { max: Scalar[] }
  | { clamp: { value: Scalar; min: number; max: number } };
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
export interface PhysicsState {
  gravityScale: number;
  jumpStrength: number;
  airJumps: number;
  playerScale: number;
  timeScale: number;
  windX: number;
}
export type RuleAction =
  | {
      type: "projectShadow";
      maxLength: number;
      thickness: number;
      lifetime: number;
      solid: boolean;
    }
  | {
      type: "createSurface" | "spawnPlatform";
      offsetX: number;
      offsetY: number;
      width: number;
      lifetime: number;
      solid: boolean;
      maxCount?: number;
    }
  | {
      type: "spawnProp";
      offsetX: number;
      offsetY: number;
      lifetime: number;
      cooldown: number;
      maxCount: number;
    }
  | { type: "impulse"; target: "self" | "player"; x: Scalar; y: Scalar }
  | {
      type: "physics";
      target: "self" | "player";
      gravityScale?: Scalar;
      jumpStrength?: Scalar;
      airJumps?: number;
      playerScale?: Scalar;
      timeScale?: Scalar;
      windX?: Scalar;
      lifetime?: number;
    }
  | {
      type: "material";
      target: "self" | "player";
      friction: number;
      bounce: number;
      lifetime?: number;
    }
  | {
      type: "cue";
      target: "self" | "player";
      color: "mint" | "coral" | "brass";
      intensity: number;
    }
  | { type: "timer"; value: number };
export type RuleTrigger =
  "tick" | "jump" | "land" | "interact" | "enterZone" | "touch";
export interface RuleClause {
  id: string;
  each: EntityKind;
  on?: RuleTrigger;
  zone?: { x: number; y: number; width: number; height: number };
  when: Condition;
  actions: RuleAction[];
}
export interface RuleProgram {
  version: 1;
  name: string;
  description: string;
  rules: RuleClause[];
  composition?: { members: RuleProgram[] };
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
    modifiersApplied?: number;
    entitiesSpawned?: number;
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
  previousX: number;
  previousY: number;
  wasGrounded: boolean;
  airJumpsUsed: number;
  baseW: number;
  baseH: number;
  physics: PhysicsState;
  expires?: number;
  spawnRule?: string;
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
  drop?: boolean;
}
export interface TickInput extends InputState {
  pressed?: {
    jump: boolean;
    interact: boolean;
    reset: boolean;
    drop?: boolean;
  };
}
export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  interact: false,
  reset: false,
  drop: false,
};
export interface GameSnapshot {
  version: typeof ENGINE_VERSION;
  tick: number;
  entities: Entity[];
  surfaces: Surface[];
  checkpoint: number;
  progress: number;
  ember: boolean;
  emberCarried: boolean;
  input: TickInput;
  previousInput: InputState;
  modifiers: TimedModifier[];
  completed: boolean;
  deaths: number;
  activeHash: string | null;
  ruleName: string | null;
  interaction: string;
  lanternOn: boolean;
  encounters: { counterweight: boolean; guardian: boolean };
}
export interface TimedModifier {
  id: string;
  entityId: string;
  expires: number;
  physics?: Partial<PhysicsState>;
  material?: { friction: number; bounce: number };
}
export interface GameCheckpoint {
  snapshot: GameSnapshot;
  program: RuleProgram | null;
  artifactHash: string | null;
}
export interface AuthorityHeartbeat {
  tick: number;
  artifactHash: string | null;
  paused: boolean;
}
export interface WorkerRuntimeFaultContext {
  kind: "runtime";
  artifactHash: string | null;
  tick: number;
}
export type WorkerCommand =
  | { type: "heartbeat" }
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
  | ({ type: "heartbeat" } & AuthorityHeartbeat)
  | { type: "fault"; message: string; context: WorkerRuntimeFaultContext }
  | {
      type: "operationError";
      message: string;
      operation: WorkerCommand["type"];
      requestId?: number;
    }
  | { type: "ready" };
