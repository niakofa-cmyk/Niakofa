import type { SharedMapLocation } from "./spiralMapLocation";

/**
 * Canonical Map Locator mirror for non-React callers (e.g. Spiral host start).
 * AppContext publishes every GPS/IP fix here so Spirals never need a second
 * independent browser GPS/Pinpoint pipeline.
 */
let shared: SharedMapLocation | null = null;

export function publishMapLocation(location: SharedMapLocation | null): void {
  shared = location;
}

export function getPublishedMapLocation(): SharedMapLocation | null {
  return shared;
}
