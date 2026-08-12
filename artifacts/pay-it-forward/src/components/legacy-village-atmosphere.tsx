import {
  Building2,
  MapPin,
  Sprout,
  TreePine,
  Users,
  Waves,
} from "lucide-react";
import type { DemoPhase, DemoSeason } from "@/lib/legacy-demo-state";

const VILLAGE_ASSET_ROOT = "/legacy-village-assets";

type VillageAtmosphereProps = {
  phase: DemoPhase;
  season: DemoSeason;
  worldVersion: number;
};

const PHASE_STATES: Partial<Record<DemoPhase, {
  label: string;
  description: string;
  icon: typeof Sprout;
  pressure: boolean;
}>> = {
  chapter1: {
    label: "Growing compound",
    description: "Cocoa paths and family homes are taking shape.",
    icon: Sprout,
    pressure: false,
  },
  chapter2: {
    label: "Golden years",
    description: "The house stands open to the market road.",
    icon: Building2,
    pressure: false,
  },
  chapter3: {
    label: "Under pressure",
    description: "The same place now carries unanswered questions.",
    icon: MapPin,
    pressure: true,
  },
  chapter4: {
    label: "After collapse",
    description: "The ravaged house makes loss visible without inventing a fact.",
    icon: Building2,
    pressure: true,
  },
  chapter5: {
    label: "Migration route",
    description: "A station becomes a visual bridge between branches.",
    icon: Waves,
    pressure: true,
  },
  "world-regen": {
    label: "Memory restored",
    description: "The family contribution gives the world another place to stand.",
    icon: TreePine,
    pressure: false,
  },
  "coop-quest": {
    label: "Shared investigation",
    description: "Ambient villagers make the recovered place feel inhabited.",
    icon: Users,
    pressure: false,
  },
  reunion: {
    label: "A living reunion",
    description: "The house is ready to hold another family story.",
    icon: Users,
    pressure: false,
  },
  finale: {
    label: "The baobab remembers",
    description: "The visual library stays a doorway into the next contribution.",
    icon: TreePine,
    pressure: false,
  },
};

const SEASON_LABELS: Record<DemoSeason, string> = {
  dry: "Dry season",
  rain: "Rain season",
  harvest: "Harvest season",
  celebration: "Celebration season",
};

/**
 * Adds the uploaded village art without changing the deterministic map
 * renderer. The art is explicitly atmosphere: it never claims to depict a
 * verified relative or a historically accurate building.
 */
export function LegacyVillageAtmosphere({
  phase,
  season,
  worldVersion,
}: VillageAtmosphereProps) {
  const state = PHASE_STATES[phase] ?? {
    label: "Shared village",
    description: "The family world is ready for the next remembered detail.",
    icon: TreePine,
    pressure: false,
  };
  const StateIcon = state.icon;
  const building = state.pressure ? "house-ravaged.png" : "house-prosperous.png";
  const buildingAlt = state.pressure
    ? "Stylized ravaged village house used to show a pressured world state"
    : "Stylized village house used to show a growing world state";
  const isMigration = phase === "chapter5";
  const environmentLayer = worldVersion > 1
    ? {
        label: "Canopy restored",
        description: "A contribution gives the path back its green horizon.",
        file: "retro-live-trees.png",
        alt: "Generic living tree silhouettes used as a recovered world-state cue",
      }
    : state.pressure
      ? {
          label: "Canopy under pressure",
          description: "The same route is held in a quieter, stressed season.",
          file: "retro-dead-trees.png",
          alt: "Generic bare tree silhouettes used as a pressured world-state cue",
        }
      : {
          label: "Canopy waiting",
          description: "The village is ready for the next remembered detail.",
          file: "retro-live-trees.png",
          alt: "Generic living tree silhouettes used as ambient environment art",
        };

  return (
    <section
      aria-labelledby="village-atmosphere-title"
      className="relative z-[1] mt-4 overflow-hidden rounded-2xl border border-emerald-300/20 bg-[#0f1d17]/80 p-3 shadow-inner shadow-black/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300/80">
            Curated village layer · {SEASON_LABELS[season]}
          </p>
          <h3 id="village-atmosphere-title" className="mt-1 flex items-center gap-1.5 text-xs font-black text-emerald-50">
            <StateIcon className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
            {state.label}
          </h3>
          <p className="mt-1 max-w-md text-[9px] leading-relaxed text-emerald-100/60">{state.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-200">
          World v{worldVersion}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1.25fr_.75fr]">
        <div className="relative h-44 overflow-hidden rounded-xl border border-emerald-200/15 bg-[#1c3022]">
          <img
            src={`${VILLAGE_ASSET_ROOT}/materials/field-grass.png`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            style={{ imageRendering: "pixelated" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300/20 via-transparent to-[#0b1710]/80" />
          <img
            src={`${VILLAGE_ASSET_ROOT}/environment/village-tree.png`}
            alt="Stylized village tree used as ambient environment art"
            className="absolute bottom-3 left-2 h-28 w-24 object-contain drop-shadow-[0_8px_8px_rgba(0,0,0,0.45)]"
            style={{ imageRendering: "pixelated" }}
          />
          <img
            src={`${VILLAGE_ASSET_ROOT}/environment/${environmentLayer.file}`}
            alt={environmentLayer.alt}
            className="absolute bottom-0 right-0 h-24 w-36 object-contain object-right opacity-45 mix-blend-screen"
          />
          <img
            src={`${VILLAGE_ASSET_ROOT}/buildings/${building}`}
            alt={buildingAlt}
            className="absolute bottom-1 left-1/2 h-40 w-36 -translate-x-1/2 object-contain drop-shadow-[0_10px_8px_rgba(0,0,0,0.5)]"
            style={{ imageRendering: "pixelated" }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg border border-amber-200/20 bg-[#171008]/80 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100/80">
            <Building2 className="h-3 w-3 text-amber-300" aria-hidden="true" />
            {state.pressure ? "Pressure state" : "Prosperity state"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          <div className="relative overflow-hidden rounded-xl border border-amber-200/15 bg-[#1b120b] p-2">
            <div className="absolute inset-0 opacity-20">
              <img
                src={`${VILLAGE_ASSET_ROOT}/materials/tree-bark-01.png`}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="relative flex items-center gap-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-amber-200/20 bg-black/30">
                <img
                  src={`${VILLAGE_ASSET_ROOT}/characters/elder-idle.png`}
                  alt="Stylized elder sprite used as a generic conversation cue"
                  className="h-12 w-12 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-200">
                  <Users className="h-3 w-3 text-amber-300" aria-hidden="true" />
                  Conversation cue
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-amber-100/60">
                  Generic sprite art frames an interview; Family Vault facts supply the voice.
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-cyan-200/15 bg-cyan-950/20 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-wide text-cyan-100/80">
                {isMigration ? "Migration landmark" : "Ambient villagers"}
              </p>
              {isMigration ? (
                <Waves className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              ) : (
                <Users className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              )}
            </div>
            {isMigration ? (
              <img
                src={`${VILLAGE_ASSET_ROOT}/buildings/train-station.png`}
                alt="Stylized train station used as a migration landmark cue"
                className="mt-2 h-14 w-full object-contain object-left"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div className="mt-2 flex h-14 items-center gap-2 overflow-hidden rounded-lg border border-cyan-200/10 bg-black/20 px-2">
                <span
                  aria-hidden="true"
                  className="h-12 w-10 shrink-0 bg-contain bg-left-top bg-no-repeat"
                  style={{
                    backgroundImage: `url(${VILLAGE_ASSET_ROOT}/characters/villager-spritesheet.png)`,
                    backgroundSize: "80px 96px",
                    imageRendering: "pixelated",
                  }}
                />
                <p className="text-[9px] leading-relaxed text-cyan-100/60">
                  A small ambient population cue keeps the map from feeling empty.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-orange-200/15 bg-orange-950/20 px-2.5 py-2">
        <span className="h-10 w-12 shrink-0 overflow-hidden rounded-lg border border-orange-200/15 bg-black/20">
          <img
            src={`${VILLAGE_ASSET_ROOT}/materials/ground-stone-echo.png`}
            alt="Stylized ground material used as a generic path texture cue"
            className="h-full w-full object-cover opacity-75"
          />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wide text-orange-200/80">
            {worldVersion > 1 ? "Restored path" : "Path texture cue"}
          </p>
          <p className="mt-0.5 text-[9px] leading-relaxed text-orange-100/55">
            {worldVersion > 1
              ? "The ground carries the visible change without inventing a new family fact."
              : `${environmentLayer.label} · ${environmentLayer.description}`}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[8px] leading-relaxed text-emerald-100/40">
        Presentation art only · not a portrait, likeness, or historical record · licensing review required before commercial launch.
      </p>
    </section>
  );
}