export const RESEARCH_EVIDENCE_TYPES = [
  "document",
  "shared_segment",
  "pedigree",
  "oral_history",
  "place_history",
  "dna_profile",
] as const;

export type ResearchEvidenceType = (typeof RESEARCH_EVIDENCE_TYPES)[number];

export const RESEARCH_EVIDENCE_LABELS: Record<ResearchEvidenceType, string> = {
  document: "Document / record",
  shared_segment: "Shared DNA segment",
  pedigree: "Pedigree / family tree",
  oral_history: "Oral history",
  place_history: "Place / local history",
  dna_profile: "DNA profile signal",
};

export const RESEARCH_EVIDENCE_HELP: Record<ResearchEvidenceType, string> = {
  document: "A census, deed, certificate, register, photograph, or other record.",
  shared_segment: "A shared-segment result supplied by a supported DNA provider.",
  pedigree: "A documented relationship chain or tree-based evidence.",
  oral_history: "A recorded or transcribed family testimony.",
  place_history: "Evidence about a location, migration route, institution, or community.",
  dna_profile: "A Niakofa DNA profile signal; not the same as a provider shared-cM match.",
};

export const RESEARCH_EVIDENCE_TONES: Record<ResearchEvidenceType, "teal" | "gold" | "rose" | "emerald"> = {
  document: "teal",
  shared_segment: "gold",
  pedigree: "emerald",
  oral_history: "rose",
  place_history: "teal",
  dna_profile: "gold",
};
