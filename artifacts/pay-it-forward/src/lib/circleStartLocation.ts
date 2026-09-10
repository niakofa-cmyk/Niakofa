import { getPublishedMapLocation, publishMapLocation } from "./spiralLocationStore";
import { getUsableMapLocation, mapLocationUnavailableMessage } from "./spiralMapLocation";

export interface CircleStartLocation {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
}

export class CircleStartLocationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CircleStartLocationError";
    this.code = code;
  }
}

/**
 * Spirals location for host start / discovery fallback.
 * Prefer the shared Map Locator fix. Only fall back to browser geolocation when
 * the Map has never produced a usable GPS fix.
 * Product surface: Niakofa Spirals (Circle naming kept for API compatibility).
 */
export function getFreshCircleStartLocation(): Promise<CircleStartLocation> {
  const published = getPublishedMapLocation();
  const fromMap =
    getUsableMapLocation(published, Date.now(), "host") ??
    getUsableMapLocation(published, Date.now(), "discovery");
  if (fromMap) {
    return Promise.resolve(fromMap);
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new CircleStartLocationError(
          "MAP_LOCATION_UNAVAILABLE",
          mapLocationUnavailableMessage(),
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy,
          captured_at: new Date(position.timestamp || Date.now()).toISOString(),
        };
        // Keep the store warm so later Host Signal / start calls reuse Map pool.
        publishMapLocation({
          lat: next.latitude,
          lng: next.longitude,
          accuracy: next.accuracy_meters,
          capturedAt: position.timestamp || Date.now(),
          source: "gps",
        });
        resolve(next);
      },
      (error) => {
        const code =
          error.code === error.PERMISSION_DENIED
            ? "GPS_PERMISSION_DENIED"
            : error.code === error.TIMEOUT
              ? "GPS_TIMEOUT"
              : "GPS_UNAVAILABLE";
        reject(
          new CircleStartLocationError(
            code,
            code === "GPS_PERMISSION_DENIED"
              ? "Turn on Location in the Map to host a Spiral. You can still join Spirals without sharing your location."
              : mapLocationUnavailableMessage(),
          ),
        );
      },
      // Reuse a recent browser fix when possible (same pool the Map Locator uses).
      { enableHighAccuracy: true, maximumAge: 120_000, timeout: 15_000 },
    );
  });
}
