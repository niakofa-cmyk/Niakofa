import type { SharedMapLocation } from "./spiralMapLocation";

/**
 * Canonical Map Locator mirror for non-React callers.
 * AppContext publishes the same fix it gives to the rest of the app so Spiral
 * flows never need a second browser GPS/Pinpoint pipeline.
 */
let shared: SharedMapLocation | null = null;

export function publishMapLocation(location: SharedMapLocation | null): void {
  shared = location;
}

export function getPublishedMapLocation(): SharedMapLocation | null {
  return shared;
}