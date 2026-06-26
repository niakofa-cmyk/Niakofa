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
 *
 * AI-Powered Dispatch enhancement — additional factors beyond proximity:
 *   • Trust score bonus: verified, high-rated helpers are preferred
 *   • Active workload penalty: helpers juggling too many requests get
 *     deprioritised so no one is overloaded (community sustainability)
 *   • Historical reliability: helpers who consistently complete what they
 *     accept earn a compounding bonus (rewards long-term commitment)
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

/**
 * AI-Powered Dispatch — extended match scoring parameters.
 *
 * All fields are optional so existing callers remain compatible.
 * When provided, these signals refine the ranking beyond the core
 * urgency + proximity + skills formula.
 */
export interface DispatchSignals {
  /**
   * Helper's current trust_score (0–100 scale).
   * High-trust helpers (+75) earn a significant bonus — they've proven
   * reliability to the community. Low-trust helpers get no bonus (not penalised
   * here; the anomaly worker handles active helpers with critically low scores).
   */
  trustScore?: number;

  /**
   * Number of requests currently claimed/en_route/arrived by this helper.
   * A helper with 0 active requests is preferred over one juggling 3.
   * Penalty is -4 per active request above the first (1 is fine; 2+ is a flag).
   */
  activeWorkload?: number;

  /**
   * Ratio of completed requests to total accepted requests (0.0–1.0).
   * Computed as: completed_count / max(1, completed_count + abandoned_count).
   * Helpers who consistently finish what they start earn up to +10 bonus.
   * Zero-history helpers get no bonus or penalty (they deserve a fair chance).
   */
  reliabilityRatio?: number;

  /**
   * Helper's saved service_radius_miles (their normal working area, from
   * Settings → Helper Settings). When provided alongside distanceMiles,
   * requests within this radius get a "local-first" bonus — the same
   * principle as the client-side Best Match card — so a helper is routed
   * to nearby work before being offered a long trip. A soft bias, not a
   * hard filter: urgency (the dominant signal) can still outweigh it.
   */
  serviceRadiusMiles?: number;
}

export function computeMatchScore(
  helper: HelperProfile,
  category: string,
  urgency: string,
  distanceMiles: number,
  availabilityWindows: AvailabilityWindow[] = [],
  now: Date = new Date(),
  signals: DispatchSignals = {}
): MatchScoreResult {
  const reasons: string[] = [];
  let score = URGENCY_WEIGHT[urgency] ?? URGENCY_WEIGHT.medium;

  // ── Skill overlap (+25) ──────────────────────────────────────────────────
  const allSkills = [...(helper.helper_skills ?? []), ...(helper.specialties ?? [])];
  const hasSkillMatch = allSkills.some((skill) => textsOverlap(category, skill));
  if (hasSkillMatch) {
    score += 25;
    reasons.push("matches your skills");
  }

  // ── Proximity (up to +20) ────────────────────────────────────────────────
  // Decays linearly to 0 by 10 miles — close-by requests are easier and
  // faster to actually help with, so they're worth surfacing first among
  // otherwise-similar options.
  const proximityBonus = Math.max(0, 20 - distanceMiles * 2);
  if (proximityBonus > 0) {
    score += proximityBonus;
    if (distanceMiles < 1) reasons.push("very close to you");
    else if (distanceMiles < 3) reasons.push("nearby");
  }

  // ── Availability bonus (+10) — soft signal only (see module docstring) ───
  // Only awarded when the helper has actually set a schedule; helpers with
  // no windows get neither a bonus nor a penalty.
  const is_available_now = availabilityWindows.length > 0
    ? isHelperAvailableNow(availabilityWindows, now)
    : false;
  if (is_available_now) {
    score += 10;
    reasons.push("available now");
  }

  // ── Trust score bonus (up to +15) — AI-Powered Dispatch ─────────────────
  // Community trust is earned through completed missions and ratings.
  // 75+ = community pillar; 55+ = reliable neighbor; 40+ = building trust.
  if (signals.trustScore !== undefined && signals.trustScore >= 0) {
    if (signals.trustScore >= 75) {
      score += 15;
      reasons.push("trusted community helper");
    } else if (signals.trustScore >= 55) {
      score += 8;
      reasons.push("reliable helper");
    } else if (signals.trustScore >= 40) {
      score += 3;
      reasons.push("building trust");
    }
  }

  // ── Active workload penalty (-4 per request above 1) ─────────────────────
  // Prevents overloading committed helpers. One active request is normal;
  // two or more suggests the helper's bandwidth is stretched.
  if (signals.activeWorkload !== undefined && signals.activeWorkload > 1) {
    const penalty = (signals.activeWorkload - 1) * 4;
    score -= penalty;
    if (signals.activeWorkload >= 3) {
      reasons.push("currently handling multiple requests");
    }
  }

  // ── Historical reliability bonus (up to +10) ─────────────────────────────
  // Rewards helpers who follow through. Ratio = completed / (completed + abandoned).
  // Zero history → no signal (fair chance for new helpers).
  if (signals.reliabilityRatio !== undefined && signals.reliabilityRatio > 0) {
    const reliabilityBonus = Math.round(signals.reliabilityRatio * 10);
    if (reliabilityBonus > 0) {
      score += reliabilityBonus;
      if (signals.reliabilityRatio >= 0.9) reasons.push("highly dependable");
      else if (signals.reliabilityRatio >= 0.75) reasons.push("dependable helper");
    }
  }

  // ── Local-first bonus (+12) ───────────────────────────────────────────────
  // Mirrors the client-side Best Match card: a non-emergency request inside
  // the helper's own declared service radius is prioritized over one
  // outside it, so the community's nearest available helper is favored
  // before anyone is routed on a long trip. Emergencies are exempt — urgency
  // stays the dominant signal throughout this module.
  if (signals.serviceRadiusMiles !== undefined && urgency !== "emergency" && distanceMiles <= signals.serviceRadiusMiles) {
    score += 12;
    reasons.push("in your usual service area");
  }

  return { score, reasons, is_available_now };
}
