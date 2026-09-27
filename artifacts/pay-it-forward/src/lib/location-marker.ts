export const LOCATION_MARKER_STYLES = ["puck", "spirit"] as const;

export type LocationMarkerStyle = typeof LOCATION_MARKER_STYLES[number];

export type LocationSource = "gps" | "ip" | "approximate" | "privacy";
export type LocationSignal = "live" | "approximate" | "stale" | "privacy";

export interface LocationMarkerInput {
  source?: LocationSource;
  accuracy?: number | null;
  capturedAt?: number;
  privacyProtected?: boolean;
}

export interface LocationMarkerState {
  source: LocationSource;
  signal: LocationSignal;
  accuracyMeters: number | null;
  capturedAt: number | null;
}

const LOCATION_STALE_AFTER_MS = 90_000;
const MAX_DISPLAYED_ACCURACY_METERS = 5_000;
const WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;

/**
 * Return a screen-space diameter for a horizontal GPS accuracy radius.
 *
 * Mapbox DOM markers stay a constant size while the map zooms, so the
 * accuracy area has to be converted from meters using the current latitude
 * and zoom. A bounded fallback keeps the puck useful in non-map previews.
 */
export function getAccuracyRingDiameterPx(options: {
  accuracyMeters: number | null | undefined;
  size: number;
  latitude?: number | null;
  mapZoom?: number | null;
}): number {
  const { accuracyMeters, size, latitude, mapZoom } = options;
  if (!Number.isFinite(accuracyMeters) || (accuracyMeters as number) <= 0) return 0;

  const accuracy = Math.min(accuracyMeters as number, MAX_DISPLAYED_ACCURACY_METERS);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(mapZoom) &&
    Math.abs(latitude as number) <= 90
  ) {
    const metersPerPixel =
      (WEB_MERCATOR_METERS_PER_PIXEL_AT_ZOOM_0 *
        Math.cos(((latitude as number) * Math.PI) / 180)) /
      2 ** (mapZoom as number);
    if (metersPerPixel > 0) {
      return Math.max(
        size * 1.2,
        Math.min(size * 12, (2 * accuracy) / metersPerPixel),
      );
    }
  }

  // Keep non-map renderers honest: this is only a bounded visual fallback,
  // never a claim that the ring is geographically to scale.
  const accuracyRatio = Math.min(1, accuracy / 200);
  return size * (1.2 + accuracyRatio * 2.3);
}

/**
 * Turn the browser location stream into an explicit rendering state.
 *
 * GPS precision, IP fallback, privacy-generalized coordinates, and stale
 * samples are different facts. Keeping them separate prevents an approximate
 * fallback from looking like a live GPS fix and gives every map entry point
 * the same behavior.
 */
export function getLocationMarkerState(
  location: LocationMarkerInput | null | undefined,
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