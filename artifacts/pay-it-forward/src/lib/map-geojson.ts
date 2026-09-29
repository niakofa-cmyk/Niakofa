export type MapGeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean | null>;
    geometry:
      | { type: "Point"; coordinates: [number, number] }
      | { type: "LineString"; coordinates: Array<[number, number]> };
  }>;
};

export function lineStringToFeatureCollection(geometry: unknown): MapGeoJSONFeatureCollection | null {
  if (!geometry || typeof geometry !== "object") return null;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "LineString" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2) {
    return null;
  }

  const coordinates: Array<[number, number]> = [];
  for (const position of candidate.coordinates) {
    if (!Array.isArray(position)
      || position.length < 2
      || typeof position[0] !== "number"
      || !Number.isFinite(position[0])
      || position[0] < -180
      || position[0] > 180
      || typeof position[1] !== "number"
      || !Number.isFinite(position[1])
      || position[1] < -90
      || position[1] > 90) {
      return null;
    }
    coordinates.push([position[0], position[1]]);
  }

  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    }],
  };
}