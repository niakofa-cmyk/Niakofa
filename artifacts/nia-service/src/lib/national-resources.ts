/**
 * national-resources.ts
 * USA-wide resource lookup by city/state for Nia AI
 * 
 * Provides Nia with verified local resources when a user's location is known.
 * Falls back to national hotlines (211, 988, 911) when city is unknown.
 */

export interface LocalResource {
  name: string;
  phone?: string;
  url?: string;
  category: "food" | "shelter" | "crisis" | "dv" | "health" | "employment" | "utility" | "general";
}

export interface CityResources {
  city: string;
  state: string;
  phone211?: string;
  resources: LocalResource[];
}

// National fallbacks — always available regardless of location
export const NATIONAL_RESOURCES: LocalResource[] = [
  { name: "911 — Emergency (Police/Fire/Medical)", phone: "911", category: "crisis" },
  { name: "988 Suicide & Crisis Lifeline", phone: "988", category: "crisis" },
  { name: "211 — United Way Local Resources (food, shelter, crisis)", phone: "211", category: "general" },
  { name: "National DV Hotline", phone: "1-800-799-7233", url: "thehotline.org", category: "dv" },
  { name: "SAMHSA Substance Use Helpline", phone: "1-800-662-4357", url: "samhsa.gov", category: "health" },
  { name: "Feeding America (find local food bank)", url: "feedingamerica.org/find-your-local-foodbank", category: "food" },
  { name: "Veterans Crisis Line", phone: "988 (press 1)", category: "crisis" },
  { name: "SNAP (Food Stamps)", url: "benefits.gov/benefit/361", category: "food" },
  { name: "Find a Health Center (uninsured)", url: "findahealthcenter.hrsa.gov", category: "health" },
  { name: "Free Legal Aid", url: "lawhelp.org", category: "general" },
  { name: "HUD Housing Counseling", phone: "1-800-569-4287", url: "hud.gov", category: "shelter" },
];

// City-specific resource databases
const CITY_DB: CityResources[] = [
  {
    city: "Fort Worth", state: "TX",
    phone211: "211",
    resources: [
      { name: "Tarrant Area Food Bank", phone: "817-857-7100", url: "tarrantareafoodbank.org", category: "food" },
      { name: "Presbyterian Night Shelter", phone: "817-632-0000", category: "shelter" },
      { name: "SafeHaven of Tarrant County (DV)", phone: "1-877-701-7233", url: "safehaventc.org", category: "dv" },
      { name: "Mental Health Connection of Tarrant County", url: "mhctarrant.org", category: "health" },
      { name: "Catholic Charities Fort Worth", phone: "817-534-0814", category: "general" },
      { name: "Salvation Army Fort Worth", phone: "817-335-5577", category: "shelter" },
      { name: "Workforce Solutions for Tarrant County", url: "workforcesolutions.net", category: "employment" },
    ],
  },
  {
    city: "Dallas", state: "TX",
    phone211: "211",
    resources: [
      { name: "North Texas Food Bank", phone: "214-330-1396", url: "ntfb.org", category: "food" },
      { name: "The Stewpot (shelter/food)", phone: "214-746-2774", url: "thestewpot.org", category: "shelter" },
      { name: "Metrocare Services (mental health)", phone: "214-743-1200", category: "health" },
      { name: "Genesis Women's Shelter (DV)", phone: "214-946-4357", category: "dv" },
    ],
  },
  {
    city: "Houston", state: "TX",
    phone211: "211",
    resources: [
      { name: "Houston Food Bank", phone: "713-223-3700", url: "houstonfoodbank.org", category: "food" },
      { name: "Star of Hope (shelter)", phone: "713-227-8900", url: "sohmission.org", category: "shelter" },
      { name: "Harris County Crisis Intervention", phone: "832-416-1177", category: "crisis" },
      { name: "Houston Area Women's Center (DV)", phone: "713-528-2121", url: "hawc.org", category: "dv" },
      { name: "Harris Center for MH & IDD", phone: "713-970-7000", url: "harriscenter.org", category: "health" },
    ],
  },
  {
    city: "Atlanta", state: "GA",
    phone211: "211",
    resources: [
      { name: "Atlanta Community Food Bank", phone: "404-892-9822", url: "acfb.org", category: "food" },
      { name: "Gateway Center (shelter)", phone: "404-215-6600", url: "gatewayctr.org", category: "shelter" },
      { name: "Grady Health System (uninsured)", phone: "404-616-1000", category: "health" },
      { name: "CHRIS 180 (mental health/youth)", phone: "404-370-0472", url: "chris180.org", category: "health" },
      { name: "Partnership Against DV (PADV)", phone: "404-873-1766", url: "padv.org", category: "dv" },
    ],
  },
  {
    city: "Chicago", state: "IL",
    phone211: "211",
    resources: [
      { name: "Greater Chicago Food Depository", phone: "773-247-3663", url: "chicagosfoodbank.org", category: "food" },
      { name: "Chicago Dept of Family & Support Services", phone: "312-744-5000", category: "general" },
      { name: "Haymarket Center (substance use)", phone: "312-226-7984", category: "health" },
      { name: "Chicago DV Hotline", phone: "877-863-6338", category: "dv" },
      { name: "All Chicago (homelessness)", phone: "312-379-0301", url: "allchicago.org", category: "shelter" },
    ],
  },
  {
    city: "Los Angeles", state: "CA",
    phone211: "211",
    resources: [
      { name: "LA Regional Food Bank", phone: "323-234-3030", url: "lafoodbank.org", category: "food" },
      { name: "Union Rescue Mission (shelter)", phone: "213-347-6300", url: "urm.org", category: "shelter" },
      { name: "Didi Hirsch Mental Health Services", phone: "800-854-7771", url: "didihirsch.org", category: "health" },
      { name: "Peace Over Violence (DV)", phone: "213-626-3393", url: "peaceoverviolence.org", category: "dv" },
      { name: "PATH (homelessness)", phone: "323-644-2200", url: "epath.org", category: "shelter" },
    ],
  },
  {
    city: "New York", state: "NY",
    phone211: "311",
    resources: [
      { name: "Food Bank for NYC", phone: "212-566-7855", url: "foodbanknyc.org", category: "food" },
      { name: "NYC Human Resources Administration", phone: "718-557-1399", url: "nyc.gov/hra", category: "general" },
      { name: "Safe Horizon (DV/crime victims)", phone: "800-621-4673", url: "safehorizon.org", category: "dv" },
      { name: "NYC Well (mental health)", phone: "888-692-9355", url: "nycwell.cityofnewyork.us", category: "health" },
      { name: "Bowery Mission (shelter/food)", phone: "212-674-3456", url: "bowery.org", category: "shelter" },
    ],
  },
  {
    city: "Detroit", state: "MI",
    phone211: "211",
    resources: [
      { name: "Forgotten Harvest (food rescue)", phone: "248-327-4925", url: "forgottenharvest.org", category: "food" },
      { name: "Detroit Rescue Mission Ministries", phone: "313-993-4700", url: "drmm.org", category: "shelter" },
      { name: "Hegira Health (mental health/substance use)", phone: "734-525-3700", url: "hegirahealth.com", category: "health" },
      { name: "DVAM Detroit DV Hotline", phone: "313-861-1444", category: "dv" },
    ],
  },
  {
    city: "Baltimore", state: "MD",
    phone211: "211",
    resources: [
      { name: "Maryland Food Bank", phone: "410-737-8282", url: "mdfoodbank.org", category: "food" },
      { name: "Weinberg Housing & Resource Center", phone: "410-625-0775", category: "shelter" },
      { name: "Baltimore Crisis Hotline", phone: "410-433-5175", category: "crisis" },
      { name: "TurnAround (DV)", phone: "443-279-0379", url: "turnaroundinc.org", category: "dv" },
    ],
  },
  {
    city: "Philadelphia", state: "PA",
    phone211: "211",
    resources: [
      { name: "Philabundance (food)", phone: "215-339-0900", url: "philabundance.org", category: "food" },
      { name: "Project HOME (homelessness)", phone: "215-232-7272", url: "projecthome.org", category: "shelter" },
      { name: "WOAR (sexual assault/DV)", phone: "215-985-3333", url: "woar.org", category: "dv" },
      { name: "Penn Behavioral Health (crisis)", phone: "800-221-5809", category: "health" },
    ],
  },
  {
    city: "Phoenix", state: "AZ",
    phone211: "211",
    resources: [
      { name: "St. Mary's Food Bank", phone: "602-242-3663", url: "firstfoodbank.org", category: "food" },
      { name: "Human Services Campus (shelter)", phone: "602-256-6945", url: "humsvcampus.org", category: "shelter" },
      { name: "Southwest Behavioral Health (crisis)", phone: "800-631-1314", category: "health" },
      { name: "Sojourner Center (DV)", phone: "602-244-0089", url: "sojourner.org", category: "dv" },
    ],
  },
  {
    city: "Miami", state: "FL",
    phone211: "211",
    resources: [
      { name: "Feeding South Florida", phone: "954-518-1818", url: "feedingsouthflorida.org", category: "food" },
      { name: "Camillus House (shelter)", phone: "305-374-1065", url: "camillus.org", category: "shelter" },
      { name: "Miami-Dade Behavioral Health", phone: "305-649-8600", category: "health" },
      { name: "The Lotus House (DV)", phone: "305-756-2444", url: "lotushouse.org", category: "dv" },
    ],
  },
  {
    city: "Minneapolis", state: "MN",
    phone211: "211",
    resources: [
      { name: "Second Harvest Heartland", phone: "651-484-5117", url: "2harvest.org", category: "food" },
      { name: "St. Stephen's Human Services (shelter)", phone: "612-874-0311", url: "ststephensmpls.org", category: "shelter" },
      { name: "Crisis Connection", phone: "612-379-6363", category: "crisis" },
      { name: "Day One Crisis Hotline (DV/SA)", phone: "1-866-223-1111", category: "dv" },
    ],
  },
  {
    city: "Seattle", state: "WA",
    phone211: "211",
    resources: [
      { name: "Food Lifeline", url: "foodlifeline.org", category: "food" },
      { name: "Union Gospel Mission", phone: "206-723-0767", url: "ugm.org", category: "shelter" },
      { name: "Crisis Connections", phone: "866-427-4747", url: "crisisconnections.org", category: "crisis" },
      { name: "New Beginnings (DV)", phone: "206-522-9472", url: "newbegin.org", category: "dv" },
    ],
  },
  {
    city: "Denver", state: "CO",
    phone211: "211",
    resources: [
      { name: "Food Bank of the Rockies", phone: "303-371-9250", url: "foodbankrockies.org", category: "food" },
      { name: "Denver Rescue Mission", phone: "303-297-1815", url: "denverrescuemission.org", category: "shelter" },
      { name: "Colorado Crisis Services", phone: "844-493-8255", url: "coloradocrisisservices.org", category: "crisis" },
      { name: "SafeHouse Denver (DV)", phone: "303-318-9989", url: "safehousedenver.org", category: "dv" },
    ],
  },
];

// Normalize city names for lookup
function normCity(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
}

/**
 * Get resources for a given city/state combination.
 * Returns city-specific resources first, then national fallbacks.
 */
export function getResourcesForCity(
  city?: string | null,
  _state?: string | null
): { cityResources: LocalResource[]; national: LocalResource[]; city211?: string } {
  if (!city) {
    return { cityResources: [], national: NATIONAL_RESOURCES };
  }
  
  const normalizedCity = normCity(city);
  const match = CITY_DB.find(entry => 
    normCity(entry.city) === normalizedCity ||
    normalizedCity.includes(normCity(entry.city))
  );
  
  return {
    cityResources: match?.resources ?? [],
    national: NATIONAL_RESOURCES,
    city211: match?.phone211,
  };
}

/**
 * Build a resource summary string for Nia to use in her responses.
 */
export function buildResourceSummary(
  city?: string | null,
  state?: string | null,
  category?: LocalResource["category"] | null
): string {
  const { cityResources, city211 } = getResourcesForCity(city, state);
  
  const cityName = city && state ? `${city}, ${state}` : city ?? "your area";
  const localNumStr = city211 ? ` (call ${city211} for local services)` : " (call 211 for local services)";
  
  if (cityResources.length === 0) {
    return `For ${cityName}, call 211 for local resources. National: 911 for emergencies, 988 for crisis, 1-800-799-7233 for DV, 1-800-662-4357 for substance use.`;
  }
  
  const filtered = category 
    ? cityResources.filter(r => r.category === category)
    : cityResources.slice(0, 3);
    
  const lines = filtered.map(r => {
    const phone = r.phone ? ` — ${r.phone}` : "";
    const url = r.url ? ` (${r.url})` : "";
    return `${r.name}${phone}${url}`;
  });
  
  return `${cityName} resources${localNumStr}:\n${lines.join("\n")}`;
}
