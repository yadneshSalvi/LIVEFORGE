import { describe, expect, it } from "vitest";
import { overlayDuration, overlayView } from "../src/lib/overlay";
import type { PublicShowState } from "../src/server/contracts";

function fixture(): PublicShowState {
  return {
    id: "public-show",
    mode: "twitch",
    phase: "forging",
    round: 2,
    revision: 0,
    votingOpen: true,
    proposals: [
      {
        id: "P1",
        text: "The first public idea",
        author: "One",
        origin: "twitch",
        createdAt: "2026-11-01T00:00:00Z",
        votes: 1,
        status: "open",
      },
      {
        id: "P2",
        text: "Hidden proposal must stay hidden",
        author: "Two",
        origin: "twitch",
        createdAt: "2026-11-01T00:00:00Z",
        votes: 50,
        status: "hidden",
      },
      {
        id: "P3",
        text: "The leading public idea",
        author: "Three",
        origin: "twitch",
        createdAt: "2026-11-01T00:01:00Z",
        votes: 5,
        status: "selected",
      },
    ],
    active: null,
    generation: {
      status: "generating",
      message: "UNREVIEWED MODEL TEXT",
      createdAt: "2026-11-01T00:00:00Z",
    },
    twitch: { status: "connected", channelLogin: "example" },
    events: [
      {
        id: "private",
        at: "2026-11-01T00:00:00Z",
        type: "private.moderation",
        message: "PRIVATE MODERATOR REASON",
      },
    ],
  };
}

describe("broadcast overlay projection", () => {
  it("ranks public ideas and shows true phase/elapsed time without unreviewed reasons", () => {
    const view = overlayView(fixture(), Date.parse("2026-11-01T00:01:05Z"));
    expect(view.ranked.map((proposal) => proposal.id)).toEqual(["P3", "P1"]);
    expect(view.maxVotes).toBe(5);
    expect(view.phase).toBe("Codex is writing the law");
    expect(view.elapsedSeconds).toBe(65);
    expect(overlayDuration(view.elapsedSeconds!)).toBe("1:05");
    expect(JSON.stringify(view)).not.toMatch(
      /UNREVIEWED|PRIVATE MODERATOR|Hidden proposal/,
    );
  });

  it("does not describe an activated ready job as still awaiting review", () => {
    const show = fixture();
    show.phase = "live";
    show.generation!.status = "ready";
    show.activeLaws = [
      {
        name: "Approved",
        description: "The approved description",
        author: "Viewer",
        origin: "twitch",
        sourceHash: "a".repeat(64),
        programHash: "b".repeat(64),
      },
    ];
    show.events.push({
      id: "activated",
      at: "2026-11-01T00:01:00Z",
      type: "candidate.activated",
      message: "ignored server message",
    });
    const view = overlayView(show);
    expect(view.phase).toBe("A community law is live");
    expect(view.moment).toBe("A new possibility is live");
    expect(view.laws[0].description).toBe("The approved description");
  });
});
