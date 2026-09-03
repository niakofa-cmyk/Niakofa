export type DnaProfileForMatching = {
  markerSketch: unknown;
  markerCount: number;
};

export type DnaMatchEstimate = {
  similarityScore: number;
  relationshipBand: string;
  confidence: "high" | "medium" | "low";
  source: "niakofa_derived_sketch_v1";
};

const SOURCE = "niakofa_derived_sketch_v1" as const;

function validSketch(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number =>
    Number.isInteger(item) && item >= 0 && item <= 0xffffffff,
  ))].sort((a, b) => a - b);
}

/**
 * Compare only the compact derived marker sketches. This deliberately does
 * not manufacture results when an older profile has no sketch and does not
 * claim to calculate IBD segments, ethnicity, paternity, or legal identity.
 */
export function estimateDnaRelationship(
  left: DnaProfileForMatching,
  right: DnaProfileForMatching,
): DnaMatchEstimate | null {
  const a = validSketch(left.markerSketch);
  const b = validSketch(right.markerSketch);
  if (a.length < 32 || b.length < 32) return null;
  const bSet = new Set(b);
  const overlap = a.reduce((count, item) => count + (bSet.has(item) ? 1 : 0), 0);
  const similarityScore = overlap / Math.min(a.length, b.length);
  if (similarityScore < 0.18) return null;

  // These are intentionally broad product bands over a similarity heuristic,
  // not the provider's shared-cM calculation.
  const relationshipBand = similarityScore >= 0.82
    ? "Higher similarity signal"
    : similarityScore >= 0.62
      ? "Moderate similarity signal"
      : "Lower similarity signal";
  const confidence = "low";

  return {
    similarityScore: Number(similarityScore.toFixed(4)),
    relationshipBand,
    confidence,
    source: SOURCE,
  };
}