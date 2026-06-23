/**
 * LOW-004: re-exports the shared trust-tier logic from @workspace/trust-tiers
 * so api-server and the frontend (TrustTierBadge.tsx) read from one source
 * instead of two manually-synced copies.
 */
export { getTrustTier as getTierName, type TrustTier } from "@workspace/trust-tiers";
