"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowUpRight,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "./AppHeader";
import { SiteFooter } from "./Brand";

const Game = dynamic(
  () => import("./GameViewport").then((mod) => mod.GameViewport),
  {
    ssr: false,
    loading: () => (
      <div className="game-loading">
        <span className="ember-loader" />
        Loading world…
      </div>
    ),
  },
);

export function Landing() {
  return (
    <div className="site-page">
      <AppHeader />
      <main>
        <section className="landing-hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>
                You play.
                <br />
                Chat changes
                <br />
                <span>the rules.</span>
                <svg
                  className="hero-underline"
                  viewBox="0 0 300 18"
                  aria-hidden="true"
                >
                  <path
                    d="M2 14C80 0 197 2 296 7M34 17C99 9 220 12 270 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </h1>
              <div className="hero-ctas">
                <Link
                  href="/studio?mode=twitch"
                  className="button button-primary button-large"
                >
                  <Radio size={18} /> Start a show <ArrowUpRight size={19} />
                </Link>
                <Link href="/studio?mode=practice" className="hero-practice">
                  Explore <ArrowRight size={18} />
                </Link>
              </div>
            </div>
            <div className="hero-world">
              <Game presentation="world" showHud={false} />
              <div className="world-note">
                <span className="note-pin" />
                <Sparkles size={14} /> “What if shadows could hold your weight?”
              </div>
            </div>
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <h2>How it works</h2>
          </div>
          <div className="how-grid">
            <article className="how-card">
              <span className="how-icon">!forge</span>
              <h3>Chat invents a law</h3>
              <p>Send an idea and back your favorites.</p>
              <code>!forge shadows become bridges</code>
            </article>
            <article className="how-card">
              <Sparkles className="how-symbol" size={35} strokeWidth={1.2} />
              <h3>Codex makes it playable</h3>
              <p>Your chosen idea becomes a verified game rule.</p>
            </article>
            <article className="how-card">
              <ShieldCheck className="how-symbol" size={35} strokeWidth={1.2} />
              <h3>You approve the law</h3>
              <p>Preview it, approve it, and play.</p>
            </article>
          </div>
        </section>
        <section className="landing-invitation">
          <Link className="button button-primary button-large" href="/studio">
            Start a show <ArrowUpRight size={20} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
