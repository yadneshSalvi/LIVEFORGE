import { describe, expect, it } from "vitest";
import {
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
  it("labels new and historical sample credit as reuse, never a fictitious inventor", () => {
    expect(
      ruleCredit({ author: "Previously generated sample", origin: "practice" }),
    ).toBe("From a previously generated sample (reused)");
    expect(ruleCredit({ author: "Example", origin: "sample" })).toBe(
      "From a previously generated sample (reused)",
    );
    expect(ruleCredit({ author: "Viewer", origin: "twitch" })).toBe(
      "Invented by Viewer",
    );
    expect(proposalOrigin("sample")).toBe("REUSED ARTIFACT");
  });
});
