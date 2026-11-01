"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive as ArchiveIcon,
  ArrowUpRight,
  Code2,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "./AppHeader";
import { SiteFooter } from "./Brand";
import { StatusChip } from "./StatusChip";
import { EvidencePanel } from "./EvidencePanel";
import { api, ApiError, errorMessage } from "@/lib/api";
import { isSampleLaw, ruleCredit, ruleDescription } from "@/lib/rule-copy";
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
            <h1>Archive</h1>
            {show?.mode === "practice" && <StatusChip>Practice</StatusChip>}
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
            <p>No laws yet</p>
            <Link className="button button-primary" href="/studio">
              Start a show <ArrowUpRight size={15} />
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
                      {isSampleLaw(proposal) && <StatusChip>Sample</StatusChip>}
                      <h2>{candidate.program.name}</h2>
                      <p>
                        {ruleDescription(
                          candidate.program.description,
                          candidate.sourceHash,
                        )}
                      </p>
                      {ruleCredit(proposal) && (
                        <span className="author-chip">
                          {ruleCredit(proposal)}
                        </span>
                      )}
                      <div className="archive-card-footer">
                        <div className="button-group">
                          <button
                            className="button button-outline button-small"
                            onClick={() => setSelected(candidate)}
                          >
                            <Code2 size={13} />
                            Details
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
      <SiteFooter />
    </div>
  );
}
