# Round 2 local browser acceptance

Observed on 1 November 2026 in the Codex in-app browser against the optimized local server at `http://localhost:3100`. Runtime source: `3a74ae32747ec09ba54670cf44363fca32fbac57`; build ID: `r0KgJgn4YzUJ9Wn1o8oVs`. This is a browser rehearsal using an existing local session, not a signed-out test or a fresh generation.

## Observed journey

- Created a new practice show (`209c055f-eeef-4e64-85e7-0efa74688110`) through Your shows → New practice.
- Loaded the clearly labeled reused `SettledPropShadowBridge` artifact (`5e87b58153`). Its new verifier report showed eight checks and 16,032 simulation ticks.
- Opened Preview & decide, selected the candidate view, and exercised movement and jump controls. This brief input check does not establish measured traversal or full natural-language fidelity.
- Approved the exact candidate and activated it at a checkpoint. The studio showed one active law and retained reused-source attribution. [Active studio screenshot](local-practice-active.jpg).
- Opened the independent public overlay at 1920 × 1080. Both document dimensions matched the viewport (1920 × 1080), without horizontal or vertical overflow. The active law and reused attribution were readable. [Overlay screenshot](local-overlay-1920.jpg).
- Restored the prior checkpoint. The studio returned to collecting with no active law and showed “Recovery checkpoint saved”; the overlay showed “Law retired — the world is safe.”
- Rejected P1 through the host moderation dialog. The public community board showed only its ID and “Not selected this round,” without its proposal text, author or support controls. [Public board screenshot](local-rejected-board.jpg).
- Anonymous HTTP access to the public show returned 200, practice mode, collecting phase, no active laws and the rejected proposal state. The response contained no `ownerId`. [Public response](local-practice-public.json).
- Browser warning/error collection was empty after this flow. The world was paused and intake closed at the end.

## Scope

No public Twitch messages, new Codex generation, camera access or OBS application were involved in this local rehearsal. Repeated runtime-fault retirement, simultaneous-generation quota compensation and the new meaningful-physics/budget checks have separate automated regression coverage; this record does not pretend to trigger those faults through the browser.
