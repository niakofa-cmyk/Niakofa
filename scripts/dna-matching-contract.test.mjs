import test from "node:test";
import assert from "node:assert/strict";
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