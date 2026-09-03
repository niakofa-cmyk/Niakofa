/**
 * Relationship labels stay explicitly probabilistic because this engine
 * produces derived-sketch similarity, not shared-cM or IBD matching.
 */
export function relationshipBandCopy(band: string, confidence: string): string {
  const normalized = confidence.toLowerCase();
  const hedge =
    normalized === "high"
      ? "Stronger signal — still verify with records."
      : normalized === "medium"
        ? "Moderate signal — needs genealogy corroboration."
        : "Weak signal — treat as a research lead only.";
  return `${band} (${hedge})`;
}

export const DNA_ENGINE_DISCLAIMER =
  "Niakofa compares compact derived DNA sketches among opted-in members only. This is not CODIS, not shared-cM/IBD matching, and not a consumer-network match from a provider like AncestryDNA or 23andMe.";