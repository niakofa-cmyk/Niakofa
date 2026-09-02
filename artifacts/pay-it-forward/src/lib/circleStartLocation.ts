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

export function getFreshCircleStartLocation(): Promise<CircleStartLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new CircleStartLocationError("GPS_UNAVAILABLE", "This browser does not provide location services."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
        captured_at: new Date(position.timestamp || Date.now()).toISOString(),
      }),
      (error) => {
        const code =
          error.code === error.PERMISSION_DENIED ? "GPS_PERMISSION_DENIED" :
          error.code === error.TIMEOUT ? "GPS_TIMEOUT" : "GPS_UNAVAILABLE";
        reject(new CircleStartLocationError(
          code,
          code === "GPS_PERMISSION_DENIED"
            ? "Location permission is required to host a Circle. You can still join Circles without sharing your location."
            : "We couldn't get a fresh, accurate location. Move somewhere with a clearer GPS signal and try again.",
        ));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}