/** Display copy for the exhibited artifact. Exact source and program stay immutable. */
export function ruleDescription(
  description: string,
  sourceHash: string,
): string {
  if (
    sourceHash ===
    "5e87b5815309d8054626dddbd952ab661d00d302f0c5540e60c6409938531dfc"
  )
    return "Leave a prop still for half a second. Its lantern-cast shadow becomes a solid bridge. Move the prop or switch off the lantern, and the bridge disappears.";
  return description;
}
