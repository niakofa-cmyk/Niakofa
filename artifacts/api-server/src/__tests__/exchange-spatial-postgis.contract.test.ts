import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/community-exchange.ts", import.meta.url);
const locationPath = new URL("../lib/exchange-location.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/exchange.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0181_exchange_geography.sql", import.meta.url);
const repairMigrationPath = new URL("../../../../lib/db/migrations/0182_exchange_geography_repair.sql", import.meta.url);

describe("Exchange production spatial contract", () => {
  it("uses the stored geography column and ST_DWithin for nearby feeds", async () => {
    const [route, location, schema] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(locationPath, "utf8"),
      fs.readFile(schemaPath, "utf8"),
    ]);

    expect(route).toMatch(/exchangeSpatialIndexReady/);
    expect(route).toMatch(/exchangeNearbyCondition/);
    expect(location).toMatch(/exchangeListingsTable\.geog/);
    expect(location).toMatch(/ST_DWithin/);
    expect(location).toMatch(/1609\.344/);
    expect(schema).toMatch(/geog: geographyPoint\("geog"\)/);
    expect(route).not.toMatch(/3958\.8 \* 2 \* ASIN/);
  });

  it("creates the geography trigger and GiST index while preserving local fallback", async () => {
    const migration = await fs.readFile(migrationPath, "utf8");

    expect(migration).toMatch(/IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'postgis'\)/);
    expect(migration).toMatch(/CREATE TRIGGER trg_exchange_listings_sync_geog/);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS exchange_listings_geog_gist_idx[\s\S]*USING GIST \(geog\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS geog text/);
    expect(migration).toMatch(/Haversine fallback active/);
  });

  it("repairs the prior index-name collision and keeps fallback inserts schema-compatible", async () => {
    const repairMigration = await fs.readFile(repairMigrationPath, "utf8");

    expect(repairMigration).toMatch(/CREATE INDEX IF NOT EXISTS exchange_listings_geog_gist_idx[\s\S]*USING GIST \(geog\)/);
    expect(repairMigration).toMatch(/ADD COLUMN IF NOT EXISTS geog text/);
    expect(repairMigration).toMatch(/ADD COLUMN IF NOT EXISTS geog geography\(Point, 4326\)/);
  });
});