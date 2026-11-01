"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Maximize2, Radio } from "lucide-react";
import { Brand } from "./Brand";
import { GameViewport } from "./GameViewport";
import { ENGINE_VERSION, type GameSnapshot } from "@/game/contracts";
import { isSampleLaw, ruleCredit } from "@/lib/rule-copy";
import { StatusChip } from "./StatusChip";

interface BroadcastFrame {
  type: "frame";
  snapshot: GameSnapshot;
  mode: "practice" | "twitch";
  phase: string;
  paused?: boolean;
  active: {
    name: string;
    description: string;
    author: string;
    origin?: string;
    ancestry?: { kind: string; originalAuthor: string };
  } | null;
}
const CHAPTERS = [
  "The Broken Crossing",
  "The Counterweight Hall",
  "The Beacon Guardian",
];

export function BroadcastView({ showId }: { showId: string }) {
  const [frame, setFrame] = useState<BroadcastFrame | null>(null);
  const [stale, setStale] = useState(false);
  const lastFrame = useRef(0);
  useEffect(() => {
    if (!showId) return;
    const channel = new BroadcastChannel(`liveforge-${showId}`);
    channel.onmessage = (event) => {
      if (
        event.data?.type === "frame" &&
        event.data.snapshot?.version === ENGINE_VERSION
      ) {
        lastFrame.current = Date.now();
        setFrame(event.data as BroadcastFrame);
        setStale(false);
      }
    };
    channel.postMessage({ type: "hello" });
    const timer = setInterval(() => {
      if (lastFrame.current && Date.now() - lastFrame.current > 6000)
        setStale(true);
      channel.postMessage({ type: "hello" });
    }, 2000);
    return () => {
      channel.close();
      clearInterval(timer);
    };
  }, [showId]);
  return (
    <main className="broadcast-page">
      <GameViewport observer snapshot={frame?.snapshot} showHud={false} />
      {frame ? (
        <div className="broadcast-chrome">
          <div className="broadcast-header">
            <div className="broadcast-heading">
              <h1>
                {frame.snapshot.completed
                  ? "The beacon lives."
                  : CHAPTERS[Math.min(2, frame.snapshot.checkpoint)]}
              </h1>
            </div>
            <div>
              <Brand />
              {frame.mode === "practice" && (
                <StatusChip variant="warm">Practice</StatusChip>
              )}
            </div>
          </div>
          {frame.active && (
            <div className="broadcast-law">
              <h2>{frame.active.name}</h2>
              {isSampleLaw(frame.active) && (
                <StatusChip variant="warm">Sample</StatusChip>
              )}
              {ruleCredit(frame.active) && <p>{ruleCredit(frame.active)}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="broadcast-empty">
          <Brand />
          <Radio size={28} style={{ color: "var(--mint)", marginTop: 20 }} />
          <h1>Waiting for the studio</h1>
          <Link className="button button-primary" href="/studio">
            Open the studio <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      {stale && <div className="broadcast-disconnect">Studio disconnected</div>}
      <div className="broadcast-actions">
        <button
          className="button button-outline"
          onClick={() => void document.documentElement.requestFullscreen()}
        >
          <Maximize2 size={16} />
          Fullscreen
        </button>
      </div>
    </main>
  );
}
