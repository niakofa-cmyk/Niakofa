/**
 * Neighborhood geography provenance policy.
 *
 * Neighborhood names are not a single federal geography in the United States.
 * Niakofa therefore keeps a provenance record and never treats an LLM-generated
 * list or a geocoder hint as an authoritative neighborhood boundary.
 *
 * Priority for host eligibility / GPS verification:
 *   1. municipal or county GIS boundary
 *   2. state/regional public GIS boundary
 *   3. reviewed OSM boundary=place / place=neighbourhood geometry
 *   4. reviewed manual Niakofa geometry
 *
 * Census TIGER/Line remains authoritative for legal/statistical geography, but
 * it is not a substitute for neighborhood boundaries where the Census does not
 * publish that geography.
 */

export type NeighborhoodSourceKind =
  | "municipal_gis"
  | "county_gis"
  | "state_gis"
  | "regional_gis"
  | "osm_reviewed"
  | "niakofa_curated"
  | "generated_hint";

export type NeighborhoodAuthority = "authoritative" | "curated" | "generated";

export type NeighborhoodSourceRecord = {
  kind: NeighborhoodSourceKind;
  authority: NeighborhoodAuthority;
  publisher: string;
  url: string;
  retrieved_at?: string | null;
  version?: string | null;
  license?: string | null;
};

export const NEIGHBORHOOD_SOURCE_PRIORITY: readonly NeighborhoodSourceKind[] = [
  "municipal_gis",
  "county_gis",
  "state_gis",
  "regional_gis",
  "osm_reviewed",
  "niakofa_curated",
  "generated_hint",
];

export function isBoundaryEligibleSource(kind: NeighborhoodSourceKind): boolean {
  return kind !== "generated_hint";
}

export function isHostVerificationEligible(
  sourceKind: NeighborhoodSourceKind | null | undefined,
  geometryVerified: boolean,
): boolean {
  return Boolean(sourceKind && geometryVerified && isBoundaryEligibleSource(sourceKind));
}

/**
 * Official source starting points for the first two launch cities.
 * City-specific layer URLs should be recorded in city_neighborhoods once the
 * exact public GIS layer has been selected and reviewed by Niakofa admins.
 */
export const NEIGHBORHOOD_SOURCE_DIRECTORY = {
  fort_worth: {
    publisher: "City of Fort Worth GIS",
    discoveryUrl: "https://www.fortworthtexas.gov/departments/it-solutions/gis",
    kind: "municipal_gis" as const,
  },
  kansas_city_missouri: {
    publisher: "Kansas City, Missouri Open Data",
    discoveryUrl: "https://data.kcmo.org/Neighborhoods/Kansas-City-Neighborhood-Boundaries/q45j-ejyk",
    kind: "municipal_gis" as const,
  },
} as const;
