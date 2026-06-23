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
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}
