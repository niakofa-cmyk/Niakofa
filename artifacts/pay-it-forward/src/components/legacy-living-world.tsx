import {
  Building2,
  Landmark,
  MapPin,
  Ship,
  Sparkles,
  Sprout,
  TreePine,
  Waves,
} from "lucide-react";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";
import type { DemoPhase, DemoSeason } from "@/lib/legacy-demo-state";

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

export function LegacyLivingWorld({
  phase,
  season,
  worldVersion,
  placedArtifacts,
  businessLevel,
}: {
  phase: DemoPhase;
  season: DemoSeason;
  worldVersion: number;
  placedArtifacts: string[];
  businessLevel: number;
}) {
  const scene = WORLD_SCENES[phase];
  const SceneIcon = scene.icon;
  const hasRegenerated = worldVersion > 1;
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

      <div className="relative min-h-[206px] overflow-hidden px-4 pb-4 pt-5" style={{ background: `${SEASON_OVERLAYS[season]}, linear-gradient(180deg, #2c1a10 0%, #6b3b1b 54%, #30150c 55%, #1a0b06 100%)` }}>
        <div className="absolute inset-x-0 bottom-0 h-14 opacity-70" style={{ background: "repeating-linear-gradient(165deg, transparent 0 13px, rgba(234,165,76,0.18) 14px 15px), linear-gradient(90deg, #291207, #8c5123 45%, #291207)" }} />
        <div className="absolute bottom-10 left-[11%] h-16 w-14 rounded-t-[60%] bg-[#1c120d] opacity-90" />
        <div className="absolute bottom-10 left-[17%] h-20 w-4 rounded-full bg-[#27150b] opacity-90" />
        <div className="absolute bottom-10 right-[12%] h-20 w-24 rounded-t-[55%] border-4 border-b-0 border-[#27150b] opacity-80" />
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

        <div className="absolute bottom-3 left-4 right-4 z-[1] flex items-center justify-between gap-3">
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