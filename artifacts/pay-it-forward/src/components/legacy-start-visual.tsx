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
  Users,
  Package,
  BookOpen,
  Map,
  ClipboardList,
  Settings,
  CheckCircle2,
  Play,
  Sparkles,
  ChevronRight,
} from "lucide-react";

// ─── Mode icons ───────────────────────────────────────────────────────────────

const MODE_ICON_LEGACY = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const MODE_ICON_EXPLORATION = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
  </svg>
);

const MODE_ICON_QUESTS = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>
);

const MODE_ICON_REUNION = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
  </svg>
);

// ─── Niakofa "N" Emblem (CSS/SVG recreation of the gold logo) ─────────────────

function NiakofahEmblem({ size = 72 }: { size?: number }) {
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
  // World-state (shown in YOUR FAMILY WORLD card)
  worldVersion?: number | null;
  recentActivities?: string[];
  currentChapterNumber?: number | null;
  currentChapterTitle?: string | null;
  isAiUnlocked?: boolean;
  // Navigation callbacks for mode grid
  onLegacyMode?: () => void;
  onExploration?: () => void;
  onFamilyQuests?: () => void;
  onReunion?: () => void;
  // Bottom nav callbacks
  onInventory?: () => void;
  onJournal?: () => void;
  onMap?: () => void;
  onFamily?: () => void;
  onQuests?: () => void;
  onSettings?: () => void;
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
  worldVersion,
  recentActivities = [],
  currentChapterNumber,
  currentChapterTitle,
  isAiUnlocked = false,
  onLegacyMode,
  onExploration,
  onFamilyQuests,
  onReunion,
  onInventory,
  onJournal,
  onMap,
  onFamily,
  onQuests,
  onSettings,
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
          <NiakofahEmblem size={80} />
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
      </div>

      {/* ── Mode selector grid ──────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Legacy Mode",    Icon: MODE_ICON_LEGACY,      onClick: onLegacyMode   },
            { label: "Exploration",    Icon: MODE_ICON_EXPLORATION,  onClick: onExploration  },
            { label: "Family Quests",  Icon: MODE_ICON_QUESTS,       onClick: onFamilyQuests },
            { label: "Reunion",        Icon: MODE_ICON_REUNION,       onClick: onReunion      },
          ].map(({ label, Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-1.5 transition-all active:scale-95"
              style={{
                background: "rgba(20, 12, 4, 0.85)",
                border: "1px solid rgba(214,158,46,0.22)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              <span className="text-amber-400">
                <Icon />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300/80 text-center leading-tight">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom icon nav row ─────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <div className="flex items-center justify-around">
          {[
            { label: "Inventory", Icon: Package,       onClick: onInventory },
            { label: "Journal",   Icon: BookOpen,      onClick: onJournal   },
            { label: "Map",       Icon: Map,           onClick: onMap       },
            { label: "Family",    Icon: Users,         onClick: onFamily    },
            { label: "Quests",    Icon: ClipboardList, onClick: onQuests    },
            { label: "Settings",  Icon: Settings,      onClick: onSettings  },
          ].map(({ label, Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex flex-col items-center gap-1 transition-all active:scale-90"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(20, 12, 4, 0.85)",
                  border: "1px solid rgba(214,158,46,0.2)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                }}
              >
                <Icon className="w-4 h-4 text-amber-400" aria-hidden="true" />
              </div>
              <span className="text-[8px] font-bold uppercase tracking-wide text-amber-500/70">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── YOUR FAMILY WORLD section (replaces Button States) ─────────────── */}
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

          {/* Divider */}
          <div
            className="mx-4 h-px mb-3"
            style={{ background: "linear-gradient(to right, transparent, rgba(214,158,46,0.2), transparent)" }}
          />

          {/* Continue Journey CTA */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={hasJourney ? onContinue : onStartBuilding}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 transition-all active:scale-[0.98]"
              style={{
                background: hasJourney
                  ? "linear-gradient(135deg, #c8900a 0%, #d6a020 50%, #f5c842 100%)"
                  : "rgba(214,158,46,0.12)",
                border: hasJourney
                  ? "1px solid rgba(245,200,66,0.4)"
                  : "1px solid rgba(214,158,46,0.3)",
                boxShadow: hasJourney
                  ? "0 4px 20px rgba(214,158,46,0.3)"
                  : "none",
              }}
            >
              {hasJourney
                ? <Play className="w-4 h-4" style={{ color: "#1A0A00" }} />
                : <ChevronRight className="w-4 h-4 text-amber-400" />
              }
              <span
                className="text-xs font-black uppercase tracking-[0.18em]"
                style={{ color: hasJourney ? "#1A0A00" : "rgba(214,158,46,0.8)" }}
              >
                {hasJourney ? "Continue Journey" : isReady ? "Begin Journey" : "Build Your World"}
              </span>
            </button>
          </div>
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
