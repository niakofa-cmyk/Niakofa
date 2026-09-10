import { getPublishedMapLocation } from "./spiralLocationStore";
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
 * Spirals location for host start / legacy callers.
 * Prefer the shared Map Locator fix published by AppContext. Only fall back to
 * a browser getCurrentPosition when the Map has never produced a usable GPS fix.
 * Product surface: Niakofa Spirals (Circle naming kept for API compatibility).
 */
export function getFreshCircleStartLocation(): Promise<CircleStartLocation> {
  const fromMap = getUsableMapLocation(getPublishedMapLocation(), Date.now(), "host");
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
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy,
          captured_at: new Date(position.timestamp || Date.now()).toISOString(),
        }),
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
