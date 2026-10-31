import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEngine as Engine } from "../src/game/core";
import type { WorkerCommand, WorkerEvent } from "../src/game/contracts";

async function bootWorker() {
  const events: WorkerEvent[] = [];
  const scope = {
    onmessage: (_event: MessageEvent<WorkerCommand>) => {},
    postMessage: vi.fn((event: WorkerEvent) =>
      events.push(structuredClone(event)),
    ),
  };
  vi.stubGlobal("self", scope);
  const { GameEngine } = await import("../src/game/core");
  const { compileRuleSource, PRACTICE_RULE_SOURCE } =
    await import("../src/game/rules");
  await import("../src/game/game.worker");
  const send = (command: WorkerCommand) =>
    scope.onmessage({ data: command } as MessageEvent<WorkerCommand>);
  return {
    events,
    send,
    GameEngine,
    program: compileRuleSource(PRACTICE_RULE_SOURCE),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("game-worker liveness and fault protocol", () => {
  it("continues wall-time heartbeats while paused without advancing simulation", async () => {
    const { events, send } = await bootWorker();
    send({ type: "pause", value: true });
    vi.advanceTimersByTime(60_000);
    const heartbeats = events.filter((event) => event.type === "heartbeat");
    expect(heartbeats).toHaveLength(3);
    expect(heartbeats).toEqual(
      Array(3).fill({
        type: "heartbeat",
        tick: 0,
        artifactHash: null,
        paused: true,
      }),
    );
  });

  it("answers an immediate heartbeat request with the exact active artifact", async () => {
    const { events, send, program } = await bootWorker();
    send({ type: "activate", program, artifactHash: "exact-active-artifact" });
    send({ type: "pause", value: true });
    send({ type: "heartbeat" });
    expect(events.at(-1)).toEqual({
      type: "heartbeat",
      tick: 0,
      artifactHash: "exact-active-artifact",
      paused: true,
    });
  });

  it("identifies the faulted hash and tick before restoring and pausing the world", async () => {
    const { events, send, program, GameEngine } = await bootWorker();
    send({ type: "activate", program, artifactHash: "faulted-artifact" });
    vi.spyOn(GameEngine.prototype, "step").mockImplementation(function (
      this: Engine,
    ) {
      this.world.tick = 71;
      throw new Error("Injected runtime invariant fault");
    });
    vi.advanceTimersByTime(40);
    const faultIndex = events.findIndex((event) => event.type === "fault");
    expect(events[faultIndex]).toEqual({
      type: "fault",
      message: "Injected runtime invariant fault",
      context: { kind: "runtime", artifactHash: "faulted-artifact", tick: 71 },
    });
    expect(events[faultIndex + 1]).toMatchObject({
      type: "snapshot",
      snapshot: { tick: 0, activeHash: null, ruleName: null },
    });
    send({ type: "heartbeat" });
    expect(events.at(-1)).toMatchObject({
      type: "heartbeat",
      paused: true,
      artifactHash: null,
    });
  });

  it("rejects a malformed activation without rolling back the existing active law", async () => {
    const { events, send, program } = await bootWorker();
    send({ type: "activate", program, artifactHash: "existing-law" });
    send({
      type: "activate",
      program: { ...program, version: 99 } as unknown as typeof program,
      artifactHash: "invalid-law",
    });
    const error = events.at(-1);
    expect(error).toMatchObject({
      type: "operationError",
      operation: "activate",
    });
    expect(error).not.toHaveProperty("context");
    expect(events.some((event) => event.type === "fault")).toBe(false);
    send({ type: "checkpoint", requestId: 9 });
    expect(events.at(-2)).toMatchObject({
      type: "checkpoint",
      requestId: 9,
      checkpoint: {
        artifactHash: "existing-law",
        snapshot: { activeHash: "existing-law" },
      },
    });
  });

  it("rejects a corrupt restore without retiring the active artifact", async () => {
    const { events, send, program, GameEngine } = await bootWorker();
    send({ type: "activate", program, artifactHash: "law-before-restore" });
    const invalid = new GameEngine().checkpoint();
    invalid.snapshot.entities[0].x = Number.POSITIVE_INFINITY;
    send({ type: "restore", checkpoint: invalid });
    expect(events.at(-1)).toMatchObject({
      type: "operationError",
      operation: "restore",
    });
    send({ type: "heartbeat" });
    expect(events.at(-1)).toMatchObject({
      type: "heartbeat",
      artifactHash: "law-before-restore",
    });
    expect(events.some((event) => event.type === "fault")).toBe(false);
  });

  it("returns the rejected checkpoint request ID instead of leaving the caller pending", async () => {
    const { events, send, GameEngine } = await bootWorker();
    vi.spyOn(GameEngine.prototype, "checkpoint").mockImplementation(() => {
      throw new Error("Injected checkpoint operation failure");
    });
    send({ type: "checkpoint", requestId: 12 });
    expect(events.at(-1)).toEqual({
      type: "operationError",
      operation: "checkpoint",
      requestId: 12,
      message: "Injected checkpoint operation failure",
    });
  });
});
