"use client";
import { useEffect, useState } from "react";
import { Check, Heart, Radio, Sparkles } from "lucide-react";
import { ForgeMark } from "./Brand";
import { overlayDuration, overlayView } from "@/lib/overlay";
import { proposalOrigin, ruleCredit } from "@/lib/rule-copy";
import type { PublicShowState } from "@/server/contracts";
import styles from "./OverlayBoard.module.css";

/** Independent public projection: no host session, game worker or BroadcastChannel. */
export function OverlayBoard({
  showId,
  previewMode = false,
}: {
  showId: string;
  previewMode?: boolean;
}) {
  const [show, setShow] = useState<PublicShowState | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [background, setBackground] = useState(previewMode);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/shows/${encodeURIComponent(showId)}`,
          {
            cache: "no-store",
            credentials: "omit",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12000),
            ]),
          },
        );
        if (!response.ok) throw new Error("Public show unavailable");
        const result = (await response.json()) as { show: PublicShowState };
        if (alive) {
          setShow(result.show);
          setDisconnected(false);
        }
      } catch {
        if (alive) setDisconnected(true);
      } finally {
        if (alive) timer = setTimeout(refresh, 2000);
      }
    };
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [showId]);
  const view = show ? overlayView(show, now) : null;
  return (
    <main
      className={`${styles.canvas} ${background ? styles.background : ""}`}
      aria-label="LIVEFORGE public broadcast overlay"
    >
      {previewMode && (
        <div className={styles.previewTools}>
          <span>OVERLAY PREVIEW · OBS canvas 1920 × 1080</span>
          <button
            onClick={() => setBackground((value) => !value)}
            aria-pressed={background}
          >
            {background ? "Show transparency" : "Show preview background"}
          </button>
          <a href={`/overlay/${showId}`} target="_blank" rel="noreferrer">
            Open transparent OBS output ↗
          </a>
        </div>
      )}
      <header className={styles.invitation}>
        <div className={styles.signature}>
          <ForgeMark size={28} />
          <strong>
            LIVE<span>FORGE</span>
          </strong>
          <i />
          {show?.mode === "practice"
            ? "PRACTICE WORLD"
            : show?.twitch.channelLogin
              ? `@${show.twitch.channelLogin}`
              : "COMMUNITY WORLD"}
        </div>
        <h1>
          Invent the next <em>law.</em>
        </h1>
        <p>Small what-ifs. Real changes to the world.</p>
        <div className={styles.commands}>
          <code>
            !forge <span>your idea</span>
          </code>
          <code>
            !back <span>P1</span>
          </code>
        </div>
        <p className={styles.hint}>
          {show?.mode === "practice"
            ? "Host-authored practice ideas · live Twitch commands are not connected"
            : show?.votingOpen === false
              ? "The shortlist is closed while the creator decides."
              : "Propose in Twitch chat. Back one idea. The creator approves every law."}
        </p>
      </header>

      <aside className={styles.shortlist} aria-label="Community shortlist">
        <section
          className={`${styles.phaseCard} ${view?.working ? styles.forging : ""}`}
        >
          <div className={styles.phaseTop}>
            <span>
              <Radio size={14} /> ROUND{" "}
              {String(show?.round || 1).padStart(2, "0")}
            </span>
            <span>{disconnected ? "UPDATES PAUSED" : "LIVE STATUS"}</span>
          </div>
          <h2>
            {view?.phase ||
              (disconnected
                ? "Waiting to reconnect"
                : "Opening the community’s world")}
          </h2>
          {view?.working && view.elapsedSeconds !== null && (
            <p className={styles.elapsed}>
              {overlayDuration(view.elapsedSeconds)}{" "}
              <span>elapsed · real generation job</span>
            </p>
          )}
          {show?.generation?.status === "ready" && show.phase === "preview" && (
            <p className={styles.phaseDetail}>
              The live world waits for an exact-version preview and approval.
            </p>
          )}
          {view?.working && (
            <div className={styles.activity} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </section>
        <div className={styles.shortlistHeading}>
          <h2>Next possibilities</h2>
          <span>{view?.ranked.length || 0} ON THE BOARD</span>
        </div>
        <div className={styles.proposals}>
          {view?.ranked.map((proposal, index) => (
            <article
              className={`${styles.proposal} ${proposal.status === "selected" ? styles.selected : ""}`}
              key={proposal.id}
            >
              <div className={styles.proposalTop}>
                <b>{proposal.id}</b>
                <span>
                  {proposal.status === "selected"
                    ? "CREATOR’S PICK"
                    : proposalOrigin(proposal.origin)}
                </span>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </div>
              <p>{proposal.text}</p>
              <div className={styles.proposalFoot}>
                <span>{proposal.author}</span>
                <strong>
                  <Heart size={13} />
                  {proposal.votes}
                </strong>
              </div>
              <div className={styles.supportTrack}>
                <span
                  style={{
                    width: `${Math.round((proposal.votes / view.maxVotes) * 100)}%`,
                  }}
                />
              </div>
            </article>
          ))}
          {view && !view.ranked.length && (
            <div className={styles.empty}>
              <Sparkles size={26} />
              <h3>A little possibility starts here.</h3>
              <p>
                {show?.mode === "practice"
                  ? "The host is gathering practice ideas."
                  : "Send !forge and a what-if to the connected Twitch chat."}
              </p>
            </div>
          )}
        </div>
        <p className={styles.supportNote}>
          Support counts are choices, not viewer counts. They reset each round.
        </p>
      </aside>

      <section className={styles.laws} aria-label="Approved laws in the world">
        {view?.moment && (
          <div className={styles.moment}>
            <Check size={14} />
            {view.moment}
          </div>
        )}
        <div className={styles.lawGrid}>
          {view?.laws.map((law, index) => (
            <article className={styles.law} key={`${index}-${law.sourceHash}`}>
              <div className={styles.lawLabel}>
                <Sparkles size={15} /> APPROVED LAW{" "}
                {view.laws.length > 1
                  ? `${index + 1} / ${view.laws.length}`
                  : ""}
              </div>
              <h2>{law.name}</h2>
              <p>{law.description}</p>
              <span>{ruleCredit(law)}</span>
            </article>
          ))}
        </div>
      </section>
      <footer className={styles.footer}>
        <span>
          THE LAST LIGHT <i /> COMMUNITY IDEAS. CREATOR APPROVED.
        </span>
        {disconnected && (
          <strong role="status">
            Live updates interrupted · last confirmed state
          </strong>
        )}
      </footer>
    </main>
  );
}
