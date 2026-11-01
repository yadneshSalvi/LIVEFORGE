import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/Brand";
export const metadata = { title: "How it's built" };
const contributions = [
  [
    "A bounded rule language",
    "Codex helped build composable mechanics for physics, light, surfaces and objects.",
    "src/game/rules.ts",
  ],
  [
    "Independent verification",
    "Deterministic scenarios check generated laws and their combinations before approval.",
    "src/game/verifier.ts",
  ],
  [
    "Runtime generation",
    "A selected idea becomes source through the Codex SDK, with isolated execution and recorded evidence.",
    "src/server/generation.ts",
  ],
  [
    "Twitch participation",
    "Chat intake, support choices and moderation connect the audience to the shortlist.",
    "src/server/twitch.ts",
  ],
  [
    "Human approval",
    "Preview and approval bind the reviewed source to the exact law entering the world.",
    "src/server/show.ts",
  ],
];
export default function HowBuiltPage() {
  return (
    <div>
      <AppHeader />
      <main className="guide-main public-guide how-built">
        <h1>How it&apos;s built</h1>
        <div className="architecture-strip" aria-label="Architecture">
          <span>Twitch idea</span>
          <span aria-hidden="true">→</span>
          <span>Codex source</span>
          <span aria-hidden="true">→</span>
          <span>Verifier</span>
          <span aria-hidden="true">→</span>
          <span>Host approval</span>
          <span aria-hidden="true">→</span>
          <span>Game</span>
        </div>
        <section className="contribution-list" aria-label="Codex contributions">
          {contributions.map(([title, description, path]) => (
            <article key={path}>
              <h2>
                <a
                  href={`https://github.com/yadneshSalvi/LIVEFORGE/blob/main/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {title} ↗
                </a>
              </h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
