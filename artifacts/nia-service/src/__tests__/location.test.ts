/**
 * nia-service location middleware tests — buildLocationPrefix()
 *
 * buildLocationPrefix is a pure function that formats a location context
 * string for Nia's prompt. These tests ensure the output contract is stable
 * so a change to the location prefix silently stops providing context to Nia.
 */
import { describe, it, expect } from "@jest/globals";
import { buildLocationPrefix, LocationContext } from "../middleware/location.js";

describe("buildLocationPrefix", () => {
  it("returns empty string when no location context provided", () => {
    expect(buildLocationPrefix(undefined)).toBe("");
  });

  it("returns empty string when city/county/region are all absent", () => {
    const loc: LocationContext = { country: "US" };
    expect(buildLocationPrefix(loc)).toBe("");
  });

  it("returns a non-empty prefix when city is set", () => {
    const loc: LocationContext = { city: "Fort Worth", region: "TX", country: "US" };
    const prefix = buildLocationPrefix(loc);
    expect(prefix).toBeTruthy();
    expect(prefix).toContain("Fort Worth");
    expect(prefix).toContain("TX");
  });

  it("includes ZIP code when provided", () => {
    const loc: LocationContext = { city: "Fort Worth", region: "TX", country: "US", zip: "76101" };
    expect(buildLocationPrefix(loc)).toContain("76101");
  });

  it("includes coordinates when lat/lon are provided", () => {
    const loc: LocationContext = {
      city: "Fort Worth", region: "TX", country: "US",
      lat: 32.7555, lon: -97.3308,
    };
    const prefix = buildLocationPrefix(loc);
    expect(prefix).toContain("32.7555");
    expect(prefix).toContain("-97.3308");
  });

  it("marks GPS-precise accuracy when fromClientGPS is true", () => {
    const loc: LocationContext = {
      city: "Fort Worth", region: "TX", country: "US", fromClientGPS: true,
    };
    expect(buildLocationPrefix(loc)).toContain("GPS-precise");
  });

  it("marks approximate (IP-based) accuracy when fromClientGPS is false/absent", () => {
    const loc: LocationContext = { city: "Fort Worth", region: "TX", country: "US" };
    expect(buildLocationPrefix(loc)).toContain("approximate (IP-based)");
  });

  it("includes timezone when provided", () => {
    const loc: LocationContext = {
      city: "Fort Worth", region: "TX", country: "US", timezone: "America/Chicago",
    };
    expect(buildLocationPrefix(loc)).toContain("America/Chicago");
  });

  it("ends with a double newline for clean prompt separation", () => {
    const loc: LocationContext = { city: "Dallas", region: "TX", country: "US" };
    expect(buildLocationPrefix(loc)).toMatch(/\n\n$/);
  });

  it("handles zero coordinates (lat=0, lon=0) without treating them as falsy", () => {
    const loc: LocationContext = { city: "Accra", region: "Greater Accra", country: "GH", lat: 0, lon: 0 };
    const prefix = buildLocationPrefix(loc);
    expect(prefix).toContain("0.0000");
  });
});
