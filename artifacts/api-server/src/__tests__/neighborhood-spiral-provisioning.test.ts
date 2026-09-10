import assert from "node:assert/strict";
import test from "node:test";

const migration = `-- Ensure every neighborhood record has its compatibility-backed Spiral row at creation time.\n-- Discovery still filters to active, geometry-verified neighborhoods; this only\n-- removes the first-request provisioning race for newly materialized cities.`;

// Keep this regression test intentionally text-based: the migration is executed
// by the production migration runner, while CI should still fail if its critical
// backfill/trigger contract is accidentally removed.
test("first-request Spiral provisioning is DB-backed and idempotent", async () => {
  const fs = await import("node:fs/promises");
  const path = new URL("../../../../lib/db/migrations/0133_neighborhood_spiral_provisioning.sql", import.meta.url);
  const sql = await fs.readFile(path, "utf8");

  assert.match(sql, /INSERT INTO audio_circles/i);
  assert.match(sql, /ON CONFLICT \(neighborhood_id\) WHERE neighborhood_id IS NOT NULL DO NOTHING/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION ensure_neighborhood_spiral_row/i);
  assert.match(sql, /AFTER INSERT ON city_neighborhoods/i);
  assert.match(sql, /CREATE TRIGGER city_neighborhoods_ensure_spiral/i);
  assert.match(sql, /audio_circles \(city_key, city_display, neighborhood_id, name\)/i);
  assert.equal(migration.startsWith("-- Ensure every neighborhood"), true);
});
