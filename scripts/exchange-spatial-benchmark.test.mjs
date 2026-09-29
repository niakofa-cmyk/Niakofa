import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const benchmark = await readFile(new URL("./exchange-spatial-benchmark.mjs", import.meta.url), "utf8");

test("Exchange spatial benchmark targets canonical Niakofa table and status fields", () => {
  assert.match(benchmark, /FROM exchange_listings/);
  assert.match(benchmark, /moderation_status = 'approved'/);
  assert.match(benchmark, /status = 'active'/);
  assert.doesNotMatch(benchmark, /exchange_posts/);
});

test("benchmark bounds the query before exact distance calculation", () => {
  assert.match(benchmark, /latitude BETWEEN \$1 AND \$2/);
  assert.match(benchmark, /longitude BETWEEN \$3 AND \$4/);
  assert.match(benchmark, /ST_DWithin/);
  assert.match(benchmark, /Haversine/);
  assert.match(benchmark, /exchange_listings_geo_idx/);
  assert.match(benchmark, /geog IS NOT NULL/);
});

test("benchmark is read-only and never seeds mock data or embeds service credentials", () => {
  assert.doesNotMatch(benchmark, /INSERT INTO/i);
  assert.doesNotMatch(benchmark, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(benchmark, /DATABASE_URL/);
  assert.match(benchmark, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT TEXT\)/);
});
