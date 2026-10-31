# LIVEFORGE — The Last Light

**You play. Chat changes the rules.** An original airborne-foundry adventure where Twitch viewers invent bounded new mechanics, Codex generates a rule, and the creator previews and approves the exact version before it enters the running game.

The signature law turns a stationary prop’s projected shadow into a traversable bridge. This relationship comes from generated source, composed from the engine’s generic conditions and geometry primitives. It is not a named effect selected from a catalog.

Production target: [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app). The [release manifest](docs/release-manifest.md) records verification status; local evidence is linked below.

## Run the demonstrated experience

Requires **Node.js 22.x** and npm. No provider subscription is needed for the local baseline game or the clearly labeled reused-artifact practice path.

```sh
npm ci
npm run setup
npm run dev
```

Open [localhost:3100](http://localhost:3100), enter **The studio → Enter practice**, and explore. The setup command creates local session/encryption secrets without printing or replacing existing values. Development persists shows to ignored `.local/store` when no database is configured. Production requires Postgres.

1. Click the world to focus it. **A/D or arrows** move, **Space** jumps, **E** interacts, and **R** returns to the current encounter checkpoint. Touch controls appear on mobile.
2. Explore The Broken Crossing, wind the Counterweight Hall crank, then awaken the Beacon Guardian and deliver the ember. A lower route makes the complete adventure playable with AI disabled.
3. Choose **Try a generated law** to load an actual previously Codex-generated shadow artifact. It is visibly labeled **reused generation**; no AI call occurs in that run.
4. Open **Preview & decide**. Switch between the original world and candidate, then click the preview to play. The live world pauses during review.
5. Approve that exact version, then activate while grounded on a platform. The current world becomes the recovery checkpoint. Cross the new shadow bridge while the prop remains still.
6. Use **Restore previous law** to restore the prior law and activation checkpoint. Progress after that checkpoint resets; source and contributor credit remain in the evidence ledger.
7. Open **Behind the law** for source, actual independent checks, hashes, and history. **The archive** exports a sanitized evidence bundle.

A separate **prewritten practice sample** is available for learning the engine. Its label explicitly distinguishes it from fresh or reused Codex output.

## Run a fresh Codex generation

Configure an authorized model key and Vercel Sandbox identity in `.env.local`. See [.env.example](.env.example) and [backend setup](docs/backend.md). The coordinator runs the official `@openai/codex-sdk` in a short-lived isolated microVM. It passes only the selected proposal, public rule contract, and narrowly scoped model access; it never copies the app’s `.env`, Twitch grant, or database/deployment credentials into the guest.

In local practice, add a new supported idea, select its card, and choose **Forge the selected idea**. Watch the actual stages, independently verified result, and immutable preview/approval flow. A failed or cancelled generation leaves the active game usable. The source must create an observable effect in the trusted fixtures before review.

Hosted fresh generation requires an OAuth-authenticated Twitch host listed in `LIVEFORGE_GENERATION_HOST_IDS`. Public visitors can use the free reused-artifact path. Model/Sandbox jobs have bounded concurrency, attempts and lifetime; an overall dollar budget is not claimed.

## Run with real Twitch chat

1. Register a Twitch application with the exact callback `${APP_BASE_URL}/api/auth/twitch/callback`. Configure client ID/secret and token encryption. Local default callback: `http://localhost:3100/api/auth/twitch/callback`.
2. Use **Your shows → New Twitch show**, then **Connect Twitch** and authorize the displayed channel. Choose **Listen to chat** after returning.
3. Have a real participant send `!forge <idea>` in that channel. Their proposal and Twitch display name appear in the shortlist. `!back P1` backs a proposal, with one current endorsement per account per round.
4. Select, generate, preview, approve, and activate as above. Support informs the creator; it never activates code automatically.

The host browser receives genuine EventSub WebSocket events. Token exchange, validation, refresh and subscriptions stay server-side. Only commands are forwarded; unrelated chat is not retained. A connection gap is visible because Twitch does not replay missed messages. The connector trusts its authorized host browser; it is not a cryptographically signed server-webhook provenance claim. The copied local bootstrap grant is never automatically refreshed.

## Broadcast and community views

**Show outputs** opens a clean projector and a public shortlist. The projector receives snapshots from the studio’s single authoritative worker through a same-browser channel. Open it in a separate window in the **same browser profile**, and use **OBS Window Capture**. Keep the studio open. A separate OBS Browser Source cannot receive that browser channel. The public community board polls filtered durable state and exposes no host controls or credentials.

## What the implementation supports

- Original Canvas2D scene, three authored encounters, fixed-step worker simulation, keyboard/touch input, muted-by-default original interface tones, checkpoint recovery and a clean broadcast projector.
- Real Twitch OAuth/EventSub intake, bounded proposal/vote handling, deduplication, host selection and explicit connection-gap state.
- Genuine isolated Codex source generation; six generic action primitives composed through a restricted rule language.
- Independent schema, effect, determinism, serialization and rollback checks; exact source/program/preview hashes; human approval; fenced authority and durable Postgres checkpoints.
- Cancellation, stale-job failure recovery, rejection, new revisions preserving credit, reusable generated artifacts and an inspectable evidence ledger.

Generated source is **a restricted TypeScript literal compiled to a capability-limited data program**, not arbitrary TypeScript execution. The implementation deliberately uses this bounded interpreter instead of the planned QuickJS sandbox, and original Canvas2D instead of Phaser. [Architecture and limits](docs/architecture.md), [rule runtime](docs/rule-runtime.md), and [backend](docs/backend.md) describe the actual boundaries.

## Verification and evidence

```sh
npm run typecheck
npm test
npm run build
npm run format:check
```

[Evidence index](docs/evidence/README.md) distinguishes deterministic tests, real model/Sandbox runs, real database probes and browser observations. Real generated source, SDK thread identifiers, timings, usage and verifier outcomes are retained in [generation evidence](docs/evidence/generation/README.md). Acceptance targets from private plans are not presented as measured results.

The coordinating development session is `01a190da-3cee-7a10-b7c1-e0cdbb379510`; the implementation lead thread is `01a191a4-623f-7533-9ef5-5f69ebeb704f`. These were read from the actual Codex environment. See [development evidence](docs/development-evidence.md).

## Source, rights and deployment

**Live:** [liveforge-iota.vercel.app](https://liveforge-iota.vercel.app). The [production verification record](docs/evidence/browser/2026-10-31-production.md) includes a complete deployed playthrough and a fresh hosted Codex generation.

The original code and procedural visuals are included. Bundled fonts and icons have their license notices in [asset rights](docs/rights.md). Source is licensed under [MIT](LICENSE). Private plans and credentials are intentionally ignored and are not needed to run the documented experience.

Deploy the repository root as a **Next.js / Node 22** Vercel project with a Postgres database, server secrets, exact production origin/Twitch callback and Sandbox identity. Deployment, live-chat evidence and submission readiness are separate from a successful local build. Source/judge access and any final video publication remain release-owner actions.
