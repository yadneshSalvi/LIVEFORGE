# Round-3 UI evidence

Before screenshots were captured from the deployed round-2 UI. After screenshots were captured from deployed round-3 source `5b011d8`, with the final Archive/Community CSS corrections and final judge flow recaptured on `c0e5acd`. The per-image manifests retain exact source, timestamp, dimensions and SHA-256: [before](before-captures.json), [after](after-captures.json). The final changes affect only the Archive Evidence title and Community proposal typography/alignment; other captured screens are unchanged.

All images were opened and visually inspected in contact sheets and individual views. The landing image was recaptured after its game finished loading. No blank placeholder is represented as a successful capture. These are browser screenshots, not OBS evidence. Practice and sample status remain explicit.

| Screen     | Before                          | After                         |
| ---------- | ------------------------------- | ----------------------------- |
| archive    | [Before](before-archive.png)    | [After](after-archive.png)    |
| broadcast  | [Before](before-broadcast.png)  | [After](after-broadcast.png)  |
| community  | [Before](before-community.png)  | [After](after-community.png)  |
| entry      | [Before](before-entry.png)      | [After](after-entry.png)      |
| evidence   | [Before](before-evidence.png)   | [After](after-evidence.png)   |
| guide      | [Before](before-guide.png)      | [After](after-guide.png)      |
| landing    | [Before](before-landing.png)    | [After](after-landing.png)    |
| law card   | [Before](before-law-card.png)   | [After](after-law-card.png)   |
| library    | [Before](before-library.png)    | [After](after-library.png)    |
| moderation | [Before](before-moderation.png) | [After](after-moderation.png) |
| not found  | [Before](before-not-found.png)  | [After](after-not-found.png)  |
| outputs    | [Before](before-outputs.png)    | [After](after-outputs.png)    |
| overlay    | [Before](before-overlay.png)    | [After](after-overlay.png)    |
| practice   | [Before](before-practice.png)   | [After](after-practice.png)   |
| preview    | [Before](before-preview.png)    | [After](after-preview.png)    |
| shows      | [Before](before-shows.png)      | [After](after-shows.png)      |
| studio     | [Before](before-studio.png)     | [After](after-studio.png)     |

Additional views: [new How it’s built page](after-how-built.png), [Archive Evidence](after-archive-details.png), [Source](after-evidence-source.png), [Verification](after-evidence-verification.png), [bridge crossed](after-bridge-crossed.png), [390 px mobile](after-mobile.png). How it’s built is new, so no prior page exists to capture.

The [production layout report](production-layout.json) contains 88 actual DOM observations across 22 screen states at 1280, 1440, 1920 and 390 px. Every observation reports zero overflow findings and no more than three text sizes. The exact review predicate runs against native DOM geometry through CDP; each row checks the requested width and a nonzero visible-element count. Modal audits include their dimmed page background. Source identities are recorded per row. Initial local findings remain separately recorded in [local-overflow-initial.json](local-overflow-initial.json); this retained subset covers candidate, preview, revision and Outputs. Other initial local audits were observed in tool output but did not persist in the accumulator; final production rows are saved directly after each screen.

[Production acceptance and remaining limitations](../review-round3-2026-11-01/production-browser.md).
