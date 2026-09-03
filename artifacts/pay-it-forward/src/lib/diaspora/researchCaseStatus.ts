/**
 * Research case state machine. Timeline handoff never resolves a case.
 */
export const RESEARCH_STATUSES = ["open", "paused", "resolved"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const RESEARCH_CONFIDENCE = ["unreviewed", "possible", "supported", "strong"] as const;
export type ResearchConfidence = (typeof RESEARCH_CONFIDENCE)[number];

export function isResearchStatus(value: string): value is ResearchStatus {
  return (RESEARCH_STATUSES as readonly string[]).includes(value);
}

export function isResearchConfidence(value: string): value is ResearchConfidence {
  return (RESEARCH_CONFIDENCE as readonly string[]).includes(value);
}

export function canTransition(from: ResearchStatus, to: ResearchStatus): boolean {
  if (from === to) return true;
  if (from === "open") return to === "paused" || to === "resolved";
  if (from === "paused") return to === "open" || to === "resolved";
  return from === "resolved" && to === "open";
}

export function assertTransition(from: string, to: string): ResearchStatus {
  if (!isResearchStatus(from)) throw new Error(`Invalid current status: ${from}`);
  if (!isResearchStatus(to)) throw new Error(`Invalid target status: ${to}`);
  if (!canTransition(from, to)) throw new Error(`Cannot move a case from "${from}" to "${to}".`);
  return to;
}