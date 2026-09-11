/**
 * Product-owned Spiral neighborhoods.
 *
 * This catalog is intentionally separate from GIS imports and Nia-generated
 * suggestions. A city appears in the user-facing Spiral catalog because
 * Niakofa selected these neighborhoods, not because a boundary or model
 * response happened to exist in the database.
 */

export type CuratedSpiralNeighborhood = {
  neighborhood_id: string;
  name: string;
  emoji: string;
  description: string;
};

export type CuratedSpiralCity = {
  city_display: string;
  neighborhoods: readonly CuratedSpiralNeighborhood[];
};

export const CURATED_SPIRAL_CATALOG: Readonly<Record<string, CuratedSpiralCity>> = {
  fort_worth: {
    city_display: "Fort Worth",
    neighborhoods: [
      { neighborhood_id: "southside", name: "Southside", emoji: "🏘️", description: "Historic community south of downtown" },
      { neighborhood_id: "near_southside", name: "Near Southside", emoji: "🌳", description: "Creative district near Magnolia Avenue" },
      { neighborhood_id: "polytechnic", name: "Polytechnic", emoji: "🎓", description: "Home of Texas Wesleyan University" },
      { neighborhood_id: "riverside", name: "Riverside", emoji: "🌊", description: "Community along the Trinity River" },
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "The urban core of Fort Worth" },
      { neighborhood_id: "east_fort_worth", name: "East Fort Worth", emoji: "🌅", description: "Working-class roots and tight-knit community" },
      { neighborhood_id: "north_fort_worth", name: "North Fort Worth", emoji: "🤠", description: "Stockyards district and growing neighborhoods" },
      { neighborhood_id: "stop_six", name: "Stop Six", emoji: "✊", description: "Resilient community with deep history" },
      { neighborhood_id: "wedgwood", name: "Wedgwood", emoji: "🏡", description: "Family-friendly southwest Fort Worth" },
    ],
  },
  dallas: {
    city_display: "Dallas",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "The center of Dallas civic and cultural life" },
      { neighborhood_id: "deep_ellum", name: "Deep Ellum", emoji: "🎶", description: "Music, art, and small-business community" },
      { neighborhood_id: "bishop_arts", name: "Bishop Arts", emoji: "🎨", description: "Independent shops, restaurants, and galleries" },
      { neighborhood_id: "oak_lawn", name: "Oak Lawn", emoji: "🌳", description: "A connected neighborhood near central Dallas" },
      { neighborhood_id: "uptown", name: "Uptown", emoji: "🏢", description: "Walkable homes, businesses, and local gathering places" },
      { neighborhood_id: "oak_cliff", name: "Oak Cliff", emoji: "🌿", description: "Historic neighborhoods south of the Trinity" },
      { neighborhood_id: "east_dallas", name: "East Dallas", emoji: "🏘️", description: "Tree-lined neighborhoods and local community life" },
      { neighborhood_id: "pleasant_grove", name: "Pleasant Grove", emoji: "🤝", description: "A welcoming southeast Dallas community" },
      { neighborhood_id: "lake_highlands", name: "Lake Highlands", emoji: "🌊", description: "North Dallas neighborhoods around White Rock Lake" },
    ],
  },
  houston: {
    city_display: "Houston",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "Houston's civic, business, and arts center" },
      { neighborhood_id: "midtown", name: "Midtown", emoji: "🚇", description: "Central Houston community close to transit and parks" },
      { neighborhood_id: "montrose", name: "Montrose", emoji: "🎨", description: "Creative, walkable neighborhood with deep local culture" },
      { neighborhood_id: "third_ward", name: "Third Ward", emoji: "✊", description: "Historic community with strong cultural roots" },
      { neighborhood_id: "east_end", name: "East End", emoji: "🌅", description: "Arts, food, and family life east of downtown" },
      { neighborhood_id: "the_heights", name: "The Heights", emoji: "🏡", description: "Distinctive homes, businesses, and neighborhood events" },
      { neighborhood_id: "river_oaks", name: "River Oaks", emoji: "🌳", description: "Central Houston neighborhood near major destinations" },
      { neighborhood_id: "museum_district", name: "Museum District", emoji: "🏛️", description: "Museums, gardens, and civic gathering spaces" },
      { neighborhood_id: "gulfton", name: "Gulfton", emoji: "🌎", description: "A vibrant, globally connected southwest community" },
    ],
  },
  san_antonio: {
    city_display: "San Antonio",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "The River Walk, civic center, and historic core" },
      { neighborhood_id: "pearl", name: "Pearl", emoji: "✨", description: "Food, culture, and community along the river" },
      { neighborhood_id: "southtown", name: "Southtown", emoji: "🎨", description: "Arts, local businesses, and historic homes" },
      { neighborhood_id: "king_william", name: "King William", emoji: "🏘️", description: "Historic neighborhood south of downtown" },
      { neighborhood_id: "alamo_heights", name: "Alamo Heights", emoji: "🌳", description: "Established central San Antonio community" },
      { neighborhood_id: "monte_vista", name: "Monte Vista", emoji: "🏡", description: "Historic homes and neighborhood connections" },
      { neighborhood_id: "west_side", name: "West Side", emoji: "✊", description: "Deep cultural roots and family networks" },
      { neighborhood_id: "south_side", name: "South Side", emoji: "🤝", description: "Growing community south of the city center" },
      { neighborhood_id: "medical_center", name: "Medical Center", emoji: "🩺", description: "A major west-side community and employment hub" },
    ],
  },
  austin: {
    city_display: "Austin",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "Austin's civic, arts, and business center" },
      { neighborhood_id: "east_austin", name: "East Austin", emoji: "🎶", description: "Historic community with vibrant local culture" },
      { neighborhood_id: "south_congress", name: "South Congress", emoji: "🌵", description: "Walkable local businesses and gathering places" },
      { neighborhood_id: "zilker", name: "Zilker", emoji: "🌿", description: "Parks, trails, and west-central community life" },
      { neighborhood_id: "hyde_park", name: "Hyde Park", emoji: "🏡", description: "Historic north-central Austin neighborhood" },
      { neighborhood_id: "mueller", name: "Mueller", emoji: "🌳", description: "Planned neighborhood with parks and public spaces" },
      { neighborhood_id: "north_loop", name: "North Loop", emoji: "☕", description: "Independent businesses and neighborhood connections" },
      { neighborhood_id: "barton_hills", name: "Barton Hills", emoji: "💧", description: "Central Austin community near green space" },
      { neighborhood_id: "west_campus", name: "West Campus", emoji: "🎓", description: "Campus-adjacent community in central Austin" },
    ],
  },
  el_paso: {
    city_display: "El Paso",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "The historic civic and cultural center" },
      { neighborhood_id: "segundo_barrio", name: "Segundo Barrio", emoji: "✊", description: "Historic border community with deep cultural roots" },
      { neighborhood_id: "sunset_heights", name: "Sunset Heights", emoji: "🌄", description: "Historic west-side neighborhood and local businesses" },
      { neighborhood_id: "kern_place", name: "Kern Place", emoji: "🏘️", description: "Established central neighborhood near UTEP" },
      { neighborhood_id: "mission_hills", name: "Mission Hills", emoji: "🌳", description: "Central El Paso neighborhood near parks and schools" },
      { neighborhood_id: "lower_valley", name: "Lower Valley", emoji: "🌵", description: "Family-centered communities along the Rio Grande" },
      { neighborhood_id: "upper_valley", name: "Upper Valley", emoji: "🌿", description: "West-side communities and agricultural heritage" },
      { neighborhood_id: "east_side", name: "East Side", emoji: "🤝", description: "Growing neighborhoods and community networks" },
      { neighborhood_id: "northeast", name: "Northeast", emoji: "🏡", description: "North-eastern El Paso neighborhoods and families" },
    ],
  },
  laredo: {
    city_display: "Laredo",
    neighborhoods: [
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "Historic center of Laredo community life" },
      { neighborhood_id: "san_agustin", name: "San Agustin", emoji: "🏘️", description: "Historic neighborhood in the heart of Laredo" },
      { neighborhood_id: "heights", name: "The Heights", emoji: "🌳", description: "Established north-central Laredo community" },
      { neighborhood_id: "del_mar", name: "Del Mar", emoji: "🏡", description: "Family neighborhoods and local gathering places" },
      { neighborhood_id: "shiloh", name: "Shiloh", emoji: "🤝", description: "Growing north Laredo community" },
      { neighborhood_id: "lakeside", name: "Lakeside", emoji: "💧", description: "Neighborhoods near Laredo's lakes and parks" },
      { neighborhood_id: "las_cruces", name: "Las Cruces", emoji: "🌵", description: "South Laredo community with strong local ties" },
      { neighborhood_id: "mines_road", name: "Mines Road", emoji: "🌎", description: "A globally connected corridor and community" },
      { neighborhood_id: "north_central", name: "North Central", emoji: "✨", description: "North Laredo homes, schools, and businesses" },
    ],
  },
  kansas_city: {
    city_display: "Kansas City",
    neighborhoods: [
      { neighborhood_id: "eighteenth_and_vine", name: "18th & Vine", emoji: "🎷", description: "Historic jazz district and Black cultural heart of Kansas City" },
      { neighborhood_id: "downtown", name: "Downtown", emoji: "🏙️", description: "Kansas City's civic and business center" },
      { neighborhood_id: "midtown", name: "Midtown", emoji: "🏘️", description: "Central neighborhoods linking downtown and the Plaza" },
      { neighborhood_id: "westport", name: "Westport", emoji: "🍻", description: "Historic district with nightlife and local gathering places" },
      { neighborhood_id: "plaza", name: "Plaza", emoji: "🌳", description: "Country Club Plaza and surrounding community life" },
      { neighborhood_id: "northeast", name: "Northeast", emoji: "🤝", description: "Historic Northeast with deep neighborhood roots" },
      { neighborhood_id: "blue_hills", name: "Blue Hills", emoji: "✊", description: "East-side community with strong cultural identity" },
      { neighborhood_id: "brookside", name: "Brookside", emoji: "🏡", description: "Tree-lined south KC neighborhood and local businesses" },
      { neighborhood_id: "waldo", name: "Waldo", emoji: "✨", description: "South Kansas City neighborhood with independent shops and cafes" },
    ],
  },
};

const CURATED_CITY_ALIASES: Readonly<Record<string, string>> = {
  fort_worth_tx: "fort_worth",
  dallas_tx: "dallas",
  houston_tx: "houston",
  san_antonio_tx: "san_antonio",
  austin_tx: "austin",
  el_paso_tx: "el_paso",
  laredo_tx: "laredo",
  kansas_city_mo: "kansas_city",
  kansas_city_missouri: "kansas_city",
  kansas_city_missouri_mo: "kansas_city",
};

export function canonicalizeCuratedCityKey(cityKey: string): string {
  return CURATED_CITY_ALIASES[cityKey] ?? cityKey;
}

export function getCuratedSpiralCity(cityKey: string): CuratedSpiralCity | null {
  return CURATED_SPIRAL_CATALOG[canonicalizeCuratedCityKey(cityKey)] ?? null;
}
