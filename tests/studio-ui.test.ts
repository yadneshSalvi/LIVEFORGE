import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LawCardStatus, StudioTitle } from "../src/components/Studio";
import {
  CandidatePreview,
  SamplePreview,
} from "../src/components/CandidatePreview";
import { ENGINE_VERSION, type RuleProgram } from "../src/game/contracts";
import { emptyEffects } from "../src/game/runtime";
import type { Candidate, Proposal } from "../src/server/contracts";

const program: RuleProgram = {
  version: 1,
  name: "Settled shadow bridge",
  description: "A still prop casts a solid shadow.",
  rules: [
    {
      id: "shadow",
      each: "prop",
      when: { compare: { left: { field: "speed" }, op: "eq", right: 0 } },
      actions: [
        {
          type: "projectShadow",
          maxLength: 480,
          thickness: 12,
          lifetime: 1,
          solid: true,
        },
      ],
    },
  ],
};
const candidate: Candidate = {
  id: "candidate",
  jobId: "job",
  proposalId: "P1",
  source: "fixture source",
  sourceHash: "a".repeat(64),
  programHash: "b".repeat(64),
  program,
  createdAt: "2026-11-01T00:00:00Z",
  baseRevision: 1,
  verification: {
    passed: true,
    engineVersion: ENGINE_VERSION,
    ticksSimulated: 7290,
    checks: [
      {
        name: "Protected invariants",
        passed: true,
        detail: "Trusted assertions passed.",
      },
    ],
    summary: "Verified fixture",
    effects: emptyEffects(),
  },
};
const proposal: Proposal = {
  id: "P1",
  text: "Give still props a solid shadow.",
  author: "Viewer",
  origin: "twitch",
  createdAt: candidate.createdAt,
  votes: 1,
  status: "selected",
};
const preview = (source: Candidate = candidate, idea: Proposal = proposal) =>
  renderToStaticMarkup(
    createElement(CandidatePreview, {
      open: true,
      onClose: () => {},
      candidate: source,
      proposal: idea,
      baseline: null,
      onApprove: async () => {},
      onReject: async () => {},
      onRevise: async () => {},
    }),
  );
const chipCount = (html: string, label: string) =>
  (html.match(new RegExp(`status-chip[^>]*>${label}</span>`, "g")) || [])
    .length;

describe("Studio review presentation", () => {
  it("shows one Practice chip in the practice title and none for a Twitch show", () => {
    const practice = renderToStaticMarkup(
      createElement(StudioTitle, { mode: "practice" }),
    );
    expect(chipCount(practice, "Practice")).toBe(1);
    expect(practice).toContain("The Last Light");
    const twitch = renderToStaticMarkup(
      createElement(StudioTitle, { mode: "twitch" }),
    );
    expect(chipCount(twitch, "Practice")).toBe(0);
  });
  it("marks reused preview source once without inventing a contributor", () => {
    const html = preview(
      {
        ...candidate,
        provenance: {
          kind: "reused-generation",
          model: "fixture",
          generatedAt: candidate.createdAt,
        },
      },
      { ...proposal, origin: "sample", author: "Previously generated sample" },
    );
    expect(chipCount(html, "Sample")).toBe(1);
    expect(html).not.toMatch(
      /Previously generated|Invented by|No AI|no model|THE PREVIEW ROOM/,
    );
    expect(html).toContain(program.name);
    expect(html).toContain("Original");
    expect(html).toContain("With law");
  });
  it("marks the Studio law card Sample for a reused artifact only", () => {
    const card = (reused: boolean, idea: Proposal = proposal) =>
      renderToStaticMarkup(
        createElement(LawCardStatus, {
          reused,
          proposal: idea,
          onVerified: () => {},
        }),
      );
    expect(chipCount(card(true), "Sample")).toBe(1);
    expect(
      chipCount(
        card(false, {
          ...proposal,
          origin: "sample",
          author: "Previously generated sample",
        }),
        "Sample",
      ),
    ).toBe(1);
    const fresh = card(false);
    expect(chipCount(fresh, "Sample")).toBe(0);
    expect(fresh).toContain("Verified");
  });
  it("keeps fresh contributor credit without a Sample chip", () => {
    const html = preview();
    expect(chipCount(html, "Sample")).toBe(0);
    expect(html).toContain("Invented by Viewer");
  });
  it("keeps technical checks inside a closed verification disclosure and approval gated", () => {
    const html = preview();
    const details = html.match(
      /<details class="verification-disclosure">([\s\S]*?)<\/details>/,
    )?.[1];
    expect(details).toContain("Verified");
    expect(details).toContain(candidate.sourceHash);
    expect(details).toContain("7,290");
    expect(details).toContain("Protected invariants");
    expect(html).toMatch(
      /<button[^>]*class="button button-primary"[^>]*disabled=""/,
    );
    expect(html).not.toMatch(
      /Your live world is paused|Approval belongs to this exact/,
    );
  });
  it("labels the standalone sample without generation disclaimers", () => {
    const html = renderToStaticMarkup(
      createElement(SamplePreview, { open: true, onClose: () => {}, program }),
    );
    expect(chipCount(html, "Sample")).toBe(1);
    expect(html).toContain(program.description);
    expect(html).not.toMatch(/Codex|No AI|no model|PREWRITTEN/);
  });
  it("preserves adaptation credit while folding the original request into details", () => {
    const html = preview(candidate, {
      ...proposal,
      ancestry: {
        kind: "adaptation",
        originalAuthor: "OriginalViewer",
        originalText: "Original private request",
        adaptationSource: "host-edited",
      },
    });
    expect(html).toContain("Original idea by OriginalViewer");
    expect(html).toContain("host-edited alternative");
    expect(html).toMatch(
      /<details class="preview-combination"><summary>Original idea<\/summary><p>Original private request<\/p><\/details>/,
    );
  });
});
