# Transient save warning after Restore

The capture operator and editor observed a short **“Progress not saving”** banner in native capture `18-confirm-restore`. Relative to the start of that source, the restore success notification appears at about 3.45 seconds, the save warning appears around 4–5 seconds, and the warning clears by about 5.8 seconds. The following native capture, `19-restored-baseline`, is clean. These are approximate visual timings, not request timestamps. The browser error log was empty; that does not mean there were no UI warnings.

The [post-restore receipt](post-restore-receipt.json), read independently at `2026-11-02T08:27:14.508Z`, confirms the persisted baseline: zero active candidates, null active artifact, no generated surfaces, a grounded courier at x = `556.3902834650113`, y = `400`, zero velocity and closed intake. The restored screenshot was taken before the later intake closure. The transient banner is retained as a UI finding rather than omitted from the release record.

## Read-only code assessment

This assessment inspected the captured release, source `b1e26e2d905290a769dde5de7281c434400513c9`; it did not change runtime code or the saved show.

- [`saveCheckpoint` in Studio](../../../../src/components/Studio.tsx#L216) prevents overlapping saves and prevents starting a save while a host action is busy. Its error handler can still set the warning for a request already in flight. A successful later save clears the warning.
- [Manual Restore](../../../../src/components/Studio.tsx#L836) pauses the game, persists rollback on the server, then restores the returned checkpoint locally. It does not wait for or cancel a checkpoint save that was sent before the action began.
- [Server checkpoint validation](../../../../src/server/checkpoint.ts#L206) requires the checkpoint's artifact and active-world hash to match the server's current law. In this run Restore changed that identity from the generated law to the baseline's null identity. A stale save containing the old generated law therefore cannot overwrite the restored baseline.
- [The document store](../../../../src/server/store.ts#L56) retries a competing database write against newly read state using a revision comparison. Validation is rerun against that state. A save that wins before Restore is superseded by Restore; an old-law save processed after Restore is rejected by validation.

The observed sequence is **consistent with a recoverable checkpoint/Restore race**: Restore succeeds, an earlier save fails later, and a subsequent save clears its warning. This is a code-supported inference. The exact failing request, HTTP status and error code were not retained for this observation, so it is not a confirmed CAS-conflict diagnosis. The final receipt independently proves the restored state persisted; this run provides no evidence of lasting progress loss.

The brief warning remains a UI issue worth a focused follow-up, such as coordinating in-flight saves with Restore or fencing outdated save notifications. No fix or new deployment was made during capture, and the release is not described as warning-free.
