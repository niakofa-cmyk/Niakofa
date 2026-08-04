/**
 * Geocoding utility for Niakofa Legacy Mode.
 *
 * Strategy (in order):
 * 1. Nominatim OSM — free, no API key, respects 1 req/s rate limit on server side.
 *    Sends label + country as a search query with a User-Agent header.
 * 2. Country centroid fallback — compact lookup for ~80 diaspora-relevant countries.
 *    Guarantees every place with a country gets coordinates so the map is never empty.
 *
 * Never throws — always returns { lat, lng } | null.
 */

export interface GeoCoords {
  lat: number;
  lng: number;
  /** true when the coords come from a country centroid rather than a precise match */
  approximate?: boolean;
}

// ── Nominatim ──────────────────────────────────────────────────────────────────

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const UA = "NiakofaLegacy/1.0 (family history app; https://niakofa.com)";

async function nominatimGeocode(
  label: string,
  country?: string | null,
): Promise<GeoCoords | null> {
  try {
    const q = [label, country].filter(Boolean).join(", ");
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const { lat, lon } = data[0];
    const latN = parseFloat(lat);
    const lngN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lngN)) return null;
    return { lat: latN, lng: lngN };
  } catch {
    return null;
  }
}

// ── Country centroid lookup ───────────────────────────────────────────────────
// ~80 countries most relevant to the African/Caribbean/Afro-Latino diaspora
// plus common English-speaking destinations.

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  // West Africa
  ghana:              [7.9465,   -1.0232],
  nigeria:            [9.0820,    8.6753],
  "ivory coast":      [7.5400,   -5.5471],
  "côte d'ivoire":    [7.5400,   -5.5471],
  senegal:            [14.4974, -14.4524],
  mali:               [17.5707,  -3.9962],
  "burkina faso":     [12.3641,  -1.5275],
  guinea:             [11.0,    -10.9408],
  "guinea-bissau":    [11.8037, -15.1804],
  gambia:             [13.4432, -15.3101],
  "sierra leone":     [8.4606,  -11.7799],
  liberia:            [6.4281,   -9.4295],
  togo:               [8.6195,    0.8248],
  benin:              [9.3077,    2.3158],
  "cape verde":       [16.5388, -23.0418],
  // East Africa
  ethiopia:           [9.1450,   40.4897],
  kenya:              [-0.0236,  37.9062],
  tanzania:           [-6.3690,  34.8888],
  uganda:             [1.3733,   32.2903],
  rwanda:             [-1.9403,  29.8739],
  somalia:            [5.1521,   46.1996],
  eritrea:            [15.1794,  39.7823],
  // Southern Africa
  "south africa":     [-30.5595, 22.9375],
  mozambique:         [-18.6657, 35.5296],
  zambia:             [-13.1339, 27.8493],
  zimbabwe:           [-19.0154, 29.1549],
  malawi:             [-13.2543, 34.3015],
  botswana:           [-22.3285, 24.6849],
  namibia:            [-22.9576, 18.4904],
  angola:             [-11.2027, 17.8739],
  // Central Africa
  "democratic republic of congo": [-4.0383, 21.7587],
  drc:                [-4.0383,  21.7587],
  "congo":            [-0.2280,  15.8277],
  cameroon:           [3.8480,   11.5021],
  gabon:              [-0.8037,  11.6094],
  chad:               [15.4542,  18.7322],
  "central african republic": [6.6111, 20.9394],
  // North Africa
  egypt:              [26.8206,  30.8025],
  sudan:              [12.8628,  30.2176],
  ethiopia:           [9.1450,   40.4897],
  morocco:            [31.7917,  -7.0926],
  algeria:            [28.0339,   1.6596],
  tunisia:            [33.8869,   9.5375],
  libya:              [26.3351,  17.2283],
  // Caribbean
  jamaica:            [18.1096, -77.2975],
  "trinidad and tobago": [10.6918, -61.2225],
  trinidad:           [10.6918, -61.2225],
  haiti:              [18.9712, -72.2852],
  cuba:               [21.5218, -77.7812],
  "dominican republic": [18.7357, -70.1627],
  barbados:           [13.1939, -59.5432],
  bahamas:            [25.0343, -77.3963],
  guyana:             [4.8604,  -58.9302],
  suriname:           [3.9193,  -56.0278],
  "antigua and barbuda": [17.0608, -61.7964],
  belize:             [17.1899, -88.4976],
  // United Kingdom
  "united kingdom":   [55.3781,  -3.4360],
  england:            [52.3555,  -1.1743],
  "great britain":    [55.3781,  -3.4360],
  uk:                 [55.3781,  -3.4360],
  // United States regions
  "united states":    [37.0902, -95.7129],
  usa:                [37.0902, -95.7129],
  // Canada
  canada:             [56.1304, -106.3468],
  // Major European destinations
  france:             [46.2276,   2.2137],
  germany:            [51.1657,  10.4515],
  netherlands:        [52.1326,   5.2913],
  belgium:            [50.5039,   4.4699],
  spain:              [40.4637,  -3.7492],
  portugal:           [39.3999,  -8.2245],
  italy:              [41.8719,  12.5674],
  sweden:             [60.1282,  18.6435],
  norway:             [60.4720,   8.4689],
  denmark:            [56.2639,   9.5018],
  // Latin America
  brazil:             [-14.2350, -51.9253],
  colombia:           [4.5709,  -74.2973],
  venezuela:          [6.4238,  -66.5897],
  panama:             [8.5380,  -80.7821],
  "costa rica":       [9.7489,  -83.7534],
  mexico:             [23.6345, -102.5528],
  // Australasia / Pacific
  australia:          [-25.2744, 133.7751],
  "new zealand":      [-40.9006, 174.8860],
  // Asia
  india:              [20.5937,  78.9629],
  "saudi arabia":     [23.8859,  45.0792],
  "united arab emirates": [23.4241, 53.8478],
};

function centroids(country?: string | null): GeoCoords | null {
  if (!country) return null;
  const key = country.trim().toLowerCase();
  const coords = COUNTRY_CENTROIDS[key];
  if (!coords) return null;
  return { lat: coords[0], lng: coords[1], approximate: true };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Geocode a family place by its label and optional country.
 * Returns { lat, lng, approximate? } or null if nothing could be resolved.
 */
export async function geocodePlace(
  label: string,
  country?: string | null,
): Promise<GeoCoords | null> {
  // 1. Try Nominatim
  const precise = await nominatimGeocode(label, country);
  if (precise) return precise;

  // 2. Fall back to country centroid
  return centroids(country);
}
