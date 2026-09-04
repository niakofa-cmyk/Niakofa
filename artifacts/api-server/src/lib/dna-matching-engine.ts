export type DnaProfileForMatching = {
  markerSketch: unknown;
  markerCount: number;
};

export type DnaMatchEstimate = {
  similarityScore: number;
  relationshipBand: string;
  confidence: "low";
  source: "niakofa_derived_sketch_v1";
};

const SOURCE = "niakofa_derived_sketch_v1" as const;
const MIN_SKETCH_MARKERS = 32;
const MIN_SIMILARITY = 0.12;

function validSketch(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number =>
    Number.isInteger(item) && item >= 0 && item <= 0xffffffff,
  ))].sort((a, b) => a - b);
}

/**
 * Compare only the compact derived marker sketches.
 *
 * The score is Jaccard similarity (intersection / union), which is symmetric
 * and avoids the old min-set denominator inflating scores when one sketch is
 * largely contained by another. It remains a discovery heuristic, not a
 * genetic relationship calculation.
 */
export function estimateDnaRelationship(
  left: DnaProfileForMatching,
  right: DnaProfileForMatching,
): DnaMatchEstimate | null {
  const a = validSketch(left.markerSketch);
  const b = validSketch(right.markerSketch);
  if (a.length < MIN_SKETCH_MARKERS || b.length < MIN_SKETCH_MARKERS) return null;

  const bSet = new Set(b);
  const overlap = a.reduce((count, item) => count + (bSet.has(item) ? 1 : 0), 0);
  const union = a.length + b.length - overlap;
  if (union === 0) return null;

  const similarityScore = overlap / union;
  if (similarityScore < MIN_SIMILARITY) return null;

  const relationshipBand = similarityScore >= 0.70
    ? "Higher similarity signal"
    : similarityScore >= 0.40
      ? "Moderate similarity signal"
      : "Lower similarity signal";

  return {
    similarityScore: Number(similarityScore.toFixed(4)),
    relationshipBand,
    confidence: "low",
    source: SOURCE,
  };
}
