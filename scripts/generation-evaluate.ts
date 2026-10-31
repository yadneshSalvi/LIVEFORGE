/** BILLABLE only when explicitly executed. Imports and --help never start a provider call. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "../src/server/store";
import {
  addProposal,
  createGeneration,
  createShow,
  showKey,
  type ShowRecord,
} from "../src/server/show";
import {
  GENERATION_SDK_VERSION,
  runGeneration,
} from "../src/server/generation";
import { sandboxMode, type SandboxMode } from "../src/server/sandbox-runtime";
import { sanitizeGenerationFailure } from "../src/server/generation-failure";
import { ENGINE_VERSION } from "../src/game/contracts";
export interface EvaluationOptions {
  casesFile?: string;
  outputDir: string;
  sandboxMode: SandboxMode;
  help: boolean;
}
export function parseEvaluationOptions(argv: string[]): EvaluationOptions {
  const values: Record<string, string> = {};
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (option === "--help") {
      help = true;
      continue;
    }
    if (
      !["--cases-file", "--output-dir", "--sandbox-mode"].includes(option) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith("--") ||
      values[option]
    )
      throw new Error(
        "Usage: --cases-file FILE --output-dir NEW_DIRECTORY --sandbox-mode cold|snapshot",
      );
    values[option] = argv[++i];
  }
  return {
    casesFile: values["--cases-file"]
      ? path.resolve(values["--cases-file"])
      : undefined,
    outputDir: path.resolve(
      values["--output-dir"] ??
        path.join(
          "docs/evidence/generation/runs",
          new Date().toISOString().replace(/[:.]/g, "-") +
            "-" +
            randomUUID().slice(0, 8),
        ),
    ),
    sandboxMode: sandboxMode(values["--sandbox-mode"]),
    help,
  };
}
export interface EvaluationCase {
  id: string;
  proposal: string;
  heldOut: boolean;
  category?: string;
}
export function parseEvaluationCases(value: unknown): EvaluationCase[] {
  const entries = (value as { proposals?: unknown })?.proposals;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100)
    throw new Error("Cases file must contain 1–100 proposals");
  const ids = new Set<string>();
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object")
      throw new Error("Invalid evaluation case");
    const e = entry as Record<string, unknown>,
      text = e.text ?? e.proposal;
    if (
      typeof e.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id) ||
      ids.has(e.id) ||
      typeof text !== "string" ||
      text.trim().length < 5 ||
      text.length > 500
    )
      throw new Error(
        "Case IDs must be unique safe names and proposals must contain 5–500 characters",
      );
    ids.add(e.id);
    return {
      id: e.id,
      proposal: text,
      heldOut: e.heldOut === true,
      ...(typeof e.category === "string"
        ? { category: e.category.slice(0, 100) }
        : {}),
    };
  });
}
const DEFAULT_CASES = [
  {
    id: "stationary-shadow",
    heldOut: false,
    proposal:
      "A movable prop casts a solid shadow only after staying still for 30 ticks; moving it should dissolve the shadow bridge immediately.",
  },
  {
    id: "springy-landing",
    heldOut: false,
    proposal:
      "While the courier is grounded, make their material springy with bounce 0.45 and a brass glow; keep normal material while airborne.",
  },
  {
    id: "timed-proximity-lift",
    heldOut: false,
    proposal:
      "When the courier is within 100 units of the stationary prop and its timer is zero, give the courier a small upward impulse and set the prop timer to 90 ticks; mark the prop coral.",
  },
  {
    id: "falling-stepping-stone",
    heldOut: true,
    proposal:
      "Only while the courier is falling faster than 1 unit per tick, create a one-tick solid stepping stone 70 units to their right and 15 units below their feet, and give the courier a mint glow. The stone should stop renewing when they rise or land.",
  },
];
export async function evaluate(options: EvaluationOptions): Promise<void> {
  if (options.help) {
    console.log(
      "BILLABLE sequential evaluation: --cases-file FILE --output-dir NEW_DIRECTORY --sandbox-mode cold|snapshot. Existing directories are never overwritten.",
    );
    return;
  }
  let cases: EvaluationCase[] = DEFAULT_CASES;
  if (options.casesFile) {
    const bytes = await readFile(options.casesFile);
    if (bytes.byteLength > 1_000_000) throw new Error("Cases file exceeds 1MB");
    cases = parseEvaluationCases(JSON.parse(bytes.toString("utf8")));
  }
  await mkdir(path.dirname(options.outputDir), { recursive: true });
  // Reserve a unique evidence directory BEFORE creating any show/job or invoking a model.
  await mkdir(options.outputDir);
  const startedAt = new Date().toISOString(),
    records: unknown[] = [];
  for (const entry of cases) {
    let showId: string | undefined, jobId: string | undefined;
    const caseStarted = new Date().toISOString();
    let record: Record<string, unknown>;
    try {
      const show = await createShow("evaluation-" + randomUUID(), "practice");
      showId = show.id;
      const job = await getStore().update<
        ShowRecord,
        ReturnType<typeof createGeneration>
      >(showKey(show.id), (s) => {
        const proposal = addProposal(
          s,
          entry.proposal,
          "Evaluation case (synthetic input)",
          entry.id,
          "practice",
        );
        return createGeneration(s, proposal.id);
      });
      jobId = job.id;
      console.log(
        JSON.stringify({
          caseId: entry.id,
          status: "starting",
          sandboxMode: options.sandboxMode,
        }),
      );
      await runGeneration(show.id, job.id, undefined, {
        sandboxMode: options.sandboxMode,
      });
      const result = await getStore().get<ShowRecord>(showKey(show.id));
      const final = result?.jobs.find((j) => j.id === job.id);
      if (!final) throw new Error("Evaluation job record became unavailable");
      const candidate = result?.candidates.find((c) => c.jobId === job.id);
      const originalSuccess =
        final.status === "ready" &&
        !final.reused &&
        candidate?.provenance?.kind === "runtime-generation" &&
        !final.revision;
      record = {
        ...entry,
        inputOrigin: "synthetic-practice-evaluation",
        originalSuccess,
        showId: show.id,
        jobId: job.id,
        status: final.status,
        attempts: final.attempt,
        model: final.model,
        sdkVersion: GENERATION_SDK_VERSION,
        engineVersion: ENGINE_VERSION,
        threadId: final.threadId ?? null,
        createdAt: final.createdAt,
        completedAt: final.updatedAt,
        elapsedMs: Date.parse(final.updatedAt) - Date.parse(final.createdAt),
        sandboxMode: options.sandboxMode,
        sandboxTimings: final.sandboxTimings ?? null,
        phases: final.phases ?? [],
        usage: final.usage ?? null,
        attemptEvidence: final.attemptEvidence ?? [],
        message: sanitizeGenerationFailure(final.message),
        candidate: candidate
          ? {
              source: candidate.source,
              sourceHash: candidate.sourceHash,
              programHash: candidate.programHash,
              verification: candidate.verification,
            }
          : null,
      };
    } catch (error) {
      record = {
        ...entry,
        inputOrigin: "synthetic-practice-evaluation",
        originalSuccess: false,
        status: "failed",
        showId: showId ?? null,
        jobId: jobId ?? null,
        createdAt: caseStarted,
        completedAt: new Date().toISOString(),
        sandboxMode: options.sandboxMode,
        sdkVersion: GENERATION_SDK_VERSION,
        engineVersion: ENGINE_VERSION,
        message: sanitizeGenerationFailure(
          error instanceof Error ? error.message : "Evaluation failed",
        ),
        candidate: null,
      };
    }
    records.push(record);
    await writeFile(
      path.join(options.outputDir, "evaluation-" + entry.id + ".json"),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        caseId: entry.id,
        status: record.status,
        originalSuccess: record.originalSuccess,
        elapsedMs: record.elapsedMs ?? null,
      }),
    );
  }
  await writeFile(
    path.join(options.outputDir, "evaluation-summary.json"),
    JSON.stringify(
      {
        startedAt,
        completedAt: new Date().toISOString(),
        sampleCount: records.length,
        sandboxMode: options.sandboxMode,
        casesFile: options.casesFile
          ? path.relative(process.cwd(), options.casesFile)
          : "historical-four-case-default",
        inputOrigin: "synthetic-practice-evaluation",
        records,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  evaluate(parseEvaluationOptions(process.argv.slice(2))).catch((error) => {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.name : "Error",
        message: sanitizeGenerationFailure(
          error instanceof Error ? error.message : "Evaluation failed",
        ),
      }),
    );
    process.exitCode = 1;
  });
