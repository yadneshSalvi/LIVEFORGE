import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusChip } from "../src/components/StatusChip";
import { SiteFooter } from "../src/components/Brand";
import HowBuiltPage from "../src/app/how-built/page";
import { CommunityProposalCard } from "../src/components/CommunityBoard";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
describe("minimal public presentation", () => {
  it.each(["Practice", "Sample"])(
    "renders the %s honesty label as a shared chip",
    (label) => {
      const html = renderToStaticMarkup(createElement(StatusChip, null, label));
      expect(html).toContain("chip status-chip");
      expect(html).toContain(`>${label}</span>`);
    },
  );
  it("keeps sample provenance on public proposal cards without a fictitious author", () => {
    const html = renderToStaticMarkup(
      createElement(CommunityProposalCard, {
        proposal: {
          id: "P1",
          text: "Shadows form bridges",
          author: "Previously generated sample",
          origin: "sample",
          status: "open",
          votes: 0,
          createdAt: "2026-11-01",
        },
      }),
    );
    expect(html).toMatch(/status-chip[^>]*>Sample<\/span>/);
    expect(html).not.toMatch(/Previously generated|Invented by|reused/i);
  });
  it("keeps the build page link in the footer and five concrete code contributions", () => {
    expect(renderToStaticMarkup(createElement(SiteFooter))).toContain(
      'href="/how-built"',
    );
    expect(source("components/AppHeader.tsx")).not.toContain("/how-built");
    const html = renderToStaticMarkup(createElement(HowBuiltPage));
    expect(
      html.match(/github.com\/yadneshSalvi\/LIVEFORGE\/blob\/main\//g),
    ).toHaveLength(5);
    expect(html).not.toMatch(/Built with Codex|no runtime language model/i);
  });
  it("removes decorative copy and technical readouts from public surfaces", () => {
    const landing = source("components/Landing.tsx");
    expect(landing).toContain("Codex makes it playable");
    expect(landing).not.toMatch(
      /eyebrow|hero-overline|hero-footnote|VOL\. 001|Made for Twitch/,
    );
    const overlay = source("components/OverlayBoard.tsx");
    expect(overlay).not.toMatch(
      /phaseEvents|elapsedSeconds|Support counts|Host-authored practice|real generation job/,
    );
    expect(overlay).toContain("<StatusChip>Practice</StatusChip>");
    expect(source("components/CommunityBoard.tsx")).toContain(
      "<StatusChip>Practice</StatusChip>",
    );
  });
});
