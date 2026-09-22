/**
 * Trust-first evidence payload for saving a DNA Connections signal to Research.
 * Signals are always possible evidence until a researcher corroborates them.
 */
export function buildDnaEvidencePayload(candidate: {
  candidate_name: string;
  candidate_family_name: string;
  similarity_score: number;
  source: string;
  relationship_band: string;
}) {
  const pct = Math.round(candidate.similarity_score * 100);
  return {
    title: `DNA similarity signal: ${candidate.candidate_name}`,
    evidence_type: "dna_profile" as const,
    confidence: "possible" as const,
    citation: `Derived sketch similarity ${pct}%; source ${candidate.source}. Candidate ${candidate.candidate_name} in ${candidate.candidate_family_name}. Band: ${candidate.relationship_band}.`,
    notes:
      "This is a low-confidence derived DNA-profile similarity signal, not shared-cM, an IBD segment, paternity evidence, ethnicity inference, or proof of a family relationship. Confirm with documents, oral history, and pedigree structure before changing the tree.",
  };
}