# Round 2 production acceptance

Observed on 1 November 2026 at the canonical `https://liveforge-iota.vercel.app` origin. Vercel deployment `dpl_HV7eBQe6qngfzCBUxtYK8MdWsqLC` is Ready and its API reports Git source `e41209c27f3085b8d6d1c2b68705f26e5860d6da` on `main`. Its application code is the tested, frozen `3a74ae3` implementation; the intervening commits add documentation and evidence. The remote build completed successfully and the canonical alias points to this deployment.

One operator used two real accounts. The host was `yadneshsalvi96`; `yadneshujwal` sent the test commands. This establishes account separation, not two independent people or organic audience engagement. The user authorized these messages and the temporary moderator role.

## Reply toggle and real moderator

The new Twitch show was `43eb69c6-e1fa-4398-810b-7c04b8a65133`. OAuth used the expected account and existing scopes. Replies began off.

- At 05:59:52 UTC, the second account sent `!forge Give the courier moon gravity so jumps float farther.` The studio accepted P1. The chat transcript showed the command and no automatic acknowledgement before replies were enabled at 06:00:42. [Replies-off screenshot](production-replies-off.jpg).
- The host refreshed its existing optional read/write-chat grant and explicitly switched replies on. The earlier P1 did not receive a retrospective acknowledgement.
- `yadneshujwal` held a real Twitch moderator badge and sent `!hide P1` at 06:00:49. Twitch accepted the message; the studio shortlist, community board and overlay all removed P1. The evidence drawer recorded an authorized moderator action. [Studio result](production-moderator-hidden.jpg) and [anonymous public projection](production-moderator-public.json).
- The role was immediately removed with `/unmod yadneshujwal`; Twitch confirmed removal. [Removal screenshot](production-moderator-removed.jpg). Subsequent proposal messages had no moderator badge.
- At 06:01:06, the second account sent the held-E gravity proposal. P2 arrived and the host account posted one acknowledgement with the updated capability hint. A real `!back P2` produced support 1. Later, selection and activation produced the two expected additional replies. [Replies-on screenshot](production-replies-on.jpg).
- Replies were switched off again after this flow, and the UI confirmed the saved setting.

## Fresh proposal to active law

The host selected P2 and started a real Codex generation. The public overlay displayed **“Forging P2 by @yadneshujwal”**, its actual text and recorded generation milestones. At 1920 × 1080, document width and height equaled the viewport dimensions. [Generation overlay](production-overlay-generating.jpg).

The job started at 06:01:29.465 and was ready at 06:01:48.993 UTC: one observed 19.528-second run, not a latency guarantee. It used the dependency snapshot and completed on attempt 1 with eight checks and 16,032 simulation ticks. Actual Codex thread: `01a195b2-e5c8-7d52-8589-cf1688b6f8b9`.

The host opened the playable preview and exercised movement and a held-interact jump. It then approved the exact source and activated the law at a checkpoint. The studio and anonymous public state showed **Hold E for low gravity**, credited to `yadneshujwal`, as the active law. [Preview](production-preview.jpg), [active studio](production-active.jpg), [public state](production-active-public.json), and [original exported evidence](production-82e7a2b634.json).

Source SHA-256: `82e7a2b6345e9e511e6c90bd50fe9dfb1970db22a5f6db18059a8cb5ee9d4572`. Runtime artifact SHA-256: `b5b702d8356057e36e67e6bd4cb212c2a997feb83930e058b939a538004f48ff`.

The original intent probe was rerun against this exact exported source. Holding E produced gravity `1/3`; release restored `1`. The ordinary jump matched baseline (129.72 units, 47 ticks); the held-E jump reached 400.44 units over 142 ticks and landed again. All five assertions passed. These are deterministic engine measurements, separate from the brief browser play check. [Probe source](production-intent-probe.ts) and [measurements](production-intent.json).

The displayed quota changed from two personal / 39 shared runs remaining to one personal / 38 shared runs remaining: one debit for this generation.

## Signed-out production practice

A separate Chrome profile showed the explicit “Connect a Twitch account to forge fresh ideas” prompt and created practice show `d3bee051-447f-4c24-8651-369fb68a1465`. Without signing into Twitch or supplying an API key, the browser loaded the labeled reused `SettledPropShadowBridge` sample, showed eight checks and 16,032 ticks, opened the playable preview, accepted movement/jump input, approved the exact version and activated it at a checkpoint. [Signed-out active screenshot](production-signed-out-active.jpg).

Restore previous law → Restore checkpoint returned to collecting with no active law and a saved recovery checkpoint. Browser warning/error collection was empty. Intake was closed and the world paused at the end. This is a brief acceptance walkthrough, not a measured traversal or full level-completion claim.

## Scope and remaining checks

The repository is public; anonymous GitHub and raw-file requests for the license and new evaluation report returned 200. No source or credential access is required for the practice path. Actual OBS capture, a true OS-minimized/OBS-covered 15-minute studio run and optional production quota exhaustion remain separate from these observations. The in-app browser reported `document.visibilityState === "visible"` even when operated in the background; that condition is not mislabeled as a minimized-window test.
