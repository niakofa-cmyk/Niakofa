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
 * Canonical source registry for launch-city geography.
 *
 * `discoveryUrl` is the human-facing catalog/source page. `datasetUrl` is the
 * machine-ingest endpoint actually used by Niakofa. Keeping both prevents a
 * future implementation from accidentally scraping a geocoder or a marketing
 * page when a first-party GIS/Open Data feed is available.
 *
 * Kansas City note: q45j-ejyk is a map view that currently returns null geometry
 * on every feature. The machine-ingestable Neighborhood Borders dataset is
 * vq6h-tqrf (MultiPolygon + nbhname). Discovery still links the public Borders
 * catalog page.
 */
export const NEIGHBORHOOD_SOURCE_DIRECTORY = {
  fort_worth: {
    publisher: "City of Fort Worth GIS",
    discoveryUrl: "https://www.fortworthtexas.gov/departments/it-solutions/gis",
    datasetUrl:
      "https://mapit.fortworthtexas.gov/ags/rest/services/Planning_Development/Zoning/MapServer/37/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson",
    dataset: "Planning_Development/Zoning/MapServer/37: Neighborhood Alliances",
    boundaryType: "Neighborhood Alliances",
    kind: "municipal_gis" as const,
  },
  kansas_city_missouri: {
    publisher: "Kansas City, Missouri Open Data",
    discoveryUrl: "https://data.kcmo.org/Neighborhoods/Kansas-City-Neighborhood-Borders/vq6h-tqrf",
    datasetUrl: "https://data.kcmo.org/resource/vq6h-tqrf.geojson?$limit=50000",
    dataset: "vq6h-tqrf: Kansas City Neighborhood Borders",
    boundaryType: "Neighborhood Borders",
    kind: "municipal_gis" as const,
  },
} as const;
