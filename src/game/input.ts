import { EMPTY_INPUT, type InputState, type TickInput } from "./contracts";
const EDGE_KEYS = ["jump", "interact", "reset"] as const;
/** Retain rising edges that arrive between fixed simulation steps. Held axes stay latest-value. */
export class InputLatch {
  private held: InputState = { ...EMPTY_INPUT };
  private pending = { jump: false, interact: false, reset: false };
  update(next: InputState) {
    for (const key of EDGE_KEYS)
      if (next[key] && !this.held[key]) this.pending[key] = true;
    this.held = { ...next };
  }
  consume(): TickInput {
    const pressed = { ...this.pending };
    this.pending = { jump: false, interact: false, reset: false };
    return {
      ...this.held,
      jump: this.held.jump || pressed.jump,
      interact: this.held.interact || pressed.interact,
      reset: this.held.reset || pressed.reset,
      pressed,
    };
  }
  clear() {
    this.held = { ...EMPTY_INPUT };
    this.pending = { jump: false, interact: false, reset: false };
  }
}
