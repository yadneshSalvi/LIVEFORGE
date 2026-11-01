import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { overlayView } from "../src/lib/overlay";
import {
  OverlayBoard,
  OverlayPhaseStatus,
} from "../src/components/OverlayBoard";
import { CommunityProposalCard } from "../src/components/CommunityBoard";
import { CAPABILITY_HINT } from "../src/lib/capabilities";
import type { PublicShowState } from "../src/server/contracts";

function fixture(): PublicShowState {
  const proposal = {
    id: "P3",
    text: "A long selected idea. ".repeat(10),
    author: "Three",
    origin: "twitch" as const,
    createdAt: "2026-11-01T00:00:00Z",
    votes: 3,
    status: "selected" as const,
  };
  return {
    id: "show",
    mode: "twitch",
    phase: "forging",
    round: 1,
    revision: 1,
    votingOpen: true,
    proposals: [proposal],
    active: null,
    generation: {
      status: "generating",
      message: "UNREVIEWED MODEL TEXT",
      createdAt: proposal.createdAt,
      proposal,
    },
    twitch: { status: "connected", channelLogin: "example" },
    events: [],
  };
}
const render = (show: PublicShowState) =>
  renderToStaticMarkup(
    createElement(OverlayPhaseStatus, { view: overlayView(show) }),
  );

describe("public broadcast and community rendering", () => {
  it.each(["queued", "starting", "generating", "verifying"] as const)(
    "credits the selected proposal while %s and limits idea length",
    (status) => {
      const show = fixture();
      show.generation!.status = status;
      expect(render(show)).toContain("Forging P3 by @Three");
      expect(overlayView(show).proposalText!.length).toBeLessThanOrEqual(90);
      expect(render(show)).toContain("A long selected idea.");
      expect(render(show)).not.toContain("UNREVIEWED MODEL TEXT");
    },
  );

  it("identifies the reviewed idea and preserves adaptation/reused credit", () => {
    const show = fixture();
    show.phase = "preview";
    show.generation!.status = "ready";
    show.proposals[0] = {
      ...show.proposals[0],
      origin: "practice",
      ancestry: {
        kind: "adaptation",
        originalAuthor: "OriginalViewer",
        adaptationSource: "host-edited",
      },
    };
    show.generation!.proposal = show.proposals[0];
    expect(render(show)).toContain("P3 by Three — streamer is reviewing");
    expect(render(show)).toContain("Original idea by OriginalViewer");
    expect(render(show)).toContain("host-edited alternative");
    show.proposals[0] = {
      ...show.proposals[0],
      origin: "sample",
      ancestry: undefined,
    };
    show.generation!.proposal = show.proposals[0];
    show.generation!.reused = true;
    expect(render(show)).toContain("previously generated sample (reused)");
    expect(render(show)).not.toContain("Invented by");
  });

  it.each(["hidden", "rejected"] as const)(
    "never projects a %s selected idea",
    (status) => {
      const show = fixture();
      show.proposals[0].status = status;
      show.generation!.proposal = show.proposals[0];
      expect(render(show)).not.toContain("selected idea");
      expect(render(show)).not.toContain("Three");
      expect(overlayView(show).proposalText).toBeNull();
    },
  );

  it("announces retirement without describing a rolled-back job as a new law", () => {
    const show = fixture();
    show.phase = "collecting";
    show.generation!.status = "ready";
    show.events.push({
      id: "rollback",
      type: "world.rollback",
      at: "2026-11-01T00:02:00Z",
      message: "ignored",
    });
    expect(render(show)).toContain("Law retired — the world is safe");
    expect(render(show)).not.toContain("NEW LAW");
  });

  it("keeps host-written alternative credit when the original Twitch origin is retained", () => {
    const show = fixture();
    show.proposals[0].ancestry = {
      kind: "adaptation",
      originalAuthor: "OriginalViewer",
      adaptationSource: "host-written",
    };
    expect(render(show)).toContain("Forging P3 by @Three");
    expect(render(show)).toContain("Original idea by OriginalViewer");
    expect(render(show)).toContain("host-written alternative");
  });

  it("credits activated reused laws without calling them newly invented", () => {
    const show = fixture();
    show.phase = "live";
    show.generation!.status = "ready";
    show.activeLaws = [
      {
        name: "Approved shadow",
        description: "Shadow bridge",
        author: "OriginalViewer",
        origin: "library",
        sourceHash: "a".repeat(64),
        programHash: "b".repeat(64),
      },
    ];
    expect(render(show)).toContain("NEW LAW: Approved shadow");
    expect(render(show)).toContain("Saved law by OriginalViewer (reused)");
    expect(render(show)).not.toContain("Invented by");
  });

  it("renders the shared current capability invitation under the overlay commands", () => {
    const html = renderToStaticMarkup(
      createElement(OverlayBoard, { showId: "show" }),
    );
    expect(html).toContain(CAPABILITY_HINT);
    expect(html.indexOf(CAPABILITY_HINT)).toBeGreaterThan(
      html.indexOf("!forge"),
    );
  });

  it("shows only the rejected proposal ID/status and suppresses hidden cards", () => {
    const proposal = {
      ...fixture().proposals[0],
      text: "REJECTED ORIGINAL TEXT",
      author: "PRIVATE AUTHOR",
      status: "rejected" as const,
    };
    const html = renderToStaticMarkup(
      createElement(CommunityProposalCard, { proposal }),
    );
    expect(html).toContain("P3");
    expect(html).toContain("Not selected this round");
    expect(html).not.toMatch(
      /REJECTED ORIGINAL TEXT|PRIVATE AUTHOR|support-button/,
    );
    expect(
      renderToStaticMarkup(
        createElement(CommunityProposalCard, {
          proposal: { ...proposal, status: "hidden" },
        }),
      ),
    ).toBe("");
  });
});
