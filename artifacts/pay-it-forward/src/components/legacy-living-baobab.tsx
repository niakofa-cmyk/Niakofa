import { ArrowRight, BookOpen, HeartHandshake, MapPin, Sparkles, TreePine } from "lucide-react";

interface LegacyLivingBaobabProps {
  worldVersion: number;
  onEnter: () => void;
}

/**
 * The public demo's home screen. The Baobab is deliberately a lightweight
 * entry surface rather than a second navigation system: the existing golden
 * path remains the source of truth once the player enters the story.
 */
export function LegacyLivingBaobab({ worldVersion, onEnter }: LegacyLivingBaobabProps) {
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

          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
            <span className="rounded-full border border-amber-700/30 bg-[#1d120a]/90 px-2.5 py-1 text-[9px] font-bold text-amber-500">
              4 branches
            </span>
            <span className="rounded-full border border-emerald-700/30 bg-[#101c13]/90 px-2.5 py-1 text-[9px] font-bold text-emerald-400">
              memories waiting
            </span>
          </div>
        </div>

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