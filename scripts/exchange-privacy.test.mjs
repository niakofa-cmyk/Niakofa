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

test("Exchange rejects common exact GPS coordinate formats", () => {
  for (const value of [
    "32.7600 -97.3300",
    "32.7600/-97.3300",
    "32.7600 N, 97.3300 W",
    "97.3300 W 32.7600 N",
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