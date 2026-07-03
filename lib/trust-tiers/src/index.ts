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
 *   childcare    — care of minor children (Texas Family Code liability)
 *   senior_care  — care of elderly/disabled adults (APS regulations)
 *   medical      — health-adjacent help from unlicensed volunteers
 *   home_repair  — work on real property; injuries, permit exposure
 *   moving_labor — physical labor + handling personal property
 *   pet_care     — care of animals in someone's home; injury/loss risk
 *   tutoring     — potential 1-on-1 contact with minors; background check warranted
 */
export const SENSITIVE_CATEGORIES = [
  "childcare",
  "senior_care",
  "medical",
  "home_repair",
  "moving_labor",
  "pet_care",
  "tutoring",
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
