"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  EMPTY_INPUT,
  type AuthorityHeartbeat,
  type WorkerRuntimeFaultContext,
  type GameCheckpoint,
  type GameSnapshot,
  type InputState,
  type RuleProgram,
  type WorkerCommand,
  type WorkerEvent,
} from "../game/contracts";
import { WorldRenderer } from "../game/renderer";
export type {
  AuthorityHeartbeat,
  WorkerRuntimeFaultContext,
} from "../game/contracts";
export interface GameViewportProps {
  presentation?: "world" | "candidate" | "live";
  showHud?: boolean;
  observer?: boolean;
  snapshot?: GameSnapshot | null;
  program?: RuleProgram | null;
  artifactHash?: string;
  preview?: boolean;
  paused?: boolean;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onCheckpoint?: (checkpoint: GameCheckpoint) => void;
  onAuthorityHeartbeat?: (heartbeat: AuthorityHeartbeat) => void;
  onFault?: (message: string, context?: WorkerRuntimeFaultContext) => void;
  onReady?: () => void;
  className?: string;
}
export interface GameViewportHandle {
  pause(value: boolean): void;
  reset(): void;
  restore(checkpoint: GameCheckpoint): void;
  checkpoint(): Promise<GameCheckpoint>;
  activate(program: RuleProgram, artifactHash: string): void;
  rollback(): void;
  requestHeartbeat(): void;
}
export const GameViewport = forwardRef<GameViewportHandle, GameViewportProps>(
  function GameViewport(props, ref) {
    const canvas = useRef<HTMLCanvasElement>(null),
      container = useRef<HTMLDivElement>(null),
      worker = useRef<Worker | null>(null),
      snapshot = useRef<GameSnapshot | null>(null),
      input = useRef<InputState>({ ...EMPTY_INPUT }),
      callbacks = useRef(props),
      requests = useRef(
        new Map<
          number,
          { resolve: (c: GameCheckpoint) => void; reject: (e: Error) => void }
        >(),
      ),
      sequence = useRef(0);
    callbacks.current = props;
    const [ready, setReady] = useState(false);
    const send = (command: WorkerCommand) =>
      worker.current?.postMessage(command);
    useImperativeHandle(
      ref,
      () => ({
        pause: (value) => send({ type: "pause", value }),
        reset: () => send({ type: "reset" }),
        restore: (checkpoint) => send({ type: "restore", checkpoint }),
        checkpoint: () =>
          new Promise((resolve, reject) => {
            if (!worker.current)
              return reject(new Error("Game authority is not ready"));
            const requestId = ++sequence.current;
            requests.current.set(requestId, { resolve, reject });
            send({ type: "checkpoint", requestId });
          }),
        activate: (program, artifactHash) =>
          send({ type: "activate", program, artifactHash }),
        rollback: () => send({ type: "rollback" }),
        requestHeartbeat: () => send({ type: "heartbeat" }),
      }),
      [],
    );
    useEffect(() => {
      if (props.observer) {
        setReady(true);
        callbacks.current.onReady?.();
        return;
      }
      const authority = new Worker(
        new URL("../game/game.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = authority;
      authority.onmessage = (event: MessageEvent<WorkerEvent>) => {
        const data = event.data;
        if (data.type === "ready") {
          setReady(true);
          callbacks.current.onReady?.();
        } else if (data.type === "snapshot") {
          snapshot.current = data.snapshot;
          callbacks.current.onSnapshot?.(data.snapshot);
        } else if (data.type === "checkpoint") {
          if (data.requestId) {
            requests.current.get(data.requestId)?.resolve(data.checkpoint);
            requests.current.delete(data.requestId);
          } else callbacks.current.onCheckpoint?.(data.checkpoint);
        } else if (data.type === "heartbeat") {
          callbacks.current.onAuthorityHeartbeat?.({
            tick: data.tick,
            artifactHash: data.artifactHash,
            paused: data.paused,
          });
        } else if (data.type === "fault") {
          callbacks.current.onFault?.(data.message, data.context);
        } else if (data.type === "operationError") {
          if (data.requestId !== undefined) {
            requests.current
              .get(data.requestId)
              ?.reject(new Error(data.message));
            requests.current.delete(data.requestId);
          }
          callbacks.current.onFault?.(data.message);
        }
      };
      authority.onerror = () =>
        callbacks.current.onFault?.(
          "Game authority stopped. Reload the saved checkpoint to recover.",
        );
      return () => {
        authority.terminate();
        worker.current = null;
        requests.current.forEach((request) =>
          request.reject(new Error("Game authority closed")),
        );
        requests.current.clear();
      };
    }, [props.observer]);
    useEffect(() => {
      if (props.observer) snapshot.current = props.snapshot ?? null;
    }, [props.observer, props.snapshot]);
    useEffect(() => {
      send({ type: "pause", value: Boolean(props.paused) });
    }, [props.paused, ready]);
    useEffect(() => {
      if (!ready || props.program === undefined) return;
      if (props.program)
        send({
          type: "activate",
          program: props.program,
          artifactHash: props.artifactHash || "practice-sample",
        });
      else send({ type: "rollback" });
    }, [props.program, props.artifactHash, ready]);
    useEffect(() => {
      const element = canvas.current,
        mountedContainer = container.current;
      if (!element || !mountedContainer) return;
      let disposed = false;
      const renderer = new WorldRenderer();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const size = () => {
        if (disposed || !mountedContainer.isConnected) return;
        const rect = mountedContainer.getBoundingClientRect(),
          dpr = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.max(1, Math.round(rect.width * dpr));
        element.height = Math.max(1, Math.round(rect.height * dpr));
      };
      const observer = new ResizeObserver(size);
      observer.observe(mountedContainer);
      size();
      let frame = 0;
      const render = (time: number) => {
        if (disposed) return;
        if (snapshot.current && mountedContainer.isConnected)
          renderer.draw(
            element,
            snapshot.current,
            time / 1000,
            reduced.matches,
            callbacks.current.showHud !== false,
          );
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
      return () => {
        disposed = true;
        observer.disconnect();
        cancelAnimationFrame(frame);
      };
    }, []);
    useEffect(() => {
      if (props.observer) return;
      const mapping: Record<string, keyof InputState> = {
        KeyA: "left",
        ArrowLeft: "left",
        KeyD: "right",
        ArrowRight: "right",
        Space: "jump",
        KeyE: "interact",
        KeyR: "reset",
      };
      const key = (event: KeyboardEvent) => {
        const field = mapping[event.code];
        if (!field) return;
        const target = event.target as HTMLElement;
        if (!container.current?.contains(target)) return;
        if (target.closest("input,textarea,select,[contenteditable=true]"))
          return;
        if (
          event.type === "keydown" &&
          target.closest("button,a") &&
          event.code === "Space"
        )
          return;
        event.preventDefault();
        input.current[field] = event.type === "keydown";
        send({ type: "input", input: input.current });
      };
      const blur = () => {
        input.current = { ...EMPTY_INPUT };
        send({ type: "input", input: input.current });
      };
      window.addEventListener("keydown", key);
      window.addEventListener("keyup", key);
      window.addEventListener("blur", blur);
      return () => {
        window.removeEventListener("keydown", key);
        window.removeEventListener("keyup", key);
        window.removeEventListener("blur", blur);
      };
    }, [props.observer]);
    const touch = (field: keyof InputState, value: boolean) => {
      input.current[field] = value;
      send({ type: "input", input: input.current });
    };
    return (
      <div
        ref={container}
        className={`game-viewport ${props.className || ""}`}
        tabIndex={0}
        aria-label="The Last Light game. A and D or arrows move, Space jumps, E interacts, R returns to checkpoint."
        onPointerDown={() => {
          if (!props.observer)
            container.current?.focus({ preventScroll: true });
        }}
        style={{
          position: "relative",
          width: "100%",
          background: "#10232b",
          overflow: "hidden",
          outlineOffset: 3,
        }}
        onBlur={() => {
          input.current = { ...EMPTY_INPUT };
          send({ type: "input", input: input.current });
        }}
      >
        <canvas
          ref={canvas}
          aria-hidden="true"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {!ready && (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#e7dfc7",
              fontSize: 13,
              letterSpacing: 2,
            }}
          >
            LIGHTING THE FOUNDRY
          </div>
        )}
        {props.paused && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "#08151f66",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                padding: "10px 16px",
                border: "1px solid #d6c28966",
                color: "#e8e1c8",
                fontSize: 12,
                letterSpacing: 3,
              }}
            >
              WORLD PAUSED
            </span>
          </div>
        )}
        {(props.presentation === "candidate" ||
          (!props.presentation && props.preview)) && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 18,
              transform: "translateX(-50%)",
              border: "1px solid #a0ddbe55",
              borderRadius: 4,
              padding: "5px 9px",
              fontSize: 9,
              letterSpacing: 2,
              color: "#b4edcd",
              background: "#0e242bd9",
            }}
          >
            CANDIDATE PREVIEW
          </div>
        )}
        {!props.observer && (
          <div
            className="game-touch-controls"
            style={{
              position: "absolute",
              bottom: 58,
              left: 14,
              right: 14,
              display: "none",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {(
              [
                ["left", "←"],
                ["right", "→"],
                ["jump", "Jump"],
                ["interact", "E"],
              ] as const
            ).map(([field, label]) => (
              <button
                key={field}
                aria-label={field}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  touch(field, true);
                }}
                onPointerUp={() => touch(field, false)}
                onPointerCancel={() => touch(field, false)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  color: "#f2ead5",
                  background: "#183239bb",
                  border: "1px solid #a7ae8266",
                  borderRadius: 6,
                  touchAction: "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <style>{`@media(pointer:coarse),(max-width:760px){.game-touch-controls{display:flex!important}}`}</style>
      </div>
    );
  },
);
export default GameViewport;
