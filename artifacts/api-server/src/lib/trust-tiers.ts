/**
 * Trust-tier logic — server-side counterpart to the frontend TrustTierBadge.
 *
 * Kept in sync with artifacts/pay-it-forward/src/components/TrustTierBadge.tsx.
 * If thresholds change here they must be updated there too (and vice-versa).
 *
 * Tier hierarchy (lowest → highest):
 *   member → verified → trusted → elite → anchor
 */

export type TrustTier = "member" | "verified" | "trusted" | "elite" | "anchor";

/**
 * Returns the tier name for the given trust score (0–100) and lifetime help count.
 * Used server-side for sorting, filtering, and notification-routing logic.
 */
export function getTierName(trustScore: number, helpCount: number): TrustTier {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}
