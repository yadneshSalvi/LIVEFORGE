"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  MoveRight,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "./AppHeader";
import { Brand } from "./Brand";

const Game = dynamic(
  () => import("./GameViewport").then((mod) => mod.GameViewport),
  {
    ssr: false,
    loading: () => (
      <div className="game-loading">
        <span className="ember-loader" />
        Waking the foundry…
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
          <div className="hero-overline">
            <span className="small-star">✳</span> A NEW KIND OF COMMUNITY GAME
            NIGHT <span className="hero-season">VOL. 001 / THE LAST LIGHT</span>
          </div>
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
              <p>
                Every great adventure needs a little chaos.
                <br className="desktop-break" /> Let your community invent what
                happens next.
              </p>
              <div className="hero-ctas">
                <Link
                  href="/studio?mode=twitch"
                  className="button button-primary button-large"
                >
                  <Radio size={18} /> Start a show <ArrowUpRight size={19} />
                </Link>
                <Link href="/studio?mode=practice" className="hero-practice">
                  Explore the foundry <ArrowRight size={18} />
                </Link>
              </div>
              <div className="hero-footnote">
                <span className="status-dot mint" /> Made for Twitch. Built with
                Codex.
                <span className="footnote-rule" /> You have the final say.
              </div>
            </div>
            <div className="hero-world">
              <div className="world-topline">
                <span>
                  <span className="status-dot coral" /> THE LAST LIGHT
                </span>
                <span>INTERACTIVE WORLD PREVIEW</span>
              </div>
              <Game presentation="world" showHud={false} />
              <div className="world-caption">
                <span className="world-chapter">01 / THE BROKEN CROSSING</span>
                <span>One ember. A world of possibility.</span>
                <span className="world-coordinate">44° N · 08° E</span>
              </div>
              <div className="world-note">
                <span className="note-pin" />
                <Sparkles size={14} /> “What if shadows could hold your weight?”
                <span className="note-label">AN IDEA, WAITING TO HAPPEN</span>
              </div>
            </div>
          </div>
          <div className="hero-bottom">
            <a href="#how-it-works" className="scroll-cue">
              THE GAME IS ONLY THE BEGINNING <ArrowDown size={15} />
            </a>
            <div className="hero-index">
              <span>01</span> / INFINITE WHAT-IFS
            </div>
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">A LITTLE AUDIENCE. A LOT OF POSSIBILITY.</p>
            <h2>
              From “what if”
              <br />
              to <em>wait, that worked.</em>
            </h2>
            <p>
              No coding. No paid votes. Just an idea
              <br />
              good enough to change the game.
            </p>
          </div>
          <div className="how-grid">
            <article className="how-card">
              <span className="how-number">01</span>
              <span className="how-icon">!forge</span>
              <h3>Chat invents a law.</h3>
              <p>
                Throw an idea into the forge. Back the ones you love. The
                community helps shape the shortlist.
              </p>
              <code>!forge shadows become bridges</code>
            </article>
            <article className="how-card">
              <span className="how-number">02</span>
              <Sparkles className="how-symbol" size={35} strokeWidth={1.2} />
              <h3>Codex makes it playable.</h3>
              <p>
                Your chosen idea becomes a new bounded rule. Independent checks
                test it before it reaches the game.
              </p>
              <span className="how-small">
                <span className="status-dot mint" /> Real code. Inspectable
                evidence.
              </span>
            </article>
            <article className="how-card">
              <span className="how-number">03</span>
              <ShieldCheck className="how-symbol" size={35} strokeWidth={1.2} />
              <h3>You let it into the world.</h3>
              <p>
                Try the exact candidate. Approve it at a checkpoint. Play your
                community’s invention, with recovery close by.
              </p>
              <span className="how-small">
                Your show. Your final call. <MoveRight size={16} />
              </span>
            </article>
          </div>
        </section>
        <section className="landing-invitation">
          <div>
            <p className="eyebrow">THE FOUNDRY IS OPEN</p>
            <h2>
              Make something
              <br />
              worth playing together.
            </h2>
          </div>
          <Link className="button button-primary button-large" href="/studio">
            Step into the studio <ArrowUpRight size={20} />
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <Brand small />
        <p>An original world. An audience full of possibilities.</p>
        <Link href="/guide">
          Read the field guide <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
