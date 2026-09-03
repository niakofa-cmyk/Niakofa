import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { estimateDnaRelationship } from "../artifacts/api-server/src/lib/dna-matching-engine.ts";

test("DNA matching fails closed when a profile has no derived sketch", () => {
  assert.equal(estimateDnaRelationship({ markerSketch: null, markerCount: 500 }, { markerSketch: null, markerCount: 500 }), null);
});

test("DNA matching returns only a broad similarity signal", () => {
  const sketch = Array.from({ length: 64 }, (_, index) => index);
  const result = estimateDnaRelationship(
    { markerSketch: sketch, markerCount: 1000 },
    { markerSketch: sketch, markerCount: 1000 },
  );
  assert.ok(result);
  assert.equal(result.source, "niakofa_derived_sketch_v1");
  assert.equal(result.confidence, "low");
  assert.match(result.relationshipBand, /similarity signal/);
  assert.equal("sharedCmEstimate" in result, false);
});

test("DNA matching suppresses weak sketch overlap", () => {
  const left = Array.from({ length: 64 }, (_, index) => index);
  const right = Array.from({ length: 64 }, (_, index) => index + 1000);
  assert.equal(
    estimateDnaRelationship({ markerSketch: left, markerCount: 1000 }, { markerSketch: right, markerCount: 1000 }),
    null,
  );
});

test("DNA profile deletion removes consent and result rows in both directions", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/diaspora.ts", import.meta.url), "utf8");
  assert.match(source, /tx\.delete\(dnaMatchingConsentTable\)/);
  assert.match(source, /eq\(dnaMatchResultsTable\.family_id, profile\.family_id\)/);
  assert.match(source, /eq\(dnaMatchResultsTable\.matched_family_id, profile\.family_id\)/);
  assert.match(source, /await db\.transaction\(async \(tx\)/);
});

test("DNA re-import replaces the sketch and invalidates old results", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/diaspora.ts", import.meta.url), "utf8");
  assert.match(source, /marker_sketch: parsed\.markerSketch/);
  assert.match(source, /A replacement export changes the derived profile/);
  assert.match(source, /tx\.delete\(dnaMatchResultsTable\)\.where\(or\(/);
  assert.match(source, /eq\(dnaMatchResultsTable\.matched_user_id, userId\)/);
});

test("DNA consent revocation removes rows where the user is the matched candidate", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/dna-matching.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!optedIn\) \{\s+await db\.transaction\(async \(tx\)/);
  assert.match(source, /eq\(dnaMatchResultsTable\.matched_family_id, familyId\)/);
  assert.match(source, /eq\(dnaMatchResultsTable\.matched_user_id, userId\)/);
});