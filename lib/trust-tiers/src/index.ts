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

export const TIER_LABEL: Record<TrustTier, string> = {
  member: "Member",
  verified: "Verified Helper",
  trusted: "Trusted Helper",
  elite: "Elite Helper",
  anchor: "Community Anchor",
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
 *   - member: everyone else (a requester who hasn't opted into helper mode).
 *     There is currently no schema field tracking requester-side give-back
 *     behavior independently of helping (goodwill_score/benevolence_wallet
 *     are both credited to the *helper* side of a transaction — see
 *     requests.ts/stripe.ts comments). Rather than invent a fake numeric
 *     ladder on top of data that doesn't exist, members get one honest
 *     static badge. A real requester-side metric (e.g. completed-request
 *     count, on-time payment rate) would need a new schema field and a
 *     dedicated design pass before it could support real tiers — don't
 *     fake thresholds against data that isn't there.
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
}): BadgeResult {
  if (user.is_admin) {
    return { role: "admin", tier: "admin", label: "Admin" };
  }
  if (user.is_helper) {
    const tier = getTrustTier(user.trust_score ?? 0, user.help_count ?? 0);
    return { role: "helper", tier, label: TIER_LABEL[tier] };
  }
  return { role: "member", tier: "member", label: "Community Member" };
}
