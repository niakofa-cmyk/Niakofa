/**
 * Live, read-only Census verification.
 *
 * This command never prints the API key or the provider URL with its query
 * string. It reports only structural coverage facts safe for CI/deploy logs.
 */
import {
  CENSUS_API,
  fetchCensusRows,
  parseCountyRows,
  parsePlaceRows,
} from "./census-coverage.js";

const apiKey = process.env.CENSUS_API_KEY?.trim();

if (!apiKey) {
  console.log(JSON.stringify({
    provider: "census",
    status: "degraded",
    reason: "CENSUS_API_KEY is not configured; verified offline Texas fallback remains active",
  }));
  process.exit(0);
}

try {
  const counties = parseCountyRows(await fetchCensusRows(
    `${CENSUS_API}?get=NAME&for=county:*`,
    apiKey,
  ));
  const texasPlaces = parsePlaceRows(await fetchCensusRows(
    `${CENSUS_API}?get=NAME&for=place:*&in=state:48`,
    apiKey,
  ));
  const tarrant = counties.find(
    (county) => county.stateFips === "48" && county.name === "Tarrant",
  );
  const fortWorth = texasPlaces.find((place) => place.name === "Fort Worth");

  if (counties.length < 3000 || !tarrant || texasPlaces.length < 1 || !fortWorth) {
    throw new Error("Census response passed JSON parsing but failed coverage sanity checks");
  }

  console.log(JSON.stringify({
    provider: "census",
    dataset: "2025/pep/population",
    status: "available",
    countyRows: counties.length,
    stateCount: new Set(counties.map((county) => county.stateFips)).size,
    texasPlaceRows: texasPlaces.length,
    tarrantCountyGEOID: `${tarrant.stateFips}${tarrant.countyFips}`,
    fortWorthPlaceFIPS: fortWorth.placeFips,
  }));
} catch (error) {
  console.error(`Census verification failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}