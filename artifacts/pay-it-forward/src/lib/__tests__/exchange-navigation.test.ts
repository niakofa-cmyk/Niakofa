import assert from "node:assert/strict";
import test from "node:test";
import { exchangeListingId, exchangeListingRoute } from "../exchange-navigation";

test("valid listing deep links and invalid ids", () => {
  assert.equal(exchangeListingId("?listingId=42&mine=true"), 42);
  for (const search of ["", "?listingId=0", "?listingId=-1", "?listingId=no", "?listingId=1.5"]) {
    assert.equal(exchangeListingId(search), null);
  }
});

test("edit links use the canonical route and preserve board filters", () => {
  assert.equal(exchangeListingRoute("?tab=exchange&mine=true", 42, true),
    "/community/exchange?mine=true&listingId=42&edit=1");
  assert.equal(exchangeListingRoute("?section=exchange&listingId=42&edit=1", 42),
    "/community/exchange?listingId=42");
});

test("closing a listing removes stale detail/edit/pickup redirects", () => {
  assert.equal(exchangeListingRoute("?mine=true&listingId=42&edit=1&pickupRequestId=9", null),
    "/community/exchange?mine=true");
});

test("pickup context is retained only for the same listing", () => {
  assert.equal(exchangeListingRoute("?listingId=42&pickupRequestId=9", 42),
    "/community/exchange?listingId=42&pickupRequestId=9");
  assert.equal(exchangeListingRoute("?listingId=42&pickupRequestId=9", 43),
    "/community/exchange?listingId=43");
});
