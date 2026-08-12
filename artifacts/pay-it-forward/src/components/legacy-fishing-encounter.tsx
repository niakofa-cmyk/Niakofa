import { useEffect, useRef, useState } from "react";
import { Fish, Sparkles, Waves } from "lucide-react";
import {
  DEMO_FISHING_CATCHES,
  type FishingJournal,
} from "@/lib/legacy-demo-state";

const CATCH_ART: Record<string, { image: string; effect: string }> = {
  "river-tilapia": {
    image: "/legacy-rpg-assets/fishing/green.png",
    effect: "/legacy-rpg-assets/animations/StateUp1.png",
  },
  "golden-fish": {
    image: "/legacy-rpg-assets/fishing/purple.png",
    effect: "/legacy-rpg-assets/animations/Fire1.png",
  },
  "river-spirit": {
    image: "/legacy-rpg-assets/fishing/devil.png",
    effect: "/legacy-rpg-assets/animations/Revival1.png",
  },
};

export function LegacyFishingEncounter({
  fishing,
  onCast,
}: {
  fishing: FishingJournal;
  onCast: (power: number) => void;
}) {
  const [power, setPower] = useState(68);
  const [casting, setCasting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const lastCatch = DEMO_FISHING_CATCHES.find(
    (catchData) => catchData.id === fishing.lastCatch,
  );
  const catchArt = lastCatch ? CATCH_ART[lastCatch.id] : null;

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCast = () => {
    if (casting) return;
    setCasting(true);
    timerRef.current = window.setTimeout(() => {
      onCast(power);
      setCasting(false);
      timerRef.current = null;
    }, 500);
  };

  return (
    <section
      aria-labelledby="legacy-fishing-heading"
      className="relative z-[1] mt-3 overflow-hidden rounded-xl border border-cyan-300/20 bg-[#071c22]/85"
    >
      <div className="relative h-28 overflow-hidden">
        <img
          src="/legacy-rpg-assets/fishing/surface1.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-75"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071c22] via-transparent to-cyan-950/20" />
        <img
          src="/legacy-rpg-assets/fishing/rod.png"
          alt=""
          className={`absolute bottom-1 right-[15%] h-24 w-28 object-contain object-bottom ${casting ? "animate-pulse" : ""}`}
          draggable={false}
        />
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
              River memory · fishing shrine
            </p>
            <h2 id="legacy-fishing-heading" className="mt-1 text-sm font-black text-cyan-50">
              Cast into the family river
            </h2>
          </div>
          <span className="rounded-full border border-cyan-200/20 bg-cyan-950/70 px-2 py-1 text-[9px] font-bold text-cyan-200">
            {fishing.castCount} casts
          </span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 text-[10px] text-cyan-100/70">
          <Waves className="h-3.5 w-3.5 text-cyan-300" />
          <span>Set your cast power. Stronger casts reach rarer river memories.</span>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-cyan-300/80">
            <label htmlFor="legacy-cast-power">Cast power</label>
            <span>{power}%</span>
          </div>
          <input
            id="legacy-cast-power"
            type="range"
            min="0"
            max="100"
            value={power}
            onChange={(event) => setPower(Number(event.target.value))}
            className="h-1.5 w-full accent-cyan-300"
            aria-describedby="legacy-cast-hint"
          />
          <p id="legacy-cast-hint" className="mt-1 text-[9px] text-cyan-100/45">
            55% unlocks rare fish · 85% reaches the river spirit
          </p>
        </div>
        <button
          type="button"
          onClick={handleCast}
          disabled={casting}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-200/25 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-wait disabled:opacity-50"
        >
          {casting ? (
            <>
              <Waves className="h-3.5 w-3.5 animate-pulse" /> Line in the water…
            </>
          ) : (
            <>
              <Fish className="h-3.5 w-3.5" /> Cast the line
            </>
          )}
        </button>

        {lastCatch && catchArt && (
          <div
            role="status"
            aria-live="polite"
            className="relative overflow-hidden rounded-lg border border-amber-300/25 bg-amber-950/30 p-2.5"
          >
            <img
              src={catchArt.effect}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-30"
              draggable={false}
            />
            <div className="relative flex items-center gap-2">
              <img
                src={catchArt.image}
                alt=""
                className="h-10 w-10 object-contain"
                draggable={false}
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-200">
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  {lastCatch.name} · {lastCatch.rarity}
                </p>
                <p className="mt-0.5 text-[9px] text-amber-100/65">
                  River memory recorded · +{lastCatch.points} Legacy Points
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}