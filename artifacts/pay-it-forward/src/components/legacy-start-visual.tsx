/**
 * LegacyStartVisual — Cinematic Niakofa Legacy Start Screen
 *
 * The full-screen Start Screen for the Niakofa Legacy RPG.
 * Shown when the user taps "Legacy" from the bottom nav or settings,
 * until they have input enough family data to start the Living Family Experience.
 *
 * Design matches the uploaded Niakofa panel reference:
 *  - Cinematic hero background (baobab tree sunset scene)
 *  - Gold "N" emblem + NIAKOFA title
 *  - CONTINUE YOUR JOURNEY (primary) + START NEW JOURNEY (secondary) buttons
 *  - Mode grid: Legacy Mode · Exploration · Family Quests · Reunion
 *  - Bottom icon row: Inventory · Journal · Map · Family · Quests · Settings
 *  - NO "Button States" section (removed per design update)
 *  - YOUR FAMILY WORLD section: world version, recent activity, Continue Journey
 */

import {
  Compass,
  CheckCircle2,
  Sparkles,
  Clapperboard,
} from "lucide-react";

// ─── Niakofa "N" Emblem (CSS/SVG recreation of the gold logo) ─────────────────

function NiakofaEmblem({ size = 72 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 40% 35%, rgba(214,158,46,0.18) 0%, rgba(10,6,4,0.98) 70%)",
        border: "2px solid rgba(214,158,46,0.6)",
        boxShadow: "0 0 0 4px rgba(214,158,46,0.12), 0 0 30px rgba(214,158,46,0.25), inset 0 0 20px rgba(0,0,0,0.6)",
      }}
    >
      {/* Ornate outer ring decoration */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "transparent",
          border: "1px solid rgba(214,158,46,0.25)",
          transform: "scale(1.08)",
          borderRadius: "50%",
        }}
      />
      {/* Inner decorative ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "transparent",
          border: "1px solid rgba(214,158,46,0.15)",
          transform: "scale(0.88)",
          borderRadius: "50%",
        }}
      />
      {/* N lettermark */}
      <span
        className="relative z-10 font-black select-none"
        style={{
          fontSize: size * 0.42,
          color: "transparent",
          background: "linear-gradient(160deg, #f5c842 0%, #d6a020 40%, #a87010 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          letterSpacing: "-0.02em",
          fontFamily: "'Georgia', 'Times New Roman', serif",
          textShadow: "none",
          filter: "drop-shadow(0 2px 6px rgba(214,158,46,0.5))",
        }}
      >
        N
      </span>
      {/* Tiny tree icon below the N */}
      <span
        className="absolute text-amber-500/60"
        style={{ bottom: size * 0.12, fontSize: size * 0.14 }}
        aria-hidden="true"
      >
        🌳
      </span>
    </div>
  );
}

// ─── World Activity Item ───────────────────────────────────────────────────────

function WorldActivityRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-200/80 leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LegacyStartVisualProps {
  familyName?: string | null;
  memberCount: number;
  memoryCount: number;
  isReady: boolean;
  hasJourney: boolean;
  onContinue: () => void;
  onStartBuilding: () => void;
  /** Optional: navigate to the public end-to-end demo */
  onDemo?: () => void;
  // World-state (shown in YOUR FAMILY WORLD card)
  worldVersion?: number | null;
  recentActivities?: string[];
  currentChapterNumber?: number | null;
  currentChapterTitle?: string | null;
  isAiUnlocked?: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LegacyStartVisual({
  familyName,
  memberCount,
  memoryCount,
  isReady,
  hasJourney,
  onContinue,
  onStartBuilding,
  onDemo,
  worldVersion,
  recentActivities = [],
  currentChapterNumber,
  currentChapterTitle,
  isAiUnlocked = false,
}: LegacyStartVisualProps) {
  const worldLabel = familyName?.trim() || "Your Family World";

  // Build the activity list for the YOUR FAMILY WORLD section
  const activities: string[] = recentActivities.length > 0
    ? recentActivities
    : [
        memberCount > 0 ? `${memberCount} family member${memberCount !== 1 ? "s" : ""} added` : "Add your first family member",
        memoryCount > 0 ? `${memoryCount} memor${memoryCount !== 1 ? "ies" : "y"} preserved` : "Add your first family memory",
      ].filter(Boolean);

  if (isAiUnlocked && currentChapterNumber && currentChapterTitle) {
    activities.push(`AI unlocked Chapter ${currentChapterNumber} "${currentChapterTitle}"`);
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)",
        minHeight: "auto",
      }}
    >
      {/* ── Hero section with cinematic background ──────────────────────────── */}
      <div className="relative w-full" style={{ minHeight: 340 }}>
        {/* Cinematic scene background */}
        <img
          src="/legacy-living-family-reference.png"
          alt="Niakofa Legacy — The Living Family Legacy Experience"
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{ opacity: 0.72 }}
        />
        {/* Gradient overlay: dark at top + bottom for text legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,6,4,0.55) 0%, rgba(10,6,4,0.1) 30%, rgba(10,6,4,0.1) 50%, rgba(10,6,4,0.92) 100%)",
          }}
        />
        {/* Subtle gold vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(214,158,46,0.12) 0%, transparent 60%)",
          }}
        />

        {/* ── Emblem + Title ── */}
        <div className="relative z-10 flex flex-col items-center pt-10 pb-6 px-4">
          <NiakofaEmblem size={80} />
          <h1
            className="mt-4 text-5xl font-black uppercase tracking-[0.12em] text-center"
            style={{
              color: "transparent",
              background: "linear-gradient(160deg, #f5c842 0%, #d6a020 45%, #a87010 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              textShadow: "none",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              filter: "drop-shadow(0 2px 12px rgba(214,158,46,0.5))",
            }}
          >
            NIAKOFA
          </h1>
          <p
            className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-center text-amber-300/90"
            style={{ letterSpacing: "0.22em" }}
          >
            The Living Family<br />Legacy Experience
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-500/60 text-center">
            Play. Discover. Preserve. Honor.
          </p>
        </div>
      </div>

      {/* ── Primary / Secondary buttons ─────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-2 pb-0 space-y-3">
        {/* CONTINUE YOUR JOURNEY — primary gold button (only if hasJourney) */}
        {hasJourney && (
          <button
            type="button"
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 px-5 transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #c8900a 0%, #d6a020 40%, #f5c842 100%)",
              boxShadow: "0 4px 24px rgba(214,158,46,0.35), 0 1px 0 rgba(255,255,255,0.12) inset",
              border: "1px solid rgba(245,200,66,0.4)",
            }}
          >
            {/* Tree icon */}
            <span className="text-lg leading-none" aria-hidden>🌳</span>
            <span
              className="text-sm font-black uppercase tracking-[0.18em]"
              style={{ color: "#1A0A00" }}
            >
              Continue Your Journey
            </span>
          </button>
        )}

        {/* START NEW JOURNEY — secondary dark button */}
        <button
          type="button"
          onClick={onStartBuilding}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 px-5 transition-all active:scale-[0.98]"
          style={{
            background: "rgba(20, 12, 4, 0.9)",
            boxShadow: "0 0 0 1px rgba(214,158,46,0.35), 0 4px 16px rgba(0,0,0,0.5)",
            border: "1px solid rgba(214,158,46,0.3)",
          }}
        >
          <Compass className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">
            {isReady ? "Start New Journey" : "Get Started"}
          </span>
        </button>

        {/* PLAY DEMO — amber outline button, always visible */}
        {onDemo && (
          <button
            type="button"
            onClick={onDemo}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-3 px-5 transition-all active:scale-[0.98]"
            style={{
              background: "transparent",
              border: "1px solid rgba(214,158,46,0.45)",
              boxShadow: "0 0 12px rgba(214,158,46,0.08)",
            }}
          >
            <Clapperboard className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-amber-500/90">
              Play Demo · House of Mensah
            </span>
          </button>
        )}
      </div>

      {/* Mode-selector grid and bottom icon nav intentionally removed (Aug 2026).
          They duplicated the hero CTAs above with a 10-button settings-style grid
          sitting directly between "Play Demo" and "Your Family World" — the actual
          reported cause of the hub feeling like a settings menu instead of a game
          entry point. Per ROOT_CAUSE_TWO_GAMES.md, Journal/Map/Quests/Reunion/etc.
          belong inside a live session as overlays (already true for Journal + Map
          in legacy-chapter.tsx, and Reunion in legacy-demo.tsx), not as a pre-game
          navigation grid. See LegacyChapterWorld / LegacyLivingWorld for the
          correct in-session overlay pattern. */}
      <div className="relative z-10 px-4 pt-4 pb-6">
        {/* Top divider */}
        <div
          className="w-full h-px mb-4"
          style={{
            background: "linear-gradient(to right, transparent, rgba(214,158,46,0.4), transparent)",
          }}
        />

        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(20, 12, 4, 0.92)",
            border: "1px solid rgba(214,158,46,0.28)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(214,158,46,0.08) inset",
          }}
        >
          {/* Card header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(214,158,46,0.15)" }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                Your Family World
              </span>
            </div>
            {worldVersion != null && worldVersion > 0 && (
              <span className="text-[10px] font-bold text-amber-500/70 bg-amber-900/30 px-2 py-0.5 rounded-full">
                Version {worldVersion}
              </span>
            )}
          </div>

          {/* World stats header line */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-xs font-semibold text-amber-200/60">
              {worldLabel}
              {worldVersion != null && worldVersion > 0 && (
                <span className="ml-1 text-amber-500/50">· World Version {worldVersion}</span>
              )}
            </p>
            <p className="text-[10px] text-amber-600/60 mt-0.5">New since yesterday</p>
          </div>

          {/* Activity list */}
          <div className="px-4 pb-3 space-y-2">
            {activities.length > 0 ? (
              activities.slice(0, 3).map((activity, i) => (
                <WorldActivityRow key={i} text={activity} />
              ))
            ) : (
              <p className="text-xs text-amber-700 italic">
                {isReady
                  ? "Your world is awakening. Play to unlock more."
                  : "Add family stories, members, and places to build your world."}
              </p>
            )}
          </div>

          {/* Chapter context (if available) */}
          {currentChapterNumber != null && currentChapterTitle && (
            <div
              className="px-4 py-2.5 mx-3 mb-3 rounded-xl"
              style={{
                background: "rgba(214,158,46,0.07)",
                border: "1px solid rgba(214,158,46,0.18)",
              }}
            >
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500/70 mb-0.5">
                {isAiUnlocked ? "✓ AI Unlocked" : "Current Chapter"}
              </p>
              <p className="text-xs font-bold text-amber-200">
                Chapter {currentChapterNumber}
              </p>
              <p className="text-[10px] text-amber-400/70 italic">
                "{currentChapterTitle}"
              </p>
            </div>
          )}

        </div>

        {/* Bottom divider */}
        <div
          className="w-full h-px mt-4"
          style={{
            background: "linear-gradient(to right, transparent, rgba(214,158,46,0.4), transparent)",
          }}
        />
      </div>
    </div>
  );
}
