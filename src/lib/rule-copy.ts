import type { ProposalAncestry } from "@/server/contracts";

export function adaptationLabel(source?: ProposalAncestry["adaptationSource"]) {
  if (source === "model-suggested") return "Model-suggested";
  if (source === "host-edited") return "Host-edited";
  if (source === "host-written") return "Host-written";
  return "Host-reviewed";
}

/** Projector messages carry the same small ancestry allowlist as public HTTP output. */
export function publicRuleAncestry(ancestry?: ProposalAncestry) {
  if (!ancestry) return undefined;
  return {
    kind: ancestry.kind,
    originalAuthor: ancestry.originalAuthor,
    ...(["model-suggested", "host-edited", "host-written"].includes(
      ancestry.adaptationSource || "",
    )
      ? { adaptationSource: ancestry.adaptationSource }
      : {}),
  };
}

/** Display the artifact's actual description; never silently rewrite a generated claim. */
export function ruleDescription(
  description: string,
  _sourceHash?: string,
): string {
  return description;
}

export function ruleCredit(
  proposal?: {
    author?: string;
    origin?: string;
    ancestry?: {
      kind: string;
      originalAuthor: string;
      adaptationSource?: ProposalAncestry["adaptationSource"];
    };
  } | null,
): string {
  if (proposal?.ancestry?.kind === "adaptation")
    return `Original idea by ${proposal.ancestry.originalAuthor || proposal.author || "the host"} · ${adaptationLabel(proposal.ancestry.adaptationSource).toLowerCase()} alternative`;
  if (
    proposal?.origin === "sample" ||
    proposal?.author === "Previously generated sample"
  )
    return "From a previously generated sample (reused)";
  if (proposal?.origin === "library" && proposal.ancestry?.adaptationSource)
    return `Original idea by ${proposal.ancestry.originalAuthor || proposal.author || "the original contributor"} · ${adaptationLabel(proposal.ancestry.adaptationSource).toLowerCase()} alternative (reused from library)`;
  if (proposal?.origin === "library")
    return `Saved law by ${proposal.ancestry?.originalAuthor || proposal.author || "the original contributor"} (reused)`;
  return `Invented by ${proposal?.author || "the host"}`;
}

export function proposalOrigin(origin: string): string {
  if (origin === "sample") return "REUSED ARTIFACT";
  if (origin === "library") return "SAVED LAW";
  if (origin === "adaptation") return "APPROVED ADAPTATION";
  return origin === "twitch" ? "TWITCH IDEA" : "HOST PRACTICE";
}
