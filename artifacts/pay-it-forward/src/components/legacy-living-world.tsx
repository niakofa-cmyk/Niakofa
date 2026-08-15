import { useEffect, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  Camera,
  Compass,
  Gamepad2,
  Landmark,
  MapPin,
  Medal,
  ScrollText,
  Ship,
  Sparkles,
  Sprout,
  TreePine,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";
import type {
  DemoFacing,
  DemoMapPosition,
  DemoPhase,
  DemoSeason,
} from "@/lib/legacy-demo-state";
import {
  getLegacyWorldLayout,
  getLegacyWorldLandmarkAt,
  getLegacyWorldSpawn,
  isLegacyWorldPositionWalkable,
  type LegacyWorldLandmarkIcon,
  type LegacyWorldTile,
} from "@/lib/legacy-world-layout";
import {
  WORLD_REGION_REGISTRY,
  getAvailableConnections,
  getWorldRegion,
  type RegionId,
} from "@/lib/legacy-world-regions";
import { LegacyFishingEncounter } from "@/components/legacy-fishing-encounter";
import type { FishingJournal } from "@/lib/legacy-demo-state";
import { LegacyVillageAtmosphere } from "@/components/legacy-village-atmosphere";
import { getPhaseNpcs } from "@/lib/legacy-npc-system";

type WorldScene = {
  title: string;
  era: string;
  description: string;
  accent: string;
  icon: typeof TreePine;
  locations: string[];
  character: {
    ageGroup: "adult" | "kid";
    gender: "male" | "female" | "unspecified";
    characterId: string;
    lifeStage: "youth" | "adult" | "mature" | "elder";
    era: string;
  };
};

const WORLD_SCENES: Record<DemoPhase, WorldScene> = {
  prologue: {
    title: "Grandma's Sunday House",
    era: "Present day · first memory",
    description: "A warm house holds the question that opens the family world.",
    accent: "#f5c842",
    icon: Landmark,
    locations: ["Dining room", "Portrait wall", "Family table"],
    character: { ageGroup: "kid", gender: "unspecified", characterId: "kwame-mensah", lifeStage: "youth", era: "1890s" },
  },
  chapter1: {
    title: "The Mensah Family Compound",
    era: "1890 · cocoa country",
    description: "Dirt paths connect the cocoa rows, family homes, and the road to market.",
    accent: "#d88f39",
    icon: Sprout,
    locations: ["Cocoa farm", "Family compound", "Village path"],
    character: { ageGroup: "kid", gender: "unspecified", characterId: "kwame-mensah", lifeStage: "youth", era: "1890s" },
  },
  chapter2: {
    title: "The Market Road",
    era: "1901–1911 · golden years",
    description: "The same compound grows into a trading network carried by many hands.",
    accent: "#f5c842",
    icon: Building2,
    locations: ["Warehouse", "Village market", "Mission school"],
    character: { ageGroup: "adult", gender: "male", characterId: "kwame-mensah", lifeStage: "adult", era: "1900s" },
  },
  kitchen: {
    title: "Grandma Ama's Kitchen",
    era: "1905 · harvest season",
    description: "Recipes become playable memories, and the kitchen becomes an archive.",
    accent: "#f09a4b",
    icon: Sprout,
    locations: ["Cooking fire", "Recipe shelf", "Sunday table"],
    character: { ageGroup: "adult", gender: "female", characterId: "ama-mensah", lifeStage: "adult", era: "1900s" },
  },
  chapter3: {
    title: "The Village Under Pressure",
    era: "1912–1920 · betrayal",
    description: "Ledgers go missing while the familiar road begins to feel uncertain.",
    accent: "#8da8c7",
    icon: MapPin,
    locations: ["Elders' gathering", "Trading house", "Church registry"],
    character: { ageGroup: "adult", gender: "male", characterId: "kwame-mensah", lifeStage: "mature", era: "1910s" },
  },
  business: {
    title: "House of Mensah Trading Co.",
    era: "1918 · ports and markets",
    description: "A family business carries the name from the village toward the coast.",
    accent: "#7ca7d9",
    icon: Ship,
    locations: ["Factory", "Port road", "Shipping ledger"],
    character: { ageGroup: "adult", gender: "male", characterId: "kwame-mensah", lifeStage: "mature", era: "1910s" },
  },
  chapter4: {
    title: "The Road After Collapse",
    era: "1920–1930 · what remains",
    description: "The map contracts, buildings empty, and memory becomes a form of care.",
    accent: "#9e8494",
    icon: Landmark,
    locations: ["Damaged shop", "Overgrown path", "Quiet compound"],
    character: { ageGroup: "adult", gender: "male", characterId: "kwame-mensah", lifeStage: "mature", era: "1920s" },
  },
  chapter5: {
    title: "Across the Ocean",
    era: "1930–1950 · migration",
    description: "A port and a train station connect the old home to a new branch.",
    accent: "#82c5d8",
    icon: Waves,
    locations: ["Cape Coast port", "Train station", "New neighborhood"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "1940s" },
  },
  mystery: {
    title: "The Archive of Missing Things",
    era: "1923 · clues remain",
    description: "A torn ledger and an unlabeled face turn the shared world into an investigation.",
    accent: "#b39bdd",
    icon: Sparkles,
    locations: ["Ledger room", "Portrait cabinet", "Registry"],
    character: { ageGroup: "adult", gender: "male", characterId: "kwame-mensah", lifeStage: "mature", era: "1920s" },
  },
  chapter6: {
    title: "The Family Vault",
    era: "Present day · discovery",
    description: "Afia opens the vault and finds the pieces needed to rebuild the world.",
    accent: "#f5c842",
    icon: TreePine,
    locations: ["Family Vault", "Grandma's house", "Baobab roots"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "present" },
  },
  "world-regen": {
    title: "The Living World",
    era: "Present day · regeneration",
    description: "Every preserved contribution gives the family world another place to stand.",
    accent: "#f5c842",
    icon: TreePine,
    locations: ["New ancestor", "Migration route", "Chapter seed"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "present" },
  },
  "coop-quest": {
    title: "The Lost Ledger",
    era: "Family quest · together",
    description: "The regenerated world gives every family member a role in restoring the record.",
    accent: "#f29b9b",
    icon: Sparkles,
    locations: ["Old photograph", "Elder interview", "Ancestral place"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "present" },
  },
  reunion: {
    title: "The Sunday Dinner Table",
    era: "Present day · reunion",
    description: "The family returns to the same house with more names, memories, and stories.",
    accent: "#75d5a8",
    icon: Landmark,
    locations: ["Family table", "Oral history", "New branch"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "present" },
  },
  finale: {
    title: "The Baobab Remembers",
    era: "Every generation · continuing",
    description: "The world is not finished. It grows again with the next contribution.",
    accent: "#f5c842",
    icon: TreePine,
    locations: ["Roots", "Living branches", "Future stories"],
    character: { ageGroup: "adult", gender: "female", characterId: "afia-mensah", lifeStage: "adult", era: "present" },
  },
};

const SEASON_OVERLAYS: Record<DemoSeason, string> = {
  dry: "radial-gradient(circle at 72% 18%, rgba(245,200,66,0.28), transparent 30%)",
  rain: "linear-gradient(145deg, rgba(53,89,125,0.34), transparent 60%)",
  harvest: "radial-gradient(circle at 72% 18%, rgba(244,151,70,0.26), transparent 30%)",
  celebration: "radial-gradient(circle at 72% 18%, rgba(255,159,67,0.32), transparent 34%)",
};

const TILE_ROOT = "/legacy-world-assets/tiles";
type TileName = LegacyWorldTile;
type PlayerPosition = { row: number; column: number };

const WORLD_LANDMARK_ICONS: Record<LegacyWorldLandmarkIcon, typeof Camera> = {
  photo: Camera,
  recipe: UtensilsCrossed,
  medal: Medal,
  certificate: ScrollText,
};

const TILE_LABELS: Record<TileName, string> = {
  grass_01: "grass",
  grass_02: "grass",
  dirt_path: "dirt path",
  red_earth: "red earth",
  water: "water",
  sand: "sand",
  compound_wall: "compound wall",
  thatch_roof: "family compound",
  tree_canopy: "tree canopy",
  baobab_trunk: "living baobab",
  market_stall: "market stall",
  fence: "fence",
  cocoa_row: "cocoa row",
};

const WORLD_MEMORY_ECHOES = [
  {
    artifactId: "photo",
    title: "Portrait echo",
    subtitle: "A name has found a place in the world.",
    description: "The preserved photograph now appears as a quiet story prompt beside the market road.",
    row: 0,
    column: 3,
    character: {
      ageGroup: "adult" as const,
      gender: "unspecified" as const,
      characterId: "memory-echo-photo",
      lifeStage: "mature" as const,
      era: "1900s",
    },
  },
  {
    artifactId: "recipe",
    title: "Kitchen echo",
    subtitle: "A recipe carries a voice forward.",
    description: "The recovered recipe opens a remembered conversation, even after the kitchen has gone quiet.",
    row: 2,
    column: 6,
    character: {
      ageGroup: "adult" as const,
      gender: "unspecified" as const,
      characterId: "memory-echo-recipe",
      lifeStage: "adult" as const,
      era: "1900s",
    },
  },
  {
    artifactId: "medal",
    title: "Return echo",
    subtitle: "A chapter seed marks the road home.",
    description: "The medal becomes a playable reminder that returning home is part of the family story.",
    row: 5,
    column: 2,
    character: {
      ageGroup: "adult" as const,
      gender: "unspecified" as const,
      characterId: "memory-echo-medal",
      lifeStage: "mature" as const,
      era: "1910s",
    },
  },
  {
    artifactId: "certificate",
    title: "Route echo",
    subtitle: "A family route now crosses the map.",
    description: "The certificate adds a visible route prompt without guessing who travelled or why.",
    row: 4,
    column: 7,
    character: {
      ageGroup: "adult" as const,
      gender: "unspecified" as const,
      characterId: "memory-echo-certificate",
      lifeStage: "adult" as const,
      era: "present",
    },
  },
] as const;

// ── RegionMap — renders a WorldRegion's tile grid with portal overlays ────────

function RegionMap({
  regionId,
  phase,
  mapPosition,
  mapFacing,
  onMapMove,
  onRegionChange,
  character,
  worldVersion,
}: {
  regionId: RegionId;
  phase: DemoPhase;
  mapPosition: DemoMapPosition;
  mapFacing: DemoFacing;
  onMapMove: (position: DemoMapPosition, facing: DemoFacing) => void;
  onRegionChange?: (regionId: RegionId) => void;
  character: WorldScene["character"];
  worldVersion: number;
}) {
  const region = getWorldRegion(regionId);
  const portals = getAvailableConnections(regionId, phase);
  const [motion, setMotion] = useState<"idle" | "walk">("idle");

  // Clamp player to valid region bounds
  const player: PlayerPosition =
    mapPosition.row >= 0 && mapPosition.row < 6 &&
    mapPosition.column >= 0 && mapPosition.column < 9
      ? mapPosition
      : region.defaultSpawn;

  useEffect(() => {
    if (motion === "idle") return;
    const timeout = window.setTimeout(() => setMotion("idle"), 180);
    return () => window.clearTimeout(timeout);
  }, [motion]);

  const move = (rowDelta: number, columnDelta: number, facing: DemoFacing) => {
    const row = player.row + rowDelta;
    const column = player.column + columnDelta;
    // Check portal exits first
    const portal = portals.find(p => p.exitRow === row && p.exitColumn === column);
    if (portal && onRegionChange) {
      onRegionChange(portal.targetRegionId);
      onMapMove({ row: portal.entryRow, column: portal.entryColumn }, facing);
      return;
    }
    const nextTile = region.map[row]?.[column];
    if (!nextTile) { onMapMove(player, facing); return; }
    onMapMove({ row, column }, facing);
    setMotion("walk");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    const movement: Record<string, [number, number, DemoFacing]> = {
      arrowup: [-1, 0, "up"], w: [-1, 0, "up"],
      arrowdown: [1, 0, "down"], s: [1, 0, "down"],
      arrowleft: [0, -1, "left"], a: [0, -1, "left"],
      arrowright: [0, 1, "right"], d: [0, 1, "right"],
    };
    const direction = movement[key];
    if (!direction) return;
    event.preventDefault();
    move(direction[0], direction[1], direction[2]);
  };

  return (
    <div className="relative z-[1] mt-4 rounded-2xl border border-amber-300/20 bg-[#120904]/80 p-3 shadow-inner shadow-black/30">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Compass className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">
              {region.name} · {region.era}
            </p>
            <p className="truncate text-[9px] text-amber-100/60">{region.subtitle}</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold text-amber-100/55">
          <Gamepad2 className="h-3 w-3" /> explore
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={(event) => event.currentTarget.focus()}
          className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-amber-400/20 bg-[#201207] outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          aria-label={`${region.name} map. Use arrow keys or W A S D to move.`}
          style={{ background: region.atmosphereGradient }}
        >
          {/* Tile grid */}
          <div className="absolute inset-0 grid grid-cols-9 grid-rows-6">
            {region.map.flatMap((row, rowIndex) =>
              row.map((tileName, columnIndex) => (
                <img
                  key={`${rowIndex}-${columnIndex}`}
                  src={`${TILE_ROOT}/${tileName}.png`}
                  alt=""
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
              )),
            )}
          </div>

          {/* Portal exits */}
          {portals.map((portal) => (
            <button
              key={`${portal.direction}-${portal.targetRegionId}`}
              type="button"
              onClick={() => { onRegionChange?.(portal.targetRegionId); onMapMove({ row: portal.entryRow, column: portal.entryColumn }, portal.direction === "north" ? "up" : portal.direction === "south" ? "down" : portal.direction === "west" ? "left" : "right"); }}
              aria-label={`Portal: ${portal.label}`}
              title={portal.label}
              className="absolute z-[6] flex items-center justify-center rounded-lg border border-violet-400/70 bg-violet-950/60 shadow-[0_0_12px_rgba(139,92,246,0.75)] hover:bg-violet-900/80 transition-all text-[8px] font-black text-violet-200 uppercase tracking-wide"
              style={{
                width: `${100 / 9}%`,
                height: `${100 / 6}%`,
                left: `${(portal.exitColumn * 100) / 9}%`,
                top: `${(portal.exitRow * 100) / 6}%`,
              }}
            >
              <span className="rotate-90 select-none" aria-hidden="true">⬡</span>
            </button>
          ))}

          {/* Story event markers */}
          {region.storyEvents.map((event) => (
            <div
              key={event.id}
              role="img"
              aria-label={`${event.label}: ${event.description}`}
              title={`${event.label} — ${event.description}`}
              className="pointer-events-none absolute z-[4] flex items-center justify-center rounded-full border border-amber-400/70 bg-amber-950/60 shadow-[0_0_8px_rgba(245,200,66,0.55)]"
              style={{
                width: `${100 / 9}%`,
                height: `${100 / 6}%`,
                left: `${(event.column * 100) / 9}%`,
                top: `${(event.row * 100) / 6}%`,
              }}
            >
              <Sparkles className="h-3 w-3 text-amber-300" />
            </div>
          ))}

          {/* Player */}
          <div
            className="absolute z-10 flex items-end justify-center transition-[left,top] duration-150 ease-out"
            style={{
              width: `${100 / 9}%`,
              height: `${100 / 6}%`,
              left: `${(player.column * 100) / 9}%`,
              top: `${(player.row * 100) / 6}%`,
            }}
            aria-hidden="true"
          >
            <LegacyCharacterSprite
              {...character}
              appearanceSeed={`region-player-${worldVersion}`}
              libraryId="niakofa-original-art-demo-v1"
              size={32}
              facing={mapFacing}
              motion={motion}
              className="mb-0.5 border-amber-200/70 bg-amber-950/30 shadow-[0_0_12px_rgba(245,200,66,0.7)]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
        </div>

        <div className="flex items-center justify-center gap-1" aria-label="Map movement controls">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <button type="button" onClick={() => move(-1, 0, "up")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move north"><ArrowUp className="h-3.5 w-3.5" /></button>
            <span />
            <button type="button" onClick={() => move(0, -1, "left")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move west"><ArrowLeft className="h-3.5 w-3.5" /></button>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-[9px] font-black text-amber-300">MOVE</span>
            <button type="button" onClick={() => move(0, 1, "right")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move east"><ArrowRight className="h-3.5 w-3.5" /></button>
            <span />
            <button type="button" onClick={() => move(1, 0, "down")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move south"><ArrowDown className="h-3.5 w-3.5" /></button>
            <span />
          </div>
        </div>
      </div>

      {portals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {portals.map((portal) => (
            <button
              key={portal.targetRegionId}
              type="button"
              onClick={() => {
                onRegionChange?.(portal.targetRegionId);
                onMapMove({ row: portal.entryRow, column: portal.entryColumn }, "down");
              }}
              className="rounded-lg border border-violet-500/35 bg-violet-950/25 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-violet-300 hover:bg-violet-900/30 transition-all"
            >
              {portal.label} →
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-[9px] text-amber-100/50">
        Arrow keys / W A S D · {portals.length > 0 ? "⬡ portal exits shown in violet" : "no portal exits in this phase"}
      </p>
      {region.ambience && (
        <p className="mt-1 text-center text-[9px] italic text-amber-100/35">{region.ambience.slice(0, 120)}{region.ambience.length > 120 ? "…" : ""}</p>
      )}
    </div>
  );
}

// ── HouseOfMensahMap ──────────────────────────────────────────────────────────

function HouseOfMensahMap({
  character,
  worldVersion,
  placedArtifacts,
  discoveredLandmarks,
  mapPosition,
  mapFacing,
  onMapMove,
  onLandmarkInspect,
  phase,
  gameHour = 8,
  onNpcInteract,
}: {
  character: WorldScene["character"];
  worldVersion: number;
  placedArtifacts: string[];
  discoveredLandmarks: string[];
  mapPosition: DemoMapPosition;
  mapFacing: DemoFacing;
  onMapMove: (position: DemoMapPosition, facing: DemoFacing) => void;
  onLandmarkInspect: (artifactId: string) => void;
  phase: DemoPhase;
  gameHour?: number;
  onNpcInteract?: (npcId: string) => void;
}) {
  const layout = getLegacyWorldLayout(worldVersion, placedArtifacts);
  const worldMap = layout.map;
  const [motion, setMotion] = useState<"idle" | "walk">("idle");
  const [actionState, setActionState] = useState<"idle" | "interacting">("idle");
  const player: PlayerPosition = !isLegacyWorldPositionWalkable(layout, mapPosition)
    ? getLegacyWorldSpawn(worldVersion, placedArtifacts)
    : mapPosition;
  const tile = worldMap[player.row][player.column];
  const placed = new Set(placedArtifacts);
  const discovered = new Set(discoveredLandmarks);
  const visibleLandmarks = layout.landmarks.filter(({ artifactId }) => placed.has(artifactId));
  const visibleEchoes = worldVersion > 1
    ? WORLD_MEMORY_ECHOES.filter(({ artifactId }) => placed.has(artifactId))
    : [];
  const activeLandmark = getLegacyWorldLandmarkAt(layout, player);
  const [selectedEchoId, setSelectedEchoId] = useState<string | null>(null);
  const phaseNpcs = getPhaseNpcs(phase, gameHour);
  const selectedEcho = visibleEchoes.find(({ artifactId }) => artifactId === selectedEchoId);

  useEffect(() => {
    if (motion === "idle") return;
    const timeout = window.setTimeout(() => setMotion("idle"), 180);
    return () => window.clearTimeout(timeout);
  }, [motion]);

  useEffect(() => {
    if (actionState === "idle") return;
    const timeout = window.setTimeout(() => setActionState("idle"), 700);
    return () => window.clearTimeout(timeout);
  }, [actionState]);

  const move = (rowDelta: number, columnDelta: number, facing: DemoFacing) => {
    const row = player.row + rowDelta;
    const column = player.column + columnDelta;
    const nextTile = worldMap[row]?.[column];
    if (!nextTile || !isLegacyWorldPositionWalkable(layout, { row, column })) {
      onMapMove(player, facing);
      return;
    }
    onMapMove({ row, column }, facing);
    setMotion("walk");
  };

  const interact = () => {
    if (!activeLandmark || !visibleLandmarks.some(({ artifactId }) => artifactId === activeLandmark.artifactId)) return;
    onLandmarkInspect(activeLandmark.artifactId);
    setActionState("interacting");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    const movement: Record<string, [number, number, DemoFacing]> = {
      arrowup: [-1, 0, "up"],
      w: [-1, 0, "up"],
      arrowdown: [1, 0, "down"],
      s: [1, 0, "down"],
      arrowleft: [0, -1, "left"],
      a: [0, -1, "left"],
      arrowright: [0, 1, "right"],
      d: [0, 1, "right"],
    };
    if (key === " " || key === "enter") {
      event.preventDefault();
      interact();
      return;
    }
    const direction = movement[key];
    if (!direction) return;
    event.preventDefault();
    move(direction[0], direction[1], direction[2]);
  };

  return (
    <div className="relative z-[1] mt-4 rounded-2xl border border-amber-300/20 bg-[#120904]/80 p-3 shadow-inner shadow-black/30">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Compass className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">House of Mensah · playable map</p>
           <p className="truncate text-[9px] text-amber-100/60">{TILE_LABELS[tile]} · Facing {mapFacing} · World v{worldVersion} · {layout.restorations.length}/4 terrain restorations</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold text-amber-100/55">
          <Gamepad2 className="h-3 w-3" /> explore
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={(event) => event.currentTarget.focus()}
          className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-amber-400/20 bg-[#201207] outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          aria-label={`House of Mensah map. You are on ${TILE_LABELS[tile]}. Use arrow keys or W A S D to move.`}
        >
          <div className="absolute inset-0 grid grid-cols-9 grid-rows-6">
            {worldMap.flatMap((row, rowIndex) =>
              row.map((tileName, columnIndex) => (
                <img
                  key={`${rowIndex}-${columnIndex}`}
                  src={`${TILE_ROOT}/${tileName}.png`}
                  alt=""
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
              )),
            )}
          </div>
          {layout.restorations.map(({ artifactId, row, column, label, description }) => (
            <div
              key={`restoration-${artifactId}`}
              role="img"
              aria-label={`${label}: ${description}`}
              title={`${label} — ${description}`}
              className="pointer-events-none absolute z-[2] rounded-sm border border-dashed border-emerald-200/80 bg-emerald-200/10 shadow-[inset_0_0_12px_rgba(110,231,183,0.45)]"
              style={{
                width: `${100 / 9}%`,
                height: `${100 / 6}%`,
                left: `${(column * 100) / 9}%`,
                top: `${(row * 100) / 6}%`,
              }}
            />
          ))}
          {visibleLandmarks.map(({ artifactId, row, column, label, description, icon }) => {
            const Icon = WORLD_LANDMARK_ICONS[icon];
            return (
            <div
              key={artifactId}
              role="img"
              aria-label={`${label}: ${description}`}
              title={`${label} — ${description}`}
              className={`absolute z-[5] flex items-center justify-center rounded-full border bg-[#2b1708]/90 text-amber-200 transition-all ${
                activeLandmark?.artifactId === artifactId
                  ? "border-emerald-200 ring-2 ring-emerald-300/70 shadow-[0_0_16px_rgba(110,231,183,0.95)]"
                  : "border-amber-200/80 shadow-[0_0_10px_rgba(245,200,66,0.75)]"
              }`}
              style={{
                width: `${100 / 9}%`,
                height: `${100 / 6}%`,
                left: `${(column * 100) / 9}%`,
                top: `${(row * 100) / 6}%`,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            );
          })}
          {visibleEchoes.map((echo) => {
            const selected = selectedEchoId === echo.artifactId;
            return (
              <button
                key={echo.artifactId}
                type="button"
                aria-label={`${echo.title}: ${echo.subtitle}`}
                aria-pressed={selected}
                onClick={() => setSelectedEchoId(selected ? null : echo.artifactId)}
                className={`absolute z-[7] flex items-end justify-center rounded-lg border transition-all ${
                  selected
                    ? "border-emerald-200 bg-emerald-950/65 ring-2 ring-emerald-300/70 shadow-[0_0_16px_rgba(110,231,183,0.9)]"
                    : "border-sky-200/70 bg-[#142b32]/75 shadow-[0_0_10px_rgba(125,211,252,0.6)] hover:border-emerald-200"
                }`}
                style={{
                  width: `${100 / 9}%`,
                  height: `${100 / 6}%`,
                  left: `${(echo.column * 100) / 9}%`,
                  top: `${(echo.row * 100) / 6}%`,
                }}
              >
                <LegacyCharacterSprite
                  {...echo.character}
                  appearanceSeed={`memory-echo:${echo.artifactId}`}
                  libraryId="niakofa-original-art-demo-v1"
                  size={30}
                  facing="down"
                  motion={selected ? "walk" : "idle"}
                  className="border-sky-200/30 bg-transparent"
                />
                <span className="absolute -bottom-1 rounded-full bg-[#10252b] px-1 py-0.5 text-[7px] font-black uppercase tracking-wide text-sky-200">
                  echo
                </span>
              </button>
            );
          })}
          {/* NPC sprites on the map */}
          {phaseNpcs.map(({ npc, col, row, activity }) => (
            <button
              key={npc.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onNpcInteract?.(npc.id); }}
              aria-label={`Talk to ${npc.name} — ${activity}`}
              title={`${npc.name} · ${activity}`}
              className="absolute z-[8] flex flex-col items-center justify-end cursor-pointer hover:scale-110 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
              style={{
                width: `${100 / 9}%`,
                height: `${100 / 6}%`,
                left: `${(col * 100) / 9}%`,
                top: `${(row * 100) / 6}%`,
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-base shadow-[0_0_8px_rgba(245,200,66,0.45)]"
                style={{ borderColor: "rgba(245,200,66,0.55)", background: "rgba(20,10,4,0.82)" }}
                aria-hidden="true"
              >
                {npc.relationship === "grandmother" ? "👵🏾"
                  : npc.relationship === "elder" ? "🧓🏾"
                  : npc.relationship === "farmer" ? "🌿"
                  : "🧑🏾"}
              </span>
              <span className="mt-px rounded-full border border-amber-700/45 bg-amber-950/90 px-1 py-px text-[6px] font-black uppercase tracking-wide text-amber-400 whitespace-nowrap">
                {npc.name.split(" ")[0]}
              </span>
            </button>
          ))}

          <div
            className="absolute z-10 flex items-end justify-center transition-[left,top] duration-150 ease-out"
            style={{
              width: `${100 / 9}%`,
              height: `${100 / 6}%`,
              left: `${(player.column * 100) / 9}%`,
              top: `${(player.row * 100) / 6}%`,
            }}
            aria-hidden="true"
          >
             <LegacyCharacterSprite
              {...character}
              appearanceSeed={`map-player-${worldVersion}`}
              libraryId="niakofa-original-art-demo-v1"
              size={32}
               facing={mapFacing}
               motion={motion}
              className="mb-0.5 border-amber-200/70 bg-amber-950/30 shadow-[0_0_12px_rgba(245,200,66,0.7)]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
        </div>

        <div className="flex items-center justify-center gap-1" aria-label="Map movement controls">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <button type="button" onClick={() => move(-1, 0, "up")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move north">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <span />
            <button type="button" onClick={() => move(0, -1, "left")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move west">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-[9px] font-black text-amber-300">MOVE</span>
            <button type="button" onClick={() => move(0, 1, "right")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move east">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <span />
            <button type="button" onClick={() => move(1, 0, "down")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-950/70 text-amber-300 active:bg-amber-400/20" aria-label="Move south">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <span />
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={interact}
          disabled={!activeLandmark || actionState === "interacting"}
          className="rounded-lg border border-emerald-300/30 bg-emerald-950/25 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionState === "interacting" ? "Listening…" : discovered.has(activeLandmark?.artifactId ?? "") ? "Review memory" : "Inspect memory"}
        </button>
        <span className="text-right text-[9px] text-amber-100/50">Enter / Space to interact</span>
      </div>
      {selectedEcho ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-lg border border-sky-300/25 bg-sky-950/25 px-2.5 py-2 text-center"
        >
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200">
            Memory echo · {selectedEcho.title}
          </p>
          <p className="mt-0.5 text-[9px] font-bold text-sky-100/75">{selectedEcho.subtitle}</p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-sky-100/60">{selectedEcho.description}</p>
        </div>
      ) : activeLandmark && visibleLandmarks.some(({ artifactId }) => artifactId === activeLandmark.artifactId) ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-lg border border-emerald-300/20 bg-emerald-950/20 px-2.5 py-2 text-center"
        >
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
            {actionState === "interacting" || discovered.has(activeLandmark.artifactId) ? "Memory inspected" : "Memory discovered"} · {activeLandmark.label}
          </p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-emerald-100/60">{activeLandmark.description}</p>
        </div>
      ) : (
        <p className="mt-2 text-center text-[9px] text-amber-100/50">
          Arrow keys / W A S D or the compass · water and buildings are blocked
          {visibleLandmarks.length > 0 ? " · move onto a glowing memory marker" : ""}
          {visibleEchoes.length > 0 ? " · tap a blue echo to hear what changed" : ""}
        </p>
      )}
    </div>
  );
}

export function LegacyLivingWorld({
  phase,
  season,
  worldVersion,
  placedArtifacts,
  discoveredLandmarks,
  businessLevel,
  mapPosition,
  mapFacing,
  onMapMove,
  onLandmarkInspect,
  fishing,
  onFishingCast,
  gameHour,
  onNpcInteract,
  activeRegionId,
  onRegionChange,
}: {
  phase: DemoPhase;
  season: DemoSeason;
  worldVersion: number;
  placedArtifacts: string[];
  discoveredLandmarks: string[];
  businessLevel: number;
  mapPosition: DemoMapPosition;
  mapFacing: DemoFacing;
  onMapMove: (position: DemoMapPosition, facing: DemoFacing) => void;
  onLandmarkInspect: (artifactId: string) => void;
  fishing: FishingJournal;
  onFishingCast: (power: number) => void;
  gameHour?: number;
  onNpcInteract?: (npcId: string) => void;
  /** When set, renders the named world region's tile map instead of the default HouseOfMensahMap. */
  activeRegionId?: RegionId;
  /** Called when the player steps through a portal exit into another region. */
  onRegionChange?: (regionId: RegionId) => void;
}) {
  const scene = WORLD_SCENES[phase];
  const SceneIcon = scene.icon;
  const hasRegenerated = worldVersion > 1;
  const worldLayout = getLegacyWorldLayout(worldVersion, placedArtifacts);
  const memoriesRestored = placedArtifacts.length;
  const growth = Math.min(4, businessLevel + (memoriesRestored > 0 ? 1 : 0));

  return (
    <section
      aria-labelledby="living-world-heading"
      className="mx-4 mb-5 overflow-hidden rounded-2xl border border-amber-700/35 bg-[#170b06] shadow-2xl shadow-black/25"
    >
      <div className="flex items-center justify-between gap-3 border-b border-amber-900/35 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10" style={{ color: scene.accent }}>
            <SceneIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p id="living-world-heading" className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
              Living World · {hasRegenerated ? "regenerated" : "shared map"}
            </p>
            <p className="truncate text-[11px] text-amber-200/75">{scene.title}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-amber-700/35 bg-amber-900/20 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-500">
          v{worldVersion}
        </span>
      </div>

      <div className="relative overflow-hidden px-4 pb-4 pt-5" style={{ background: `${SEASON_OVERLAYS[season]}, linear-gradient(180deg, #2c1a10 0%, #6b3b1b 54%, #30150c 55%, #1a0b06 100%)` }}>
        <div className="absolute right-[14%] top-8 h-9 w-9 rounded-full bg-amber-300/15 blur-sm" />

        <div className="relative z-[1] flex items-start justify-between gap-4">
          <div className="max-w-[65%]">
            <p className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: scene.accent }}>{scene.era}</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/90">{scene.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scene.locations.map((location) => (
                <span key={location} className="rounded-full border border-amber-200/15 bg-black/20 px-2 py-1 text-[9px] font-bold text-amber-100/75">
                  {location}
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-1 shrink-0">
            <LegacyCharacterSprite
              {...scene.character}
              appearanceSeed="house-of-mensah"
              libraryId="niakofa-original-art-demo-v1"
              size={84}
              className="border-amber-300/30 bg-black/20 shadow-xl shadow-black/30"
            />
            <span className="absolute -bottom-1 -right-2 rounded-full border border-amber-300/30 bg-[#241106] px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-300">
              story
            </span>
          </div>
        </div>

        <LegacyVillageAtmosphere
          phase={phase}
          season={season}
          worldVersion={worldVersion}
        />
        {activeRegionId ? (
          <RegionMap
            regionId={activeRegionId}
            phase={phase}
            mapPosition={mapPosition}
            mapFacing={mapFacing}
            onMapMove={onMapMove}
            onRegionChange={onRegionChange}
            character={scene.character}
            worldVersion={worldVersion}
          />
        ) : (
          <HouseOfMensahMap
            character={scene.character}
            worldVersion={worldVersion}
            placedArtifacts={placedArtifacts}
            discoveredLandmarks={discoveredLandmarks}
            mapPosition={mapPosition}
            mapFacing={mapFacing}
            onMapMove={onMapMove}
            onLandmarkInspect={onLandmarkInspect}
            phase={phase}
            gameHour={gameHour}
            onNpcInteract={onNpcInteract}
          />
        )}
        <LegacyFishingEncounter fishing={fishing} onCast={onFishingCast} />

        {hasRegenerated && (
          <div className="relative z-[1] mt-3 rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                World discoveries are live
              </p>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {worldLayout.landmarks.map(({ artifactId, label, description, icon }) => {
                const Icon = WORLD_LANDMARK_ICONS[icon];
                return (
                <div key={artifactId} className="flex items-start gap-2 rounded-lg bg-black/15 px-2 py-1.5">
                  <Icon className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/80" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-emerald-100/85">{label}</p>
                    <p className="text-[9px] leading-relaxed text-emerald-100/55">{description}</p>
                  </div>
                </div>
                );
              })}
            </div>
            {worldLayout.restorations.length > 0 && (
              <div className="mt-3 border-t border-emerald-300/10 pt-2">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200/70">
                  Memory-rooted terrain
                </p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {worldLayout.restorations.map(({ artifactId, label, description }) => (
                    <p key={artifactId} className="text-[9px] leading-relaxed text-emerald-100/55">
                      <span className="font-bold text-emerald-100/80">{label}:</span> {description}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative z-[1] mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-100/65">
            <TreePine className="h-3 w-3" />
            Baobab growth
            <span className="flex gap-1" aria-label={`${growth} of 4 world growth stages`}>
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < growth ? "bg-amber-300" : "bg-amber-100/20"}`} />
              ))}
            </span>
          </div>
          <span className="flex items-center gap-1 text-[9px] font-bold text-amber-100/65">
            <Sparkles className="h-3 w-3" />
            {memoriesRestored}/4 memories
          </span>
        </div>
      </div>
    </section>
  );
}