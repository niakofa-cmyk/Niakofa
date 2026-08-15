/**
 * Legacy World Regions — 12-region world scaffold for Niakofa Legacy.
 *
 * Architecture (from Canonical Resolution doc, Aug 2026):
 *   Each region has 17 layers: Terrain, Paths, Buildings, Interior Portals,
 *   Props, Vegetation, Water, Collision, Navigation, Interaction Points,
 *   NPC Spawn Points, Story Events, Foreground Occlusion, Lighting,
 *   Weather, Audio Zones, and Legacy World State.
 *
 * The 12 regions span the full Mensah family story arc:
 *   Present day compound → 1890s flashbacks → Colonial era → Migration → Return
 *
 * Map scale: all regions use 6 rows × 9 columns (54 tiles each) at the
 * canonical Kwame-calibrated tile size. Portals connect adjacent regions.
 */

import type { LegacyWorldTile, LegacyWorldLandmark } from "@/lib/legacy-world-layout";

// ── Region types ──────────────────────────────────────────────────────────────

export type RegionId =
  | "mensah-compound-present"
  | "mensah-compound-1890"
  | "cape-coast-market"
  | "cocoa-farm-east"
  | "mission-school"
  | "mensah-warehouse"
  | "village-common-baobab"
  | "river-fishing"
  | "elder-nana-compound"
  | "colonial-office"
  | "diaspora-town"
  | "regenerated-world";

export type RegionEra =
  | "present-day"
  | "1890s"
  | "1900s"
  | "1910s"
  | "1920s"
  | "1940s"
  | "diaspora"
  | "regenerated";

export type RegionConnectionDirection = "north" | "south" | "east" | "west" | "portal";

export interface RegionConnection {
  direction: RegionConnectionDirection;
  targetRegionId: RegionId;
  /** Tile coordinates of the exit in THIS region */
  exitRow: number;
  exitColumn: number;
  /** Tile coordinates of the entry in the TARGET region */
  entryRow: number;
  entryColumn: number;
  /** Phases in which this connection is accessible */
  availablePhases: string[];
  /** Label shown at the portal */
  label: string;
}

export interface RegionNpcSpawn {
  npcId: string;
  defaultRow: number;
  defaultColumn: number;
  /** Hours at which this spawn is active (uses game hour 0-23) */
  activeHours: number[];
}

export interface RegionStoryEvent {
  id: string;
  row: number;
  column: number;
  triggerPhase: string;
  label: string;
  description: string;
}

export interface WorldRegion {
  id: RegionId;
  name: string;
  subtitle: string;
  era: RegionEra;
  /** Phases in which this region is accessible */
  availablePhases: string[];
  /** Atmospheric description shown on entry */
  ambience: string;
  /** Audio zone identifier */
  audioZone: string;
  /** Tile map: 6 rows × 9 columns */
  map: readonly (readonly LegacyWorldTile[])[];
  landmarks: readonly LegacyWorldLandmark[];
  connections: readonly RegionConnection[];
  npcSpawns: readonly RegionNpcSpawn[];
  storyEvents: readonly RegionStoryEvent[];
  /** Default player spawn position in this region */
  defaultSpawn: { row: number; column: number };
  /** CSS gradient for the region overlay */
  atmosphereGradient: string;
}

// ── Region 1: Mensah Compound — Present Day ───────────────────────────────────

const mensahCompoundPresent: WorldRegion = {
  id: "mensah-compound-present",
  name: "Mensah Compound",
  subtitle: "Present Day",
  era: "present-day",
  availablePhases: ["prologue", "chapter1", "chapter2", "kitchen", "reunion", "finale", "world-regen"],
  ambience: "A warm afternoon in the family compound. The smell of groundnut soup drifts from the kitchen. Grandma Ama sits under the breadfruit tree.",
  audioZone: "compound-day",
  atmosphereGradient: "linear-gradient(180deg, #3d2008 0%, #1a0e04 100%)",
  map: [
    ["tree_canopy", "tree_canopy", "grass_01", "grass_02", "grass_01", "tree_canopy", "grass_01", "grass_02", "tree_canopy"],
    ["tree_canopy", "baobab_trunk", "grass_01", "dirt_path", "dirt_path", "grass_02", "grass_01", "tree_canopy", "tree_canopy"],
    ["grass_02", "compound_wall", "thatch_roof", "dirt_path", "dirt_path", "market_stall", "grass_02", "grass_01", "grass_02"],
    ["grass_01", "fence", "red_earth", "dirt_path", "dirt_path", "cocoa_row", "grass_01", "sand", "sand"],
    ["grass_02", "grass_01", "grass_02", "dirt_path", "water", "water", "dirt_path", "sand", "water"],
    ["grass_01", "grass_02", "red_earth", "dirt_path", "dirt_path", "grass_01", "grass_02", "grass_01", "grass_02"],
  ],
  defaultSpawn: { row: 5, column: 3 },
  landmarks: [
    { artifactId: "photo", row: 1, column: 4, label: "Portrait wall", description: "A named ancestor watches over the compound.", icon: "photo" },
    { artifactId: "recipe", row: 2, column: 3, label: "Kitchen hearth", description: "Grandma Ama's recipe lives in the kitchen.", icon: "recipe" },
  ],
  connections: [
    { direction: "east", targetRegionId: "cape-coast-market", exitRow: 3, exitColumn: 8, entryRow: 3, entryColumn: 0, availablePhases: ["chapter1", "chapter2", "chapter3"], label: "Market Road →" },
    { direction: "south", targetRegionId: "cocoa-farm-east", exitRow: 5, exitColumn: 5, entryRow: 0, entryColumn: 4, availablePhases: ["chapter1", "chapter2"], label: "East Grove ↓" },
    { direction: "portal", targetRegionId: "mensah-compound-1890", exitRow: 1, exitColumn: 1, entryRow: 1, entryColumn: 1, availablePhases: ["chapter2", "chapter3", "mystery"], label: "🌀 1890s Flashback" },
    { direction: "portal", targetRegionId: "regenerated-world", exitRow: 0, exitColumn: 4, entryRow: 5, entryColumn: 4, availablePhases: ["world-regen", "finale"], label: "✨ Regenerated World" },
  ],
  npcSpawns: [
    { npcId: "grandma-ama", defaultRow: 1, defaultColumn: 3, activeHours: [8, 9, 10, 11, 14, 15, 16, 17] },
  ],
  storyEvents: [
    { id: "compound-entry-prologue", row: 5, column: 4, triggerPhase: "prologue", label: "First arrival", description: "You arrive at the family compound for the first time this generation." },
  ],
};

// ── Region 2: Mensah Compound — 1890s ─────────────────────────────────────────

const mensahCompound1890: WorldRegion = {
  id: "mensah-compound-1890",
  name: "Mensah Compound",
  subtitle: "1890s · At the Height of Prosperity",
  era: "1890s",
  availablePhases: ["chapter2", "chapter3", "mystery"],
  ambience: "The compound in 1890. The walls are freshly plastered. The trading house is at its peak. You hear Kwame's voice from the warehouse — he is twenty years old and everything is still possible.",
  audioZone: "compound-1890s",
  atmosphereGradient: "linear-gradient(180deg, #4a2a0a 0%, #2a1508 100%)",
  map: [
    ["tree_canopy", "grass_02", "grass_01", "dirt_path", "dirt_path", "grass_01", "tree_canopy", "grass_02", "tree_canopy"],
    ["grass_01", "compound_wall", "compound_wall", "thatch_roof", "dirt_path", "compound_wall", "grass_01", "grass_02", "grass_01"],
    ["grass_02", "red_earth", "red_earth", "dirt_path", "dirt_path", "red_earth", "grass_02", "grass_01", "grass_02"],
    ["grass_01", "fence", "cocoa_row", "dirt_path", "market_stall", "cocoa_row", "grass_01", "grass_02", "grass_01"],
    ["grass_02", "grass_01", "red_earth", "dirt_path", "dirt_path", "grass_02", "water", "water", "sand"],
    ["grass_01", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "grass_01", "grass_02"],
  ],
  defaultSpawn: { row: 5, column: 1 },
  landmarks: [],
  connections: [
    { direction: "east", targetRegionId: "mensah-warehouse", exitRow: 3, exitColumn: 8, entryRow: 3, entryColumn: 0, availablePhases: ["chapter2", "chapter3"], label: "Trading Warehouse →" },
    { direction: "north", targetRegionId: "village-common-baobab", exitRow: 0, exitColumn: 4, entryRow: 5, entryColumn: 4, availablePhases: ["chapter2"], label: "Village Common ↑" },
    { direction: "portal", targetRegionId: "mensah-compound-present", exitRow: 0, exitColumn: 0, entryRow: 1, entryColumn: 1, availablePhases: ["chapter2", "chapter3", "mystery"], label: "← Return to Present" },
  ],
  npcSpawns: [
    { npcId: "kofi-trader", defaultRow: 3, defaultColumn: 4, activeHours: [8, 9, 10, 11, 12, 13, 14] },
    { npcId: "yaw-farmer", defaultRow: 4, defaultColumn: 2, activeHours: [6, 7, 8, 9, 16, 17, 18] },
  ],
  storyEvents: [
    { id: "kwame-youth-scene", row: 2, column: 4, triggerPhase: "chapter2", label: "Young Kwame at work", description: "You see Kwame at 20 — confident, ambitious, still building." },
  ],
};

// ── Region 3: Cape Coast Market ───────────────────────────────────────────────

const capeCoastMarket: WorldRegion = {
  id: "cape-coast-market",
  name: "Cape Coast Market",
  subtitle: "The trading heart of the Gold Coast",
  era: "1890s",
  availablePhases: ["chapter1", "chapter2", "chapter3"],
  ambience: "The Cape Coast market hums with voices bargaining in Fante, Twi, and English. Cocoa sellers, cloth merchants, and spice traders crowd the wide central road. The castle looms in the distance above the sea.",
  audioZone: "market-1890s",
  atmosphereGradient: "linear-gradient(180deg, #2a3a1a 0%, #1a2a10 100%)",
  map: [
    ["grass_02", "market_stall", "dirt_path", "market_stall", "dirt_path", "market_stall", "dirt_path", "market_stall", "grass_01"],
    ["grass_01", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "grass_02"],
    ["market_stall", "dirt_path", "market_stall", "dirt_path", "market_stall", "dirt_path", "market_stall", "dirt_path", "market_stall"],
    ["dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path"],
    ["grass_02", "dirt_path", "grass_01", "dirt_path", "grass_02", "dirt_path", "grass_01", "dirt_path", "grass_02"],
    ["grass_01", "grass_02", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "grass_01", "grass_02"],
  ],
  defaultSpawn: { row: 3, column: 0 },
  landmarks: [
    { artifactId: "certificate", row: 1, column: 4, label: "Mensah Trading Stall", description: "The family's main market presence — the hub of their commercial network.", icon: "certificate" },
  ],
  connections: [
    { direction: "west", targetRegionId: "mensah-compound-present", exitRow: 3, exitColumn: 0, entryRow: 3, entryColumn: 8, availablePhases: ["chapter1", "chapter2", "chapter3"], label: "← Mensah Compound" },
    { direction: "north", targetRegionId: "colonial-office", exitRow: 0, exitColumn: 4, entryRow: 5, entryColumn: 4, availablePhases: ["chapter3", "mystery"], label: "Colonial Office ↑" },
    { direction: "east", targetRegionId: "mensah-warehouse", exitRow: 1, exitColumn: 8, entryRow: 1, entryColumn: 0, availablePhases: ["chapter2", "chapter3"], label: "Warehouse →" },
  ],
  npcSpawns: [
    { npcId: "kofi-trader", defaultRow: 1, defaultColumn: 3, activeHours: [9, 10, 11, 12, 13, 14, 15] },
  ],
  storyEvents: [
    { id: "market-price-negotiation", row: 3, column: 4, triggerPhase: "chapter1", label: "Cocoa price discovery", description: "You overhear colonial agents suppressing the cocoa price." },
  ],
};

// ── Region 4: Cocoa Farm — East Grove ─────────────────────────────────────────

const cocoaFarmEast: WorldRegion = {
  id: "cocoa-farm-east",
  name: "East Grove — Mensah Cocoa Farm",
  subtitle: "The foundation of the family's wealth",
  era: "1890s",
  availablePhases: ["chapter1", "chapter2"],
  ambience: "Rows of cocoa trees, their trunks painted white to mark family ownership. The pods hang heavy and golden. Yaw is already at work — you can hear him at the far end of the grove, singing.",
  audioZone: "farm-morning",
  atmosphereGradient: "linear-gradient(180deg, #1a3a08 0%, #0f2406 100%)",
  map: [
    ["tree_canopy", "cocoa_row", "cocoa_row", "grass_02", "cocoa_row", "cocoa_row", "grass_01", "cocoa_row", "tree_canopy"],
    ["cocoa_row", "red_earth", "cocoa_row", "grass_01", "red_earth", "cocoa_row", "grass_02", "red_earth", "cocoa_row"],
    ["grass_01", "cocoa_row", "red_earth", "dirt_path", "cocoa_row", "red_earth", "dirt_path", "cocoa_row", "grass_02"],
    ["cocoa_row", "red_earth", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "red_earth", "cocoa_row"],
    ["grass_02", "cocoa_row", "red_earth", "dirt_path", "water", "cocoa_row", "red_earth", "cocoa_row", "grass_01"],
    ["grass_01", "grass_02", "grass_01", "dirt_path", "dirt_path", "grass_02", "grass_01", "grass_02", "grass_01"],
  ],
  defaultSpawn: { row: 3, column: 3 },
  landmarks: [],
  connections: [
    { direction: "north", targetRegionId: "mensah-compound-present", exitRow: 0, exitColumn: 4, entryRow: 5, entryColumn: 5, availablePhases: ["chapter1", "chapter2"], label: "↑ Back to Compound" },
    { direction: "east", targetRegionId: "river-fishing", exitRow: 4, exitColumn: 8, entryRow: 4, entryColumn: 0, availablePhases: ["chapter1", "chapter2"], label: "River →" },
  ],
  npcSpawns: [
    { npcId: "yaw-farmer", defaultRow: 1, defaultColumn: 4, activeHours: [6, 7, 8, 9, 10, 11, 16, 17] },
  ],
  storyEvents: [
    { id: "first-harvest-event", row: 3, column: 4, triggerPhase: "chapter1", label: "First harvest", description: "The east grove is ready — Yaw needs your help before sunset." },
  ],
};

// ── Region 5: Mission School ──────────────────────────────────────────────────

const missionSchool: WorldRegion = {
  id: "mission-school",
  name: "Cape Coast Mission School",
  subtitle: "1912 · Where Kwame learned two worlds",
  era: "1910s",
  availablePhases: ["chapter2", "chapter3", "mystery"],
  ambience: "A colonial schoolhouse built of stone and whitewash. The smell of chalk and wood polish. Rows of benches face a blackboard. The school teaches Kwame English, arithmetic, and a version of history that erases his own.",
  audioZone: "school-interior",
  atmosphereGradient: "linear-gradient(180deg, #2a2a1a 0%, #1a1a0a 100%)",
  map: [
    ["compound_wall", "compound_wall", "compound_wall", "thatch_roof", "thatch_roof", "thatch_roof", "compound_wall", "compound_wall", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "fence", "red_earth", "red_earth", "red_earth", "fence", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path"],
  ],
  defaultSpawn: { row: 5, column: 4 },
  landmarks: [
    { artifactId: "certificate", row: 2, column: 4, label: "Kwame's school desk", description: "Where Kwame sat and wrote in two languages.", icon: "certificate" },
  ],
  connections: [
    { direction: "south", targetRegionId: "cape-coast-market", exitRow: 5, exitColumn: 4, entryRow: 0, entryColumn: 4, availablePhases: ["chapter2", "chapter3"], label: "↓ Market" },
    { direction: "east", targetRegionId: "colonial-office", exitRow: 3, exitColumn: 8, entryRow: 3, entryColumn: 0, availablePhases: ["chapter3"], label: "Colonial Office →" },
  ],
  npcSpawns: [],
  storyEvents: [
    { id: "school-records-discovery", row: 2, column: 3, triggerPhase: "mystery", label: "School records", description: "Old school records show who was enrolled alongside Kwame in 1912." },
  ],
};

// ── Region 6: Mensah Warehouse ────────────────────────────────────────────────

const mensahWarehouse: WorldRegion = {
  id: "mensah-warehouse",
  name: "Mensah Trading Warehouse",
  subtitle: "The commercial heart — and the site of the betrayal",
  era: "1890s",
  availablePhases: ["chapter1", "chapter2", "chapter3", "mystery"],
  ambience: "The warehouse smells of cocoa, palm oil, and old timber. Ledgers line the walls. The floor has grooves worn by decades of sack-carrying. Kofi knows every corner of this building.",
  audioZone: "warehouse-interior",
  atmosphereGradient: "linear-gradient(180deg, #2a1a08 0%, #150d04 100%)",
  map: [
    ["compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall"],
    ["compound_wall", "red_earth", "fence", "red_earth", "red_earth", "red_earth", "fence", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["dirt_path", "red_earth", "red_earth", "red_earth", "market_stall", "red_earth", "red_earth", "red_earth", "dirt_path"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "compound_wall"],
  ],
  defaultSpawn: { row: 5, column: 4 },
  landmarks: [
    { artifactId: "medal", row: 3, column: 4, label: "Trading ledger shelf", description: "Where Kwame kept the family records — and where a name was later circled.", icon: "medal" },
  ],
  connections: [
    { direction: "west", targetRegionId: "cape-coast-market", exitRow: 3, exitColumn: 0, entryRow: 1, entryColumn: 8, availablePhases: ["chapter1", "chapter2", "chapter3"], label: "← Market" },
    { direction: "south", targetRegionId: "mensah-compound-1890", exitRow: 5, exitColumn: 4, entryRow: 0, entryColumn: 4, availablePhases: ["chapter2", "chapter3"], label: "↓ Family Compound" },
  ],
  npcSpawns: [
    { npcId: "kofi-trader", defaultRow: 2, defaultColumn: 4, activeHours: [8, 9, 10, 11, 12, 13, 14, 15] },
  ],
  storyEvents: [
    { id: "betrayal-site", row: 3, column: 4, triggerPhase: "mystery", label: "The betrayal", description: "This is where it happened. The ledger shows the date: October 1912." },
  ],
};

// ── Region 7: Village Common — Baobab Tree ────────────────────────────────────

const villageCommonBaobab: WorldRegion = {
  id: "village-common-baobab",
  name: "Village Common",
  subtitle: "The baobab that remembers everything",
  era: "1890s",
  availablePhases: ["chapter1", "chapter2", "chapter3", "mystery", "world-regen"],
  ambience: "The village common centers on a baobab that is older than any person's memory. Elder Nana says it was here when the first Mensah ancestor arrived. The shade beneath it is a meeting place, a court, a memory palace.",
  audioZone: "village-common",
  atmosphereGradient: "linear-gradient(180deg, #1a2a08 0%, #0e1a04 100%)",
  map: [
    ["tree_canopy", "grass_02", "grass_01", "grass_02", "grass_01", "grass_02", "grass_01", "grass_02", "tree_canopy"],
    ["grass_01", "grass_02", "dirt_path", "dirt_path", "grass_01", "dirt_path", "dirt_path", "grass_01", "grass_02"],
    ["grass_02", "dirt_path", "grass_01", "grass_02", "baobab_trunk", "grass_01", "grass_02", "dirt_path", "grass_01"],
    ["grass_01", "dirt_path", "grass_02", "grass_01", "grass_02", "grass_01", "grass_01", "dirt_path", "grass_02"],
    ["grass_02", "grass_01", "dirt_path", "dirt_path", "grass_01", "dirt_path", "dirt_path", "grass_02", "grass_01"],
    ["grass_01", "grass_02", "grass_01", "grass_02", "dirt_path", "grass_01", "grass_02", "grass_01", "grass_02"],
  ],
  defaultSpawn: { row: 5, column: 4 },
  landmarks: [],
  connections: [
    { direction: "south", targetRegionId: "mensah-compound-1890", exitRow: 5, exitColumn: 4, entryRow: 0, entryColumn: 4, availablePhases: ["chapter2", "chapter3"], label: "↓ Mensah Compound" },
    { direction: "east", targetRegionId: "elder-nana-compound", exitRow: 2, exitColumn: 8, entryRow: 2, entryColumn: 0, availablePhases: ["chapter2", "chapter3"], label: "Elder Nana →" },
  ],
  npcSpawns: [
    { npcId: "elder-nana", defaultRow: 2, defaultColumn: 5, activeHours: [7, 8, 9, 10, 11, 16, 17, 18, 19] },
  ],
  storyEvents: [
    { id: "baobab-council", row: 2, column: 4, triggerPhase: "chapter2", label: "Village council", description: "The elders are gathering. Something has happened at the trading house." },
  ],
};

// ── Region 8: River — Fishing Area ────────────────────────────────────────────

const riverFishing: WorldRegion = {
  id: "river-fishing",
  name: "The Volta River Bend",
  subtitle: "Where Kwame came to think",
  era: "1890s",
  availablePhases: ["chapter1", "chapter2"],
  ambience: "The river is slow here, wide and brown with delta silt. A fishing platform juts out over the water. Kwame came here alone when the business troubled him. The water holds no memory of who is watching.",
  audioZone: "river-ambient",
  atmosphereGradient: "linear-gradient(180deg, #08201a 0%, #041410 100%)",
  map: [
    ["grass_01", "grass_02", "grass_01", "grass_02", "grass_01", "grass_02", "grass_01", "grass_02", "grass_01"],
    ["grass_02", "grass_01", "grass_02", "dirt_path", "dirt_path", "dirt_path", "grass_02", "grass_01", "grass_02"],
    ["grass_01", "grass_02", "sand", "sand", "dirt_path", "sand", "sand", "grass_01", "grass_02"],
    ["water", "water", "water", "sand", "dirt_path", "sand", "water", "water", "water"],
    ["water", "water", "water", "water", "water", "water", "water", "water", "water"],
    ["water", "water", "water", "water", "water", "water", "water", "water", "water"],
  ],
  defaultSpawn: { row: 2, column: 4 },
  landmarks: [],
  connections: [
    { direction: "west", targetRegionId: "cocoa-farm-east", exitRow: 4, exitColumn: 0, entryRow: 4, entryColumn: 8, availablePhases: ["chapter1", "chapter2"], label: "← East Grove" },
  ],
  npcSpawns: [],
  storyEvents: [
    { id: "river-reflection", row: 3, column: 4, triggerPhase: "chapter1", label: "River reflection", description: "Standing at the water's edge, you find an old receipt wedged in the dock planks." },
  ],
};

// ── Region 9: Elder Nana's Compound ───────────────────────────────────────────

const elderNanaCompound: WorldRegion = {
  id: "elder-nana-compound",
  name: "Elder Nana's Compound",
  subtitle: "Where the oldest stories are kept",
  era: "1890s",
  availablePhases: ["chapter2", "chapter3", "mystery", "world-regen"],
  ambience: "Elder Nana's compound is quieter than the others. The walls are hung with things that look like ordinary objects — a walking stick, a dried flower, a strip of kente cloth. Each one is a story that has been told a hundred times and must not be forgotten.",
  audioZone: "elder-compound",
  atmosphereGradient: "linear-gradient(180deg, #1a1408 0%, #100c04 100%)",
  map: [
    ["tree_canopy", "tree_canopy", "grass_01", "grass_02", "grass_01", "grass_02", "grass_01", "tree_canopy", "tree_canopy"],
    ["grass_01", "compound_wall", "compound_wall", "thatch_roof", "compound_wall", "thatch_roof", "compound_wall", "compound_wall", "grass_02"],
    ["dirt_path", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["grass_01", "red_earth", "fence", "red_earth", "red_earth", "red_earth", "fence", "red_earth", "compound_wall"],
    ["grass_02", "compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall", "grass_01"],
    ["grass_01", "grass_02", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "grass_01", "grass_02", "grass_01"],
  ],
  defaultSpawn: { row: 5, column: 4 },
  landmarks: [],
  connections: [
    { direction: "west", targetRegionId: "village-common-baobab", exitRow: 2, exitColumn: 0, entryRow: 2, entryColumn: 8, availablePhases: ["chapter2", "chapter3"], label: "← Village Common" },
  ],
  npcSpawns: [
    { npcId: "elder-nana", defaultRow: 3, defaultColumn: 4, activeHours: [7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20] },
  ],
  storyEvents: [
    { id: "oral-history-session", row: 3, column: 4, triggerPhase: "chapter3", label: "The full story", description: "Elder Nana is ready to tell you what he has never told anyone in your generation." },
  ],
};

// ── Region 10: Colonial Administrative Office ──────────────────────────────────

const colonialOffice: WorldRegion = {
  id: "colonial-office",
  name: "Cape Coast Castle — Administrative Wing",
  subtitle: "1912 · Where colonial power made decisions",
  era: "1910s",
  availablePhases: ["chapter3", "mystery"],
  ambience: "The smell of ink and imported furniture. Documents in triplicate. The land registry is here — and somewhere in it, proof that the Mensah compound was improperly surveyed in 1913.",
  audioZone: "colonial-office",
  atmosphereGradient: "linear-gradient(180deg, #20201a 0%, #14140e 100%)",
  map: [
    ["compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "fence", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "fence", "red_earth", "red_earth", "red_earth", "fence", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "market_stall", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "red_earth", "compound_wall"],
    ["dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path"],
  ],
  defaultSpawn: { row: 5, column: 4 },
  landmarks: [
    { artifactId: "certificate", row: 3, column: 4, label: "Land registry desk", description: "The colonial record that improperly reassigned Mensah family land in 1913.", icon: "certificate" },
  ],
  connections: [
    { direction: "south", targetRegionId: "cape-coast-market", exitRow: 5, exitColumn: 4, entryRow: 0, entryColumn: 4, availablePhases: ["chapter3"], label: "↓ Market" },
    { direction: "west", targetRegionId: "mission-school", exitRow: 3, exitColumn: 0, entryRow: 3, entryColumn: 8, availablePhases: ["chapter3"], label: "← Mission School" },
  ],
  npcSpawns: [],
  storyEvents: [
    { id: "land-registry-discovery", row: 3, column: 4, triggerPhase: "mystery", label: "The land record", description: "You find the 1913 survey that moved the Mensah boundary — and the signature at the bottom is familiar." },
  ],
};

// ── Region 11: Diaspora Town ──────────────────────────────────────────────────

const diasporaTown: WorldRegion = {
  id: "diaspora-town",
  name: "The Diaspora Settlement",
  subtitle: "1940s · Where the family branch was almost lost",
  era: "diaspora",
  availablePhases: ["chapter5", "chapter6", "reunion"],
  ambience: "A street in post-war England. Rows of terraced houses. The smells of familiar spices mixed with unfamiliar cold. The Mensah cousins who migrated here kept the family name alive — but the stories got thinner with each generation.",
  audioZone: "diaspora-1940s",
  atmosphereGradient: "linear-gradient(180deg, #1a1a2a 0%, #0e0e18 100%)",
  map: [
    ["compound_wall", "compound_wall", "dirt_path", "compound_wall", "compound_wall", "dirt_path", "compound_wall", "compound_wall", "compound_wall"],
    ["compound_wall", "red_earth", "dirt_path", "red_earth", "compound_wall", "dirt_path", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "red_earth", "dirt_path", "red_earth", "dirt_path", "dirt_path", "red_earth", "red_earth", "compound_wall"],
    ["dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path", "dirt_path"],
    ["compound_wall", "red_earth", "dirt_path", "red_earth", "compound_wall", "dirt_path", "red_earth", "red_earth", "compound_wall"],
    ["compound_wall", "compound_wall", "dirt_path", "compound_wall", "compound_wall", "dirt_path", "compound_wall", "compound_wall", "compound_wall"],
  ],
  defaultSpawn: { row: 3, column: 4 },
  landmarks: [
    { artifactId: "photo", row: 1, column: 3, label: "Family photograph", description: "The 1950 photograph that proves the diaspora branch kept the Mensah name.", icon: "photo" },
  ],
  connections: [
    { direction: "portal", targetRegionId: "mensah-compound-present", exitRow: 3, exitColumn: 8, entryRow: 3, entryColumn: 0, availablePhases: ["reunion"], label: "✈️ Return Home" },
  ],
  npcSpawns: [],
  storyEvents: [
    { id: "diaspora-story-found", row: 3, column: 4, triggerPhase: "chapter5", label: "The diaspora branch", description: "Letters confirm that two Mensah children emigrated in 1942 and kept the family name alive in England." },
  ],
};

// ── Region 12: Regenerated World ──────────────────────────────────────────────

const regeneratedWorld: WorldRegion = {
  id: "regenerated-world",
  name: "The Living Compound",
  subtitle: "The present — restored and growing",
  era: "regenerated",
  availablePhases: ["world-regen", "finale"],
  ambience: "The same compound — but fuller. The walls are repainted. The trading house has a new sign. The baobab in the corner is taller. Every artifact you preserved has changed something here. The world is not what it was. It is what you helped it become.",
  audioZone: "regenerated-celebration",
  atmosphereGradient: "linear-gradient(180deg, #1a3008 0%, #0e1e04 100%)",
  map: [
    ["tree_canopy", "grass_01", "grass_02", "grass_01", "tree_canopy", "grass_01", "grass_02", "tree_canopy", "tree_canopy"],
    ["grass_02", "baobab_trunk", "dirt_path", "dirt_path", "grass_01", "dirt_path", "grass_02", "grass_01", "tree_canopy"],
    ["grass_01", "compound_wall", "thatch_roof", "dirt_path", "market_stall", "dirt_path", "grass_01", "grass_02", "grass_01"],
    ["grass_02", "fence", "red_earth", "dirt_path", "dirt_path", "cocoa_row", "dirt_path", "sand", "sand"],
    ["grass_01", "grass_02", "water", "water", "dirt_path", "grass_01", "dirt_path", "sand", "water"],
    ["grass_02", "grass_01", "red_earth", "dirt_path", "dirt_path", "grass_02", "grass_01", "grass_02", "grass_01"],
  ],
  defaultSpawn: { row: 5, column: 3 },
  landmarks: [
    { artifactId: "photo", row: 1, column: 5, label: "Portrait wall", description: "All named ancestors now visible.", icon: "photo" },
    { artifactId: "recipe", row: 2, column: 4, label: "Kitchen hearth", description: "The recipe is cooked again every week.", icon: "recipe" },
    { artifactId: "medal", row: 3, column: 3, label: "Service marker", description: "The soldier's return is now honored.", icon: "medal" },
    { artifactId: "certificate", row: 4, column: 4, label: "Migration route", description: "The family path is mapped and walkable.", icon: "certificate" },
  ],
  connections: [
    { direction: "portal", targetRegionId: "mensah-compound-present", exitRow: 0, exitColumn: 4, entryRow: 5, entryColumn: 4, availablePhases: ["world-regen", "finale"], label: "← Original Compound" },
  ],
  npcSpawns: [
    { npcId: "grandma-ama", defaultRow: 1, defaultColumn: 4, activeHours: [8, 9, 10, 11, 12, 14, 15, 16, 17] },
    { npcId: "elder-nana", defaultRow: 2, defaultColumn: 6, activeHours: [9, 10, 11, 16, 17] },
    { npcId: "kofi-trader", defaultRow: 3, defaultColumn: 5, activeHours: [9, 10, 11, 12, 13, 14] },
    { npcId: "yaw-farmer", defaultRow: 4, defaultColumn: 5, activeHours: [6, 7, 8, 16, 17, 18] },
  ],
  storyEvents: [
    { id: "world-regenerated", row: 5, column: 4, triggerPhase: "world-regen", label: "The world is different", description: "Every preserved memory changed something in the world you walk through now." },
  ],
};

// ── World Region Registry ─────────────────────────────────────────────────────

export const WORLD_REGION_REGISTRY: Record<RegionId, WorldRegion> = {
  "mensah-compound-present": mensahCompoundPresent,
  "mensah-compound-1890":    mensahCompound1890,
  "cape-coast-market":       capeCoastMarket,
  "cocoa-farm-east":         cocoaFarmEast,
  "mission-school":          missionSchool,
  "mensah-warehouse":        mensahWarehouse,
  "village-common-baobab":   villageCommonBaobab,
  "river-fishing":           riverFishing,
  "elder-nana-compound":     elderNanaCompound,
  "colonial-office":         colonialOffice,
  "diaspora-town":           diasporaTown,
  "regenerated-world":       regeneratedWorld,
};

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns the regions accessible in the current phase.
 */
export function getAccessibleRegions(phase: string): WorldRegion[] {
  return Object.values(WORLD_REGION_REGISTRY).filter(r =>
    r.availablePhases.includes(phase),
  );
}

/**
 * Returns the connections available from a region in the current phase.
 */
export function getAvailableConnections(
  regionId: RegionId,
  phase: string,
): RegionConnection[] {
  const region = WORLD_REGION_REGISTRY[regionId];
  if (!region) return [];
  return region.connections.filter(c => c.availablePhases.includes(phase));
}

/**
 * Returns the world region layout for a given regionId.
 * Falls back to the mensah-compound-present if the region doesn't exist.
 */
export function getWorldRegion(regionId: RegionId): WorldRegion {
  return WORLD_REGION_REGISTRY[regionId] ?? mensahCompoundPresent;
}

/**
 * Returns the default starting region for a given phase.
 */
export function getStartingRegion(phase: string): RegionId {
  const regionMap: Record<string, RegionId> = {
    prologue:       "mensah-compound-present",
    chapter1:       "mensah-compound-present",
    chapter2:       "mensah-compound-1890",
    chapter3:       "cape-coast-market",
    chapter4:       "mensah-warehouse",
    chapter5:       "diaspora-town",
    chapter6:       "elder-nana-compound",
    mystery:        "mensah-warehouse",
    "world-regen":  "regenerated-world",
    "coop-quest":   "mensah-compound-present",
    reunion:        "mensah-compound-present",
    finale:         "regenerated-world",
    kitchen:        "mensah-compound-present",
    business:       "mensah-warehouse",
  };
  return regionMap[phase] ?? "mensah-compound-present";
}
