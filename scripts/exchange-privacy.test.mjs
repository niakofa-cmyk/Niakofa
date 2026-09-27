import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePublicPickupArea } from "../artifacts/api-server/src/lib/exchange-privacy.ts";

test("Exchange rejects exact addresses in any displayed text field", () => {
  for (const value of [
    "Meet at 123 Main Street",
    "Pickup from 123 5th Avenue",
    "Come by 12B Main Street",
    "My home on the corner",
    "Apartment #4",
    "Email me at neighbor@example.com",
    "Pay via Venmo",
  ]) {
    assert.equal(sanitizePublicPickupArea(value), false, value);
  }
});

test("Exchange accepts coarse public pickup areas and ordinary time windows", () => {
  for (const value of [
    "Downtown near the library",
    "Saturday afternoon",
    "Meet in the public park",
    "Central neighborhood",
  ]) {
    assert.equal(sanitizePublicPickupArea(value), true, value);
  }
});