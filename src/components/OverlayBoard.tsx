"use client";
import { useEffect, useState } from "react";
import { Heart, Sparkles } from "lucide-react";
import { StatusChip } from "./StatusChip";
import { ForgeMark } from "./Brand";
import { overlayView } from "@/lib/overlay";
import { isSampleLaw, ruleCredit } from "@/lib/rule-copy";
import { CAPABILITY_HINT } from "@/lib/capabilities";
import type { PublicShowState } from "@/server/contracts";
import styles from "./OverlayBoard.module.css";

/** Pure phase content also used by the broadcast render regression cases. */
export function OverlayPhaseStatus({
  view,
}: {
  view: ReturnType<typeof overlayView>;
}) {
  return (
    <>
      <h2>{view.phase}</h2>
      {view.proposalText && (
        <p className={styles.phaseDetail}>{view.proposalText}</p>
      )}
      {view.proposalCredit && (
        <p className={styles.phaseDetail}>{view.proposalCredit}</p>
      )}
    </>
  );
}

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
  return (
    <OverlayPresentation
      show={show}
      showId={showId}
      disconnected={disconnected}
      now={now}
      previewMode={previewMode}
      background={background}
      onBackgroundChange={() => setBackground((value) => !value)}
    />
  );
}

export function OverlayPresentation({
  show,
  showId,
  disconnected = false,
  now = Date.now(),
  previewMode = false,
  background = false,
  onBackgroundChange,
}: {
  show: PublicShowState | null;
  showId: string;
  disconnected?: boolean;
  now?: number;
  previewMode?: boolean;
  background?: boolean;
  onBackgroundChange?: () => void;
}) {
  const view = show ? overlayView(show, now) : null;
  return (
    <main
      className={`${styles.canvas} ${background ? styles.background : ""}`}
      aria-label="LIVEFORGE public broadcast overlay"
    >
      {previewMode && (
        <div className={styles.previewTools}>
          <span>Overlay preview</span>
          <button onClick={onBackgroundChange} aria-pressed={background}>
            {background ? "Show transparency" : "Show preview background"}
          </button>
          <a href={`/overlay/${showId}`} target="_blank" rel="noreferrer">
            Open output ↗
          </a>
        </div>
      )}
      <header className={styles.invitation}>
        <div className={styles.signature}>
          <ForgeMark size={28} />
          <strong>
            LIVE<span>FORGE</span>
          </strong>
          {show?.mode === "practice" ? (
            <StatusChip>Practice</StatusChip>
          ) : show?.twitch.channelLogin ? (
            <span>@{show.twitch.channelLogin}</span>
          ) : null}
          {view?.hasSample && <StatusChip>Sample</StatusChip>}
        </div>
        <div className={styles.commands}>
          <code>
            !forge <span>your idea</span>
          </code>
          <code>
            !back <span>P#</span>
          </code>
        </div>
        <p className={styles.hint}>{CAPABILITY_HINT}</p>
      </header>

      <aside className={styles.shortlist} aria-label="Community shortlist">
        <section
          className={`${styles.phaseCard} ${view?.working ? styles.forging : ""}`}
        >
          {view ? (
            <OverlayPhaseStatus view={view} />
          ) : (
            <h2>
              {disconnected
                ? "Waiting to reconnect"
                : "Opening the community’s world"}
            </h2>
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
        </div>
        <div className={styles.proposals}>
          {view?.ranked.map((proposal) => (
            <article
              className={`${styles.proposal} ${proposal.status === "selected" ? styles.selected : ""}`}
              key={proposal.id}
            >
              <div className={styles.proposalTop}>
                <b>{proposal.id}</b>
              </div>
              <p>{proposal.text}</p>
              <div className={styles.proposalFoot}>
                <span>
                  {isSampleLaw(proposal) &&
                  proposal.author === "Previously generated sample"
                    ? ""
                    : proposal.ancestry?.kind === "adaptation"
                      ? ruleCredit(proposal)
                      : proposal.author}
                </span>
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
              <p>No ideas yet</p>
            </div>
          )}
        </div>
      </aside>

      <section className={styles.laws} aria-label="Approved laws in the world">
        <div className={styles.lawGrid}>
          {view?.laws.map((law, index) => (
            <article className={styles.law} key={`${index}-${law.sourceHash}`}>
              <h2>{law.name}</h2>
              <p>{law.description}</p>
              {ruleCredit(law) && <span>{ruleCredit(law)}</span>}
            </article>
          ))}
        </div>
      </section>
      <footer className={styles.footer}>
        {disconnected && <strong role="status">Updates paused</strong>}
      </footer>
    </main>
  );
}
