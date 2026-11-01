"use client";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, Sparkles } from "lucide-react";
import { Brand, SiteFooter } from "./Brand";
import { StatusChip } from "./StatusChip";
import { overlayView } from "@/lib/overlay";
import { api, errorMessage } from "@/lib/api";
import { CAPABILITY_HINT } from "@/lib/capabilities";
import { isSampleLaw, ruleCredit, ruleDescription } from "@/lib/rule-copy";
import type { PublicProposal, PublicShowState } from "@/server/contracts";

export function CommunityProposalCard({
  proposal,
  showSample = true,
}: {
  proposal: PublicProposal;
  showSample?: boolean;
}) {
  if (proposal.status === "hidden") return null;
  if (proposal.status === "rejected")
    return (
      <article className="proposal-card">
        <div className="proposal-card-head">
          <span className="proposal-id">{proposal.id}</span>
          <span className="proposal-origin">Not selected this round</span>
        </div>
      </article>
    );
  return (
    <article className="proposal-card">
      <div className="proposal-card-head">
        <span className="proposal-id">{proposal.id}</span>
        {showSample && isSampleLaw(proposal) && <StatusChip>Sample</StatusChip>}
      </div>
      <p>{proposal.text}</p>
      <div className="proposal-card-foot">
        {proposal.author !== "Previously generated sample" && (
          <span className="author-chip">
            {proposal.ancestry?.kind === "adaptation"
              ? ruleCredit(proposal)
              : proposal.author}
          </span>
        )}
        <span className="support-button">
          <Heart size={13} />
          {proposal.votes}
        </span>
      </div>
    </article>
  );
}

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
  return <CommunityPresentation show={show} error={error} />;
}

export function CommunityPresentation({
  show,
  error = null,
}: {
  show: PublicShowState | null;
  error?: string | null;
}) {
  const view = show ? overlayView(show) : null;
  return (
    <div className="community-page">
      <header className="community-header">
        <Brand />
        {show?.mode === "practice" ? (
          <StatusChip>Practice</StatusChip>
        ) : show?.twitch.channelLogin ? (
          <StatusChip>@{show.twitch.channelLogin}</StatusChip>
        ) : null}
        {view?.hasSample && <StatusChip>Sample</StatusChip>}
      </header>
      <main className="community-main">
        <div className="community-heading">
          <h1>Community board</h1>
        </div>
        <div className="command-block community-command">
          <span>!forge &lt;your idea&gt;</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>!back P#</span>
        </div>
        <p className="community-notice">{CAPABILITY_HINT}</p>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {view && (
          <section className="community-phase">
            <h2>{view.phase}</h2>
            {view.proposalText && <p>{view.proposalText}</p>}
            {view.proposalCredit && <p>{view.proposalCredit}</p>}
          </section>
        )}
        {(show?.activeLaws || (show?.active ? [show.active] : [])).map(
          (law, index) => (
            <div
              className="notice notice-success"
              key={`${index}-${law.sourceHash}`}
            >
              <Sparkles size={20} />
              <div>
                <strong>{law.name}</strong>
                <p>
                  {ruleDescription(law.description, law.sourceHash)}
                  {ruleCredit(law) && <> · {ruleCredit(law)}</>}
                </p>
              </div>
            </div>
          ),
        )}
        {view?.ranked.length ? (
          <div className="community-grid">
            {view?.ranked.map((proposal) => (
              <CommunityProposalCard
                key={proposal.id}
                proposal={proposal}
                showSample={false}
              />
            ))}
          </div>
        ) : (
          <div className="empty-forge" style={{ minHeight: 220 }}>
            <MessageCircle size={30} />
            <p>{show ? "No ideas yet" : "Opening board…"}</p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
