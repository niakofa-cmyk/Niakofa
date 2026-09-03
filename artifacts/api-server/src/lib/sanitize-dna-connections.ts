/**
 * Defense-in-depth boundary for DNA Connections responses.
 * Keep internal identifiers, fingerprints, emails, vectors, and timestamps out.
 */
const PUBLIC_CANDIDATE_FIELDS = [
  "id",
  "candidate_name",
  "candidate_family_name",
  "relation_note",
  "similarity_score",
  "confidence",
  "source",
  "relationship_band",
] as const;

type PublicField = (typeof PUBLIC_CANDIDATE_FIELDS)[number];
export type PublicDnaCandidate = { [K in PublicField]: unknown };

export function sanitizeDnaCandidate(row: Record<string, unknown>): PublicDnaCandidate {
  const clean = {} as PublicDnaCandidate;
  for (const field of PUBLIC_CANDIDATE_FIELDS) clean[field] = row[field] ?? null;
  return clean;
}

export function sanitizeConnectionsPayload<
  T extends { candidates?: Array<Record<string, unknown>>; [key: string]: unknown },
>(payload: T) {
  return {
    ...payload,
    candidates: Array.isArray(payload.candidates) ? payload.candidates.map(sanitizeDnaCandidate) : [],
  };
}