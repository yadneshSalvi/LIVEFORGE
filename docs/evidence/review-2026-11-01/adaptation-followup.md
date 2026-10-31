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

## Follow-up result

Pending implementation and browser acceptance.
