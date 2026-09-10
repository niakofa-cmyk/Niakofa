import type { SharedMapLocation } from "./spiralMapLocation";

/**
 * Canonical Map Locator mirror for non-React callers (e.g. Spiral host start).
 * Publish every GPS fix from AppContext / Host Signal so Spirals never need a
 * second independent Pinpoint pipeline.
 */
let shared: SharedMapLocation | null = null;

export function publishMapLocation(location: SharedMapLocation | null): void {
  shared = location;
}

export function getPublishedMapLocation(): SharedMapLocation | null {
  return shared;
}
