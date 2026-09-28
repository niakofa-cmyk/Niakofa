#!/usr/bin/env node
/**
 * Migration-backed CI integration entrypoint. The spatial check uses only TEMP
 * fixtures; after it closes its connection, run the local-only Exchange
 * lifecycle and push API fixtures through the same existing CI entrypoint.
 * Both child scripts refuse non-local databases and clean up their own rows.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TEMP TABLE exchange_spatial_fixture (
      id integer PRIMARY KEY, status text NOT NULL, moderation_status text NOT NULL,
      latitude double precision, longitude double precision
    ) ON COMMIT DROP
  `);
  const center = { lat: 32.7555, lng: -97.3308 };
  const radiusMiles = 5;
  // At Fort Worth latitude, longitude miles are scaled by cosine(latitude).
  const milesLat = 1 / 69;
  const milesLng = 1 / (69 * Math.cos(center.lat * Math.PI / 180));
  const rows = [
    [1, "active", "approved", center.lat, center.lng], // center
    [2, "active", "approved", center.lat + 4.9 * milesLat, center.lng], // safely inside the five-mile boundary
    [3, "active", "approved", center.lat + 5.1 * milesLat, center.lng], // safely outside
    [4, "active", "pending", center.lat, center.lng], // not approved
    [5, "archived", "approved", center.lat, center.lng], // inactive
    [6, "active", "approved", center.lat, center.lng + 2 * milesLng], // nearby
    [7, "active", "approved", null, null],
  ];
  for (const row of rows) {
    await client.query(
      "INSERT INTO exchange_spatial_fixture(id,status,moderation_status,latitude,longitude) VALUES($1,$2,$3,$4,$5)",
      row,
    );
  }
  const params = [center.lat - radiusMiles / 69, center.lat + radiusMiles / 69,
    center.lng - radiusMiles / (69 * Math.max(0.25, Math.cos(center.lat * Math.PI / 180))),
    center.lng + radiusMiles / (69 * Math.max(0.25, Math.cos(center.lat * Math.PI / 180))),
    center.lat, center.lng, radiusMiles];
  const fallback = await client.query(`
    SELECT id FROM exchange_spatial_fixture
    WHERE status='active' AND moderation_status='approved'
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
      AND 3958.8 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(latitude - $5) / 2), 2) +
        COS(RADIANS($5)) * COS(RADIANS(latitude)) *
        POWER(SIN(RADIANS(longitude - $6) / 2), 2)
      )) <= $7 ORDER BY id
  `, params);
  const fallbackIds = fallback.rows.map(r => r.id);
  assert.deepEqual(fallbackIds, [1, 2, 6], "Haversine path returns only active approved in-radius rows");

  const postgisEnabled = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS enabled");
  if (postgisEnabled.rows[0].enabled) {
    const postgis = await client.query(`
      SELECT id FROM exchange_spatial_fixture
      WHERE status='active' AND moderation_status='approved'
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint($6,$5),4326)::geography,
          ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography,
          $7 * 1609.344
        ) ORDER BY id
    `, params);
    assert.deepEqual(postgis.rows.map(r => r.id), fallbackIds, "PostGIS and Haversine result IDs agree");
  } else {
    console.log("PostGIS unavailable; verified fallback only.");
  }
  await client.query("ROLLBACK");
  console.log("Exchange spatial integration passed; fixture rows were rolled back.");
} finally {
  client.release();
  await pool.end();
}

for (const [label, file] of [
  ["Exchange API lifecycle", "./exchange-lifecycle.integration.test.mjs"],
  ["Push subscription API", "./push-subscription.integration.test.mjs"],
]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} integration failed (exit ${result.status ?? result.signal})`);
  }
}
