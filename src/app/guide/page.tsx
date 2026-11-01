import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/Brand";
import { RULE_CAPABILITY_HINTS } from "@/game/rules";
export const metadata = { title: "Guide" };

const steps = [
  [
    "Explore",
    "Start Practice and click the world to play. Carry the ember, turn the counterweight, and awaken the Warden.",
  ],
  [
    "Collect ideas",
    "Connect your Twitch channel and open intake. Viewers send !forge <idea> and back a proposal with !back P1. In Practice, enter your own ideas.",
  ],
  [
    "Forge",
    "Select an idea, then Forge selected idea. Connect Twitch to use your daily allowance, or Load sample law.",
  ],
  [
    "Preview",
    "Compare Original and With law. Play the candidate before approving it; your live world pauses during review.",
  ],
  [
    "Approve",
    "Add the law or replace your current laws, then activate at a grounded checkpoint. Up to three laws can work together.",
  ],
  [
    "Recover",
    "Return to checkpoint resets the encounter. Restore previous law returns to the world saved before activation.",
  ],
];

export default function GuidePage() {
  return (
    <div>
      <AppHeader />
      <main className="guide-main public-guide">
        <h1>Guide</h1>
        <section className="guide-section">
          <h2>Your first show</h2>
          <ol className="guide-steps">
            {steps.map(([title, text]) => (
              <li key={title}>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="guide-section">
          <h2>Controls</h2>
          <table className="guide-table">
            <tbody>
              <tr>
                <td>
                  <code>A / D · ← / →</code>
                </td>
                <td>Move</td>
              </tr>
              <tr>
                <td>
                  <code>Space</code>
                </td>
                <td>Jump; release before jumping again</td>
              </tr>
              <tr>
                <td>
                  <code>E</code>
                </td>
                <td>Interact with the nearest prop</td>
              </tr>
              <tr>
                <td>
                  <code>Q</code>
                </td>
                <td>Drop or pick up the ember</td>
              </tr>
              <tr>
                <td>
                  <code>R</code>
                </td>
                <td>Return to checkpoint</td>
              </tr>
            </tbody>
          </table>
          <p>
            Click the world for keyboard focus. Touch controls appear on mobile;
            sound starts muted.
          </p>
        </section>
        <section className="guide-section">
          <h2>What can a law change?</h2>
          <div className="capability-chips">
            {RULE_CAPABILITY_HINTS.map((item) => (
              <span key={item.title}>{item.title}</span>
            ))}
          </div>
          <p>
            Try one clear relationship: lighter gravity near a lamp, an extra
            air jump, or a platform after landing.
          </p>
        </section>
        <section className="guide-section">
          <h2>Stream your show</h2>
          <p>
            Open Outputs. Add Overlay as an OBS Browser Source at 1920 × 1080.
            Open Game in the same browser profile and use Window Capture. Keep
            Studio open while playing.
          </p>
          <p>
            Share Community board for the public shortlist. Host controls and
            your Law library stay private.
          </p>
        </section>
        <section className="guide-section">
          <h2>Manage the room</h2>
          <p>
            Moderation lets you hide or reject ideas and set private blocked
            terms. Channel moderators can use !hide P1 and !reject P1. Each
            account has one current support choice per round.
          </p>
          <p>
            Chat replies need separate write permission and an explicit switch.
            Replies post as your account, are rate limited, and may appear in
            Shared Chat.
          </p>
          <p>
            Save approved laws in Library. Importing a saved law requires fresh
            verification, preview and approval.
          </p>
        </section>
        <section className="guide-section">
          <h2>Reconnect and recover</h2>
          <p>
            If chat disconnects, reconnect to resume intake; missed messages are
            not replayed. If the game connection drops, recover the active tab.
            Retry a pending checkpoint save before closing Studio.
          </p>
          <p>
            An engine upgrade archives the old save and starts a new world.
            Historical laws need fresh approval.
          </p>
        </section>
        <Link className="button button-primary" href="/studio">
          Start a show
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
