import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwitchConnector } from "../src/lib/twitch-client";
import { api, ApiError } from "../src/lib/api";
class Socket {
  static instances: Socket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}
const welcome = (id = "session-1") => ({
  metadata: { message_type: "session_welcome" },
  payload: { session: { id, keepalive_timeout_seconds: 30 } },
});
const notification = (text: string) => ({
  metadata: {
    message_type: "notification",
    subscription_type: "channel.chat.message",
    message_id: "delivery-1",
    message_timestamp: new Date().toISOString(),
  },
  payload: {
    subscription: {
      id: "subscription-1",
      type: "channel.chat.message",
      condition: { broadcaster_user_id: "channel", user_id: "host" },
    },
    event: {
      broadcaster_user_id: "channel",
      chatter_user_id: "viewer",
      chatter_user_name: "Viewer",
      message_id: "message-1",
      message: { text },
    },
  },
});
let calls: { path: string; body: unknown }[] = [];
let connectors: TwitchConnector[] = [];
const flush = () => vi.advanceTimersByTimeAsync(0);
function connect() {
  const state = vi.fn(),
    event = vi.fn();
  const connector = new TwitchConnector("show-1", state, event);
  connectors.push(connector);
  connector.start();
  return { connector, state, event, socket: Socket.instances[0] };
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  calls = [];
  connectors = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: RequestInfo | URL, options?: RequestInit) => {
      calls.push({
        path: String(path),
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      });
      return Response.json({ show: {} });
    }),
  );
});
afterEach(async () => {
  connectors.forEach((connector) => connector.stop());
  await flush();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("the actual Twitch browser protocol adapter", () => {
  it("subscribes only after welcome", async () => {
    const { socket, state } = connect();
    expect(calls).toHaveLength(0);
    socket.emit(welcome());
    await flush();
    expect(calls[0]).toEqual({
      path: "/api/shows/show-1/twitch/session",
      body: { sessionId: "session-1", reconnect: false },
    });
    expect(state).toHaveBeenLastCalledWith(
      "connected",
      expect.stringContaining("!forge"),
    );
  });
  it("forwards commands in order without retaining unrelated chat", async () => {
    const { socket, event } = connect();
    socket.emit(welcome());
    await flush();
    socket.emit(notification("hello everyone"));
    socket.emit(notification("!forge props glow when still"));
    socket.emit(notification("!back P1"));
    await flush();
    const commands = calls.filter((call) => call.path.endsWith("/events"));
    expect(commands).toHaveLength(2);
    expect(
      (commands[0].body as ReturnType<typeof notification>).payload.event
        .message.text,
    ).toContain("!forge");
    expect(
      (commands[1].body as ReturnType<typeof notification>).payload.event
        .message.text,
    ).toBe("!back P1");
    expect(event).toHaveBeenCalledTimes(3);
  });
  it("preserves the old socket until planned reconnect welcome", async () => {
    const { socket } = connect();
    socket.emit(welcome());
    await flush();
    socket.emit({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?reconnect=trusted",
        },
      },
    });
    expect(socket.closed).toBe(false);
    const replacement = Socket.instances[1];
    replacement.emit(welcome("session-2"));
    await flush();
    expect(socket.closed).toBe(true);
    expect(replacement.closed).toBe(false);
    expect(
      calls.filter((call) => call.path.endsWith("/session")).at(-1)?.body,
    ).toEqual({ sessionId: "session-2", reconnect: true });
  });
  it("rejects reconnect URLs outside Twitch", async () => {
    const { socket, state } = connect();
    socket.emit(welcome());
    await flush();
    socket.emit({
      metadata: { message_type: "session_reconnect" },
      payload: { session: { reconnect_url: "wss://attacker.example/ws" } },
    });
    expect(Socket.instances).toHaveLength(1);
    expect(state).toHaveBeenLastCalledWith(
      "gap",
      expect.stringContaining("unsupported"),
    );
  });
  it("shows a gap and re-subscribes after disconnect", async () => {
    const { socket, state } = connect();
    socket.emit(welcome());
    await flush();
    socket.close();
    await flush();
    expect(state).toHaveBeenLastCalledWith(
      "gap",
      expect.stringContaining("cannot be recovered"),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(Socket.instances).toHaveLength(2);
    Socket.instances[1].emit(welcome("session-2"));
    await flush();
    expect(
      calls.filter((call) => call.path.endsWith("/session")).at(-1)?.body,
    ).toEqual({ sessionId: "session-2", reconnect: false });
  });
  it("handles missed keepalive and stops on revocation", async () => {
    const { socket, state } = connect();
    socket.emit(welcome());
    await flush();
    await vi.advanceTimersByTimeAsync(32001);
    expect(socket.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    const replacement = Socket.instances[1];
    replacement.emit(welcome("session-2"));
    await flush();
    replacement.emit({ metadata: { message_type: "revocation" }, payload: {} });
    await flush();
    expect(state).toHaveBeenLastCalledWith(
      "revoked",
      expect.stringContaining("permission was revoked"),
    );
    await vi.advanceTimersByTimeAsync(60000);
    expect(Socket.instances).toHaveLength(2);
  });
});
it("prefers a human error explanation and preserves its machine code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          error: "stale_authority",
          message: "Reconnect the active game tab before changing the world.",
        },
        { status: 409 },
      ),
    ),
  );
  try {
    await api("/api/example", {});
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(
      "Reconnect the active game tab before changing the world.",
    );
    expect((error as ApiError).code).toBe("stale_authority");
  }
});
