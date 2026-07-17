/**
 * haptics.ts — thin wrapper around the Vibration API.
 *
 * Used for the handful of moments on the map screen where a physical tap
 * confirms something important happened (claiming a job, an emergency
 * alert arriving, recentering) — purely additive polish, never required
 * for correctness. No-ops silently on browsers/devices without
 * navigator.vibrate (iOS Safari has none of this — that's expected and
 * fine, not an error).
 */
export type HapticPattern = "success" | "warning" | "light";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  success: [10, 40, 10],
  warning: [20, 60, 20, 60, 20],
};

export function haptic(pattern: HapticPattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[pattern]);
    }
  } catch {
    // Vibration API can throw in some embedded webviews — never let a
    // cosmetic haptic crash a real user action.
  }
}
