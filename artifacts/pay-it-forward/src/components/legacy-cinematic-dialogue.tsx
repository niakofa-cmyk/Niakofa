/**
 * LegacyCinematicDialogue — cinematic RPG chapter dialogue panel
 *
 * Visual Runtime Bible requirements:
 * - Typewriter text reveal (immersive, not instant)
 * - Character portrait area with NPC avatar
 * - Cinematic ambient sky per season/chapter
 * - Choice buttons with trait icons and value indicators
 * - NPC memory callback — NPCs recall earlier player choices
 */

import { useState, useEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { DemoSeason } from "@/lib/legacy-demo-state";

// ── Typewriter hook ────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 20, enabled = true) {
  const [displayed, setDisplayed] = useState(enabled ? "" : text);
  const [done, setDone] = useState(!enabled);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed("");
    setDone(false);
    indexRef.current = 0;
    const id = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        setDone(true);
        clearInterval(id);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, enabled]);

  return { displayed, done };
}

// ── Season/chapter atmosphere ──────────────────────────────────────────────────

const SEASON_ATMO: Record<string, {
  skyGrad: string;
  glowColor: string;
  accent: string;
  cloudOpacity: number;
}> = {
  dry: {
    skyGrad: "linear-gradient(160deg, #3d2008 0%, #2a1206 50%, #0d0604 100%)",
    glowColor: "rgba(245,200,66,0.14)",
    accent: "#f5c842",
    cloudOpacity: 0.07,
  },
  harvest: {
    skyGrad: "linear-gradient(160deg, #4a2706 0%, #2d1a06 50%, #0d0804 100%)",
    glowColor: "rgba(244,151,70,0.16)",
    accent: "#f09a4b",
    cloudOpacity: 0.1,
  },
  rain: {
    skyGrad: "linear-gradient(160deg, #1a2b3d 0%, #0f1e2a 50%, #070e16 100%)",
    glowColor: "rgba(107,174,214,0.14)",
    accent: "#6baed6",
    cloudOpacity: 0.22,
  },
  celebration: {
    skyGrad: "linear-gradient(160deg, #3d1c08 0%, #291207 50%, #0d0604 100%)",
    glowColor: "rgba(255,159,67,0.2)",
    accent: "#ff9f43",
    cloudOpacity: 0.06,
  },
};

// ── NPC avatar config ──────────────────────────────────────────────────────────

const NPC_AVATARS: Record<string, { emoji: string; name: string; color: string }> = {
  grandma: { emoji: "👵🏾", name: "Grandma Ama", color: "#c4773a" },
  uncle: { emoji: "👴🏾", name: "Uncle Kofi", color: "#8b5a2b" },
  cousin: { emoji: "👩🏾", name: "Cousin Afia", color: "#b06a30" },
  kwame: { emoji: "👦🏾", name: "Kwame Mensah", color: "#9a5020" },
  elder: { emoji: "🧓🏾", name: "Village Elder", color: "#7a4418" },
};

const TRAIT_META: Record<string, { icon: string; color: string }> = {
  Wisdom:     { icon: "📖", color: "#7ec8e3" },
  Leadership: { icon: "🦁", color: "#f5c842" },
  Compassion: { icon: "❤️", color: "#f08080" },
  Courage:    { icon: "⚔️", color: "#e8862e" },
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CinematicChapter {
  id: string;
  number?: number;
  title: string;
  era: string;
  description: string;
  choices?: Array<{ label: string; trait: string; value: number }>;
  outcome?: string;
}

interface LegacyCinematicDialogueProps {
  chapter: CinematicChapter;
  season: DemoSeason;
  traits: Record<string, number>;
  npcMemory: Array<{ npcName: string; remembers: string }>;
  onChoice: (trait: string, value: number) => void;
  /** NPC speaker shown alongside the chapter description. Default: grandma */
  npcKey?: keyof typeof NPC_AVATARS;
  /** Animate typewriter. Disable when restoring a saved state mid-demo. */
  animate?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LegacyCinematicDialogue({
  chapter,
  season,
  traits,
  npcMemory,
  onChoice,
  npcKey = "grandma",
  animate = true,
}: LegacyCinematicDialogueProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [showChoices, setShowChoices] = useState(!animate);
  const atmo = SEASON_ATMO[season] ?? SEASON_ATMO.dry;
  const npc = NPC_AVATARS[npcKey] ?? NPC_AVATARS.grandma;

  const { displayed: mainText, done: mainDone } = useTypewriter(
    chapter.description,
    17,
    animate,
  );

  // Memory hint shown if grandma remembers something from this chapter
  const memHint = npcMemory.find(m =>
    m.remembers.includes("Chapter") || m.remembers.includes("chose"),
  );

  useEffect(() => {
    if (!mainDone) return;
    const t = setTimeout(() => setShowChoices(true), animate ? 340 : 0);
    return () => clearTimeout(t);
  }, [mainDone, animate]);

  // Reset when chapter changes
  useEffect(() => {
    setChosen(null);
    setShowChoices(!animate);
  }, [chapter.id, animate]);

  const handleChoice = (idx: number) => {
    if (chosen !== null) return;
    setChosen(idx);
    const c = chapter.choices?.[idx];
    if (c) setTimeout(() => onChoice(c.trait, c.value), 900);
  };

  const skipTypewriter = () => {
    if (!animate || mainDone) return;
    setShowChoices(true);
  };

  return (
    <div className="space-y-4 animate-[fadeInUp_0.45s_ease-out]">

      {/* ── Cinematic scene header ────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl border border-amber-800/30"
        style={{ background: atmo.skyGrad, boxShadow: `0 0 48px ${atmo.glowColor}` }}
        onClick={skipTypewriter}
        role="presentation"
      >
        {/* Atmospheric clouds / weather overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{ opacity: atmo.cloudOpacity }}
        >
          <div
            className="absolute top-2 left-4 h-4 w-24 rounded-full blur-xl"
            style={{ background: atmo.accent }}
          />
          <div
            className="absolute top-5 left-20 h-3 w-16 rounded-full blur-xl"
            style={{ background: atmo.accent }}
          />
          {season === "rain" && (
            <>
              <div className="absolute inset-0 legacy-rain-lines" aria-hidden="true" />
            </>
          )}
        </div>

        {/* Horizon sun/moon glow */}
        <div
          className="pointer-events-none absolute -right-4 top-2 h-16 w-16 rounded-full blur-2xl"
          aria-hidden="true"
          style={{ background: atmo.accent, opacity: 0.22 }}
        />

        <div className="relative p-5">
          {/* Chapter label */}
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.22em]"
              style={{
                background: `${atmo.accent}1a`,
                color: atmo.accent,
                border: `1px solid ${atmo.accent}40`,
              }}
            >
              {chapter.number !== undefined ? `Chapter ${chapter.number}` : "Prologue"} · {chapter.era}
            </span>
          </div>

          <h2
            className="mb-4 text-xl font-black leading-tight text-amber-100"
            style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.45)" }}
          >
            {chapter.title}
          </h2>

          {/* Typewriter description */}
          <p
            className="min-h-[80px] text-sm leading-relaxed text-amber-200/90 cursor-default"
            title={animate && !mainDone ? "Tap to skip text" : undefined}
          >
            {mainText}
            {animate && !mainDone && (
              <span className="ml-0.5 inline-block w-0.5 h-4 bg-amber-400 animate-pulse align-middle" aria-hidden="true" />
            )}
          </p>

          {animate && !mainDone && (
            <p className="mt-2 text-[9px] text-amber-700 italic">Tap to skip…</p>
          )}
        </div>
      </div>

      {/* ── NPC memory hint ───────────────────────────────────────────────── */}
      {memHint && mainDone && (
        <div className="flex items-start gap-2.5 animate-[fadeInUp_0.4s_ease-out]">
          <div
            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border-2 text-base"
            style={{
              borderColor: `${npc.color}60`,
              background: `radial-gradient(circle, ${npc.color}20 0%, rgba(10,6,4,0.9) 100%)`,
            }}
            aria-hidden="true"
          >
            {npc.emoji}
          </div>
          <div className="flex-1 rounded-2xl rounded-tl-sm border border-amber-700/25 bg-amber-950/50 px-4 py-3">
            <p
              className="mb-1 text-[9px] font-black uppercase tracking-wide"
              style={{ color: npc.color }}
            >
              {npc.name} remembers
            </p>
            <p className="text-[11px] italic leading-relaxed text-amber-300/80">
              "{memHint.remembers}"
            </p>
          </div>
        </div>
      )}

      {/* ── Trait overview pills ──────────────────────────────────────────── */}
      {mainDone && (
        <div className="flex flex-wrap gap-1.5 animate-[fadeIn_0.4s_ease-out]">
          {Object.entries(traits).slice(0, 4).map(([k, v]) => {
            const meta = TRAIT_META[k] ?? { icon: "✦", color: "#f5c842" };
            return (
              <div
                key={k}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                style={{ borderColor: `${meta.color}30`, background: `${meta.color}10` }}
              >
                <span className="text-[11px]" aria-hidden="true">{meta.icon}</span>
                <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: meta.color }}>
                  {k}
                </span>
                <span className="text-[9px] font-bold tabular-nums text-amber-400">{Math.min(v, 100)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Choices ───────────────────────────────────────────────────────── */}
      {chapter.choices && showChoices && chosen === null && (
        <div className="space-y-2 animate-[fadeInUp_0.4s_ease-out]">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Choose your path</p>
          {chapter.choices.map((c, i) => {
            const meta = TRAIT_META[c.trait] ?? { icon: "✦", color: "#f5c842" };
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleChoice(i)}
                className="group w-full rounded-xl border border-amber-800/40 bg-[#21140b] p-3.5 text-left transition-all hover:border-amber-600/50 hover:bg-amber-950/40 active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition-all group-hover:scale-105"
                    style={{
                      borderColor: `${meta.color}40`,
                      background: `${meta.color}15`,
                    }}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm text-amber-200 group-hover:text-amber-100 transition-colors">
                      {c.label}
                    </span>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: meta.color, opacity: 0.75 }}
                    >
                      +{c.value} {c.trait}
                    </span>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    style={{ color: meta.color, opacity: 0.6 }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Outcome (after choice) ────────────────────────────────────────── */}
      {chosen !== null && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 p-4 animate-[fadeIn_0.3s_ease-out]">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-400" />
            <p className="text-xs font-black uppercase tracking-wide text-amber-400">Choice made</p>
          </div>
          <p className="text-sm italic text-amber-200/90">{chapter.choices?.[chosen]?.label}</p>
          {chapter.choices?.[chosen] && (
            <p className="mt-1.5 text-[10px] text-amber-600">
              <span aria-hidden="true">
                {TRAIT_META[chapter.choices[chosen].trait]?.icon ?? "✦"}
              </span>{" "}
              +{chapter.choices[chosen].value} {chapter.choices[chosen].trait}
            </p>
          )}
          {chapter.outcome && (
            <p className="mt-3 border-t border-amber-800/30 pt-3 text-xs leading-relaxed text-amber-300/80">
              <Sparkles className="mr-1 inline h-3 w-3 text-amber-500" aria-hidden="true" />
              {chapter.outcome}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
