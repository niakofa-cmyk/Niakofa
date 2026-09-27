export const LOCATION_MARKER_STYLES = ["puck", "spirit"] as const;

export type LocationMarkerStyle = typeof LOCATION_MARKER_STYLES[number];

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