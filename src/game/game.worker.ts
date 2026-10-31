/// <reference lib="webworker" />
import { type WorkerCommand, type WorkerEvent } from "./contracts";
import { GameEngine } from "./core";
import { InputLatch } from "./input";
import { validateRuleProgram } from "./rules";
const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new GameEngine();
const input = new InputLatch();
let paused = false;
let previous = performance.now(),
  accumulator = 0;
const emit = (event: WorkerEvent) => scope.postMessage(event);
scope.onmessage = (event: MessageEvent<WorkerCommand>) => {
  try {
    const command = event.data;
    switch (command.type) {
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
          validateRuleProgram(command.checkpoint.program);
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
          validateRuleProgram(command.program),
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
    engine.rollback();
    emit({
      type: "fault",
      message:
        error instanceof Error
          ? error.message
          : "Rule paused; checkpoint recovered",
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
    engine.rollback();
    paused = true;
    emit({
      type: "fault",
      message:
        error instanceof Error
          ? error.message
          : "Rule paused; checkpoint recovered",
    });
    emit({ type: "snapshot", snapshot: engine.world });
  }
}, 1000 / 60);
emit({ type: "ready" });
emit({ type: "snapshot", snapshot: engine.world });
