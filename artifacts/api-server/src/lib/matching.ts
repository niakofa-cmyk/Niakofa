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

export interface MatchScoreResult {
  score: number;
  reasons: string[];
}

export function computeMatchScore(
  helper: HelperProfile,
  category: string,
  urgency: string,
  distanceMiles: number
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

  return { score, reasons };
}
