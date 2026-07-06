/**
 * LOW-004: single source of truth for trust-tier thresholds, shared by
 * api-server (server-side sorting/notification logic) and pay-it-forward
 * (TrustTierBadge UI). Previously these thresholds were duplicated in both
 * places with only a comment asking humans to keep them in sync.
 *
 * Tier hierarchy (lowest → highest):
 *   member → verified → trusted → elite → anchor
 */

export type TrustTier = "member" | "verified" | "trusted" | "elite" | "anchor";

export function getTrustTier(trustScore: number, helpCount: number): TrustTier {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  // Two paths to "verified", but neither rewards spam:
  //   - 5+ completed helps AND at least neutral trust (50 = default midpoint),
  //     so a bad actor whose ratings have dragged their score below neutral
  //     cannot grind to "verified" by completing low-quality requests; or
  //   - a high trust score (85+) on its own, for users vouched into the system.
  if ((helpCount >= 5 && trustScore >= 50) || trustScore >= 85) return "verified";
  return "member";
}

/**
 * Compute the effective tier applying tier stickiness.
 *
 * Effective tier = max(currently computed tier, highest_tier_reached).
 * A helper's tier can only go up, never down, once earned.
 * Pass the stored `highest_tier_reached` column value from the DB row.
 */
export function getEffectiveTier(
  trustScore: number,
  helpCount: number,
  highestTierReached: string | null | undefined,
): TrustTier {
  const computed = getTrustTier(trustScore, helpCount);
  const stored = (highestTierReached ?? "member") as TrustTier;
  // Validate stored value is a real tier; fall back to computed if not
  const storedRank = TIER_RANK[stored] ?? 0;
  return storedRank > TIER_RANK[computed] ? stored : computed;
}

/**
 * Tiers that require a quality gate (avg recent rating ≥ 4.0) before
 * advancement is recorded in highest_tier_reached. Member and verified
 * are reachable on count/score alone — participation matters at that stage.
 * Once in trusted/elite/anchor the helper has demonstrated reliability and
 * quality becomes the gating signal.
 */
export const QUALITY_GATED_TIERS: ReadonlySet<TrustTier> = new Set([
  "trusted",
  "elite",
  "anchor",
]);

/**
 * Returns true when the candidate tier is either not quality-gated, or when
 * the helper's average rating meets the 4.0 minimum for quality-gated tiers.
 *
 * @param candidateTier  The tier the helper would advance to.
 * @param avgRating      Average star rating as a helper (null = no ratings yet).
 *                       null is treated as passing (benefit of the doubt for new helpers).
 */
export function meetsQualityGate(
  candidateTier: TrustTier,
  avgRating: number | null,
): boolean {
  if (!QUALITY_GATED_TIERS.has(candidateTier)) return true;
  // No ratings yet → benefit of the doubt (they haven't been rated badly)
  if (avgRating === null) return true;
  return avgRating >= 4.0;
}

/**
 * Categories that involve vulnerable people or significant liability exposure.
 * These carry trust/safety concerns that groceries or errands don't, so they
 * are gated:
 *   - Helpers must be at least "verified" tier AND identity-verified (or
 *     have a passed background check) to claim them.
 *   - Requesters must explicitly acknowledge that Niakofa is not a licensed
 *     provider when creating them.
 * Shared by api-server (claim/create gates) and pay-it-forward (UI badges,
 * consent flow, WaiverModal) so the two can never drift.
 *
 * Category rationale:
 *   childcare         — care of minor children (Texas Family Code liability)
 *   senior_care       — care of elderly/disabled adults (APS regulations)
 *   medical           — health-adjacent help from unlicensed volunteers
 *   home_repair       — work on real property; injuries, permit exposure
 *   moving_labor      — physical labor + handling personal property
 *   pet_care          — care of animals in someone's home; injury/loss risk
 *   tutoring          — potential 1-on-1 contact with minors; background check warranted
 *   legal_aid         — lay volunteers giving legal guidance; UPL exposure without proper disclaimers
 *   mental_health_peer — peer emotional support; crisis referral obligations, volunteer boundaries
 */
export const SENSITIVE_CATEGORIES = [
  "childcare",
  "senior_care",
  "medical",
  "home_repair",
  "moving_labor",
  "pet_care",
  "tutoring",
  "legal_aid",
  "mental_health_peer",
] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

export function isSensitiveCategory(category: string | null | undefined): category is SensitiveCategory {
  return category != null && (SENSITIVE_CATEGORIES as readonly string[]).includes(category);
}

/** Numeric rank for tier comparisons (member=0 … anchor=4). */
export const TIER_RANK: Record<TrustTier, number> = {
  member: 0,
  verified: 1,
  trusted: 2,
  elite: 3,
  anchor: 4,
};

export function tierAtLeast(tier: TrustTier, minimum: TrustTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

/**
 * Wage multiplier for each trust tier — the core of "livable wage that grows
 * over time" (Roadmap: Tenure Tiers).
 *
 * These multipliers scale the guaranteed minimum paid from the Community Pool
 * when a task completes. A helper who has completed 50+ jobs and maintained
 * a 97+ trust score (anchor tier) earns 20% more from the pool floor than a
 * brand-new member. The multiplier is intentionally modest — it rewards tenure
 * without creating perverse incentives to game the tier system.
 *
 *   member   → 1.00× (base, no adjustment)
 *   verified → 1.05× (+5%)
 *   trusted  → 1.10× (+10%)
 *   elite    → 1.15× (+15%)
 *   anchor   → 1.20× (+20%)
 *
 * Used by community-pool.ts getGuaranteedMinimum() when a helperId is passed.
 */
export const TIER_WAGE_MULTIPLIER: Record<TrustTier, number> = {
  member:   1.00,
  verified: 1.05,
  trusted:  1.10,
  elite:    1.15,
  anchor:   1.20,
};

export function getTierWageMultiplier(tier: TrustTier): number {
  return TIER_WAGE_MULTIPLIER[tier];
}

export const TIER_LABEL: Record<TrustTier, string> = {
  member: "Member",
  verified: "Verified Helper",
  trusted: "Trusted Helper",
  elite: "Elite Helper",
  anchor: "Community Anchor",
};

// ─── Requester-side reputation ────────────────────────────────────────────────
// goodwill_score lives on users and tracks give-back behavior:
//   - starts at 100 on registration
//   - decremented by processPledgeDefaults (-5 per defaulted pledge)
//   - can be boosted by admins for exceptional community contributions
//
// This is the one existing field that represents "did this requester hold up
// their end of the PIF covenant?" It's not a full reputation system, but it
// is real data — unlike inventing thresholds against fields that don't exist.
//
// Tier names deliberately differ from the helper ladder to prevent confusion:
//   community_new → community_member → good_neighbor → trusted_neighbor
//
// These are shown on request-detail.tsx (helper's view of requester) and on
// admin pages. They are intentionally softer labels ("Good Neighbor") —
// requesters are not rated, they are seen.
export type RequesterTier = "community_new" | "community_member" | "good_neighbor" | "trusted_neighbor";

export function getRequesterTier(goodwillScore: number): RequesterTier {
  if (goodwillScore >= 95) return "trusted_neighbor";
  if (goodwillScore >= 80) return "good_neighbor";
  if (goodwillScore >= 50) return "community_member";
  return "community_new";
}

export const REQUESTER_TIER_LABEL: Record<RequesterTier, string> = {
  community_new:    "New Neighbor",
  community_member: "Community Member",
  good_neighbor:    "Good Neighbor",
  trusted_neighbor: "Trusted Neighbor",
};

export const REQUESTER_TIER_EMOJI: Record<RequesterTier, string> = {
  community_new:    "👋",
  community_member: "🤝",
  good_neighbor:    "💚",
  trusted_neighbor: "⭐",
};

/**
 * Role-aware badge resolution — single entry point for "what badge does this
 * user show, anywhere in the app." Added when PayItForwardBadge.tsx was found
 * to be running its own independent, role-blind tier ladder (no is_admin/
 * is_helper distinction at all, same "Trusted" label as the helper ladder but
 * different thresholds behind it).
 *
 * Three tracks, by role — not three independent trust scores:
 *   - admin: a flag, not a ladder. Being an admin isn't a trust achievement.
 *   - helper: the real trust_score/help_count ladder above. This is the only
 *     track backed by an actual behavioral reputation signal in the schema.
 *   - member: uses goodwill_score (real data) via getRequesterTier() above.
 *     goodwill_score starts at 100, decrements on pledge defaults, and can be
 *     boosted for exceptional contributions. It is the honest requester metric.
 */
export type BadgeRole = "admin" | "helper" | "member";

export interface BadgeResult {
  role: BadgeRole;
  tier: TrustTier | "admin";
  label: string;
}

export function getBadgeForUser(user: {
  is_admin?: boolean | null;
  is_helper?: boolean | null;
  trust_score?: number | null;
  help_count?: number | null;
  goodwill_score?: number | null;
}): BadgeResult {
  if (user.is_admin) {
    return { role: "admin", tier: "admin", label: "Admin" };
  }
  if (user.is_helper) {
    const tier = getTrustTier(user.trust_score ?? 0, user.help_count ?? 0);
    return { role: "helper", tier, label: TIER_LABEL[tier] };
  }
  // Member track uses goodwill_score — a real behavioral signal from the schema.
  // Starts at 100, decremented by pledge defaults, never fabricated.
  const requesterTier = getRequesterTier(user.goodwill_score ?? 100);
  return { role: "member", tier: "member", label: REQUESTER_TIER_LABEL[requesterTier] };
}
