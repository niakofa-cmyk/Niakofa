/**
 * Niakofa Civic Coverage Seed
 *
 * Establishes safe national state/county coverage from authoritative public
 * directories, a Texas Census-place verification queue, and verified 311
 * resources for Fort Worth and Dallas. It never invents municipal URLs.
 */
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  civicJurisdictionsTable,
  civicResourcesTable,
  type InsertCivicResource,
} from "@workspace/db";
import {
  CENSUS_API,
  FIPS_TO_STATE,
  STATE_CODES,
  fetchCensusRows,
  offlineTexasCounties,
  parseCountyRows,
  parsePlaceRows,
  type CountyRecord,
} from "./census-coverage.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);
const VERIFIED_AT = new Date("2026-08-30T00:00:00.000Z");
const CENSUS_API_KEY = process.env.CENSUS_API_KEY?.trim();
const USA_LOCAL_GOV_URL = "https://www.usa.gov/state-local-governments";
const NATIONAL_211_URL = "https://www.211.org/";

async function loadNationalCounties(): Promise<CountyRecord[]> {
  if (!CENSUS_API_KEY) return [];
  return parseCountyRows(await fetchCensusRows(
    `${CENSUS_API}?get=NAME&for=county:*`,
    CENSUS_API_KEY,
  ));
}

async function loadPlaces(stateFips: string) {
  return parsePlaceRows(await fetchCensusRows(
    `${CENSUS_API}?get=NAME&for=place:*&in=state:${stateFips}`,
    CENSUS_API_KEY,
  ));
}

function nationalStateBaseline(state: string): InsertCivicResource {
  const label = STATE_CODES[state] ?? state;
  return {
    state,
    county: "Statewide",
    city: null,
    org_name: `Official State & Local Government Directory — ${label}`,
    description: `National civic-resource baseline for ${label}. Use this official federal directory to locate state and local government services. This record is a coverage fallback and is not a substitute for a verified local government resource.`,
    url: USA_LOCAL_GOV_URL,
    phone: null,
    category: "government_directory",
    address: null,
    latitude: null,
    longitude: null,
    open_hours: null,
    jurisdiction_level: "state",
    source_name: "USA.gov",
    source_url: USA_LOCAL_GOV_URL,
    last_verified_at: VERIFIED_AT,
    is_authoritative: true,
    coverage_status: "baseline",
    geoid: `US-${state}`,
  };
}

function countyBaseline(state: string, county: string, geoid: string | null): InsertCivicResource {
  const label = STATE_CODES[state] ?? state;
  const url = state === "TX" ? "https://www.211texas.org/" : NATIONAL_211_URL;
  return {
    state,
    county,
    city: null,
    org_name: `Local Government & Community Resource Directory — ${county} County, ${label}`,
    description: `County-level coverage baseline for ${county} County. This record points to authoritative government/community directories until a county-specific official resource is verified. It prevents cross-jurisdiction leakage while preserving a safe discovery path.`,
    url,
    phone: state === "TX" ? "877-541-7905" : null,
    category: "information_referral",
    address: null,
    latitude: null,
    longitude: null,
    open_hours: null,
    jurisdiction_level: "county",
    source_name: state === "TX"
      ? "2-1-1 Texas / Texas Health and Human Services Commission"
      : "211 / national community information referral",
    source_url: url,
    last_verified_at: VERIFIED_AT,
    is_authoritative: state === "TX",
    coverage_status: "baseline",
    geoid,
  };
}

const CITY_RESOURCES = [
  {
    state: "TX", county: "Tarrant", city: "Fort Worth",
    org_name: "City of Fort Worth 311 Customer Care",
    description: "Official City of Fort Worth non-emergency customer care and service-request channel for city services.",
    url: "https://www.fortworthtexas.gov/departments/communications/customercare",
    phone: "817-392-1234", category: "government",
    address: "100 Fort Worth Trail, Fort Worth, TX 76102",
    latitude: 32.748, longitude: -97.33, open_hours: null,
    jurisdiction_level: "city", source_name: "City of Fort Worth",
    source_url: "https://www.fortworthtexas.gov/departments/communications/customercare",
    last_verified_at: VERIFIED_AT, is_authoritative: true,
    coverage_status: "verified", geoid: null,
  },
  {
    state: "TX", county: "Dallas", city: "Dallas",
    org_name: "City of Dallas 311 Customer Service Center",
    description: "Official City of Dallas 311 service-request and city-information channel.",
    url: "https://dallascityhall.com/services/311/Pages/about-us.aspx",
    phone: "214-670-3111", category: "government",
    address: "1500 Marilla St, Dallas, TX 75201",
    latitude: 32.776, longitude: -96.797, open_hours: null,
    jurisdiction_level: "city", source_name: "City of Dallas",
    source_url: "https://dallascityhall.com/services/311/Pages/about-us.aspx",
    last_verified_at: VERIFIED_AT, is_authoritative: true,
    coverage_status: "verified", geoid: null,
  },
] satisfies InsertCivicResource[];

async function upsertResource(values: InsertCivicResource): Promise<"inserted" | "updated"> {
  const existing = await db
    .select({ id: civicResourcesTable.id })
    .from(civicResourcesTable)
    .where(and(
      eq(civicResourcesTable.org_name, values.org_name),
      eq(civicResourcesTable.state, values.state),
      eq(civicResourcesTable.county, values.county),
      values.city ? eq(civicResourcesTable.city, values.city) : isNull(civicResourcesTable.city),
    ))
    .limit(1);

  if (existing.length) {
    await db.update(civicResourcesTable)
      .set(values)
      .where(eq(civicResourcesTable.id, existing[0].id));
    return "updated";
  }
  await db.insert(civicResourcesTable).values(values);
  return "inserted";
}

export default async function runSeed(): Promise<void> {
  try {
    let inserted = 0;
    let updated = 0;
    const upsert = async (values: InsertCivicResource) => {
      const result = await upsertResource(values);
      if (result === "inserted") inserted++;
      else updated++;
    };

    for (const state of Object.keys(STATE_CODES)) {
      await upsert(nationalStateBaseline(state));
    }

    let counties: CountyRecord[];
    let censusAvailable = Boolean(CENSUS_API_KEY);
    if (!censusAvailable) {
      counties = offlineTexasCounties();
    } else {
      try {
        counties = await loadNationalCounties();
      } catch (error) {
        censusAvailable = false;
        console.warn(
          `civic coverage seed: Census county lookup unavailable; using the ` +
          `verified offline Texas county list only (${String(error)}).`,
        );
        counties = offlineTexasCounties();
      }
    }
    for (const county of counties) {
      const state = FIPS_TO_STATE[county.stateFips];
      if (state) {
        const geoid = county.countyFips
          ? `${county.stateFips}${county.countyFips}`
          : null;
        await upsert(countyBaseline(state, county.name, geoid));
      }
    }

    let txPlaces: { name: string; placeFips: string }[] = [];
    if (censusAvailable) {
      try {
        txPlaces = await loadPlaces("48");
      } catch (error) {
        console.warn(
          `civic coverage seed: Census Texas place lookup unavailable; ` +
          `skipping unverified place registry (${String(error)}).`,
        );
      }
    }
    let jurisdictionInserted = 0;
    for (const place of txPlaces) {
      const geoid = `48-${place.placeFips}`;
      const existing = await db
        .select({ id: civicJurisdictionsTable.id })
        .from(civicJurisdictionsTable)
        .where(eq(civicJurisdictionsTable.geoid, geoid))
        .limit(1);
      const values = {
        state: "TX",
        county: null,
        city: place.name,
        geoid,
        jurisdiction_level: "city",
        source_name: "U.S. Census Bureau",
        source_url: "https://www.census.gov/geographies/reference-files.html",
        coverage_status: "needs_verification",
        last_verified_at: VERIFIED_AT,
        updated_at: VERIFIED_AT,
      };
      if (existing.length) {
        await db.update(civicJurisdictionsTable)
          .set(values)
          .where(eq(civicJurisdictionsTable.id, existing[0].id));
      } else {
        await db.insert(civicJurisdictionsTable).values(values);
        jurisdictionInserted++;
      }
    }

    for (const resource of CITY_RESOURCES) await upsert(resource);

    console.log(
      `civic coverage seed: ${inserted} inserted, ${updated} updated; ` +
      `${censusAvailable ? "national" : "offline Texas"} state/county baseline + ` +
      `${txPlaces.length} Texas Census place ` +
      `registry entries (${jurisdictionInserted} new) + ${CITY_RESOURCES.length} ` +
      "verified TX city resources.",
    );
  } finally {
    await pool.end();
  }
}