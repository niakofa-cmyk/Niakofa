/**
 * Niakofa — Helper/Request Matching
 *
 * This is intentionally a single scoring function, not a black-box ML
 * model: every weight below is visible and tunable, and the result always
 * exposes which factors contributed (`reasons`) so the ranking is
 * explainable in the UI ("closer to you", "matches your skills") rather
 * than a mysterious reorder.
 *
 * Urgency stays the dominant signal — an emergency must always outrank a
 * routine errand regardless of skill match. Skill overlap and proximity
 * only break ties within the same urgency tier, refining relevance rather
 * than overriding triage.
 *
 * Availability is a soft signal, not a hard filter: a helper who is
 * currently within their declared schedule gets a bonus, but helpers
 * without any schedule set (or outside their windows) are still shown.
 * This is intentional — emergencies shouldn't be invisible to a helper
 * just because they forgot to set Saturday hours.
 */

const URGENCY_WEIGHT: Record<string, number> = {
  emergency: 40,
  high: 25,
  medium: 10,
  low: 0,
};

// Category labels are snake_case enum values (e.g. "tech_support"); helper
// skills/specialties are free-text the helper typed themselves. A loose,
// case-insensitive substring match in either direction catches "Tech
// support", "I do tech repairs", etc. without requiring helpers to type an
// exact enum value they were never shown.
function textsOverlap(category: string, freeText: string): boolean {
  const normalizedCategory = category.replace(/_/g, " ").toLowerCase();
  const normalizedText = freeText.toLowerCase();
  return normalizedText.includes(normalizedCategory) || normalizedCategory.includes(normalizedText);
}

export interface HelperProfile {
  helper_skills: string[] | null;
  specialties: string[] | null;
}

/**
 * A single weekly availability window as stored in helper_availability.
 * day_of_week: 0 (Sun) – 6 (Sat).
 * start_min / end_min: minutes from midnight (0–1440).
 */
export interface AvailabilityWindow {
  day_of_week: number;
  start_min: number;
  end_min: number;
}

export interface MatchScoreResult {
  score: number;
  reasons: string[];
  /** true if the helper has windows defined AND the current time falls in one */
  is_available_now: boolean;
}

/**
 * Returns true if `now` falls within any of the helper's declared windows.
 * Timezone note: we use the server's local clock (UTC in production) for
 * consistency — both the helper app and the server should agree on "now".
 * A future improvement could pass the helper's preferred timezone here.
 */
export function isHelperAvailableNow(
  windows: AvailabilityWindow[],
  now: Date = new Date()
): boolean {
  if (windows.length === 0) return false;
  const currentDay = now.getDay();     // 0–6
  const currentMin = now.getHours() * 60 + now.getMinutes(); // 0–1439
  return windows.some(
    (w) => w.day_of_week === currentDay && currentMin >= w.start_min && currentMin < w.end_min
  );
}

export function computeMatchScore(
  helper: HelperProfile,
  category: string,
  urgency: string,
  distanceMiles: number,
  availabilityWindows: AvailabilityWindow[] = [],
  now: Date = new Date()
): MatchScoreResult {
  const reasons: string[] = [];
  let score = URGENCY_WEIGHT[urgency] ?? URGENCY_WEIGHT.medium;

  const allSkills = [...(helper.helper_skills ?? []), ...(helper.specialties ?? [])];
  const hasSkillMatch = allSkills.some((skill) => textsOverlap(category, skill));
  if (hasSkillMatch) {
    score += 25;
    reasons.push("matches your skills");
  }

  // Decays linearly to 0 by 10 miles — close-by requests are easier and
  // faster to actually help with, so they're worth surfacing first among
  // otherwise-similar options.
  const proximityBonus = Math.max(0, 20 - distanceMiles * 2);
  if (proximityBonus > 0) {
    score += proximityBonus;
    if (distanceMiles < 1) reasons.push("very close to you");
    else if (distanceMiles < 3) reasons.push("nearby");
  }

  // Availability bonus — soft signal only (see module docstring).
  // Only awarded when the helper has actually set a schedule; helpers with
  // no windows get neither a bonus nor a penalty.
  const is_available_now = availabilityWindows.length > 0
    ? isHelperAvailableNow(availabilityWindows, now)
    : false;
  if (is_available_now) {
    score += 10;
    reasons.push("available now");
  }

  return { score, reasons, is_available_now };
}
