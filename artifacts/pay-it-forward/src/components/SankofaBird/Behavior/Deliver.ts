/**
 * SankofaBird/Behavior/Deliver.ts
 *
 * Delivery behavior — trust tier and effective sky tier computation.
 * These drive the Adinkra/Kente visual overlays and the nocturnal palette.
 */

/** Trust tier from continuous trustLevel (0–1). */
export function computeTrustTier(
  trustLevel: number,
): "none" | "growing" | "trusted" | "elder" {
  return trustLevel >= 0.80 ? "elder"   :
         trustLevel >= 0.55 ? "trusted" :
         trustLevel >= 0.25 ? "growing" : "none";
}

/** Effective sky tier: explicit prop takes precedence over nightMode bool. */
export function computeEffectiveSkyTier(
  skyTier: string | undefined,
  nightMode: boolean,
): string {
  return skyTier ?? (nightMode ? "night" : "day");
}
