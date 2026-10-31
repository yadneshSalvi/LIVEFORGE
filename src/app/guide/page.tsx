import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RULE_CAPABILITY_HINTS } from "@/game/rules";
export const metadata = { title: "Field guide" };

export default function GuidePage() {
  return (
    <div>
      <AppHeader />
      <main className="guide-main">
        <p className="eyebrow">A FIELD GUIDE TO THE POSSIBLE</p>
        <h1>
          Your first night
          <br />
          at the forge.
        </h1>
        <p className="guide-lead">
          You carry the ember. Your community invents what the world can do.
          Here is how to turn a good what-if into a law worth playing.
        </p>
        <section className="guide-section">
          <h2>Run your first round.</h2>
          <ol className="guide-steps">
            <li>
              <div>
                <h3>Find your feet.</h3>
                <p>
                  Enter practice and click the game to focus it. Explore The
                  Broken Crossing, turn the counterweight crank, and awaken the
                  Warden. The lower route works without a generated law.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Invite an idea.</h3>
                <p>
                  In a Twitch show, connect your channel, then choose Listen to
                  chat. Ask someone to send <code>!forge &lt;idea&gt;</code>. In
                  practice, use the clearly labeled host idea field. Choose a
                  relationship between movement, light, geometry, materials, or
                  timing.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Choose what deserves a chance.</h3>
                <p>
                  Viewers back a proposal with <code>!back P1</code>. One
                  current support choice per account; a later valid choice
                  replaces the earlier one. Support helps you choose. It never
                  publishes a law automatically.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Make it playable.</h3>
                <p>
                  Connect a Twitch account for a fresh Codex generation within
                  the daily limits shown in the studio. Anyone can load a
                  previously generated law, clearly labeled as reused.
                  Generation runs while your current world remains playable.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Try the exact version.</h3>
                <p>
                  Open Preview & decide. Compare the original world with the
                  candidate and play it yourself. Your live world pauses while
                  you review. Source and independent checks are available in
                  Behind the law.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3>Bring it into the world.</h3>
                <p>
                  Approve the exact candidate. Return to a grounded platform and
                  activate it at a checkpoint. Choose to add it to your existing
                  laws or replace them. Up to three laws can shape the world
                  together; the preview checks that exact ordered combination.
                  Restore previous law returns to the previous combination and
                  its saved activation checkpoint.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="guide-section">
          <h2>A small set of controls.</h2>
          <table className="guide-table">
            <thead>
              <tr>
                <th>CONTROL</th>
                <th>WHAT IT DOES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>A / D</code> or <code>← / →</code>
                </td>
                <td>
                  Move through the foundry. Click the world first to give it
                  keyboard focus.
                </td>
              </tr>
              <tr>
                <td>
                  <code>Space</code>
                </td>
                <td>Jump. Release it before your next jump.</td>
              </tr>
              <tr>
                <td>
                  <code>E</code>
                </td>
                <td>
                  Move a nearby prop, toggle the lantern, wind the
                  counterweight, or awaken the Warden. The instruction below the
                  game describes the closest interaction.
                </td>
              </tr>
              <tr>
                <td>
                  <code>Q</code>
                </td>
                <td>
                  Drop the ember or pick it up when nearby. Carry it to complete
                  the beacon.
                </td>
              </tr>
              <tr>
                <td>
                  <code>R</code>
                </td>
                <td>Return to the current encounter checkpoint.</td>
              </tr>
              <tr>
                <td>Pause / sound / fullscreen</td>
                <td>
                  Use the controls below the world. Sound starts muted. Mobile
                  shows touch controls.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="guide-section">
          <h2>What can a law change?</h2>
          <p>
            A law can change the courier, crates, lanterns and dropped ember
            through a bounded set of capabilities. Try a clear relationship:
            lighter gravity near a lamp, an extra jump in the air, a platform
            after each landing, or a crate that stays bouncy for three seconds.
          </p>
          <div className="capability-chips">
            {RULE_CAPABILITY_HINTS.map((capability) => (
              <span key={capability.title}>{capability.title}</span>
            ))}
          </div>
          <p>
            For example: “A prop’s shadow is solid while the prop stands still”
            connects stillness, light, projected geometry, and collision. The
            engine supplies the primitives. The generated rule supplies the
            relationship.
          </p>
          <div className="guide-callout">
            <p>
              Rules stay within the foundry’s physics and object limits. If an
              idea needs an unsupported capability, the studio explains the
              limitation. A suggested adaptation becomes a separate proposal
              only when you choose it, with the original contributor credited.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>Give the audience a clear view.</h2>
          <p>
            Open Show outputs and copy the transparent overlay URL into an OBS
            Browser Source at 1920 × 1080. It shows the shortlist, genuine forge
            progress and approved laws. Its preview has a background toggle so
            you can check legibility before adding it to your stream.
          </p>
          <p>
            Capture the game through the separate broadcast projector in a
            window of the same browser profile, using OBS Window Capture. Keep
            the studio open to run the game. The overlay and the public
            community board work independently in other browser contexts and
            expose only public show state.
          </p>
        </section>
        <section className="guide-section">
          <h2>Keep a good room. Keep a good law.</h2>
          <p>
            Moderation & chat lets you hide or reject ideas and set private
            blocked terms. Your broadcaster and channel moderators can use
            <code> !hide P1</code> and <code>!reject P1</code>. Support counts
            reset each round, giving the next idea a fresh start.
          </p>
          <p>
            Optional chat replies are off by default. They need separate write
            permission and an explicit switch in room settings. Replies post as
            your account, are rate limited, and may appear in Shared Chat.
          </p>
          <p>
            Save an approved law to your Law library, then import it into
            another show. It retains its source and contributor credit and needs
            fresh verification, preview and approval in the new world.
          </p>
        </section>
        <section className="guide-section">
          <h2>When a what-if needs a little work.</h2>
          <p>
            A failed or cancelled generation leaves the active game untouched. A
            changed source needs fresh approval. If chat disconnects, the studio
            shows the gap: Twitch does not replay messages missed while
            disconnected. If the game authority is lost, the world pauses until
            the active tab can recover.
          </p>
          <p>
            Restore previous law restores the world and law saved before
            activation. Progress after that moment resets. Contributor credit
            and the evidence history remain available.
          </p>
          <p>
            Progress needs saving means the checkpoint has not been acknowledged
            yet; retry without closing the studio. An earlier-engine show offers
            an explicit upgrade that archives its old save and starts the new
            world. Historical laws keep their source, but require fresh
            approval.
          </p>
        </section>
        <section className="guide-section">
          <h2>Know what is real.</h2>
          <p>
            Practice, prewritten samples, reused generated artifacts, and fresh
            runtime generations carry different labels. No audience members,
            votes, checks, or source history are fabricated. The evidence drawer
            links a proposal to source, verification, approval, and activation.
          </p>
          <p>
            Fresh generation requires your own authorized Twitch account and
            available daily quota. Everyone can explore the complete baseline
            game and use the reused-artifact path. Your host controls and saved
            law library remain private.
          </p>
          <Link className="button button-primary" href="/studio">
            Put the guide into play <ArrowUpRight size={16} />
          </Link>
        </section>
      </main>
    </div>
  );
}
