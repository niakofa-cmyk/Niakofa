/**
 * Diaspora connection model.
 *
 * This is deliberately an evidence model, not a "find my relative" oracle.
 * Genetic evidence can strengthen a genealogy hypothesis, but it cannot by
 * itself establish identity, parentage, or a family relationship.
 */

export type ConnectionEvidenceKind =
  | "document"
  | "shared_segment"
  | "pedigree"
  | "oral_history"
  | "place_history"
  | "dna_profile";

export type ConnectionConfidence = "unreviewed" | "possible" | "supported" | "strong";

export interface ConnectionEvidence {
  kind: ConnectionEvidenceKind;
  sourceId: string;
  label: string;
  confidence: ConnectionConfidence;
  reviewedByUser: boolean;
}

export interface DiasporaConnectionCandidate {
  personId: string;
  displayName: string;
  relationshipHypothesis?: string;
  evidence: ConnectionEvidence[];
  explanation: string;
  requiresReview: true;
}

/**
 * Transparent UI ordering only. This must not be presented as a probability.
 * Shared DNA is one evidence stream among several and requires provenance.
 */
export function connectionEvidenceWeight(kind: ConnectionEvidenceKind): number {
  switch (kind) {
    case "shared_segment": return 5;
    case "pedigree": return 4;
    case "document": return 4;
    case "oral_history": return 2;
    case "place_history": return 1;
    case "dna_profile": return 1;
  }
}

export function rankConnectionEvidence(evidence: ConnectionEvidence[]): number {
  return evidence.reduce((score, item) => {
    const reviewBonus = item.reviewedByUser ? 1 : 0;
    return score + connectionEvidenceWeight(item.kind) + reviewBonus;
  }, 0);
}

export function connectionReviewLabel(score: number): ConnectionConfidence {
  if (score >= 14) return "strong";
  if (score >= 8) return "supported";
  if (score >= 3) return "possible";
  return "unreviewed";
}
