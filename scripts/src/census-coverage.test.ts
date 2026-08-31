import assert from "node:assert/strict";
import test from "node:test";
import {
  censusRequestUrl,
  fetchCensusRows,
  offlineTexasCounties,
  parseCountyRows,
  parsePlaceRows,
} from "./census-coverage.js";

test("keeps the verified Texas fallback complete and GEOID-free", () => {
  const counties = offlineTexasCounties();
  assert.equal(counties.length, 254);
  assert.equal(counties.find((county) => county.name === "Tarrant")?.stateFips, "48");
  assert.ok(counties.every((county) => county.countyFips === null));
});

test("adds an encoded Census key without replacing existing query parameters", () => {
  const url = censusRequestUrl(
    "https://api.census.gov/data/2025/pep/population?get=NAME&for=county:*",
    "key with spaces",
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("get"), "NAME");
  assert.equal(parsed.searchParams.get("for"), "county:*");
  assert.equal(parsed.searchParams.get("key"), "key with spaces");
});

test("rejects provider HTML and malformed tabular responses", async () => {
  await assert.rejects(
    fetchCensusRows(
      "https://example.test/census",
      undefined,
      async () => new Response("<html>missing key</html>", { status: 200 }),
    ),
    /non-JSON/,
  );
  await assert.rejects(
    fetchCensusRows(
      "https://example.test/census",
      undefined,
      async () => new Response(JSON.stringify({ error: "bad response" }), { status: 200 }),
    ),
    /invalid tabular/,
  );
  await assert.rejects(
    fetchCensusRows(
      "https://example.test/census",
      undefined,
      async () => new Response("upstream failure", { status: 503 }),
    ),
    /Census API 503/,
  );
  await assert.rejects(
    fetchCensusRows(
      "https://example.test/census",
      "invalid",
      async () => new Response(null, {
        status: 302,
        headers: { "x-datawebapi-keyerror": "1" },
      }),
    ),
    /rejected the configured key/,
  );
});

test("parses Census county names, state FIPS, and county FIPS", () => {
  const rows = [
    ["state", "county", "NAME"],
    ["48", "439", "Tarrant County"],
    ["25", "017", "Middlesex County"],
  ];
  assert.deepEqual(parseCountyRows(rows), [
    { name: "Tarrant", stateFips: "48", countyFips: "439" },
    { name: "Middlesex", stateFips: "25", countyFips: "017" },
  ]);
});

test("parses place names while retaining the Census place code", () => {
  assert.deepEqual(parsePlaceRows([
    ["NAME", "place"],
    ["Fort Worth city", "27000"],
    ["Example CDP", "99999"],
  ]), [
    { name: "Fort Worth", placeFips: "27000" },
    { name: "Example", placeFips: "99999" },
  ]);
});

test("rejects county and place responses with missing required columns", () => {
  assert.throws(
    () => parseCountyRows([["NAME", "state"], ["Tarrant County", "48"]]),
    /Unexpected Census county response/,
  );
  assert.throws(
    () => parsePlaceRows([["NAME"], ["Fort Worth city"]]),
    /Unexpected Census place response/,
  );
});