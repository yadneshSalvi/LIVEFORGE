import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/game/contracts";
import {
  compileRuleSource,
  validateRuleProgram,
  validateRuntimeRuleProgram,
} from "../src/game/rules";
import { verifyRuleProgram } from "../src/game/verifier";
import * as stored from "../src/server/reused-artifact";
import { digest, hashData } from "../src/server/security";

const baseline = JSON.parse(
  readFileSync(
    new URL(
      "../docs/evidence/surface-motion-2026-11-02/backward-compat-baseline.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  engineVersion: string;
  records: {
    id: string;
    source: string;
    sourceHash: string;
    programHash: string;
    program: unknown;
    report: unknown;
    reportHash: string;
  }[];
};

describe("surface motion preserves existing generated artifacts", () => {
  it("retains the additive engine version and all pre-change source records", () => {
    expect(ENGINE_VERSION).toBe(baseline.engineVersion);
    expect(baseline.records.map((record) => record.id)).toEqual([
      "REUSED_RULE_ARTIFACT",
      "REUSED_STEP_ARTIFACT",
      "REVISION_004_SOLID_SHADOWS",
    ]);
    for (const record of baseline.records.filter((entry) =>
      entry.id.startsWith("REUSED_"),
    )) {
      const artifact = Object.entries(stored).find(
        ([id]) => id === record.id,
      )?.[1];
      expect(artifact?.source).toBe(record.source);
      expect(artifact?.sourceHash).toBe(record.sourceHash);
      expect(artifact?.programHash).toBe(record.programHash);
    }
  });

  it.each(baseline.records)(
    "$id retains its exact source, validated program and verification report",
    (record) => {
      expect(digest(record.source)).toBe(record.sourceHash);
      const program = compileRuleSource(record.source);
      expect(program).toEqual(record.program);
      expect(validateRuleProgram(program)).toEqual(record.program);
      expect(validateRuntimeRuleProgram(program)).toEqual(record.program);
      expect(hashData(program)).toBe(record.programHash);
      const report = verifyRuleProgram(program);
      expect(report.passed).toBe(true);
      expect(JSON.stringify(report)).toBe(JSON.stringify(record.report));
      expect(hashData(report)).toBe(record.reportHash);
    },
  );
});
