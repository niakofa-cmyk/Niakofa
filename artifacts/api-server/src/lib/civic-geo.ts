const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
  "American Samoa": "AS", Guam: "GU",
  "Northern Mariana Islands": "MP", "Puerto Rico": "PR",
  "U.S. Virgin Islands": "VI", "United States Virgin Islands": "VI",
};

const VALID_STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

/**
 * Convert Mapbox's region metadata to the canonical state code used by the
 * civic registry. Mapbox normally supplies `US-TX`, but older/partial
 * responses may only contain the human-readable `Texas` label.
 */
export function normalizeMapboxStateCode(
  shortCode?: string | null,
  stateLabel?: string | null,
): string | null {
  const normalizedShortCode = shortCode?.trim().toUpperCase().replace(/_/g, "-");
  const shortCodeMatch = normalizedShortCode?.match(/^US-([A-Z]{2})$/);
  if (shortCodeMatch && VALID_STATE_CODES.has(shortCodeMatch[1])) {
    return shortCodeMatch[1];
  }

  const label = stateLabel
    ?.split(",")[0]
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return null;

  if (VALID_STATE_CODES.has(label.toUpperCase())) return label.toUpperCase();
  return STATE_NAME_TO_CODE[label] ?? null;
}