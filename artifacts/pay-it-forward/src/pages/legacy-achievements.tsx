/**
 * Legacy Achievements — Achievement & Skill Tree System
 * Route: /legacy/achievements
 *
 * Tracks user progress through 8 legacy achievements from the
 * Living Family Legacy Experience design document. Progress and unlock
 * state are computed server-side from real per-family vault/gameplay data
 * and persisted in legacy_achievements — see
 * artifacts/api-server/src/routes/legacy-achievements.ts.
 *
 * Achievement keys, goals, and categories MUST match the backend CATALOG
 * exactly — the backend is the source of truth for progress computation.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Trophy, BookOpen, Mic, Users, Camera, MapPin,
  Compass, CheckCircle2, Lock, ChevronRight,
  Sparkles, TreePine, Archive, GraduationCap, Heart, Loader2,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

// Shape returned by GET /api/legacy/achievements/:familyId — real, persisted
// per-family progress (see artifacts/api-server/src/routes/legacy-achievements.ts).
interface BackendAchievement {
  achievement_key: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

// ── Achievement definitions ──────────────────────────────────────────────────
// Achievements are categorized by how they unlock:
//   vault_prompt   — unlocked by adding data to the Family Vault
//   reconnection   — unlocked by reconnecting with relatives
//   gameplay       — unlocked by playing Legacy Mode chapters
//   preservation   — unlocked by preserving stories/interviews
// Progress/unlock state for all 8 comes from the real backend endpoint;
// icon/color/hint/href below are presentation-only.
//
// IMPORTANT: `id` must match the backend `key` in CATALOG exactly, and `goal`
// must match the backend `goal` — otherwise the progress bar will be wrong.

interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  hint: string;
  icon: typeof BookOpen;
  color: string;
  bg: string;
  border: string;
  dot: string;
  goal: number;
  href: string;
  category: "vault_prompt" | "reconnection" | "gameplay" | "preservation";
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "memory_keeper",
    title: "Memory Keeper",
    desc: "Preserve 5 family memories in the vault.",
    hint: "Add photos, stories, and documents to your Family Vault.",
    icon: BookOpen,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    dot: "bg-amber-400",
    goal: 5,
    href: "/diaspora/family",
    category: "vault_prompt",
  },
  {
    id: "family_detective",
    title: "Family Detective",
    desc: "Connect 10 family relationships in the tree.",
    hint: "Add parents, grandparents, and great-grandparents to your tree.",
    icon: Compass,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/25",
    dot: "bg-teal-400",
    goal: 10,
    href: "/diaspora/tree",
    category: "vault_prompt",
  },
  {
    id: "bridge_builder",
    title: "Bridge Builder",
    desc: "Connect 3 family members in the tree.",
    hint: "Add family members and link them with relationships.",
    icon: Users,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/25",
    dot: "bg-teal-400",
    goal: 3,
    href: "/diaspora/family",
    category: "reconnection",
  },
  {
    id: "roots_traveler",
    title: "Roots Traveler",
    desc: "Visit 10 family landmarks in person and check in.",
    hint: "Visit family landmarks and use GPS check-in to discover them.",
    icon: MapPin,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/25",
    dot: "bg-green-400",
    goal: 10,
    href: "/legacy/map",
    category: "gameplay",
  },
  {
    id: "legacy_guardian",
    title: "Legacy Guardian",
    desc: "Preserve 3 family artifacts (photos, documents).",
    hint: "Upload photos, letters, and historical documents.",
    icon: Archive,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/25",
    dot: "bg-sky-400",
    goal: 3,
    href: "/diaspora/family",
    category: "preservation",
  },
  {
    id: "voice_of_elders",
    title: "Voice of the Elders",
    desc: "Publish 2 family interviews.",
    hint: "Use the Oral History recorder in your Family Vault.",
    icon: Mic,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/25",
    dot: "bg-orange-400",
    goal: 2,
    href: "/diaspora/family",
    category: "preservation",
  },
  {
    id: "memory_restorer",
    title: "Memory Restorer",
    desc: "Upload 5 photos to family memories.",
    hint: "Upload old family photos to bring them back to life.",
    icon: Camera,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/25",
    dot: "bg-rose-400",
    goal: 5,
    href: "/diaspora/family",
    category: "vault_prompt",
  },
  {
    id: "ancestor_walker",
    title: "Ancestor Walker",
    desc: "Complete 3 Legacy chapters.",
    hint: "Play Legacy Mode chapters to walk in your ancestors' footsteps.",
    icon: GraduationCap,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/25",
    dot: "bg-emerald-400",
    goal: 3,
    href: "/legacy/start",
    category: "gameplay",
  },
];

// ── Skill Tree ────────────────────────────────────────────────────────────
// Each skill maps to a specific achievement. A skill is unlocked when its
// corresponding achievement is unlocked — no more hardcoded unlocks.
const SKILL_TREE: { label: string; icon: typeof BookOpen; achievementKey: string; color: string }[] = [
  { label: "Historian",         icon: BookOpen,       achievementKey: "memory_keeper",    color: "text-amber-400" },
  { label: "Explorer",          icon: Compass,        achievementKey: "family_detective", color: "text-teal-400" },
  { label: "Story Keeper",      icon: Heart,          achievementKey: "voice_of_elders",  color: "text-rose-400" },
  { label: "Photographer",      icon: Camera,         achievementKey: "memory_restorer",  color: "text-sky-400" },
  { label: "Interviewer",       icon: Mic,            achievementKey: "voice_of_elders",  color: "text-orange-400" },
  { label: "Archivist",         icon: Archive,        achievementKey: "legacy_guardian",  color: "text-purple-400" },
  { label: "Genealogist",       icon: TreePine,       achievementKey: "family_detective", color: "text-emerald-400" },
  { label: "Community Builder", icon: Users,          achievementKey: "bridge_builder",   color: "text-blue-400" },
];

// ── Legacy Inventory ─────────────────────────────────────────────────────
// Inventory items map to real backend achievement keys. When the achievement
// is unlocked, the item shows as collected. Partial progress is shown live.
const INVENTORY_ITEMS: { achievementKey: string; label: string; icon: string; desc: string }[] = [
  { achievementKey: "memory_keeper",    label: "Family Storybook",     icon: "📖", desc: "A collection of preserved family memories" },
  { achievementKey: "family_detective", label: "Family Tree Scroll",   icon: "🌳", desc: "Your mapped family relationships and lineage" },
  { achievementKey: "bridge_builder",   label: "Reunion Quilt",        icon: "🧵", desc: "Connecting family members across distances" },
  { achievementKey: "roots_traveler",   label: "Migration Map",        icon: "🗺️", desc: "A map of your family's journey across lands" },
  { achievementKey: "legacy_guardian",   label: "Heritage Archive",     icon: "🗄️", desc: "Preserved photos and historical documents" },
  { achievementKey: "voice_of_elders",   label: "Elder's Voice Recording", icon: "🎙️", desc: "Oral history interviews with family elders" },
  { achievementKey: "memory_restorer",   label: "Restored Photograph", icon: "🖼️", desc: "Old family photos brought back to life" },
  { achievementKey: "ancestor_walker",   label: "Ancestor's Walking Stick", icon: "🦯", desc: "Earned by completing Legacy chapters" },
];

export default function LegacyAchievementsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [backendAch, setBackendAch] = useState<BackendAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"achievements" | "skills" | "inventory">("achievements");

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      fetch("/api/family/mine", { headers: authHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => d?.families?.[0]?.id)
        .then(famId => famId ? fetch(`/api/legacy/achievements/${famId}`, { headers: authHeaders() }) : Promise.reject())
        .then(r => r?.ok ? r.json() : Promise.reject())
        .then(d => setBackendAch(d?.achievements ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Sign in to view achievements</p>
      </div>
    );
  }

  // Build a lookup from backend data
  const backendMap: Map<string, BackendAchievement> = new Map(backendAch.map(a => [a.achievement_key, a]));

  const unlockedCount = ACHIEVEMENTS.filter(a => {
    const backend = backendMap.get(a.id);
    return backend ? backend.unlocked : false;
  }).length;

  const overallPct = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100);

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Achievements
            </h1>
            <p className="text-xs text-muted-foreground">Your legacy milestones</p>
          </div>
          {!loading && (
            <div className="text-right">
              <p className="text-sm font-bold text-amber-400">{unlockedCount}/{ACHIEVEMENTS.length}</p>
              <p className="text-[10px] text-muted-foreground">unlocked</p>
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1a1000] via-[#2a1800] to-[#1a1000] border-b border-amber-900/30">
        <div className="max-w-lg mx-auto px-4 py-6">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400/50" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-amber-400/60 uppercase tracking-wider font-medium">Legacy Progress</p>
                  <p className="text-lg font-bold text-amber-200 mt-0.5">
                    {overallPct}% Complete
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-amber-300">{unlockedCount}</p>
                  <p className="text-xs text-amber-400/60">of {ACHIEVEMENTS.length} earned</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-amber-400/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${overallPct}%`, transition: "width 1.2s ease" }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[57px] z-10 bg-background border-b border-border">
        <div className="max-w-lg mx-auto flex">
          {(["achievements", "skills", "inventory"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-amber-400 border-b-2 border-amber-400"
                  : "text-muted-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">

        {/* ── Achievements tab ─────────────────────────────────────────── */}
        {activeTab === "achievements" && (
          <div className="space-y-3">
            {ACHIEVEMENTS.map(ach => {
              const Icon = ach.icon;
              const backend = backendMap.get(ach.id);
              const current = backend?.progress ?? 0;
              const pct = Math.min(100, Math.round((current / ach.goal) * 100));
              const unlocked = backend?.unlocked ?? false;
              return (
                <button
                  key={ach.id}
                  onClick={() => navigate(ach.href)}
                  className={`w-full text-left rounded-2xl border p-4 active:opacity-70 transition-all ${
                    unlocked
                      ? `${ach.bg} ${ach.border}`
                      : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${ach.bg} flex items-center justify-center flex-shrink-0`}>
                      {unlocked ? (
                        <CheckCircle2 className="w-5 h-5 text-amber-400" />
                      ) : (
                        <Icon className={`w-5 h-5 ${ach.color}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-foreground">{ach.title}</p>
                        {unlocked && (
                          <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded-full font-bold">
                            EARNED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{ach.desc}</p>
                      {!unlocked && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1 italic">{ach.hint}</p>
                      )}
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{current} / {ach.goal}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ach.dot}`}
                            style={{ width: `${pct}%`, opacity: unlocked ? 1 : 0.6, transition: "width 1s ease" }}
                          />
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Skill tree tab ────────────────────────────────────────────── */}
        {activeTab === "skills" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              Unlock skills by completing achievements. Each skill reveals new abilities.
            </p>
            <div className="space-y-2">
              {SKILL_TREE.map((skill, i) => {
                const Icon = skill.icon;
                const backend = backendMap.get(skill.achievementKey);
                const unlocked = backend?.unlocked ?? false;
                const progress = backend?.progress ?? 0;
                const goal = backend?.goal ?? 1;
                return (
                  <div key={skill.label} className="flex items-center gap-3">
                    {/* Connector line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        unlocked ? "bg-amber-400/15 border border-amber-400/30" : "bg-muted border border-border"
                      }`}>
                        {unlocked
                          ? <Icon className={`w-4 h-4 ${skill.color}`} />
                          : <Lock className="w-3.5 h-3.5 text-muted-foreground/40" />
                        }
                      </div>
                      {i < SKILL_TREE.length - 1 && (
                        <div className={`w-0.5 h-4 mt-1 ${unlocked ? "bg-amber-400/30" : "bg-border"}`} />
                      )}
                    </div>
                    <div className={`flex-1 p-3 rounded-xl border ${
                      unlocked ? "bg-amber-400/5 border-amber-400/20" : "bg-card border-border opacity-50"
                    }`}>
                      <p className={`text-sm font-medium ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                        {skill.label}
                      </p>
                      {!unlocked && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {progress > 0
                            ? `${progress} / ${goal} progress — keep going!`
                            : "Complete the linked achievement to unlock"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Inventory tab ─────────────────────────────────────────────── */}
        {activeTab === "inventory" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              Legacy collectibles — earned through preservation and discovery.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {INVENTORY_ITEMS.map(item => {
                const backend = backendMap.get(item.achievementKey);
                const earned = backend?.unlocked ?? false;
                const progress = backend?.progress ?? 0;
                const goal = backend?.goal ?? 1;
                return (
                  <div
                    key={item.achievementKey}
                    className={`p-4 rounded-xl border text-center ${
                      earned
                        ? "bg-amber-400/5 border-amber-400/20"
                        : "bg-card border-border opacity-40"
                    }`}
                  >
                    <div className="text-3xl mb-2" style={{ filter: earned ? "none" : "grayscale(1)" }}>
                      {item.icon}
                    </div>
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{item.desc}</p>
                    {earned ? (
                      <span className="inline-block mt-2 text-[9px] bg-amber-400 text-black px-1.5 py-0.5 rounded-full font-bold">
                        COLLECTED
                      </span>
                    ) : progress > 0 ? (
                      <span className="inline-block mt-2 text-[9px] text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">
                        {progress} / {goal}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Nia inventory prompt */}
            <button
              onClick={() => window.openNia?.("What items might be in my family's inventory based on our history?")}
              className="w-full flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5 text-sm active:opacity-70"
            >
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-muted-foreground text-left">Ask Nia what inventory items your family might have</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
