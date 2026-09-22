import assert from "node:assert/strict";
import test from "node:test";
import { getBoundaryStage, isBoundaryActive, isBoundaryReadyToPromote } from "../../components/BoundaryImportsReviewWorkflow";

const base = {
  id: 1,
  city_key: "fort_worth",
  city_display: "Fort Worth",
  source_kind: "municipal_gis",
  authority_level: "authoritative",
  source_publisher: "City of Fort Worth",
  source_url: "https://example.gov",
  source_dataset: "neighborhoods",
  source_feature_id: "1",
  source_version: "v1",
  source_retrieved_at: "2026-09-09T00:00:00Z",
  name: "Test Neighborhood",
  neighborhood_id: "test-neighborhood",
  center_lat: 32.75,
  center_lng: -97.33,
  geometry_valid: true,
  geometry_verified: false,
  reviewed: false,
  review_note: null,
  rejection_reason: null,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
};

test("workflow keeps each approval gate explicit", () => {
  assert.equal(getBoundaryStage({ ...base, geometry_valid: false }), "invalid");
  assert.equal(getBoundaryStage(base), "needs_review");
  assert.equal(getBoundaryStage({ ...base, reviewed: true }), "reviewed");
  assert.equal(getBoundaryStage({ ...base, reviewed: true, geometry_verified: true }), "ready_to_promote");
  assert.equal(isBoundaryReadyToPromote({ ...base, reviewed: true, geometry_verified: true }), true);
  assert.equal(isBoundaryReadyToPromote({ ...base, reviewed: true }), false);
});

test("generated sources can never enter the promotion-ready stage", () => {
  const generated = { ...base, reviewed: true, geometry_verified: true, source_kind: "generated_hint", authority_level: "generated" };
  assert.equal(getBoundaryStage(generated), "reviewed");
  assert.equal(isBoundaryReadyToPromote(generated), false);
});

test("active state requires the promoted production identity and current effective date", () => {
  const production = {
    id: 10,
    city_key: "fort_worth",
    city_display: "Fort Worth",
    neighborhood_id: "test-neighborhood",
    name: "Test Neighborhood",
    geometry_verified: true,
    source_kind: "municipal_gis",
    authority_level: "authoritative",
    verified: true,
    geometry_effective_at: "2026-09-08T00:00:00Z",
  };
  assert.equal(isBoundaryActive(base, [production]), true);
  assert.equal(isBoundaryActive(base, [{ ...production, neighborhood_id: "other" }]), false);
  assert.equal(isBoundaryActive(base, [{ ...production, geometry_effective_at: "2999-01-01T00:00:00Z" }]), false);
});

test("marking reviewed without explicit geometry_verified still leaves the row in Reviewed stage", () => {
  // Client must not force geometry_verified=false on Mark reviewed; server preserves prior value.
  // A freshly reviewed row with geometry_verified false is stage "reviewed", not vanished.
  const reviewedOnly = { ...base, reviewed: true, geometry_verified: false };
  assert.equal(getBoundaryStage(reviewedOnly), "reviewed");
  assert.equal(isBoundaryReadyToPromote(reviewedOnly), false);
});
