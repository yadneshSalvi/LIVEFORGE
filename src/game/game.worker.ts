/// <reference lib="webworker" />
import { type WorkerCommand, type WorkerEvent } from "./contracts";
import { GameEngine } from "./core";
import { InputLatch } from "./input";
import { validateRuntimeRuleProgram } from "./rules";
const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new GameEngine();
const input = new InputLatch();
let paused = false;
let previous = performance.now(),
  accumulator = 0;
const emit = (event: WorkerEvent) => scope.postMessage(event);
// Lease liveness follows worker wall time, independently of simulation pause/ticks.
const emitHeartbeat = () =>
  emit({
    type: "heartbeat",
    tick: engine.world.tick,
    artifactHash: engine.artifactHash,
    paused,
  });
setInterval(emitHeartbeat, 20_000);
scope.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  try {
    switch (command.type) {
      case "heartbeat":
        emitHeartbeat();
        return;
      case "input":
        input.update(command.input);
        break;
      case "pause":
        paused = command.value;
        input.clear();
        break;
      case "reset":
        engine.reset();
        input.clear();
        break;
      case "restore":
        if (command.checkpoint.program)
          validateRuntimeRuleProgram(command.checkpoint.program);
        engine.restore(command.checkpoint);
        input.clear();
        break;
      case "checkpoint":
        emit({
          type: "checkpoint",
          checkpoint: engine.checkpoint(),
          requestId: command.requestId,
        });
        break;
      case "activate":
        engine.activate(
          validateRuntimeRuleProgram(command.program),
          command.artifactHash,
        );
        emit({ type: "checkpoint", checkpoint: engine.checkpoint() });
        break;
      case "rollback":
        input.clear();
        engine.rollback();
        emit({ type: "checkpoint", checkpoint: engine.checkpoint() });
        break;
    }
    emit({ type: "snapshot", snapshot: engine.world });
  } catch (error) {
    // A rejected command did not fail live simulation and must not retire its law.
    emit({
      type: "operationError",
      operation: command.type,
      ...(command.type === "checkpoint"
        ? { requestId: command.requestId }
        : {}),
      message:
        error instanceof Error ? error.message : "Game operation was rejected",
    });
  }
};
setInterval(() => {
  const now = performance.now();
  accumulator += Math.min(100, now - previous);
  previous = now;
  if (paused) {
    accumulator = 0;
    return;
  }
  try {
    let stepped = false;
    while (accumulator >= 1000 / 60) {
      const before = engine.world.checkpoint;
      engine.step(input.consume());
      if (engine.world.checkpoint !== before)
        emit({ type: "checkpoint", checkpoint: engine.checkpoint() });
      accumulator -= 1000 / 60;
      stepped = true;
    }
    if (stepped && engine.world.tick % 2 === 0)
      emit({ type: "snapshot", snapshot: engine.world });
  } catch (error) {
    const context = {
      kind: "runtime" as const,
      artifactHash: engine.artifactHash,
      tick: engine.world.tick,
    };
    paused = true;
    input.clear();
    emit({
      type: "fault",
      context,
      message:
        error instanceof Error
          ? error.message
          : "Rule paused; checkpoint recovered",
    });
    engine.rollback();
    emit({ type: "snapshot", snapshot: engine.world });
  }
}, 1000 / 60);
emit({ type: "ready" });
emit({ type: "snapshot", snapshot: engine.world });
