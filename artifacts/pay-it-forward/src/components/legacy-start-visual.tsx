import {
  ArrowRight,
  BookHeart,
  Camera,
  Crown,
  FileText,
  Globe2,
  Heart,
  Map,
  Mic,
  Sparkles,
  Users,
} from "lucide-react";

const legacyReferenceImage = "/legacy-living-family-reference.png";

interface LegacyStartVisualProps {
  familyName?: string | null;
  memberCount: number;
  memoryCount: number;
  isReady: boolean;
  hasJourney: boolean;
  onContinue: () => void;
  onStartBuilding: () => void;
}

const PLACEHOLDER_RELATIVES = [
  { label: "Grandmother", icon: Crown, tone: "from-amber-200/80 to-amber-500/40" },
  { label: "Grandfather", icon: Users, tone: "from-sky-200/70 to-sky-500/40" },
  { label: "Mother", icon: Heart, tone: "from-rose-200/70 to-rose-500/40" },
  { label: "Father", icon: BookHeart, tone: "from-emerald-200/70 to-emerald-500/40" },
];

const PLACEHOLDER_SYSTEMS = [
  { label: "Memories", icon: Camera },
  { label: "Stories", icon: Mic },
  { label: "Places", icon: Map },
  { label: "Chapters", icon: FileText },
];

export function LegacyStartVisual({
  familyName,
  memberCount,
  memoryCount,
  isReady,
  hasJourney,
  onContinue,
  onStartBuilding,
}: LegacyStartVisualProps) {
  const worldLabel = familyName?.trim() || "Your family";
  const progress = Math.min(100, Math.round((memberCount * 12 + memoryCount * 8) / 2));

  return (
    <section
      aria-labelledby="legacy-start-title"
      className="relative overflow-hidden border-y border-amber-700/30 bg-[#0b0805] shadow-2xl sm:rounded-3xl sm:border"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(214,158,64,0.18),transparent_38%),radial-gradient(circle_at_90%_90%,rgba(33,82,69,0.16),transparent_34%)]" />

      <div className="relative grid lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="relative min-h-[22rem] overflow-hidden border-b border-amber-700/20 lg:min-h-[31rem] lg:border-b-0 lg:border-r">
          <img
            src={legacyReferenceImage}
            alt="Niakofa Legacy visual reference showing the Living Family Legacy Experience"
            className="absolute inset-0 h-full w-full object-cover object-left"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0805] via-[#0b0805]/15 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-[#0b0805]" />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-amber-300/30 bg-[#160f08]/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200 backdrop-blur">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Living world preview
          </div>
          <div className="absolute bottom-4 left-4 right-4 max-w-sm lg:hidden">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-400/80">
              The Living Family Legacy Experience
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-50">
              Every story becomes part of the world.
            </p>
          </div>
        </div>

        <div className="relative p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-500">
                Niakofa Legacy
              </p>
              <h1 id="legacy-start-title" className="mt-2 text-2xl font-black leading-tight text-amber-50 sm:text-3xl">
                Your family&apos;s living story starts here.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-amber-100/65">
                {isReady
                  ? `${worldLabel} is ready to become a world you can explore, remember, and grow.`
                  : "The people, places, and memories shown here are placeholders until your family adds its own story."}
              </p>
            </div>
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 sm:flex">
              <Globe2 className="h-5 w-5 text-amber-300" />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-700/30 bg-[#160f08]/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500/80">
                  {isReady ? "Your world is awakening" : "Placeholder family world"}
                </p>
                <p className="mt-1 text-sm font-semibold text-amber-100">
                  {isReady ? `${memberCount} relatives · ${memoryCount} memories` : "Add enough family data to begin"}
                </p>
              </div>
              <span className="text-lg font-black text-amber-300">{isReady ? `${progress}%` : "—"}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-950/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-400 to-emerald-400 transition-all duration-700"
                style={{ width: `${isReady ? Math.max(8, progress) : 5}%` }}
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {PLACEHOLDER_RELATIVES.map(({ label, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl border border-amber-800/30 bg-[#120c07]/80 p-2.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${tone} text-[#211308]`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-amber-100/85">{label}</p>
                  <p className="text-[10px] text-amber-600">{isReady ? "Awaiting your details" : "Placeholder avatar"}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {PLACEHOLDER_SYSTEMS.map(({ label, icon: Icon }) => (
              <div key={label} className="text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-amber-800/30 bg-amber-500/10">
                  <Icon className="h-4 w-4 text-amber-400" />
                </div>
                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">{label}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={hasJourney ? onContinue : onStartBuilding}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-400 px-4 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-[#211308] shadow-lg shadow-amber-900/30 transition hover:from-amber-500 hover:to-amber-300 active:scale-[0.99]"
          >
            {hasJourney ? "Continue Journey" : isReady ? "Start New Journey" : "Begin Building Your World"}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-center text-[10px] leading-4 text-amber-700">
            {hasJourney
              ? "Your current chapter, journal, and world version are preserved."
              : "Upload relatives, memories, and places to replace placeholders with your family."}
          </p>
        </div>
      </div>
    </section>
  );
}