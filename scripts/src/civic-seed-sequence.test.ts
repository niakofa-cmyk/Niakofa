import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { offlineTexasCounties, STATE_CODES } from "./census-coverage.js";

const databaseUrl = process.env.CIVIC_SEED_TEST_DATABASE_URL?.trim();

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll(`"`, `""`)}"`;
}

function databaseUrlWithSearchPath(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", `-c search_path=${schema}`);
  return parsed.toString();
}

test(
  "repairs a stale civic resource sequence and remains idempotent",
  { skip: !databaseUrl },
  async () => {
    assert.ok(databaseUrl, "CIVIC_SEED_TEST_DATABASE_URL is required");

    const schema = `civic_seed_test_${process.pid}_${Date.now()}`;
    const schemaSql = quoteIdentifier(schema);
    const adminPool = new pg.Pool({ connectionString: databaseUrl });
    const expectedNewRows = Object.keys(STATE_CODES).length + offlineTexasCounties().length + 2;

    try {
      await adminPool.query(`CREATE SCHEMA ${schemaSql}`);
      await adminPool.query(`
        CREATE TABLE ${schemaSql}.civic_resources (
          id serial PRIMARY KEY,
          state text NOT NULL,
          county text NOT NULL,
          city text,
          org_name text NOT NULL,
          description text,
          url text NOT NULL,
          phone text,
          category text,
          address text,
          latitude real,
          longitude real,
          open_hours text,
          jurisdiction_level text NOT NULL DEFAULT 'county',
          source_name text,
          source_url text,
          last_verified_at timestamptz,
          is_authoritative boolean NOT NULL DEFAULT false,
          coverage_status text NOT NULL DEFAULT 'needs_verification',
          geoid text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE ${schemaSql}.civic_jurisdictions (
          id serial PRIMARY KEY,
          state text NOT NULL,
          county text,
          city text,
          geoid text NOT NULL UNIQUE,
          jurisdiction_level text NOT NULL,
          source_name text NOT NULL,
          source_url text NOT NULL,
          coverage_status text NOT NULL DEFAULT 'needs_verification',
          last_verified_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await adminPool.query(
        `INSERT INTO ${schemaSql}.civic_resources
          (id, state, county, org_name, description, url, category)
         VALUES (50000, 'TX', 'Imported', 'Imported civic sentinel',
           'A legacy row with an ID higher than the serial sequence.',
           'https://example.test/imported-civic-sentinel', 'test')`,
      );

      const seedDatabaseUrl = databaseUrlWithSearchPath(databaseUrl, schema);
      const previousDatabaseUrl = process.env.DATABASE_URL;
      const previousCensusApiKey = process.env.CENSUS_API_KEY;
      process.env.DATABASE_URL = seedDatabaseUrl;
      delete process.env.CENSUS_API_KEY;

      try {
        const { default: runSeed } = await import("./seed-civic-coverage.js");
        await runSeed();
      } finally {
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousDatabaseUrl;
        if (previousCensusApiKey === undefined) delete process.env.CENSUS_API_KEY;
        else process.env.CENSUS_API_KEY = previousCensusApiKey;
      }

      const firstRun = await adminPool.query<{
        count: string;
        max_id: number;
        fort_worth: string;
        dallas: string;
      }>(`
        SELECT
          count(*)::text AS count,
          max(id)::int AS max_id,
          count(*) FILTER (
            WHERE org_name = 'City of Fort Worth 311 Customer Care'
          )::text AS fort_worth,
          count(*) FILTER (
            WHERE org_name = 'City of Dallas 311 Customer Service Center'
          )::text AS dallas
        FROM ${schemaSql}.civic_resources
      `);

      assert.equal(firstRun.rows[0].max_id, 50000 + expectedNewRows);
      assert.equal(firstRun.rows[0].count, String(expectedNewRows + 1));
      assert.equal(firstRun.rows[0].fort_worth, "1");
      assert.equal(firstRun.rows[0].dallas, "1");

      const firstRows = await adminPool.query<{
        state: string;
        county: string;
        city: string | null;
        org_name: string;
        url: string;
      }>(`
        SELECT state, county, city, org_name, url
        FROM ${schemaSql}.civic_resources
        ORDER BY id
      `);

      const secondSeedDatabaseUrl = databaseUrlWithSearchPath(databaseUrl, schema);
      process.env.DATABASE_URL = secondSeedDatabaseUrl;
      delete process.env.CENSUS_API_KEY;
      const secondSeedModule = new URL("./seed-civic-coverage.js", import.meta.url);
      secondSeedModule.search = "second-run";
      const { default: runSeedAgain } = await import(secondSeedModule.href);
      await runSeedAgain();

      const secondRows = await adminPool.query<{
        state: string;
        county: string;
        city: string | null;
        org_name: string;
        url: string;
      }>(`
        SELECT state, county, city, org_name, url
        FROM ${schemaSql}.civic_resources
        ORDER BY id
      `);

      assert.deepEqual(secondRows.rows, firstRows.rows);
      assert.equal(secondRows.rowCount, expectedNewRows + 1);
    } finally {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaSql} CASCADE`);
      await adminPool.end();
    }
  },
);