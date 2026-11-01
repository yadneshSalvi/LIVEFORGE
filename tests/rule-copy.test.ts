import { describe, expect, it } from "vitest";
import {
  isSampleLaw,
  proposalOrigin,
  ruleCredit,
  ruleDescription,
} from "../src/lib/rule-copy";

describe("honest rule presentation", () => {
  it("preserves exact generated description even for the exhibited sample hash", () => {
    const description = "The original description, including 30 ticks.";
    expect(
      ruleDescription(
        description,
        "5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc",
      ),
    ).toBe(description);
  });
  it("uses a Sample chip instead of fictitious sample credit", () => {
    expect(
      ruleCredit({ author: "Previously generated sample", origin: "practice" }),
    ).toBe("");
    expect(ruleCredit({ author: "Example", origin: "sample" })).toBe("");
    expect(ruleCredit({ author: "Viewer", origin: "twitch" })).toBe(
      "Invented by Viewer",
    );
    expect(isSampleLaw({ origin: "library", author: "Viewer" })).toBe(true);
    expect(
      isSampleLaw({
        origin: "practice",
        author: "Previously generated sample",
      }),
    ).toBe(true);
    expect(isSampleLaw({ origin: "twitch", author: "Viewer" })).toBe(false);
    expect(ruleCredit({ origin: "library", author: "Viewer" })).toBe(
      "Saved law by Viewer",
    );
    expect(proposalOrigin("sample")).toBe("Sample");
  });
});
