export const LOCATION_MARKER_STYLES = ["puck", "spirit"] as const;

export type LocationMarkerStyle = typeof LOCATION_MARKER_STYLES[number];

export type LocationSource = "gps" | "ip" | "approximate" | "privacy";
export type LocationSignal = "live" | "approximate" | "stale" | "privacy";

export interface LocationMarkerState {
  source: LocationSource;
  signal: LocationSignal;
  accuracyMeters: number | null;
  capturedAt: number | null;
}

interface LocationLike {
  source?: LocationSource;
  accuracy?: number | null;
  capturedAt?: number;
  privacyProtected?: boolean;
}

const LOCATION_STALE_AFTER_MS = 90_000;

/**
 * Turn the browser location stream into an explicit rendering state.
 *
 * GPS precision, IP fallback, privacy-generalized coordinates, and stale
 * samples are different facts. Keeping them separate prevents an approximate
 * fallback from looking like a live GPS fix and gives every map entry point
 * the same behavior.
 */
export function getLocationMarkerState(
  location: LocationLike | null | undefined,
  now = Date.now(),
): LocationMarkerState {
  const source = location?.privacyProtected ? "privacy" : (location?.source ?? "approximate");
  const capturedAt = typeof location?.capturedAt === "number" ? location.capturedAt : null;
  const accuracyMeters =
    typeof location?.accuracy === "number" && Number.isFinite(location.accuracy) && location.accuracy > 0
      ? location.accuracy
      : null;

  if (source === "privacy") {
    return { source, signal: "privacy", accuracyMeters: null, capturedAt };
  }
  if (source !== "gps") {
    return { source, signal: "approximate", accuracyMeters: null, capturedAt };
  }
  if (capturedAt != null && now - capturedAt > LOCATION_STALE_AFTER_MS) {
    return { source, signal: "stale", accuracyMeters, capturedAt };
  }
  return { source, signal: "live", accuracyMeters, capturedAt };
}

export function isLocationMarkerStyle(value: unknown): value is LocationMarkerStyle {
  return typeof value === "string" &&
    (LOCATION_MARKER_STYLES as readonly string[]).includes(value);
}

/**
 * Resolve the marker actually safe to render for this device/session.
 * A blue puck is deliberately used whenever the preference is missing or
 * animated companions should be suppressed for motion, battery, or GPU cost.
 */
export function resolveLocationMarkerStyle(
  requested: unknown,
  options: { animationSuppressed?: boolean; batterySaver?: boolean } = {},
): LocationMarkerStyle {
  if (options.animationSuppressed || options.batterySaver) return "puck";
  return isLocationMarkerStyle(requested) ? requested : "puck";
}