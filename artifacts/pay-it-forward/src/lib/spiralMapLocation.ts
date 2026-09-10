export type SharedMapLocation = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturedAt?: number;
  source?: "gps" | "ip";
};

export type SpiralMapLocation = {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  captured_at: string;
};

const DISCOVERY_MAX_AGE_MS = 5 * 60_000;
const HOST_MAX_AGE_MS = 120_000;
const MAX_ACCURACY_METERS = 150;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getUsableMapLocation(
  location: SharedMapLocation | null | undefined,
  nowMs = Date.now(),
  mode: "discovery" | "host" = "discovery",
): SpiralMapLocation | null {
  if (!location || location.source !== "gps") return null;
  if (!isFiniteCoordinate(location.lat) || !isFiniteCoordinate(location.lng)) return null;
  if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) return null;
  if (!isFiniteCoordinate(location.accuracy) || location.accuracy <= 0 || location.accuracy > MAX_ACCURACY_METERS) return null;
  if (!isFiniteCoordinate(location.capturedAt)) return null;

  const maxAge = mode === "host" ? HOST_MAX_AGE_MS : DISCOVERY_MAX_AGE_MS;
  const age = nowMs - location.capturedAt;
  if (age < -30_000 || age > maxAge) return null;

  return {
    latitude: location.lat,
    longitude: location.lng,
    accuracy_meters: location.accuracy,
    captured_at: new Date(location.capturedAt).toISOString(),
  };
}

export function mapLocationUnavailableMessage(): string {
  return "Turn on Location in the Map so Niakofa can identify your neighborhood Spiral.";
}
