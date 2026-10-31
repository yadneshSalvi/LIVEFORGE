"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Maximize2, Radio } from "lucide-react";
import { Brand } from "./Brand";
import { GameViewport } from "./GameViewport";
import type { GameSnapshot } from "@/game/contracts";

interface BroadcastFrame {
  type: "frame";
  snapshot: GameSnapshot;
  mode: "practice" | "twitch";
  phase: string;
  paused?: boolean;
  active: { name: string; description: string; author: string } | null;
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
        event.data.snapshot?.version === "last-light/1.0.0"
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
              <p className="eyebrow">
                THE LAST LIGHT / 0{Math.min(2, frame.snapshot.checkpoint) + 1}
              </p>
              <h1>
                {frame.snapshot.completed
                  ? "The beacon lives."
                  : CHAPTERS[Math.min(2, frame.snapshot.checkpoint)]}
              </h1>
            </div>
            <div>
              <Brand />
              {frame.mode === "practice" && (
                <p
                  className="pill pill-brass"
                  style={{
                    display: "flex",
                    marginTop: 10,
                    justifyContent: "center",
                  }}
                >
                  PRACTICE SESSION
                </p>
              )}
            </div>
          </div>
          {frame.active && (
            <div className="broadcast-law">
              <p className="eyebrow">YOUR COMMUNITY CHANGED THE RULES</p>
              <h2>{frame.active.name}</h2>
              <p>Invented by {frame.active.author}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="broadcast-empty">
          <Brand />
          <Radio size={28} style={{ color: "var(--mint)", marginTop: 20 }} />
          <h1>Your world is on its way.</h1>
          <p>
            Keep the host studio open in this browser profile. This projector
            receives the real game’s frames; it does not start a second
            simulation.
          </p>
          <Link className="button button-primary" href="/studio">
            Open the studio <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      {stale && (
        <div className="broadcast-disconnect">
          The studio has stopped sending frames. The last view is preserved.
        </div>
      )}
      <div className="broadcast-actions">
        <button
          className="button button-outline"
          onClick={() => void document.documentElement.requestFullscreen()}
        >
          <Maximize2 size={16} />
          Fullscreen projector
        </button>
      </div>
    </main>
  );
}
