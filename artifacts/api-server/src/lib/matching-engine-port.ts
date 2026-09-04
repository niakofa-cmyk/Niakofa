/**
 * Stable port for future provider-grade DNA evidence.
 *
 * The current live route remains on the sketch heuristic. A future IBD or
 * licensed provider engine must implement this interface and pass the same
 * consent, retention, and legal review gates before it is selected.
 */
import { estimateDnaRelationship, type DnaProfileForMatching } from "./dna-matching-engine";

export type MatchEngineKind = "sketch" | "ibd_v1" | "licensed_api" | "none";

export interface MatchEngineInput extends DnaProfileForMatching {
  userId: number;
  familyId: number;
}

export interface MatchEngineResult {
  otherUserId: number;
  otherFamilyId: number;
  similarityScore: number;
  sharedCmEst: number | null;
  relationshipBand: string;
  confidence: "high" | "medium" | "low";
  source: string;
}

export interface MatchEngine {
  kind: MatchEngineKind;
  findMatches(input: MatchEngineInput, cohort: MatchEngineInput[]): MatchEngineResult[];
}

export function selectEngine(kind: MatchEngineKind | string | undefined): MatchEngineKind {
  if (kind === "ibd_v1" || kind === "licensed_api" || kind === "sketch" || kind === "none") {
    return kind;
  }
  return "sketch";
}

export const sketchMatchEngine: MatchEngine = {
  kind: "sketch",
  findMatches(input, cohort) {
    return cohort
      .map((candidate): MatchEngineResult | null => {
        const estimate = estimateDnaRelationship(input, candidate);
        if (!estimate) return null;
        return {
          otherUserId: candidate.userId,
          otherFamilyId: candidate.familyId,
          similarityScore: estimate.similarityScore,
          sharedCmEst: null,
          relationshipBand: estimate.relationshipBand,
          confidence: estimate.confidence,
          source: estimate.source,
        };
      })
      .filter((item): item is MatchEngineResult => item !== null);
  },
};