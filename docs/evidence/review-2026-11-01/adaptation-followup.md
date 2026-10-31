# Refusal adaptation follow-up

## Original production observation

On deployed source `2a7e01ac223270620bb29caead990ec0b8b87847`, a real host-practice proposal, “Make gravity follow the pitch of my microphone.”, produced failed job `6b58b399-4b3c-ee2f-b4db-732ba7104a0a` in show `fb95f1f3-29be-4100-940c-2ff5b0ec0d3f`. Codex correctly explained that microphone input and pitch detection are unavailable, and returned no adaptation. The host saw the reason; the game kept running with a saved checkpoint and the reused-law fallback remained available. There was no adaptation action to review. This failure is retained in `production-unsupported-original.json` and `production-unsupported-private.jpg`.

This observation is separate from the frozen ten-original-idea evaluation and the five paired latency trials. It must not be erased or recounted as a successful original proposal.

## Acceptance declared before the follow-up

- Preserve this exact failed proposal and job without changing their model output or attributing a host-written alternative to Codex.
- Provide an explicit adaptation path even when the model returns no suggestion. Any host-authored alternative must be labeled as such, retain original proposal/contributor ancestry, and require an intentional action.
- A fresh generation must use the distinct adapted proposal; approval remains tied to the resulting exact hashes. No automatic activation or hidden model retry is permitted.
- Test omitted model suggestion, edited or host-authored alternatives, empty/oversized input, stable retry/idempotency, stale state and ownership. The public projection must not reveal unreviewed failure text or draft suggestions.
- Exercise the real browser flow locally and on the final deployment. Record the exact alternative, result, hashes and any failures.

## Public projection check

A cookie-free GET of the production public show endpoint returned HTTP 200 with `Cache-Control: no-store`. It contained neither the private microphone failure explanation nor `adaptedProposal` nor `sourceJobId`. The actual overlay displayed “That idea needs another approach” and explicitly labeled the show as practice. The response and browser screenshot are retained in `production-unsupported-public.json` and `production-unsupported-public.jpg`.

## Local browser acceptance

Source `b586ab1f823c11646db35a0d2b166fb3ef672385` passed typecheck, 350 tests in 34 files, formatting, diff checks and an isolated optimized build. Root served that build at `http://127.0.0.1:3104` and used the in-app browser. The existing localhost:3100 OAuth handoff was left untouched.

The local fixture is deliberately synthetic, not a provider result: the browser created practice show `37181d09-5e0c-41dc-8789-9eb1e5a7e689` and P1 “Synthetic QA: make gravity follow microphone pitch.” A guarded test helper added one failed job with attempt 0, model “SYNTHETIC QA — no provider call”, an explicit fixture message and no suggestion. The helper refused any show that did not match the exact disposable one-proposal/zero-job precondition. Its receipt is `adaptation-local-fixture.json`.

Observed:

- The omitted-suggestion case displayed a blank **Write an alternative** form labeled **Host-written wording**. Empty and four-character drafts left Create disabled.
- Entering “While I hold E, gravity is one-third of normal; releasing E restores normal gravity.” enabled Create. A cookie-free public read before submission contained only P1 and neither this draft nor the private fixture failure.
- **Create reviewed alternative** produced P2 with a **HOST-WRITTEN ALTERNATIVE** badge, explicit original-author credit, and a separate **go to Forge** action. P1 and the original failed job remained unchanged. A durable read confirmed two proposals, the same single synthetic job with attempt 0, and zero candidates; no generation was started.
- Reload retained the reviewed alternative and attribution. **Select P2 to forge** selected P2 and focused the Forge action region. The anonymous practice session still required Twitch authorization for fresh generation.
- After explicit creation, the public response included the alternative and its `host-written` credit, but no `sourceJobId` or `originalText`.
- At a 390 × 844 emulated viewport, document width and scroll width were both 390; the adaptation card was 312 pixels wide. Screenshot inspection showed the card, credit and controls readable without horizontal overflow. The viewport override was cleared afterward.

Receipts and screenshots: `adaptation-local-draft-public.json`, `adaptation-local-created.json`, `adaptation-local-created-public.json`, `adaptation-local-draft.jpg`, `adaptation-local-created.jpg`, and `adaptation-local-mobile.jpg`. These checks establish the UI and no-provider boundary only; real adaptation generation is recorded separately below.

## Production follow-up

Runtime source `e02c25efb838a925b92002dcc940e438c76502fc` passed 357 tests across 34 files and all release gates. Its evidence-only descendant `5fe10fbcb441180bdefc719fb9cd83b4bdec0f90` was pushed to main and deployed as `dpl_8MZL2kezSB8rxFMhCTGnnuRsAjYk` at https://liveforge-iota.vercel.app. Vercel’s remote optimized build completed all 14 static tasks. Anonymous status denied provider access; private current-show/library endpoints returned 401.

On that final production deployment, the original real failed P1/job immediately exposed the blank host-written form. The host explicitly saved the same 84-character alternative as P2, then separately chose Forge. Real job `85aacbb4-4e98-bf17-1041-30ebe597c8d0` completed in one attempt, without reuse, from `20:14:51.819Z` to `20:15:11.112Z` on 31 October UTC. Its actual Codex thread is `01a19399-d35d-7a73-95c5-6a5224bcea4c`. The generated law, **Hold E for Light Gravity**, has source hash `8654819ad5d79ca2fa24e7a4ff9a6d66bffadd800a9321954eae6c474599a60d`. This is successful generation of an explicitly changed proposal, never a success for microphone input.

The in-app browser preview showed the courier still high in the air after Space followed by a 1,100 ms E hold. The same control sequence in Original world showed the courier back on the ground. Both screenshots are retained. The host selected With your law, approved its exact version, then separately activated at a grounded checkpoint. The studio displayed 1/3 active laws and a saved recovery checkpoint. Preview, active stage and public overlay all credited “Original idea by Host · host-written alternative”. The activity record accurately described a reviewed alternative rather than a new viewer submission. No public chat message was sent.

The UI exported `liveforge.evidence/2`; exact downloaded bytes are preserved in `production-8654819ad5.json`. Independent checks recomputed source SHA-256 and matched approval to source, program, combination, context and runtime artifact. The export retains P1, its original text and original failure job as P2 ancestry. A separate durable read confirmed that the original job remains failed, its model suggestion remains absent, and exactly two provider jobs exist: the original refusal and the fresh alternative.

The separately authored `adaptation-intent-probe.ts` parsed that exact source as data and measured the requested behavior: gravity was 1 before holding E, exactly 1/3 for ten held ticks, and 1 on the first released tick. An ordinary jump with the law matched the unmodified world (47 ticks, height 129.72); holding E extended it to 142 ticks and height 400.44, with a successful landing. These are deterministic simulation measurements, separately labeled from the browser observation.

Production receipts: `adaptation-production-http.json`, `adaptation-production-integrity.json`, `adaptation-production-intent.json`, `adaptation-original-preserved.json`, and `adaptation-production-public.json`. Screenshots: `adaptation-production-created.jpg`, `adaptation-production-preview-held.jpg`, `adaptation-production-preview-original.jpg`, `adaptation-production-active.jpg`, and `adaptation-production-overlay.jpg`. The overlay’s temporary 1920 × 1080 override was cleared. The local QA server was stopped after acceptance; the pending OAuth server remained available.

**Still separate:** fresh non-allowlisted OAuth/quota, new second-account chat and optional reply/moderator acceptance need the renewed Twitch sign-in. Actual OBS broadcast and two-human remote testing are not claimed.
