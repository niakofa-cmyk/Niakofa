/**
 * LegacyGameHud — RPG HUD overlay for the House of Mensah demo.
 *
 * Design brief: Makes it feel like a real RPG.
 * Shows:
 * - Life Skills bar (Storytelling, Farming, Leadership, Negotiation, Cultural Knowledge)
 * - Active quest mini-panel with current objective
 * - Season + game-world time
 * - NPC proximity indicator
 * - Chapter/World Version badge
 *
 * Not combat stats — legacy stats.
 * "The primary enemy is forgetting."
 */

import { useState } from "react";
import { BookOpen, Leaf, Users, MessageCircle, Sparkles, Clock, ChevronDown, ChevronUp, Target, type LucideIcon } from "lucide-react";
import type { DemoPhase, DemoSeason } from "@/lib/legacy-demo-state";
import type { QuestDefinition } from "@/lib/legacy-quest-system";
import { formatGameHour } from "@/lib/legacy-npc-system";

// ── Life Skills ──────────────────────────────────────────────────────────────────

export interface LifeSkills {
  storytelling: number;   // max 100 — oral history ability
  farming: number;        // cocoa/land knowledge
  leadership: number;     // community standing
  negotiation: number;    // trading/business acumen
  culturalWisdom: number; // ancestral knowledge
}

export const DEFAULT_LIFE_SKILLS: LifeSkills = {
  storytelling: 0,
  farming: 0,
  leadership: 0,
  negotiation: 0,
  culturalWisdom: 0,
};

const SKILL_META: Array<{
  key: keyof LifeSkills;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  color: string;
  tip: string;
}> = [
  { key: "storytelling", label: "Storytelling", shortLabel: "Story", icon: MessageCircle, color: "#f5c842", tip: "Oral history skill — grows through NPC conversations" },
  { key: "farming", label: "Farming", shortLabel: "Farm", icon: Leaf, color: "#68b04a", tip: "Land knowledge — grows through harvest quests" },
  { key: "leadership", label: "Leadership", shortLabel: "Lead", icon: Users, color: "#6baed6", tip: "Community standing — grows through decisions" },
  { key: "negotiation", label: "Negotiation", shortLabel: "Trade", icon: Sparkles, color: "#f09a4b", tip: "Trading acumen — grows through market interactions" },
  { key: "culturalWisdom", label: "Cultural Wisdom", shortLabel: "Wisdom", icon: BookOpen, color: "#b09ae0", tip: "Ancestral knowledge — grows through elder conversations" },
];

// ── Season display ────────────────────────────────────────────────────────────────

const SEASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  dry:         { label: "Dry Season", icon: "☀️", color: "#f5c842" },
  harvest:     { label: "Harvest", icon: "🌾", color: "#f09a4b" },
  rain:        { label: "Rain Season", icon: "🌧️", color: "#6baed6" },
  celebration: { label: "Celebration", icon: "🎊", color: "#ff9f43" },
};

const PHASE_LABELS: Record<string, string> = {
  prologue: "Prologue",
  chapter1: "Ch. 1",
  chapter2: "Ch. 2",
  chapter3: "Ch. 3",
  chapter4: "Ch. 4",
  chapter5: "Ch. 5",
  chapter6: "Ch. 6",
  kitchen: "Kitchen",
  business: "Business",
  mystery: "Mystery",
  "world-regen": "Regen",
  "coop-quest": "Co-op",
  reunion: "Reunion",
  finale: "Finale",
};

// ── Skill Bar component ────────────────────────────────────────────────────────────

function SkillBar({
  label,
  value,
  color,
  icon: Icon,
  tip,
}: {
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
  tip: string;
}) {
  const pct = Math.min(value, 100);
  return (
    <div className="group flex items-center gap-2" title={tip}>
      <Icon className="h-3 w-3 shrink-0" style={{ color }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-[8px] font-black uppercase tracking-wide" style={{ color, opacity: 0.85 }}>
            {label}
          </p>
          <p className="text-[8px] font-bold tabular-nums text-amber-600">{pct}</p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-amber-950/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}60` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── NPC proximity indicator ────────────────────────────────────────────────────────

function NpcProximityBadge({ npcName, activity }: { npcName: string; activity: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-700/30 bg-amber-950/60 px-2.5 py-1.5 animate-[fadeIn_0.3s_ease-out]">
      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[8px] font-black text-amber-400 uppercase tracking-wide truncate">{npcName}</p>
        <p className="text-[8px] text-amber-700 truncate italic">{activity}</p>
      </div>
      <p className="text-[7px] font-black uppercase tracking-wide text-amber-600 shrink-0">Nearby</p>
    </div>
  );
}

// ── Active quest panel ──────────────────────────────────────────────────────────────

function ActiveQuestPanel({
  quest,
  currentObjectiveIdx,
}: {
  quest: QuestDefinition;
  currentObjectiveIdx: number;
}) {
  const obj = quest.objectives[currentObjectiveIdx];
  const progress = quest.objectives.filter((_, i) => i < currentObjectiveIdx).length;
  const total = quest.objectives.length;

  return (
    <div className="rounded-xl border border-amber-700/30 bg-amber-950/60 p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm" aria-hidden="true">{quest.icon}</span>
            <p className="text-[8px] font-black uppercase tracking-widest text-amber-600">Quest</p>
          </div>
          <p className="text-[11px] font-black text-amber-200 leading-tight">{quest.title}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[8px] tabular-nums text-amber-600">{progress}/{total}</p>
          <p className="text-[7px] text-amber-800">objectives</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-amber-950/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400/60 transition-all duration-500"
          style={{ width: `${(progress / total) * 100}%` }}
        />
      </div>

      {/* Current objective */}
      {obj && (
        <div className="flex items-start gap-2">
          <Target className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <div>
            <p className="text-[9px] font-bold text-amber-300">{obj.label}</p>
            <p className="text-[8px] text-amber-600 leading-snug">{obj.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main HUD ──────────────────────────────────────────────────────────────────────

interface LegacyGameHudProps {
  phase: DemoPhase;
  season: DemoSeason;
  worldVersion: number;
  gameHour: number;
  skills: LifeSkills;
  traits: Record<string, number>;
  activeQuest: QuestDefinition | null;
  questObjectiveIdx: number;
  nearbyNpcs: Array<{ name: string; activity: string }>;
  /** Whether the HUD is expanded (shows all skills) */
  defaultExpanded?: boolean;
}

export function LegacyGameHud({
  phase,
  season,
  worldVersion,
  gameHour,
  skills,
  traits,
  activeQuest,
  questObjectiveIdx,
  nearbyNpcs,
  defaultExpanded = false,
}: LegacyGameHudProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const seasonInfo = SEASON_LABELS[season] ?? SEASON_LABELS.dry;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 space-y-2">
      {/* ── Top status bar ── */}
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-amber-800/30 px-3 py-2"
        style={{ background: "rgba(13,8,4,0.88)", backdropFilter: "blur(8px)" }}
      >
        {/* Phase badge */}
        <span className="rounded-full bg-amber-900/60 border border-amber-700/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-400">
          {PHASE_LABELS[phase] ?? phase}
        </span>

        {/* Season */}
        <div className="flex items-center gap-1">
          <span className="text-xs" aria-hidden="true">{seasonInfo.icon}</span>
          <p className="text-[8px] font-bold text-amber-600">{seasonInfo.label}</p>
        </div>

        <div className="flex-1" />

        {/* Game time */}
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-amber-700" aria-hidden="true" />
          <p className="text-[8px] font-black tabular-nums text-amber-600">{formatGameHour(gameHour)}</p>
        </div>

        {/* World version */}
        {worldVersion > 1 && (
          <span className="rounded-full bg-emerald-950/70 border border-emerald-700/30 px-1.5 py-0.5 text-[7px] font-black uppercase text-emerald-400">
            v{worldVersion}
          </span>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          className="flex items-center gap-1 text-amber-700 hover:text-amber-400 transition-colors"
          onClick={() => setExpanded(e => !e)}
          aria-label={expanded ? "Collapse HUD" : "Expand HUD"}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ── Expanded HUD panel ── */}
      {expanded && (
        <div
          className="pointer-events-auto space-y-2 rounded-2xl border border-amber-800/25 p-3 animate-[fadeInUp_0.3s_ease-out]"
          style={{ background: "rgba(13,8,4,0.88)", backdropFilter: "blur(8px)" }}
        >
          {/* Active quest */}
          {activeQuest && (
            <ActiveQuestPanel quest={activeQuest} currentObjectiveIdx={questObjectiveIdx} />
          )}

          {/* Life Skills */}
          <div>
            <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">Life Skills</p>
            <div className="grid grid-cols-1 gap-1.5">
              {SKILL_META.map(({ key, label, icon, color, tip }) => (
                <SkillBar
                  key={key}
                  label={label}
                  value={skills[key]}
                  color={color}
                  icon={icon}
                  tip={tip}
                />
              ))}
            </div>
          </div>

          {/* Traits compact */}
          <div>
            <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">Character Traits</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(traits).slice(0, 4).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <div className="h-1 flex-1 rounded-full bg-amber-950/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400/50 transition-all duration-500"
                      style={{ width: `${Math.min(v, 100)}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-amber-600 shrink-0 w-12 truncate">{k} {Math.min(v, 100)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NPC proximity badges (always visible when NPCs nearby) ── */}
      {nearbyNpcs.length > 0 && (
        <div className="pointer-events-auto flex flex-col gap-1">
          {nearbyNpcs.slice(0, 2).map(n => (
            <NpcProximityBadge key={n.name} npcName={n.name} activity={n.activity} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Life Skills calculator ─────────────────────────────────────────────────────────

/** Calculate life skills from demo state traits + NPC interactions */
export function deriveLifeSkills(
  traits: Record<string, number>,
  npcInteractionCount: number,
  questsCompleted: number,
  artifactsPlaced: number,
): LifeSkills {
  return {
    storytelling: Math.min(100, Math.round((traits.Wisdom ?? 0) * 0.7 + npcInteractionCount * 3 + questsCompleted * 5)),
    farming:      Math.min(100, Math.round((traits.Compassion ?? 0) * 0.5 + artifactsPlaced * 4)),
    leadership:   Math.min(100, Math.round((traits.Leadership ?? 0) * 0.9 + questsCompleted * 6)),
    negotiation:  Math.min(100, Math.round((traits.Courage ?? 0) * 0.6 + npcInteractionCount * 2)),
    culturalWisdom: Math.min(100, Math.round(
      ((traits.Wisdom ?? 0) + (traits.Compassion ?? 0)) * 0.4 + questsCompleted * 4,
    )),
  };
}
