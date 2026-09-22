/** Server-side source of truth for explicit Research case transitions. */
export const RESEARCH_STATUSES = ["open", "paused", "resolved"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

function isResearchStatus(value: string): value is ResearchStatus {
  return (RESEARCH_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: ResearchStatus, to: ResearchStatus): boolean {
  if (from === to) return true;
  if (from === "open") return to === "paused" || to === "resolved";
  if (from === "paused") return to === "open" || to === "resolved";
  return from === "resolved" && to === "open";
}

export function assertTransition(
  from: string,
  to: string,
): { ok: true; status: ResearchStatus } | { ok: false; error: string } {
  if (!isResearchStatus(from)) return { ok: false, error: `Invalid current status: ${from}` };
  if (!isResearchStatus(to)) return { ok: false, error: `Invalid target status: ${to}` };
  if (!canTransition(from, to)) return { ok: false, error: `Cannot move a case from "${from}" to "${to}".` };
  return { ok: true, status: to };
}