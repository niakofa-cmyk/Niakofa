import { useState, useRef } from "react";
import { ArrowRight, BookOpen, HeartHandshake, MapPin, Sparkles, TreePine } from "lucide-react";

interface LegacyLivingBaobabProps {
  worldVersion: number;
  onEnter: () => void;
}

type LivingBranch = {
  id: string;
  label: string;
  member: string;
  era: string;
  detail: string;
  evidence: string;
  position: { left: string; top: string };
};

const LIVING_BRANCHES: readonly LivingBranch[] = [
  {
    id: "ancestor",
    label: "Ancestor branch",
    member: "Kwame Mensah",
    era: "1890 · Gold Coast",
    detail: "Merchant, farmer, and the first known keeper of the House of Mensah story.",
    evidence: "12 memories · 4 places · 2 chapters",
    position: { left: "24%", top: "38%" },
  },
  {
    id: "kitchen",
    label: "Living kitchen",
    member: "Ama's recipes",
    era: "1932 · Family memory",
    detail: "A recipe can carry a voice, a place, and the person who taught it.",
    evidence: "3 recipes · 1 oral history · 1 new dialogue",
    position: { left: "72%", top: "38%" },
  },
  {
    id: "migration",
    label: "Migration route",
    member: "The next branch",
    era: "Across generations",
    detail: "Follow the route from the village to the places where the family took root.",
    evidence: "2 landmarks · 1 route · more to discover",
    position: { left: "35%", top: "26%" },
  },
  {
    id: "living",
    label: "Living relatives",
    member: "Your family now",
    era: "Today · Connected",
    detail: "New contributions become leaves, stories become fruit, and the tree keeps growing.",
    evidence: "Living leaves · shared quests · memories waiting",
    position: { left: "62%", top: "26%" },
  },
];

// ── Firefly animation config ───────────────────────────────────────────────────

type FireflyConfig = {
  id: number;
  x: string;
  y: string;
  dur: string;
  delay: string;
  size: number;
};

function useFireflies(count: number): FireflyConfig[] {
  const ref = useRef<FireflyConfig[] | null>(null);
  if (!ref.current) {
    ref.current = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: `${8 + (i * 13.7 + i * 3) % 84}%`,
      y: `${15 + (i * 11.3 + i * 5) % 65}%`,
      dur: `${2.8 + (i % 5) * 0.6}s`,
      delay: `${(i * 0.38) % 2.8}s`,
      size: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
    }));
  }
  return ref.current;
}

/**
 * The public demo's home screen. The Baobab is deliberately a lightweight
 * entry surface rather than a second navigation system: the existing golden
 * path remains the source of truth once the player enters the story.
 */
export function LegacyLivingBaobab({ worldVersion, onEnter }: LegacyLivingBaobabProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(LIVING_BRANCHES[0].id);
  const selectedBranch =
    LIVING_BRANCHES.find(branch => branch.id === selectedBranchId) ?? LIVING_BRANCHES[0];
  const fireflies = useFireflies(10);

  return (
    <section
      aria-labelledby="living-baobab-title"
      className="relative overflow-hidden px-4 pb-8 pt-8 animate-[fadeIn_0.6s_ease-out]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(214,158,46,0.2), transparent 46%), radial-gradient(circle at 15% 55%, rgba(24,110,78,0.18), transparent 36%), radial-gradient(circle at 85% 60%, rgba(95,53,21,0.25), transparent 40%)",
        }}
        aria-hidden="true"
      />

      <div className="relative space-y-6">
        <div className="text-center">
          <p className="mb-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] text-amber-500">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            A living family archive
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </p>
          <h1
            id="living-baobab-title"
            className="text-3xl font-black text-amber-100 sm:text-4xl"
            style={{ fontFamily: "Georgia, serif" }}
          >
            The Living Baobab
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-amber-200/75">
            Every branch holds a generation. Every root carries a memory.
            Choose a family story and help it grow.
          </p>
        </div>

        <div
          className="relative mx-auto min-h-[340px] max-w-md overflow-hidden rounded-[2rem] border border-amber-700/40 bg-[#120b07]/90 shadow-[0_18px_70px_rgba(0,0,0,0.35)]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 35%, rgba(214,158,46,0.12), transparent 38%), linear-gradient(180deg, rgba(28,17,10,0.9), rgba(10,6,4,0.98))",
          }}
        >
          <div className="absolute inset-x-6 top-5 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">
            <span>House of Mensah</span>
            <span>World v{worldVersion}</span>
          </div>

          {/* A small, scalable baobab emblem keeps the entry screen self-contained
              and avoids pulling the RPG runtime or unreviewed art into the SPA. */}
          <svg
            viewBox="0 0 360 300"
            className="absolute inset-x-3 bottom-2 h-[285px] w-[calc(100%-1.5rem)]"
            role="img"
            aria-label="A glowing baobab tree with family memories on its branches"
          >
            <defs>
              <linearGradient id="baobab-trunk" x1="0" x2="1">
                <stop offset="0" stopColor="#4d2b17" />
                <stop offset="0.5" stopColor="#9a5c27" />
                <stop offset="1" stopColor="#3b2112" />
              </linearGradient>
              <radialGradient id="baobab-glow">
                <stop offset="0" stopColor="#f5c842" stopOpacity="0.8" />
                <stop offset="1" stopColor="#f5c842" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="180" cy="270" rx="142" ry="22" fill="#0a0604" opacity="0.8" />
            <ellipse cx="180" cy="130" rx="95" ry="95" fill="url(#baobab-glow)" opacity="0.18" />
            <g fill="none" stroke="#70401e" strokeLinecap="round">
              <path d="M180 270 C170 220 175 168 180 122" strokeWidth="36" />
              <path d="M176 211 C137 174 112 136 78 111" strokeWidth="13" />
              <path d="M186 201 C222 166 253 140 292 119" strokeWidth="13" />
              <path d="M180 169 C155 133 145 103 139 71" strokeWidth="10" />
              <path d="M181 157 C205 121 217 92 224 62" strokeWidth="10" />
              <path d="M144 176 C119 159 92 155 55 152" strokeWidth="8" />
              <path d="M220 173 C252 157 282 155 315 158" strokeWidth="8" />
            </g>
            <path d="M161 270 C153 221 161 173 171 119 C180 101 193 105 199 122 C204 172 209 220 198 270Z" fill="url(#baobab-trunk)" />
            <g fill="#31583c" stroke="#6a8f52" strokeWidth="2">
              <ellipse cx="83" cy="102" rx="42" ry="18" transform="rotate(-22 83 102)" />
              <ellipse cx="279" cy="105" rx="45" ry="18" transform="rotate(20 279 105)" />
              <ellipse cx="138" cy="67" rx="42" ry="17" transform="rotate(-10 138 67)" />
              <ellipse cx="224" cy="58" rx="44" ry="17" transform="rotate(12 224 58)" />
              <ellipse cx="58" cy="151" rx="34" ry="14" transform="rotate(-3 58 151)" />
              <ellipse cx="310" cy="157" rx="34" ry="14" transform="rotate(4 310 157)" />
            </g>
            <g fill="#f5c842" stroke="#fff1a8" strokeWidth="1.5">
              <circle cx="105" cy="95" r="6" />
              <circle cx="252" cy="97" r="6" />
              <circle cx="144" cy="83" r="6" />
              <circle cx="214" cy="78" r="6" />
              <circle cx="82" cy="145" r="5" />
              <circle cx="281" cy="149" r="5" />
            </g>
            <path d="M42 274 Q180 235 318 274" fill="none" stroke="#b88232" strokeDasharray="3 9" opacity="0.55" />
          </svg>

          {/* Animated fireflies — memory sparks drifting through the canopy */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {fireflies.map(fly => (
              <div
                key={fly.id}
                className="absolute rounded-full legacy-firefly"
                style={{
                  left: fly.x,
                  top: fly.y,
                  width: fly.size,
                  height: fly.size,
                  background: "#f5c842",
                  boxShadow: `0 0 ${fly.size + 3}px rgba(245,200,66,0.8)`,
                  "--firefly-dur": fly.dur,
                  animationDelay: fly.delay,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <div
            className="absolute inset-0"
            aria-label="Family branches"
          >
            {LIVING_BRANCHES.map(branch => {
              const isSelected = branch.id === selectedBranch.id;
              return (
                <button
                  key={branch.id}
                  type="button"
                  aria-label={`Focus ${branch.label}: ${branch.member}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedBranchId(branch.id)}
                  className={[
                    "absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-black shadow-[0_0_18px_rgba(245,200,66,0.35)] transition-all focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-[#120b07]",
                    isSelected
                      ? "z-10 scale-110 border-amber-100 bg-amber-400 text-[#241205]"
                      : "border-amber-300/70 bg-[#203c2b] text-amber-100 hover:scale-105 hover:border-amber-100",
                  ].join(" ")}
                  style={{ left: branch.position.left, top: branch.position.top }}
                >
                  <span aria-hidden="true">{isSelected ? "✦" : "·"}</span>
                </button>
              );
            })}
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
            <span className="rounded-full border border-amber-700/30 bg-[#1d120a]/90 px-2.5 py-1 text-[9px] font-bold text-amber-500">
              4 branches
            </span>
            <span className="rounded-full border border-emerald-700/30 bg-[#101c13]/90 px-2.5 py-1 text-[9px] font-bold text-emerald-400">
              memories waiting
            </span>
          </div>
        </div>

        <section
          aria-live="polite"
          aria-labelledby="selected-branch-title"
          className="rounded-2xl border border-amber-700/35 bg-[#1a0d07]/90 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">
                {selectedBranch.label}
              </p>
              <h2
                id="selected-branch-title"
                className="mt-1 text-xl font-black text-amber-100"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {selectedBranch.member}
              </h2>
              <p className="mt-1 text-[10px] font-bold text-amber-500/80">{selectedBranch.era}</p>
            </div>
            <TreePine className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-amber-200/75">{selectedBranch.detail}</p>
          <p className="mt-2 text-[10px] font-bold text-emerald-400/85">{selectedBranch.evidence}</p>
        </section>

        <p className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
          Select a branch to see what it remembers
        </p>

        <div className="grid grid-cols-3 gap-2" aria-label="Living Baobab features">
          {[
            { icon: BookOpen, label: "Stories", detail: "Hear what came before" },
            { icon: MapPin, label: "Places", detail: "Walk the family world" },
            { icon: HeartHandshake, label: "Kinship", detail: "Grow it together" },
          ].map(({ icon: Icon, label, detail }) => (
            <div
              key={label}
              className="rounded-xl border border-amber-900/40 bg-[#1a0d07]/85 p-2.5 text-center"
            >
              <Icon className="mx-auto mb-1.5 h-4 w-4 text-amber-500" aria-hidden="true" />
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-300">{label}</p>
              <p className="mt-1 text-[9px] leading-tight text-amber-700">{detail}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onEnter}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/70 bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-3.5 text-sm font-black text-[#241205] shadow-[0_8px_24px_rgba(214,158,46,0.2)] transition-all hover:from-amber-400 hover:to-yellow-300 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-[#0A0604]"
        >
          Live Their Story
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        <p className="text-center text-[10px] text-amber-700">
          Begin at the roots of the House of Mensah
        </p>
      </div>
    </section>
  );
}