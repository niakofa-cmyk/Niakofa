import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { neighborhoodBoundaryImportsTable } from "@workspace/db";

const { Pool } = pg;

type GeoJSONGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type Feature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: GeoJSONGeometry | null;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

type SourceConfig = {
  key: string;
  cityKey: string;
  cityDisplay: string;
  kind: "municipal_gis";
  publisher: string;
  dataset: string;
  url: string;
  nameFields: string[];
  idFields: string[];
  adapter: "arcgis" | "socrata";
};

export const NEIGHBORHOOD_IMPORT_SOURCES: Record<string, SourceConfig> = {
  fort_worth: {
    key: "fort_worth",
    cityKey: "fort_worth",
    cityDisplay: "Fort Worth, TX",
    kind: "municipal_gis",
    publisher: "City of Fort Worth GIS",
    dataset: "Planning_Development/Zoning/MapServer/37: Neighborhood Alliances",
    url: "https://mapit.fortworthtexas.gov/ags/rest/services/Planning_Development/Zoning/MapServer/37/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson",
    nameFields: ["NAME", "name"],
    idFields: ["OBJECTID_1", "OBJECTID", "ID", "ID_FIELD"],
    adapter: "arcgis",
  },
  kansas_city_missouri: {
    key: "kansas_city_missouri",
    cityKey: "kansas_city_missouri",
    cityDisplay: "Kansas City, MO",
    kind: "municipal_gis",
    publisher: "Kansas City, Missouri Open Data",
    dataset: "q45j-ejyk: Kansas City Neighborhood Boundaries",
    url: "https://data.kcmo.org/resource/q45j-ejyk.json?$limit=50000",
    nameFields: ["name", "neighborhood", "neighborhood_name", "hood", "name_1"],
    idFields: ["objectid", "id", "cartodb_id", "the_geom"],
    adapter: "socrata",
  },
};

/**
 * pnpm `run script -- fort_worth` places a literal `--` before the city key.
 * Accept either `tsx file.ts fort_worth` or `tsx file.ts -- fort_worth`.
 */
export function resolveSourceKey(argv: string[]): string | undefined {
  const args = argv.slice(2).filter((arg) => arg !== "--" && !arg.startsWith("-"));
  return args[0];
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/<[^>]*>/g, "").trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 120) : null;
}

function asFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePosition(position: unknown): boolean {
  return Array.isArray(position)
    && position.length >= 2
    && asFiniteNumber(position[0])
    && asFiniteNumber(position[1])
    && position[0] >= -180 && position[0] <= 180
    && position[1] >= -90 && position[1] <= 90;
}

function validateRing(ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  if (!ring.every(validatePosition)) return false;
  const first = ring[0] as number[];
  const last = ring[ring.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1];
}

export function validateGeometry(geometry: unknown): geometry is GeoJSONGeometry {
  if (!geometry || typeof geometry !== "object") return false;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  if (candidate.type === "Polygon") {
    return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0
      && candidate.coordinates.every(validateRing);
  }
  if (candidate.type === "MultiPolygon") {
    return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0
      && candidate.coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validateRing));
  }
  return false;
}

function centroidFromGeometry(geometry: GeoJSONGeometry): { lat: number; lng: number } {
  const points: number[][] = [];
  const collect = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (validatePosition(value)) points.push(value as number[]);
    else value.forEach(collect);
  };
  collect(geometry.coordinates);
  if (points.length === 0) throw new Error("geometry contains no coordinates");
  const sums = points.reduce((acc, point) => ({ lng: acc.lng + point[0], lat: acc.lat + point[1] }), { lng: 0, lat: 0 });
  return { lng: sums.lng / points.length, lat: sums.lat / points.length };
}

function geometryFromSocrata(value: unknown): GeoJSONGeometry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "Polygon" || candidate.type === "MultiPolygon") {
    return { type: candidate.type, coordinates: candidate.coordinates } as GeoJSONGeometry;
  }
  return null;
}

function featureCollectionFromSocrata(rows: unknown[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.flatMap((row, index) => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      const geometry = geometryFromSocrata(record.the_geom ?? record.geometry ?? record.geom);
      if (!geometry) return [];
      return [{
        type: "Feature",
        id: String(record.objectid ?? record.id ?? record.cartodb_id ?? index),
        properties: record,
        geometry,
      }];
    }),
  };
}

async function fetchSource(source: SourceConfig): Promise<{ collection: FeatureCollection; version: string; retrievedAt: Date }> {
  const retrievedAt = new Date();
  const response = await fetch(source.url, { headers: { Accept: "application/geo+json, application/json" } });
  if (!response.ok) throw new Error(`${source.key}: source returned HTTP ${response.status}`);
  const body = await response.text();
  const version = response.headers.get("etag")
    ?? response.headers.get("last-modified")
    ?? `sha256:${createHash("sha256").update(body).digest("hex")}`;
  const payload = JSON.parse(body) as unknown;
  if (source.adapter === "arcgis") {
    const collection = payload as FeatureCollection;
    if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) throw new Error(`${source.key}: expected GeoJSON FeatureCollection`);
    return { collection, version, retrievedAt };
  }
  if (!Array.isArray(payload)) throw new Error(`${source.key}: expected Socrata JSON array`);
  return { collection: featureCollectionFromSocrata(payload), version, retrievedAt };
}

function pickProperty(properties: Record<string, unknown> | null | undefined, fields: string[]): unknown {
  if (!properties) return null;
  const lower = new Map(Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]));
  for (const field of fields) {
    const value = properties[field] ?? lower.get(field.toLowerCase());
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export async function buildImportRows(source: SourceConfig, collection: FeatureCollection, version: string, retrievedAt: Date) {
  return collection.features.flatMap((feature, index) => {
    if (!validateGeometry(feature.geometry)) return [];
    const properties = feature.properties ?? {};
    const name = normalizeName(pickProperty(properties, source.nameFields));
    if (!name) return [];
    const sourceFeatureId = String(feature.id ?? pickProperty(properties, source.idFields) ?? index);
    const center = centroidFromGeometry(feature.geometry);
    return [{
      city_key: source.cityKey,
      city_display: source.cityDisplay,
      source_kind: source.kind,
      authority_level: "authoritative" as const,
      source_publisher: source.publisher,
      source_url: source.url,
      source_dataset: source.dataset,
      source_feature_id: sourceFeatureId,
      source_version: version,
      source_retrieved_at: retrievedAt,
      name,
      neighborhood_id: `${source.cityKey}:${source.dataset}:${sourceFeatureId}`.slice(0, 240),
      polygon_geojson: feature.geometry,
      center_lat: center.lat,
      center_lng: center.lng,
      geometry_valid: true,
      geometry_verified: false,
      reviewed: false,
    }];
  });
}

async function main() {
  const sourceKey = resolveSourceKey(process.argv);
  const source = sourceKey ? NEIGHBORHOOD_IMPORT_SOURCES[sourceKey] : undefined;
  if (!source) {
    console.error(
      `Usage: pnpm --filter @workspace/scripts run ingest:neighborhood-boundaries -- <${Object.keys(NEIGHBORHOOD_IMPORT_SOURCES).join("|")}>`,
    );
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");

  const { collection, version, retrievedAt } = await fetchSource(source);
  const rows = await buildImportRows(source, collection, version, retrievedAt);
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = drizzle(pool);
  try {
    let imported = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      if (batch.length === 0) continue;
      await db.insert(neighborhoodBoundaryImportsTable)
        .values(batch)
        .onConflictDoNothing();
      imported += batch.length;
    }
    console.log(JSON.stringify({
      source: source.key,
      source_version: version,
      retrieved_at: retrievedAt.toISOString(),
      source_features: collection.features.length,
      valid_features: rows.length,
      imported,
      note: "Imported boundaries remain unreviewed and GPS-ineligible until explicitly verified.",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1] != null
  && (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")));

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
