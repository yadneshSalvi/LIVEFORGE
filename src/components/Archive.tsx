"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive as ArchiveIcon,
  ArrowUpRight,
  Code2,
  Download,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "./AppHeader";
import { EvidencePanel, downloadEvidence } from "./EvidencePanel";
import { api, ApiError, errorMessage, shortHash } from "@/lib/api";
import { proposalOrigin, ruleCredit, ruleDescription } from "@/lib/rule-copy";
import type {
  Candidate,
  HostShowResponse,
  ShowState,
} from "@/server/contracts";

export function Archive() {
  const [show, setShow] = useState<ShowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  useEffect(() => {
    let alive = true;
    api<HostShowResponse>("/api/shows/current")
      .then((result) => {
        if (alive) setShow(result.show);
      })
      .catch((e) => {
        if (alive && !(e instanceof ApiError && [401, 404].includes(e.status)))
          setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div>
      <AppHeader />
      <main className="archive-main">
        <div className="archive-heading">
          <div>
            <p className="eyebrow">SMALL IDEAS. LASTING POSSIBILITIES.</p>
            <h1>The archive.</h1>
            <p>
              This show’s laws and the story of how they became real. Save an
              approved law from the studio to keep it in your private Law
              library.
            </p>
          </div>
          <Link className="button button-outline" href="/studio">
            Back to the studio <ArrowUpRight size={15} />
          </Link>
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="studio-loading">
            <LoaderCircle size={22} className="spinner" />
            Opening the archive…
          </div>
        ) : !show?.candidates.length ? (
          <div className="archive-empty">
            <ArchiveIcon size={34} strokeWidth={1.2} />
            <h2>Your first law belongs here.</h2>
            <p>
              Complete a generation or try the reused artifact in practice. Its
              source, creator credit, and verification stay together in the
              archive.
            </p>
            <Link className="button button-primary" href="/studio">
              Make room for a what-if <ArrowUpRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="archive-grid">
            {show.candidates
              .slice()
              .reverse()
              .map((candidate) => {
                const proposal = show.proposals.find(
                  (p) => p.id === candidate.proposalId,
                );
                return (
                  <article className="archive-card" key={candidate.id}>
                    <div className="archive-card-art">
                      <span className="artifact-orbit" />
                      <span className="artifact-orbit" />
                      <Sparkles size={49} strokeWidth={1} />
                    </div>
                    <div className="archive-card-body">
                      <span
                        className={`pill ${candidate.activatedAt ? "pill-mint" : "pill-brass"}`}
                      >
                        {candidate.rejectedAt
                          ? "REJECTED VERSION"
                          : candidate.activatedAt
                            ? "PLAYED IN THE WORLD"
                            : candidate.approvedAt
                              ? "APPROVED"
                              : "AWAITING REVIEW"}
                      </span>
                      <h2>{candidate.program.name}</h2>
                      <p>
                        {ruleDescription(
                          candidate.program.description,
                          candidate.sourceHash,
                        )}
                      </p>
                      <span className="author-chip">
                        <span className="author-avatar">
                          {(proposal?.author || "H")[0]}
                        </span>
                        {ruleCredit(proposal)} ·{" "}
                        {proposalOrigin(
                          proposal?.origin || "practice",
                        ).toLowerCase()}
                      </span>
                      <div className="archive-card-footer">
                        <span className="mono muted" style={{ fontSize: 9 }}>
                          {shortHash(candidate.sourceHash)}
                        </span>
                        <div className="button-group">
                          <button
                            className="icon-button"
                            aria-label={`Export ${candidate.program.name}`}
                            onClick={() => downloadEvidence(show, candidate)}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            className="button button-outline button-small"
                            onClick={() => setSelected(candidate)}
                          >
                            <Code2 size={13} />
                            Evidence
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        )}
        {show && (
          <EvidencePanel
            open={Boolean(selected)}
            onClose={() => setSelected(null)}
            show={show}
            candidate={selected}
          />
        )}
      </main>
    </div>
  );
}
