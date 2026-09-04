import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Diaspora dashboard exposes the complete canonical journey", () => {
  const source = read("artifacts/pay-it-forward/src/pages/diaspora-dashboard.tsx");
  for (const label of ["Family", "Stories", "Tree", "Research", "Connections", "Heritage", "Legacy"]) {
    assert.match(source, new RegExp(`label: \\\"${label}\\\"`));
  }
  assert.match(source, /\/diaspora\/heritage\/globe/);
  assert.match(source, /\/diaspora\/dna/);
});

test("DNA copy stays provenance-safe", () => {
  const source = read("artifacts/pay-it-forward/src/pages/diaspora-dashboard.tsx");
  assert.match(source, /derived-sketch/);
  assert.match(source, /shared-cM/);
  assert.match(source, /IBD/);
});

test("Research evidence vocabulary contains all six supported semantics", () => {
  const source = read("artifacts/pay-it-forward/src/lib/diaspora/researchEvidence.ts");
  for (const kind of ["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]) {
    assert.match(source, new RegExp(`\\\"${kind}\\\"`));
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
