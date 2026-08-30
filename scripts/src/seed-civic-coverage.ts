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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);
const VERIFIED_AT = new Date("2026-08-30T00:00:00.000Z");
const CENSUS_API = "https://api.census.gov/data/2025/pep/population";
const CENSUS_API_KEY = process.env.CENSUS_API_KEY;
const USA_LOCAL_GOV_URL = "https://www.usa.gov/state-local-governments";
const NATIONAL_211_URL = "https://www.211.org/";

const STATE_CODES: Record<string, string> = {
  AL: "Alabama", AS: "American Samoa", AK: "Alaska", AZ: "Arizona",
  AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP",
  "72": "PR", "78": "VI",
};

// The Texas list is an offline safety net for environments where Census API
// access requires a key. It is used without fabricated GEOIDs; Census remains
// the source of truth for national county names and identifiers when available.
const TX_COUNTIES = `
Anderson|Andrews|Angelina|Aransas|Archer|Armstrong|Atascosa|Austin|Bailey|Bandera|Bastrop|Baylor|Bee|Bell|Bexar|Blanco|Borden|Bosque|Bowie|Brazoria|Brazos|Brewster|Briscoe|Brooks|Brown|Burleson|Burnet|
Caldwell|Calhoun|Callahan|Cameron|Camp|Carson|Cass|Castro|Chambers|Cherokee|Childress|Clay|Cochran|Coke|Coleman|Collin|Collingsworth|Colorado|Comal|Comanche|Concho|Cooke|Coryell|Cottle|Crane|Crockett|Crosby|Culberson|
Dallam|Dallas|Dawson|Deaf Smith|Delta|Denton|DeWitt|Dickens|Dimmit|Donley|Duval|Eastland|Ector|Edwards|Ellis|El Paso|Erath|Falls|Fannin|Fayette|Fisher|Floyd|Foard|Fort Bend|Franklin|Freestone|Frio|
Gaines|Galveston|Garza|Gillespie|Glasscock|Goliad|Gonzales|Gray|Grayson|Gregg|Grimes|Guadalupe|Hale|Hall|Hamilton|Hansford|Hardeman|Hardin|Harrison|Hartley|Harris|Haskell|Hays|Hemphill|Henderson|Hidalgo|Hill|Hockley|Hood|Hopkins|Houston|Howard|Hudspeth|Hunt|Hutchinson|Irion|
Jack|Jackson|Jasper|Jeff Davis|Jefferson|Jim Hogg|Jim Wells|Johnson|Jones|Karnes|Kaufman|Kendall|Kenedy|Kent|Kerr|Kimble|King|Kinney|Kleberg|Knox|Lamar|Lamb|Lampasas|LaSalle|Lavaca|Lee|Leon|Liberty|Limestone|Lipscomb|Live Oak|Llano|Loving|Lubbock|Lynn|
Madison|Marion|Martin|Mason|Matagorda|Maverick|McCulloch|McLennan|McMullen|Medina|Menard|Midland|Milam|Mills|Mitchell|Montague|Montgomery|Moore|Morris|Motley|Nacogdoches|Navarro|Newton|Nolan|Nueces|Ochiltree|Oldham|Orange|
Palo Pinto|Panola|Parker|Parmer|Pecos|Polk|Potter|Presidio|Rains|Randall|Reagan|Real|Red River|Reeves|Refugio|Roberts|Robertson|Rockwall|Runnels|Rusk|
Sabine|San Augustine|San Jacinto|San Patricio|San Saba|Schleicher|Scurry|Shackelford|Shelby|Sherman|Smith|Somervell|Starr|Stephens|Sterling|Stonewall|Sutton|Swisher|
Tarrant|Taylor|Terrell|Terry|Throckmorton|Titus|Tom Green|Travis|Trinity|Tyler|Upshur|Upton|Uvalde|Val Verde|Van Zandt|Victoria|Walker|Waller|Ward|Washington|Webb|Wharton|Wheeler|Wichita|Wilbarger|Willacy|Williamson|Wilson|Winkler|Wise|Wood|Yoakum|Young|Zapata|Zavala
`.split("|").map((county) => county.trim()).filter(Boolean);

if (TX_COUNTIES.length !== 254) {
  throw new Error(`Expected 254 Texas counties in offline fallback, got ${TX_COUNTIES.length}`);
}

type CountyRecord = {
  name: string;
  stateFips: string;
  countyFips: string | null;
};

async function censusRows(url: string): Promise<string[][]> {
  const requestUrl = CENSUS_API_KEY
    ? `${url}&key=${encodeURIComponent(CENSUS_API_KEY)}`
    : url;
  const response = await fetch(requestUrl, { headers: { accept: "application/json" } });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Census API ${response.status}: ${body.slice(0, 240)}`);
  }
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    throw new Error(`Census API returned non-JSON content: ${body.slice(0, 120)}`);
  }
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("Census API returned no rows");
  }
  return rows as string[][];
}

async function loadNationalCounties(): Promise<CountyRecord[]> {
  const rows = await censusRows(`${CENSUS_API}?get=NAME&for=county:*`);
  const [header, ...data] = rows;
  const nameIndex = header.indexOf("NAME");
  const stateIndex = header.indexOf("state");
  const countyIndex = header.indexOf("county");
  if (nameIndex < 0 || stateIndex < 0 || countyIndex < 0) {
    throw new Error("Unexpected Census county response");
  }
  return data.map((row) => ({
    name: row[nameIndex].replace(
      / County$| Parish$| Borough$| Census Area$| Municipality$| city and borough$/i,
      "",
    ),
    stateFips: row[stateIndex],
    countyFips: row[countyIndex],
  }));
}

function offlineTexasCounties(): CountyRecord[] {
  return TX_COUNTIES.map((name) => ({
    name,
    stateFips: "48",
    countyFips: null,
  }));
}

async function loadPlaces(stateFips: string) {
  const rows = await censusRows(`${CENSUS_API}?get=NAME&for=place:*&in=state:${stateFips}`);
  const [header, ...data] = rows;
  const nameIndex = header.indexOf("NAME");
  const placeIndex = header.indexOf("place");
  if (nameIndex < 0 || placeIndex < 0) {
    throw new Error("Unexpected Census place response");
  }
  return data.map((row) => ({
    name: row[nameIndex].replace(/ city$| town$| village$| borough$| CDP$/i, ""),
    placeFips: row[placeIndex],
  }));
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
    let censusAvailable = true;
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