import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Diaspora landing is a Globe-first Hub doorway", () => {
  const source = read("artifacts/pay-it-forward/src/pages/diaspora-dashboard.tsx");
  const globe = read("artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx");

  // Product hierarchy: Diaspora → Globe → Hub → Action
  assert.match(source, /DiasporaGlobeFirst/);
  assert.match(source, /\/api\/griot\/village-pulse/);
  assert.match(globe, /Diaspora Globe/);
  assert.doesNotMatch(source, /\/diaspora\/family/);
  assert.doesNotMatch(source, /\/diaspora\/timeline/);

  // Globe is the navigation system — Hubs, not individual members
  assert.match(globe, /Search country, state or local hub/);
  assert.match(globe, /U\.S\. state hub/);
  assert.match(globe, /Country hub/);
  assert.match(globe, /hubId=/);
  assert.match(globe, /\/diaspora\/heritage\/globe/);
  assert.match(globe, /projection="globe"/);
  assert.match(globe, /Reset Globe to worldwide view/);
  assert.match(globe, /live_user_count > 0/);
  assert.match(globe, /Other U\.S\. State Hubs/);
  assert.match(globe, /position="bottom-right"/);
  assert.match(globe, /hero_image_url/);
  assert.match(globe, /label="Family"/);
  assert.match(globe, /\/diaspora\/family\?hubId=/);
  assert.match(globe, /data-niakofa-surface="diaspora-globe"/);
  assert.match(globe, /bg-\[#071312\]\/55 p-2 shadow-lg/);
  assert.match(globe, /bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(globe, /Hub context/);

  // Hub actions stay one level deeper (not competing landing cards)
  for (const label of ["Community", "Message hub", "Spirals", "Stories", "Family", "Pool"]) {
    assert.match(globe, new RegExp(`label=\"${label}\"`));
  }
});

test("V4 Hub context imagery and geography hardening are migration-backed", () => {
  const schema = read("lib/db/src/schema/diaspora-hubs.ts");
  const migration = read("lib/db/migrations/0140_diaspora_hub_context_hardening.sql");
  const audit = read("sql/diaspora-globe-geography-audit.sql");

  assert.match(schema, /hero_image_url: text\("hero_image_url"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS hero_image_url text/);
  assert.match(migration, /VALIDATE CONSTRAINT diaspora_hubs_globe_geography_check/);
  assert.match(migration, /hero_image_url must use https/);
  assert.match(audit, /WHERE primary_hub_id = id/);
  assert.match(audit, /upper\(country_code\) <> 'US'/);
});

test("DNA copy stays provenance-safe on DNA surfaces", () => {
  // DNA provenance belongs on DNA routes, not the Globe doorway.
  const route = read("artifacts/api-server/src/routes/dna-matching.ts");
  const engine = read("artifacts/api-server/src/lib/dna-matching-engine.ts");
  assert.match(engine, /niakofa_derived_sketch_v1/);
  assert.match(route, /shared_cm_est: null/);
  assert.match(route, /MAX_MATCH_RESULTS = 50/);
});

test("Research evidence vocabulary contains all six supported semantics", () => {
  const source = read("artifacts/pay-it-forward/src/lib/diaspora/researchEvidence.ts");
  for (const kind of ["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]) {
    assert.match(source, new RegExp(`\"${kind}\"`));
  }
});

test("Preserve pending scans retain a database uniqueness boundary", () => {
  const migration = read("lib/db/migrations/0124_diaspora_preserve_scan_idempotency.sql");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS diaspora_preserve_pending_user_qr_unique/);
  assert.match(migration, /WHERE memory_id IS NULL/);
});

test("DNA matching remains bounded and sketch-only", () => {
  const route = read("artifacts/api-server/src/routes/dna-matching.ts");
  const engine = read("artifacts/api-server/src/lib/dna-matching-engine.ts");
  assert.match(route, /MAX_MATCH_RESULTS = 50/);
  assert.match(route, /shared_cm_est: null/);
  assert.match(engine, /MIN_SKETCH_MARKERS = 32/);
  assert.match(engine, /niakofa_derived_sketch_v1/);
});
