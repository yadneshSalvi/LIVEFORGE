import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
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
                  An invited host can run a fresh Codex generation. Public
                  practice can load an actual previously generated artifact,
                  labeled as reused. Generation runs in an isolated workspace
                  while the baseline game remains playable.
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
                  activate it at a checkpoint. The new law replaces the previous
                  experimental law; progress and the ember remain intact.
                  Restore previous law returns to the saved activation
                  checkpoint.
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
            Codex generates a new TypeScript literal that composes a bounded
            rule language. It can query players, props, and lights; combine
            conditions; project shadows; create temporary surfaces; apply
            bounded impulses; change friction or bounce; add visual cues; and
            use timers.
          </p>
          <div className="capability-chips">
            <span>Conditions</span>
            <span>Geometry</span>
            <span>Light projection</span>
            <span>Impulses</span>
            <span>Materials</span>
            <span>Cues & timers</span>
          </div>
          <p>
            For example: “A prop’s shadow is solid while the prop stands still”
            connects stillness, light, projected geometry, and collision. The
            engine supplies the primitives. The generated rule supplies the
            relationship.
          </p>
          <div className="guide-callout">
            <p>
              This is not arbitrary game generation. Rules cannot fetch the web,
              install packages, edit the interface, read secrets, execute
              JavaScript functions, or rewrite the game engine. A proposal
              outside these capabilities needs an explicit revision.
            </p>
          </div>
        </section>
        <section className="guide-section">
          <h2>Give the audience a clear view.</h2>
          <p>
            Open Show outputs from the studio. The broadcast projector receives
            frames from the authoritative game in the same browser profile. Open
            it in its own window, then use OBS Window Capture. Keep the studio
            open. A separate OBS Browser Source does not share this browser’s
            frame channel.
          </p>
          <p>
            The public community board is a read-only shortlist. Viewers can use
            it on a phone and participate through Twitch chat. The board never
            exposes credentials or the private host controls.
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
        </section>
        <section className="guide-section">
          <h2>Know what is real.</h2>
          <p>
            Local practice, prewritten samples, reused generated artifacts, and
            fresh runtime generations carry different labels. No audience
            members, votes, checks, or source history are fabricated. The
            evidence drawer links a proposal to source, verification, approval,
            and activation.
          </p>
          <p>
            Fresh hosted generation is limited to invited, authorized Twitch
            hosts. Everyone can explore the baseline game and use the free
            reused-artifact practice path. An invitation does not grant access
            to another creator’s show.
          </p>
          <Link className="button button-primary" href="/studio">
            Put the guide into play <ArrowUpRight size={16} />
          </Link>
        </section>
      </main>
    </div>
  );
}
