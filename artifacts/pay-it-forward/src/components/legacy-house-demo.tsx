import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  HeartHandshake,
  Image,
  Landmark,
  MapPin,
  Medal,
  Mic,
  ScrollText,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  placeDemoArtifact,
  readDemoState,
  writeDemoState,
  type DemoState,
} from "@/lib/legacy-demo-state";

type HouseArea = "house" | "kitchen" | "reunion";
type DemoArtifact = {
  id: string;
  label: string;
  description: string;
  unlocks: string;
  icon: typeof Camera;
};

interface LegacyHouseDemoProps {
  familyId?: number;
  memberCount: number;
  memoryCount: number;
  landmarkCount: number;
  worldVersion?: number | null;
  onOpenVault: () => void;
  onOpenMap: () => void;
  onRecordMemory: () => void;
  onOpenReunion: () => void;
}

const ARTIFACTS: DemoArtifact[] = [
  {
    id: "photo",
    label: "Old photo",
    description: "A face waiting for its name",
    unlocks: "Portrait wall + family mystery",
    icon: Image,
  },
  {
    id: "recipe",
    label: "Family recipe",
    description: "A taste carried across generations",
    unlocks: "Kitchen memory + new quest",
    icon: UtensilsCrossed,
  },
  {
    id: "medal",
    label: "Military medal",
    description: "Service remembered with honor",
    unlocks: "Display cabinet + ancestor clue",
    icon: Medal,
  },
  {
    id: "certificate",
    label: "Marriage certificate",
    description: "The beginning of a family branch",
    unlocks: "Hallway timeline + relationship",
    icon: ScrollText,
  },
];

function HouseArtifact({
  artifact,
  placed,
  onPlace,
}: {
  artifact: DemoArtifact;
  placed: boolean;
  onPlace: () => void;
}) {
  const Icon = artifact.icon;
  return (
    <button
      type="button"
      onClick={onPlace}
      className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
        placed
          ? "border-amber-400/50 bg-amber-400/10"
          : "border-amber-900/40 bg-[#21140b] hover:border-amber-600/50"
      }`}
      aria-label={placed ? `${artifact.label} placed in the house` : `Place ${artifact.label} in the house`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          placed ? "bg-amber-400/20 text-amber-300" : "bg-amber-950/60 text-amber-600"
        }`}
      >
        {placed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-bold ${placed ? "text-amber-200" : "text-amber-300/90"}`}>
          {artifact.label}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-amber-700">{artifact.description}</span>
      </span>
      <span className={`text-[10px] font-bold uppercase ${placed ? "text-amber-400" : "text-amber-700"}`}>
        {placed ? "Placed" : "Add"}
      </span>
    </button>
  );
}

export function LegacyHouseDemo({
  familyId,
  memberCount,
  memoryCount,
  landmarkCount,
  worldVersion,
  onOpenVault,
  onOpenMap,
  onRecordMemory,
  onOpenReunion,
}: LegacyHouseDemoProps) {
  const [area, setArea] = useState<HouseArea>("house");
  const [demoState, setDemoState] = useState<DemoState | null>(null);

  useEffect(() => {
    const syncState = () => setDemoState(readDemoState(localStorage));
    syncState();
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);

  const placedArtifacts = demoState?.placedArtifacts ?? [];
  const placedCount = placedArtifacts.length;
  const placed = useMemo(() => new Set(placedArtifacts), [placedArtifacts]);
  const houseStage = placedCount >= 4 ? "Museum of the Mensah Family" : placedCount >= 2 ? "A house becoming a story" : "Grandma's Sunday house";

  const placeArtifact = (id: string) => {
    setDemoState((current) => {
      const next = placeDemoArtifact(current ?? readDemoState(localStorage), id);
      writeDemoState(localStorage, next);
      return next;
    });
  };

  return (
    <section className="mb-5 px-4" aria-labelledby="house-demo-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Live Demo · House of Mensah</p>
          <h2 id="house-demo-heading" className="mt-1 text-lg font-black text-amber-100">
            Your memories change the house
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-amber-700/30 bg-amber-900/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-500">
          {worldVersion ? `World v${worldVersion}` : "Demo world"}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-amber-700/30 bg-[#170d07] shadow-xl shadow-black/20">
        <div className="relative h-40 overflow-hidden">
          <img
            src="/niakofa-legacy-live-demo.png"
            alt="Niakofa Legacy reference panels showing the family's living world"
            className="h-full w-full object-cover object-[center_72%] opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#170d07] via-[#170d07]/35 to-transparent" />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">Sunday dinner · Present day</p>
              <p className="mt-1 text-base font-black text-amber-50">{houseStage}</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-black/35 px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-lg font-black text-amber-300">{placedCount}/4</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600">artifacts placed</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 border-y border-amber-900/30 bg-[#21140b]">
          {([
            ["house", "The House", Landmark],
            ["kitchen", "Kitchen", UtensilsCrossed],
            ["reunion", "Reunion", HeartHandshake],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setArea(id)}
              className={`flex items-center justify-center gap-1.5 py-3 text-[10px] font-black uppercase tracking-wide transition-colors ${
                area === id ? "border-b-2 border-amber-400 text-amber-300" : "text-amber-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {area === "house" && (
          <div className="p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-100">Every contribution has a place</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-600">
                  Place an artifact to reveal the room, relationship, and quest it creates in your living world.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ARTIFACTS.map((artifact) => (
                <HouseArtifact
                  key={artifact.id}
                  artifact={artifact}
                  placed={placed.has(artifact.id)}
                  onPlace={() => placeArtifact(artifact.id)}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-900/30 bg-[#21140b] px-3 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-500">
                {placedCount === 4
                  ? "The house is now a museum. A new generation can walk through the story."
                  : `${4 - placedCount} more contribution${4 - placedCount === 1 ? "" : "s"} will complete the museum.`}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <button type="button" onClick={onOpenVault} className="rounded-lg border border-amber-900/30 bg-amber-950/30 px-2 py-2 text-[10px] font-bold text-amber-500">
                <ScrollText className="mx-auto mb-1 h-3.5 w-3.5" /> Open Vault
              </button>
              <button type="button" onClick={onOpenMap} className="rounded-lg border border-amber-900/30 bg-amber-950/30 px-2 py-2 text-[10px] font-bold text-amber-500">
                <MapPin className="mx-auto mb-1 h-3.5 w-3.5" /> Visit Place
              </button>
              <button type="button" onClick={onRecordMemory} className="rounded-lg border border-amber-900/30 bg-amber-950/30 px-2 py-2 text-[10px] font-bold text-amber-500">
                <Mic className="mx-auto mb-1 h-3.5 w-3.5" /> Record Story
              </button>
            </div>
          </div>
        )}

        {area === "kitchen" && (
          <div className="p-4">
            <div className="rounded-xl border border-amber-700/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300">
                  <UtensilsCrossed className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-amber-100">Grandma's kitchen</p>
                  <p className="text-xs text-amber-600">Recipes unlock memories, not just meals.</p>
                </div>
              </div>
              <p className="mt-4 text-sm italic leading-relaxed text-amber-200/85">
                “This recipe came from your great-grandmother. She made it whenever someone came home.”
              </p>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-[10px]">
                <span className="text-amber-700">Kitchen memory</span>
                <span className={placed.has("recipe") ? "font-bold text-emerald-400" : "font-bold text-amber-600"}>
                  {placed.has("recipe") ? "Unlocked" : "Locked · place recipe"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => placeArtifact("recipe")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-xs font-black uppercase tracking-wide text-amber-950 active:opacity-80"
            >
              <UtensilsCrossed className="h-4 w-4" />
              {placed.has("recipe") ? "Recipe preserved" : "Preserve the recipe"}
            </button>
            <p className="mt-3 text-center text-[10px] text-amber-700">
              {memoryCount} memories already feed your family world · recipes add a new dialogue branch.
            </p>
          </div>
        )}

        {area === "reunion" && (
          <div className="p-4">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-100">Sunday dinner · play together</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-600">
                  Walk around the house, talk to relatives, identify photographs, and preserve a voice for the next generation.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "Family members", value: memberCount, icon: Users },
                { label: "Landmarks", value: landmarkCount, icon: MapPin },
                { label: "Shared memories", value: memoryCount, icon: Camera },
              ] satisfies Array<{ label: string; value: number; icon: typeof Camera }>).map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-amber-900/30 bg-[#21140b] p-3 text-center">
                  <Icon className="mx-auto mb-1.5 h-4 w-4 text-amber-500" />
                  <p className="text-lg font-black text-amber-300">{value}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700">{label}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenReunion}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 py-3 text-xs font-black uppercase tracking-wide text-rose-300 active:opacity-80"
            >
              Enter the family reunion
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-amber-800">
        <Landmark className="h-3 w-3" /> A playable concept built from the Niakofa Legacy reference
        {familyId ? ` · family ${familyId}` : ""}
      </p>
    </section>
  );
}