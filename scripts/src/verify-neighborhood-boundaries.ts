import pg from "pg";

const { Pool } = pg;

const SOURCE_QUERY = `
  SELECT
    id,
    city_key,
    name,
    source_publisher,
    source_dataset,
    source_feature_id,
    source_version,
    geometry_valid,
    geometry_verified,
    reviewed,
    CASE
      WHEN polygon_geojson IS NULL THEN false
      ELSE ST_IsValid(
        ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson::text), 4326)
      )
    END AS postgis_valid,
    CASE
      WHEN polygon_geojson IS NULL THEN 'missing GeoJSON'
      ELSE ST_IsValidReason(
        ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson::text), 4326)
      )
    END AS postgis_valid_reason,
    CASE
      WHEN polygon_geojson IS NULL THEN NULL
      ELSE ST_Area(
        ST_Transform(
          ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson::text), 4326),
          3857
        )
      )
    END AS area_m2
  FROM neighborhood_boundary_imports
  ORDER BY city_key, name, id
`;

type Row = {
  id: number;
  city_key: string;
  name: string;
  source_publisher: string;
  source_dataset: string;
  source_feature_id: string;
  source_version: string | null;
  geometry_valid: boolean;
  geometry_verified: boolean;
  reviewed: boolean;
  postgis_valid: boolean;
  postgis_valid_reason: string | null;
  area_m2: number | null;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<Row>(SOURCE_QUERY);
    const rows = result.rows;
    const invalid = rows.filter((row) => !row.postgis_valid);
    const structurallyValidButUnverified = rows.filter(
      (row) => row.geometry_valid && row.postgis_valid && !row.geometry_verified,
    );
    const verifiedButInvalid = rows.filter(
      (row) => row.geometry_verified && !row.postgis_valid,
    );

    const report = {
      generated_at: new Date().toISOString(),
      total_imports: rows.length,
      postgis_valid: rows.length - invalid.length,
      postgis_invalid: invalid.length,
      structurally_valid_but_unverified: structurallyValidButUnverified.length,
      verified_but_postgis_invalid: verifiedButInvalid.length,
      cities: [...new Set(rows.map((row) => row.city_key))],
      invalid_features: invalid.map((row) => ({
        id: row.id,
        city_key: row.city_key,
        name: row.name,
        source_publisher: row.source_publisher,
        source_dataset: row.source_dataset,
        source_feature_id: row.source_feature_id,
        source_version: row.source_version,
        geometry_valid: row.geometry_valid,
        reviewed: row.reviewed,
        geometry_verified: row.geometry_verified,
        reason: row.postgis_valid_reason,
      })),
      verified_features_with_invalid_geometry: verifiedButInvalid.map((row) => ({
        id: row.id,
        city_key: row.city_key,
        name: row.name,
        reason: row.postgis_valid_reason,
      })),
    };

    console.log(JSON.stringify(report, null, 2));

    if (invalid.length > 0 || verifiedButInvalid.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
