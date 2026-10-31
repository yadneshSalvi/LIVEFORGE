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

Pending final follow-up deployment and real generation from the retained original failure.
