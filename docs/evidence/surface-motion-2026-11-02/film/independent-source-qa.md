# Independent source QA — revision 005

Reviewed 2026-11-02. Scope: source evidence, capture metadata, and local sampled original images. No browser, runtime mutation, new generation, or paid API use. This is a source review; encoded film, caption placement, full motion playback, sound and final delivery remain to be reviewed.

## Findings

No source-performance blocker found. The accepted generated source has SHA-256 `531134801715dafd49771a5297f352b354534009cb99e54fab03e6236ae8a414`, independently recalculated from actual bytes. The pre-approval and post-restore exports agree on candidate, source, thread and original Twitch P1 identity. The final generation is a genuine gameplay revision; it must not be presented as the initial generation succeeding unchanged. The planned generation section already reserves space for revision feedback.

The source places a 100-unit platform at x = 800 with travel = -140, giving left-edge bounds 660 to 800 and right-edge bounds 760 to 900. With ledges ending at 610 and starting at 950, minimum clearance is 50 units at each end. The one-way sweep is 140 / 72 = 1.944 seconds; an out-and-back sweep takes 3.889 seconds.

Preview source `11-preview-performance-take3`, selected 0.30 to 16.30 seconds: first jump command is at approximately 4.691 seconds, leaving 4.391 seconds before it within the selection. Release is at 5.203 seconds and jump-off at 7.503 seconds. The 2.300-second neutral input interval and sampled pictures support the carried-ride claim. Sampled frames show jump-on, rider supported by the wedge, jump-off, and grounded far landing. Both gap edges are visible during the demonstration; retain the full canvas when cropping, because the game's following camera shifts the arrival edge toward the left boundary during the final jump.

Live source `15-live-performance-take1`, selected 3.00 to 19.00 seconds: first jump command is at approximately 7.689 seconds, leaving 4.689 seconds before it within the selection. Release is at 8.201 seconds and jump-off at 10.502 seconds. Neutral interval is approximately 2.301 seconds. Sampled frames again show the complete crossing and far-side landing. The selected pre-jump interval covers more than one complete oscillation.

Original live metadata contains one adjacent arrival-order inversion involving frames 000345 and 000346. Chronological selection by original timestamp is appropriate, with original metadata and bytes retained. Largest selected native frame gap is about 0.1002 seconds in preview and 0.0834 seconds in live; these are captured-frame gaps, not a reason to describe the sources as accelerated or perfectly uniform 60 fps.

The activation and restore-dialog capture errors occur after valid frames. Only documented captured prefixes may enter the edit; no extrapolated tail is established by the recording. Later state evidence independently confirms activation and restoration. Post-restore receipt shows no active candidate, no generated surface, intake closed, player x = 556.3902834650113 / y = 400 and grounded, and checkpoint restored. Describe this as returning to the pre-activation moment; do not imply all earlier run progress or intake state is rewound.

The work ledger was initially stale at the unsupported first attempt; root reports it has now been updated with final lineage and cleanup. No outstanding source issue is assigned on that basis.

## Export review gate

Review the actual encoded result for chronological native-speed gameplay, readable captions, no covered gap edges, explicit shortened generation wait, historical development labels, exact new law and author, signed-out Sample scope, and recap identification. Check duration at most 176 seconds, complete decode, decoded frame timestamp continuity, about -14 LUFS with true peak at or below -1 dBTP, full narration/music review, and final input freshness/hash. These are pending, not claimed passed.

The two adjacent contact sheets are independently selected once-per-second source samples. They establish sampled state progression only, not full playback or sound quality.
