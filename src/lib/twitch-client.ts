import { api, errorMessage } from "./api";
import type { TwitchNotificationRequest } from "@/server/contracts";

const EVENTSUB_URL =
  "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
type ClientState =
  "connecting" | "connected" | "gap" | "revoked" | "disconnected";
interface Envelope {
  metadata?: { message_type?: string; subscription_type?: string };
  payload?: {
    session?: {
      id?: string;
      keepalive_timeout_seconds?: number;
      reconnect_url?: string;
    };
    event?: { message?: { text?: string } };
  };
}

/** Twitch sends events directly to the trusted host's browser. Credentials remain server-side. */
export class TwitchConnector {
  private active: WebSocket | null = null;
  private sockets = new Set<WebSocket>();
  private heartbeat: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private attempts = 0;
  private keepaliveMs = 32000;
  private lastHealthyReport = 0;
  private queue = Promise.resolve();

  constructor(
    private showId: string,
    private onState: (state: ClientState, message: string) => void,
    private onEvent: () => void,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.open(EVENTSUB_URL);
  }
  stop() {
    this.stopped = true;
    if (this.heartbeat) clearTimeout(this.heartbeat);
    if (this.retry) clearTimeout(this.retry);
    for (const socket of this.sockets) socket.close(1000, "Host disconnected");
    this.sockets.clear();
    this.active = null;
    this.onState("disconnected", "New proposals paused.");
    void this.health("disconnected", "Host disconnected the chat connector.");
  }

  private async health(
    status: Exclude<ClientState, "connecting">,
    message: string,
  ) {
    try {
      await api(`/api/shows/${this.showId}/twitch/health`, { status, message });
    } catch {
      /* connection notice remains visible locally */
    }
  }

  private touchHeartbeat(socket: WebSocket) {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => {
      if (this.active === socket && !this.stopped)
        socket.close(4000, "Keepalive expired");
    }, this.keepaliveMs);
    if (Date.now() - this.lastHealthyReport >= 25000) {
      this.lastHealthyReport = Date.now();
      void this.health("connected", "Twitch EventSub connection is healthy.");
    }
  }

  private open(url: string, migrating = false) {
    if (this.stopped) return;
    // Reconnect destinations are supplied by Twitch, but still constrained to its documented host.
    const parsed = new URL(url);
    if (
      parsed.protocol !== "wss:" ||
      parsed.hostname !== "eventsub.wss.twitch.tv"
    ) {
      this.onState(
        "gap",
        "Twitch returned an unsupported reconnect destination. Reconnect manually.",
      );
      return;
    }
    if (!migrating)
      this.onState("connecting", "Opening the Twitch connection…");
    const previous = this.active;
    const socket = new WebSocket(url);
    this.sockets.add(socket);
    if (!migrating) this.active = socket;
    socket.onmessage = (event) => {
      if (
        this.stopped ||
        typeof event.data !== "string" ||
        event.data.length > 65536
      )
        return;
      let data: Envelope;
      try {
        data = JSON.parse(event.data) as Envelope;
      } catch {
        return;
      }
      const type = data.metadata?.message_type;
      if (type === "session_welcome") {
        const sessionId = data.payload?.session?.id;
        if (!sessionId) return;
        this.keepaliveMs = Math.min(
          602000,
          Math.max(
            12000,
            (data.payload?.session?.keepalive_timeout_seconds || 30) * 1000 +
              2000,
          ),
        );
        void api(`/api/shows/${this.showId}/twitch/session`, {
          sessionId,
          reconnect: migrating,
        })
          .then(() => {
            if (this.stopped) return;
            this.active = socket;
            this.attempts = 0;
            this.touchHeartbeat(socket);
            if (migrating && previous && previous !== socket)
              previous.close(1000, "Twitch session migrated");
            this.onState(
              "connected",
              "Listening for !forge and !back in Twitch chat.",
            );
            this.onEvent();
          })
          .catch((error) => {
            this.stopped = true;
            socket.close(1000, "Subscription unavailable");
            this.onState("disconnected", errorMessage(error));
          });
      } else if (type === "session_keepalive") {
        if (socket === this.active) this.touchHeartbeat(socket);
      } else if (type === "session_reconnect") {
        const reconnect = data.payload?.session?.reconnect_url;
        if (reconnect) this.open(reconnect, true);
      } else if (type === "revocation") {
        this.stopped = true;
        this.onState(
          "revoked",
          "Twitch chat permission was revoked. Connect Twitch again to resume.",
        );
        void this.health("revoked", "Twitch revoked this chat subscription.");
        for (const connection of this.sockets)
          connection.close(1000, "Subscription revoked");
      } else if (
        type === "notification" &&
        data.metadata?.subscription_type === "channel.chat.message"
      ) {
        if (socket === this.active) this.touchHeartbeat(socket);
        const text = data.payload?.event?.message?.text || "";
        if (!/^!(forge|back)(?:\s|$)/i.test(text)) return;
        // Preserve arrival order. Unrelated chat is never forwarded or retained.
        this.queue = this.queue.then(async () => {
          if (this.stopped) return;
          try {
            await api(
              `/api/shows/${this.showId}/twitch/events`,
              data as TwitchNotificationRequest,
            );
            this.onEvent();
          } catch (error) {
            this.onState("connected", errorMessage(error));
            this.onEvent();
          }
        });
      }
    };
    socket.onclose = () => {
      this.sockets.delete(socket);
      if (this.stopped || socket !== this.active) return;
      if (this.heartbeat) clearTimeout(this.heartbeat);
      this.onState(
        "gap",
        "Chat connection interrupted. Messages sent during the gap cannot be recovered.",
      );
      void this.health(
        "gap",
        "Connection gap: Twitch does not replay missed messages.",
      );
      this.retry = setTimeout(
        () => this.open(EVENTSUB_URL),
        Math.min(30000, 2000 * 2 ** Math.min(this.attempts++, 4)),
      );
    };
    socket.onerror = () => {
      /* onclose owns reconnect and its single visible status */
    };
  }
}
