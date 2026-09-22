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
export declare function getTrustTier(trustScore: number, helpCount: number): TrustTier;
/**
 * Compute the effective tier applying tier stickiness.
 *
 * Effective tier = max(currently computed tier, highest_tier_reached).
 * A helper's tier can only go up, never down, once earned.
 * Pass the stored `highest_tier_reached` column value from the DB row.
 */
export declare function getEffectiveTier(trustScore: number, helpCount: number, highestTierReached: string | null | undefined): TrustTier;
/**
 * Tiers that require a quality gate (avg recent rating ≥ 4.0) before
 * advancement is recorded in highest_tier_reached. Member and verified
 * are reachable on count/score alone — participation matters at that stage.
 * Once in trusted/elite/anchor the helper has demonstrated reliability and
 * quality becomes the gating signal.
 */
export declare const QUALITY_GATED_TIERS: ReadonlySet<TrustTier>;
/**
 * Returns true when the candidate tier is either not quality-gated, or when
 * the helper's average rating meets the 4.0 minimum for quality-gated tiers.
 *
 * @param candidateTier  The tier the helper would advance to.
 * @param avgRating      Average star rating as a helper (null = no ratings yet).
 *                       null is treated as passing (benefit of the doubt for new helpers).
 */
export declare function meetsQualityGate(candidateTier: TrustTier, avgRating: number | null): boolean;
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
export declare const SENSITIVE_CATEGORIES: readonly ["childcare", "senior_care", "medical", "home_repair", "moving_labor", "pet_care", "tutoring", "legal_aid", "mental_health_peer"];
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];
export declare function isSensitiveCategory(category: string | null | undefined): category is SensitiveCategory;
/** Numeric rank for tier comparisons (member=0 … anchor=4). */
export declare const TIER_RANK: Record<TrustTier, number>;
export declare function tierAtLeast(tier: TrustTier, minimum: TrustTier): boolean;
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
export declare const TIER_WAGE_MULTIPLIER: Record<TrustTier, number>;
export declare function getTierWageMultiplier(tier: TrustTier): number;
/**
 * Hub-leadership trust bonus.
 *
 * Being an approved, active hub leader who has successfully shepherded a
 * community is a meaningful trust signal — it represents accountability, time,
 * and a public commitment to the platform's values. The roadmap document
 * explicitly calls this out: "hub leadership tenure should count toward tier
 * advancement, the same way completed-help-request quality already does."
 *
 * This function returns how many bonus trust-score points an approved hub
 * leader earns, based on how long they've held the role. The bonus is purely
 * advisory — callers (e.g. the trust-score update path) add it to the helper's
 * base score BEFORE passing to getTrustTier(). It is never persisted directly;
 * the persisted trust_score already includes any accumulated bonus from past
 * rating/PIF events.
 *
 * Bonus schedule (cumulative, not additive per month):
 *   < 3 months  → +0 (probationary — show up before getting credit)
 *   3–6 months  → +2 (established — you stayed, you grew)
 *   6–12 months → +4 (proven tenure)
 *   12+ months  → +6 (anchor-grade community commitment)
 *
 * Cap: the bonus alone cannot push someone past "trusted" (90 pts). The
 * quality gate (4.0 avg rating) still applies for the upper tiers.
 *
 * @param approvedAt   The date the leader was approved (null = not approved → 0 bonus)
 * @param isApproved   Whether the leader's application is currently approved
 */
export declare function getHubLeadershipTrustBonus(approvedAt: Date | string | null | undefined, isApproved: boolean): number;
export declare const TIER_LABEL: Record<TrustTier, string>;
export type RequesterTier = "community_new" | "community_member" | "good_neighbor" | "trusted_neighbor";
export declare function getRequesterTier(goodwillScore: number): RequesterTier;
export declare const REQUESTER_TIER_LABEL: Record<RequesterTier, string>;
export declare const REQUESTER_TIER_EMOJI: Record<RequesterTier, string>;
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
export declare function getBadgeForUser(user: {
    is_admin?: boolean | null;
    is_helper?: boolean | null;
    trust_score?: number | null;
    help_count?: number | null;
    goodwill_score?: number | null;
}): BadgeResult;
//# sourceMappingURL=index.d.ts.map