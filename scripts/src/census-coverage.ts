/**
 * Pure Census coverage helpers.
 *
 * Keep provider parsing separate from the database seed so it can be verified
 * without a Postgres connection and so malformed provider responses fail closed.
 */

export const CENSUS_API = "https://api.census.gov/data/2024/acs/acs5";

export type CountyRecord = {
  name: string;
  stateFips: string;
  countyFips: string | null;
};

export type PlaceRecord = {
  name: string;
  placeFips: string;
};

export const STATE_CODES: Record<string, string> = {
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

export const FIPS_TO_STATE: Record<string, string> = {
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

// Verified offline safety net for environments where Census API access is
// unavailable. It intentionally has no fabricated GEOIDs.
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

export function offlineTexasCounties(): CountyRecord[] {
  return TX_COUNTIES.map((name) => ({
    name,
    stateFips: "48",
    countyFips: null,
  }));
}

export function censusRequestUrl(url: string, apiKey?: string): string {
  const requestUrl = new URL(url);
  if (apiKey) requestUrl.searchParams.set("key", apiKey);
  return requestUrl.toString();
}

function isStringRows(value: unknown): value is string[][] {
  return Array.isArray(value)
    && value.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"));
}

export function parseCensusResponse(body: string, status: number, ok: boolean): string[][] {
  if (!ok) throw new Error(`Census API ${status}`);

  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    throw new Error("Census API returned non-JSON content");
  }
  if (!isStringRows(rows) || rows.length < 1 || rows[0].length < 1) {
    throw new Error("Census API returned an invalid tabular response");
  }
  return rows;
}

type CensusFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchCensusRows(
  url: string,
  apiKey: string | undefined,
  fetcher: CensusFetcher = fetch,
): Promise<string[][]> {
  const response = await fetcher(censusRequestUrl(url, apiKey), {
    headers: { accept: "application/json" },
    redirect: "manual",
  });
  if (response.headers.get("x-datawebapi-keyerror") === "1") {
    throw new Error("Census API rejected the configured key");
  }
  return parseCensusResponse(await response.text(), response.status, response.ok);
}

function requireColumns(header: string[], columns: string[], kind: string): number[] {
  const indexes = columns.map((column) => header.indexOf(column));
  if (indexes.some((index) => index < 0)) {
    throw new Error(`Unexpected Census ${kind} response`);
  }
  return indexes;
}

function withoutStateSuffix(name: string): string {
  return name.replace(/,\s+[^,]+$/, "").trim();
}

export function parseCountyRows(rows: string[][]): CountyRecord[] {
  const [header, ...data] = rows;
  const [nameIndex, stateIndex, countyIndex] = requireColumns(
    header,
    ["NAME", "state", "county"],
    "county",
  );
  return data.map((row) => ({
    name: withoutStateSuffix(row[nameIndex]).replace(
      / County$| Parish$| Borough$| Census Area$| Municipality$| city and borough$/i,
      "",
    ).trim(),
    stateFips: row[stateIndex],
    countyFips: row[countyIndex],
  }));
}

export function parsePlaceRows(rows: string[][]): PlaceRecord[] {
  const [header, ...data] = rows;
  const [nameIndex, placeIndex] = requireColumns(header, ["NAME", "place"], "place");
  return data.map((row) => ({
    name: withoutStateSuffix(row[nameIndex])
      .replace(/ city$| town$| village$| borough$| CDP$/i, "")
      .trim(),
    placeFips: row[placeIndex],
  }));
}