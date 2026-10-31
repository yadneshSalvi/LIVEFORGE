# LIVEFORGE — The Last Light

**You play. Chat changes the rules.** Twitch viewers invent a mechanic, Codex writes a bounded rule, and the creator plays and approves its exact version before it enters an original airborne-foundry adventure.

**[Open the live app](https://liveforge-iota.vercel.app)** · [Field guide](https://liveforge-iota.vercel.app/guide) · [Evidence](docs/evidence/README.md) · [Current review status](docs/review-progress.md)

![The real deployed adventure after beacon completion](docs/evidence/browser/production-completed.jpg)

_Actual production playthrough, 31 October 2026. The review ledger distinguishes that release from the engine 2 improvements and their ongoing acceptance._

## Try it in 60 seconds

No Twitch sign-in or API key is needed for this path.

1. Open **The studio → Enter practice**. Click the world; **A/D** move, **Space** jumps, **E** interacts, **Q** drops/picks up the ember, and **R** returns to the encounter checkpoint. Mobile has touch controls.
2. Choose **Try a generated law**. This loads an actual previously Codex-generated artifact, clearly labeled **reused**; it makes no new AI call.
3. Open **Preview & decide** and walk on the stationary prop’s solid shadow. Your live world pauses during review.
4. Approve the exact version, then **Activate** while grounded. The source supplies the stillness/light/geometry relationship; the engine has no named shadow-bridge preset.
5. **Restore previous law** returns to the prior combination and activation checkpoint. **Behind the law** shows exact source, hashes, checks and history.

The complete lower route, Counterweight Hall and Beacon Guardian work without generated laws. Carry the ember to finish the beacon.

## Let real chat invent the next law

Create a **New Twitch show**, **Connect Twitch**, then **Listen to chat**. A viewer sends `!forge <idea>`; others send `!back P1`. One current support choice per account resets each round. The creator chooses what to forge, previews the result, approves its exact ordered combination and activates it separately.

Fresh generation requires an independently authorized Twitch account and available daily quota. Defaults are **3 per account / 40 shared runs per UTC day**; explicitly exempt hosts are configurable. Anonymous visitors always retain the reused-artifact path. Optional server chat replies need separate write permission and an explicit switch; they start off, post as the host, and may appear in Shared Chat.

Try lighter gravity, an extra air jump, size while holding interact, local wind, bouncy dropped embers, or a temporary platform on landing. The studio shows the actual capability contract. After a failed run, review Codex’s suggestion or write your own alternative. **Create reviewed alternative** saves a separate, credited proposal; **Forge the selected idea** starts its fresh generation only when you choose. Model-suggested, host-edited and host-written wording stay distinguishable. The original idea and failed run are preserved.

## One world, up to three laws

Choose **Add to this world** or **Replace** before forging. Up to three ordered originals share the same limits and are verified together. Approval binds the sources, engine, prior stack, combined program and preview. Later matching property modifiers take precedence. A changed combination requires fresh review.

Save an approved law to the private **Law library** and import its exact source into another show with new verification and approval. **Moderation & chat** provides hide/reject actions and private blocked terms; broadcaster/moderator commands include `!hide P1` and `!reject P1`.

**Show outputs** provides a transparent, independent **1920 × 1080 OBS Browser Source overlay** for proposals, genuine generation progress and approved laws. Capture the separate game projector with **OBS Window Capture** in the studio’s browser profile. The overlay does not contain or independently simulate the game; keep the studio open.

## Run locally

Requires **Node.js 22.x** and npm:

```sh
npm ci
npm run setup
npm run dev
```

Open [localhost:3100](http://localhost:3100). Setup creates local session/encryption secrets without printing or replacing existing values. Development can use the ignored atomic file store; production requires Postgres.

For genuine runtime generation, configure your OpenAI key and Vercel Sandbox identity using [.env.example](.env.example) and [backend setup](docs/backend.md). Production uses request-scoped OIDC, never an uploaded expiring token. Register the exact Twitch callback `${APP_BASE_URL}/api/auth/twitch/callback`. Keep all real credentials in ignored local files or the deployment environment.

## Codex and the runtime boundary

Codex was used to build the application through real coordinating, implementation and worker threads. [Development evidence](docs/development-evidence.md) records those identifiers and observed engineering fixes. Separately, runtime generation uses the official pinned Codex SDK in an isolated, nonpersistent Vercel Sandbox.

Generated source is a **TypeScript-shaped literal compiled to bounded data**, not arbitrary executable TypeScript. Events, conditions, arithmetic, reversible physics, timed materials and capped temporary objects can compose new relationships. No generated function, import, shell, network call, secret access or engine rewrite is permitted. The dependency snapshot is prepared before any proposal, model key, session or output exists. Trusted verification checks observable effects, budgets, deterministic replay, JSON continuation and rollback; a verifier pass does not establish every detail of natural-language intent.

The fixed-step game runs in a worker with one fenced authority per show. Postgres persists checkpoints, exact approvals and recovery. Visible save/authority/fault errors preserve control. Interrupted generation fails visibly within bounded coordinator/VM lifetimes; it is not a durable resumable worker. [Architecture](docs/architecture.md), [rule contract](docs/rule-runtime.md) and [generation performance](docs/generation-performance.md) document these limits.

## Verify and inspect

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

The [review ledger](docs/review-progress.md) separates implementation, deterministic gates, browser observations, real-provider measurements and remaining acceptance. The [ten predeclared original ideas](docs/evidence/review-2026-11-01/evaluation-proposals.json) and [paired latency protocol](docs/evidence/review-2026-11-01/latency-protocol.json) preserve failures and distinguish verifier acceptance from independently measured intent. Reused or adapted laws do not count as original-proposal successes.

[MIT license](LICENSE) · [Original art, fonts and icon rights](docs/rights.md) · [Release manifest](docs/release-manifest.md)

Private plans, credentials and local state are ignored. Canonical production origin: **https://liveforge-iota.vercel.app**. Source access, actual OBS capture and submission-video publication remain release-owner actions.
