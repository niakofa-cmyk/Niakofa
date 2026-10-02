export type ParkCoordinates = {
  lat: number;
  lng: number;
};

export type ParkFeature = {
  id: string;
  text: string;
  place_name?: string;
  geometry: { coordinates: [number, number] };
  properties?: { category?: string | string[] };
};

export type DistanceUnits = "metric" | "imperial";

export function isValidCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number"
    && typeof lng === "number"
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180;
}

export function parseMapboxParkFeatures(payload: unknown): ParkFeature[] {
  if (!payload || typeof payload !== "object" || !("features" in payload)) return [];
  const { features } = payload as { features?: unknown };
  if (!Array.isArray(features)) return [];

  const seen = new Set<string>();
  return features.filter((candidate): candidate is ParkFeature => {
    if (!candidate || typeof candidate !== "object") return false;
    const feature = candidate as Partial<ParkFeature>;
    const coordinates = feature.geometry?.coordinates;
    if (
      typeof feature.id !== "string"
      || !feature.id
      || typeof feature.text !== "string"
      || !feature.text.trim()
      || !Array.isArray(coordinates)
      || coordinates.length < 2
      || !isValidCoordinates(coordinates[1], coordinates[0])
      || (feature.place_name !== undefined && typeof feature.place_name !== "string")
      || seen.has(feature.id)
    ) return false;

    const category = feature.properties?.category;
    const categoryText = Array.isArray(category) ? category.join(" ") : category ?? "";
    const isPark = /park/i.test(categoryText) || /\bparks?\b/i.test(feature.text);
    if (!isPark) return false;

    seen.add(feature.id);
    return true;
  });
}

export function formatParkDistance(meters: number, units: DistanceUnits): string {
  if (!Number.isFinite(meters) || meters < 0) return "";

  if (units === "metric") {
    if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m away`;
    const kilometers = meters / 1000;
    return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km away`;
  }

  const miles = meters / 1609.344;
  if (miles < 1) {
    const feet = meters * 3.28084;
    return `${Math.max(10, Math.round(feet / 10) * 10)} ft away`;
  }
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

export function getParkDirectionsUrl(feature: ParkFeature): string {
  const [lng, lat] = feature.geometry.coordinates;
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function getParkAddress(feature: ParkFeature): string | null {
  if (!feature.place_name) return null;
  const segments = feature.place_name.split(",").map((part) => part.trim());
  if (segments[0]?.toLocaleLowerCase() === feature.text.toLocaleLowerCase()) segments.shift();
  return segments.join(", ") || null;
}