import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdaptationComposer } from "@/components/AdaptationComposer";
import {
  alternativeRequest,
  alternativeSource,
  keepNewerReviewState,
  normalizeAlternative,
} from "@/lib/adaptation-review";
import {
  adaptationLabel,
  publicRuleAncestry,
  ruleCredit,
} from "@/lib/rule-copy";
import type { Proposal } from "@/server/contracts";

const original: Proposal = {
  id: "P1",
  text: "Make gravity follow the pitch of my microphone.",
  author: "Fixture viewer",
  origin: "practice",
  createdAt: "2026-11-01T00:00:00.000Z",
  votes: 0,
  status: "selected",
};
const text = "While I hold E, gravity is one-third of normal.";
const job = { id: "synthetic-failed-job", updatedAt: original.createdAt };
const input = {
  showId: "synthetic-show",
  jobId: job.id,
  text,
  revision: 3,
  jobUpdatedAt: job.updatedAt,
};
const accepted: Proposal = {
  ...original,
  id: "P2",
  text,
  status: "open",
  ancestry: {
    kind: "adaptation",
    adaptationSource: "host-written",
    originalAuthor: original.author,
    originalText: original.text,
    originalProposalId: original.id,
    sourceJobId: job.id,
  },
};

afterEach(() => vi.restoreAllMocks());

describe("private alternative review and exact client retries", () => {
  it("classifies absent, verbatim and edited suggestions without inventing model authorship", () => {
    expect(alternativeSource(text)).toBe("host-written");
    expect(alternativeSource(text, " \n ")).toBe("host-written");
    expect(alternativeSource(`  ${text}\n`, text)).toBe("model-suggested");
    expect(alternativeSource(text, "Make every lantern glow gold.")).toBe(
      "host-edited",
    );
    expect(normalizeAlternative("  Ｈold\u0000E\n\tfor light. ")).toBe(
      "Hold E for light.",
    );
  });

  it("retains the exact command after an unknown outcome even if later polls change state tokens", () => {
    const createKey = vi.fn(() => "first-request-key");
    const first = alternativeRequest(null, input, createKey);
    const retry = alternativeRequest(
      first,
      {
        ...input,
        text: ` ${text} \n`,
        revision: 10,
        jobUpdatedAt: "2026-11-01T01:00:00.000Z",
      },
      createKey,
    );
    expect(retry).toBe(first);
    expect(retry.body).toEqual({
      text,
      expectedRevision: 3,
      expectedJobUpdatedAt: job.updatedAt,
    });
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("gives edits, another job and another show distinct request identities", () => {
    let next = 0;
    const createKey = () => `request-${++next}`;
    const first = alternativeRequest(null, input, createKey);
    const edit = alternativeRequest(
      first,
      { ...input, text: "Make lanterns glow while I hold E." },
      createKey,
    );
    const otherJob = alternativeRequest(
      first,
      { ...input, jobId: "other-failure" },
      createKey,
    );
    const otherShow = alternativeRequest(
      first,
      { ...input, showId: "other-show" },
      createKey,
    );
    expect(
      new Set(
        [first, edit, otherJob, otherShow].map(
          (request) => request.idempotencyKey,
        ),
      ).size,
    ).toBe(4);
    expect(first.body.text).toBe(text);
  });

  it("can bind a new reviewed state after a definite server rejection", () => {
    const retry = alternativeRequest(
      null,
      { ...input, revision: 4 },
      () => "new-review-key",
    );
    expect(retry.body.expectedRevision).toBe(4);
    expect(retry.body.text).toBe(text);
  });

  it("preserves a newer polled world when an old save response arrives", () => {
    const saved = { id: input.showId, revision: 3, active: "old-law" };
    const current = { id: input.showId, revision: 4, active: "new-law" };
    expect(keepNewerReviewState(current, saved)).toBe(current);
    expect(keepNewerReviewState(saved, current)).toBe(current);
    expect(keepNewerReviewState(null, saved)).toBe(saved);
  });
});

describe("alternative form semantics", () => {
  const render = (
    overrides: Partial<Parameters<typeof AdaptationComposer>[0]> = {},
  ) => {
    const onCreate = vi.fn(async () => {});
    const html = renderToStaticMarkup(
      createElement(AdaptationComposer, {
        showId: input.showId,
        job,
        revision: input.revision,
        original,
        selected: false,
        busy: false,
        onCreate,
        onSelect: () => {},
        ...overrides,
      }),
    );
    expect(onCreate).not.toHaveBeenCalled();
    return html;
  };

  it("offers a blank, host-written form when the real refusal shape has no suggestion", () => {
    const html = render();
    expect(html).toContain("Codex did not suggest an alternative");
    expect(html).toContain("Host-written wording");
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(html).toContain("Only you can see this draft");
    expect(html).toContain("No generation starts until you choose Forge");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("shows a genuine suggestion as editable model wording without starting a job", () => {
    const html = render({ job: { ...job, adaptedProposal: text } });
    expect(html).toContain("Codex suggested the wording below");
    expect(html).toContain("Model-suggested wording");
    expect(html).toContain(text);
    expect(html).toContain("Create reviewed alternative");
    expect(html).not.toContain("Forge this adaptation");
  });

  it("restores immutable accepted wording, attribution and an explicit selection path after reload", () => {
    const html = render({ accepted });
    expect(html).toContain("Host-written alternative");
    expect(html).toContain("Original idea by Fixture viewer");
    expect(html).toContain("Select P2 to forge");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('type="submit"');
  });

  it("explains a moderated original or accepted alternative rather than exposing a submit path", () => {
    const draft = render({ original: { ...original, status: "hidden" } });
    expect(draft).toContain("The original idea was moderated");
    expect(draft).toMatch(/<textarea[^>]*disabled=""/);
    const saved = render({ accepted: { ...accepted, status: "rejected" } });
    expect(saved).toContain("This alternative was moderated");
    expect(saved).not.toContain("<button");
  });
});

describe("adaptation authorship survives later presentation", () => {
  it.each(["sample", "library"] as const)(
    "does not label a fresh alternative to a %s-origin idea as reused source",
    (origin) => {
      const credit = ruleCredit({ ...accepted, origin });
      expect(credit).toContain("host-written alternative");
      expect(credit).not.toContain("reused");
    },
  );

  it("limits projector ancestry to accepted public credit, excluding original text and failure lineage", () => {
    expect(publicRuleAncestry(accepted.ancestry)).toEqual({
      kind: "adaptation",
      originalAuthor: "Fixture viewer",
      adaptationSource: "host-written",
    });
    expect(JSON.stringify(publicRuleAncestry(accepted.ancestry))).not.toMatch(
      /microphone|sourceJobId|originalProposalId|originalText|synthetic-failed-job/,
    );
    expect(publicRuleAncestry(undefined)).toBeUndefined();
  });

  it.each(["host-written", "host-edited", "model-suggested"] as const)(
    "retains %s attribution through a saved-law reuse",
    (adaptationSource) => {
      const ancestry = { ...accepted.ancestry!, adaptationSource };
      expect(ruleCredit({ ...accepted, ancestry })).toContain(
        `${adaptationLabel(adaptationSource).toLowerCase()} alternative`,
      );
      expect(
        ruleCredit({
          ...accepted,
          origin: "library",
          ancestry: { ...ancestry, kind: "library" },
        }),
      ).toBe(
        `Original idea by Fixture viewer · ${adaptationLabel(adaptationSource).toLowerCase()} alternative (reused from library)`,
      );
    },
  );

  it("does not invent model provenance for historical alternatives without a source label", () => {
    const ancestry = { ...accepted.ancestry!, adaptationSource: undefined };
    expect(ruleCredit({ ...accepted, ancestry })).toBe(
      "Original idea by Fixture viewer · host-reviewed alternative",
    );
  });
});
