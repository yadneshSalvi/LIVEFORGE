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
    ancestry?: { kind: string; originalAuthor: string };
  } | null,
): string {
  if (
    proposal?.origin === "sample" ||
    proposal?.author === "Previously generated sample"
  )
    return "From a previously generated sample (reused)";
  if (proposal?.origin === "library")
    return `Saved law by ${proposal.ancestry?.originalAuthor || proposal.author || "the original contributor"} (reused)`;
  if (proposal?.ancestry?.kind === "adaptation")
    return `Invented by ${proposal.ancestry.originalAuthor || proposal.author || "the host"} · adapted with creator approval`;
  return `Invented by ${proposal?.author || "the host"}`;
}

export function proposalOrigin(origin: string): string {
  if (origin === "sample") return "REUSED ARTIFACT";
  if (origin === "library") return "SAVED LAW";
  if (origin === "adaptation") return "APPROVED ADAPTATION";
  return origin === "twitch" ? "TWITCH IDEA" : "HOST PRACTICE";
}
