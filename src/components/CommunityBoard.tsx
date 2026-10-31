"use client";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Radio, Sparkles } from "lucide-react";
import { Brand } from "./Brand";
import { api, errorMessage } from "@/lib/api";
import { ruleDescription } from "@/lib/rule-copy";
import type { PublicShowState } from "@/server/contracts";

export function CommunityBoard({ showId }: { showId: string }) {
  const [show, setShow] = useState<PublicShowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      api<{ show: PublicShowState }>(`/api/shows/${showId}`)
        .then((result) => {
          if (alive) {
            setShow(result.show);
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError(errorMessage(e));
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [showId]);
  return (
    <div className="community-page">
      <header className="community-header">
        <Brand />
        <span
          className={`pill ${show?.mode === "practice" ? "pill-brass" : "pill-mint"}`}
        >
          <Radio size={11} />
          {show?.mode === "practice"
            ? "PRACTICE BOARD"
            : show?.twitch.channelLogin
              ? `@${show.twitch.channelLogin}`
              : "COMMUNITY BOARD"}
        </span>
      </header>
      <main className="community-main">
        <div className="community-heading">
          <p className="eyebrow">YOUR NEXT WHAT-IF COULD CHANGE EVERYTHING</p>
          <h1>
            Make a little
            <br />
            <span style={{ color: "var(--mint)" }}>possibility.</span>
          </h1>
          <p>
            {show?.mode === "practice"
              ? "This is a host’s practice board. These ideas are labeled practice; they are not live Twitch submissions."
              : "Invent a law in Twitch chat. Back a good idea. Watch the creator bring your community’s imagination into the world."}
          </p>
        </div>
        <div className="command-block community-command">
          <span>!forge &lt;your idea&gt;</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>!back P1</span>
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {show?.active && (
          <div className="notice notice-success">
            <Sparkles size={20} />
            <div>
              <strong>Now in the world: {show.active.name}</strong>
              <p>
                {ruleDescription(
                  show.active.description,
                  show.active.sourceHash,
                )}{" "}
                · Invented by {show.active.author}
              </p>
            </div>
          </div>
        )}
        {show && show.proposals.length ? (
          <div className="community-grid">
            {show.proposals
              .slice()
              .sort(
                (a, b) =>
                  b.votes - a.votes || a.createdAt.localeCompare(b.createdAt),
              )
              .map((proposal) => (
                <article key={proposal.id} className="proposal-card">
                  <div className="proposal-card-head">
                    <span className="proposal-id">{proposal.id}</span>
                    <span className="proposal-origin">
                      {proposal.origin === "practice"
                        ? "HOST PRACTICE"
                        : "TWITCH IDEA"}
                    </span>
                  </div>
                  <p>{proposal.text}</p>
                  <div className="proposal-card-foot">
                    <span className="author-chip">
                      <span className="author-avatar">
                        {proposal.author[0]}
                      </span>
                      {proposal.author}
                    </span>
                    <span className="support-button">
                      <Heart size={13} />
                      {proposal.votes}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <div className="empty-forge" style={{ minHeight: 220 }}>
            <MessageCircle size={30} />
            <h3>The forge is open.</h3>
            <p>
              {show
                ? "The next idea could be yours. Send !forge in the connected Twitch chat."
                : "Opening this community’s board…"}
            </p>
          </div>
        )}
        <p className="community-notice">
          One current support choice per account, with no paid priority. The
          creator chooses what enters the game. Every candidate is checked and
          previewed before approval. Support counts are contributions, not
          viewer counts.
        </p>
      </main>
    </div>
  );
}
