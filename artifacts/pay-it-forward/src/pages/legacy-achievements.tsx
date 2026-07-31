/**
 * Legacy Achievements — Achievement & Skill Tree System
 * Route: /legacy/achievements
 *
 * Tracks user progress through 8 legacy achievements from the
 * Living Family Legacy Experience design document. Progress is
 * calculated from real vault/family data pulled from the dashboard.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Trophy, BookOpen, Mic, Users, Camera, MapPin,
  Compass, Shield, Star, CheckCircle2, Lock, ChevronRight,
  Sparkles, TreePine, Archive, GraduationCap, Heart, Loader2,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Stats {
  family_spaces: number;
  vault_items: number;
  oral_histories: number;
  family_tree_people: number;
  dna_connections: number;
  heritage_collections: number;
}

// ── Achievement definitions (from Living Family Legacy document) ────────────
const ACHIEVEMENTS = [
  {
    id: "story_keeper",
    title: "The Story Keeper",
    desc: "Record 100 family memories in the vault.",
    hint: "Add photos, stories, and documents to your Family Vault.",
    icon: BookOpen,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    dot: "bg-amber-400",
    progress: (s: Stats) => Math.min(s.vault_items, 100),
    goal: 100,
    href: "/diaspora/family",
  },
  {
    id: "family_detective",
    title: "Family Detective",
    desc: "Find and add 10 ancestors to your family tree.",
    hint: "Add parents, grandparents, and great-grandparents to your tree.",
    icon: Compass,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/25",
    dot: "bg-purple-400",
    progress: (s: Stats) => Math.min(s.family_tree_people, 10),
    goal: 10,
    href: "/diaspora/tree",
  },
  {
    id: "bridge_builder",
    title: "The Bridge Builder",
    desc: "Reconnect with 5 family spaces.",
    hint: "Create or join family spaces to connect with relatives.",
    icon: Users,
    color: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/25",
    dot: "bg-teal-400",
    progress: (s: Stats) => Math.min(s.family_spaces, 5),
    goal: 5,
    href: "/diaspora/family",
  },
  {
    id: "legacy_guardian",
    title: "Legacy Guardian",
    desc: "Preserve 50 family photographs and documents.",
    hint: "Upload photos, letters, and historical documents.",
    icon: Archive,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/25",
    dot: "bg-sky-400",
    progress: (s: Stats) => Math.min(s.vault_items, 50),
    goal: 50,
    href: "/diaspora/family",
  },
  {
    id: "voice_of_elders",
    title: "Voice of the Elders",
    desc: "Record 3 oral history interviews with family members.",
    hint: "Use the Oral History recorder in your Family Vault.",
    icon: Mic,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/25",
    dot: "bg-orange-400",
    progress: (s: Stats) => Math.min(s.oral_histories, 3),
    goal: 3,
    href: "/diaspora/family",
  },
  {
    id: "roots_traveler",
    title: "Roots Traveler",
    desc: "Discover DNA connections to 10 relatives.",
    hint: "Import your DNA data to find cousins and relatives.",
    icon: MapPin,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/25",
    dot: "bg-green-400",
    progress: (s: Stats) => Math.min(s.dna_connections, 10),
    goal: 10,
    href: "/diaspora/dna",
  },
  {
    id: "memory_restorer",
    title: "Memory Restorer",
    desc: "Upload and preserve 25 historic family photographs.",
    hint: "Upload old family photos to bring them back to life.",
    icon: Camera,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/25",
    dot: "bg-rose-400",
    progress: (s: Stats) => Math.min(s.vault_items, 25),
    goal: 25,
    href: "/diaspora/family",
  },
  {
    id: "ancestor_walker",
    title: "Ancestor Walker",
    desc: "Explore 5 heritage collections from your family's origins.",
    hint: "Explore heritage collections related to your family's culture.",
    icon: GraduationCap,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/25",
    dot: "bg-emerald-400",
    progress: (s: Stats) => Math.min(s.heritage_collections, 5),
    goal: 5,
    href: "/diaspora/heritage",
  },
];

// ── Skill Tree ────────────────────────────────────────────────────────────
const SKILL_TREE = [
  { label: "Historian",         icon: BookOpen,       unlocked: true,  color: "text-amber-400" },
  { label: "Explorer",          icon: Compass,        unlocked: true,  color: "text-teal-400" },
  { label: "Story Keeper",      icon: Heart,          unlocked: false, color: "text-rose-400" },
  { label: "Photographer",      icon: Camera,         unlocked: false, color: "text-sky-400" },
  { label: "Interviewer",       icon: Mic,            unlocked: false, color: "text-orange-400" },
  { label: "Archivist",         icon: Archive,        unlocked: false, color: "text-purple-400" },
  { label: "Genealogist",       icon: TreePine,       unlocked: false, color: "text-emerald-400" },
  { label: "Community Builder", icon: Users,          unlocked: false, color: "text-blue-400" },
];

// ── Legacy Inventory ─────────────────────────────────────────────────────
const INVENTORY_ITEMS = [
  { id: "old_letter",    label: "Old Letter",       icon: "📜", desc: "A letter from a family elder — record 1 story",    earned: false },
  { id: "family_bible",  label: "Family Bible",     icon: "📖", desc: "Your family's holy book — add 5 ancestors",        earned: false },
  { id: "photograph",    label: "Family Portrait",  icon: "🖼️", desc: "A family photograph — upload 3 photos",            earned: false },
  { id: "recipe_book",   label: "Recipe Book",      icon: "📗", desc: "Traditional recipes — record an oral history",    earned: false },
  { id: "birth_cert",    label: "Birth Certificate",icon: "📄", desc: "Historical document — add 3 ancestors",           earned: false },
  { id: "migration_map", label: "Migration Map",    icon: "🗺️", desc: "A map of your family's journey — connect DNA",    earned: false },
];

export default function LegacyAchievementsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"achievements" | "skills" | "inventory">("achievements");

  useEffect(() => {
    if (!currentUser) return;
    fetch("/api/diaspora/dashboard", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setStats(d as Stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Sign in to view achievements</p>
      </div>
    );
  }

  const unlockedCount = stats
    ? ACHIEVEMENTS.filter(a => a.progress(stats) >= a.goal).length
    : 0;

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
          {stats && (
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
              const current = stats ? ach.progress(stats) : 0;
              const pct = Math.min(100, Math.round((current / ach.goal) * 100));
              const unlocked = pct >= 100;
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
                            className={`h-full rounded-full ${unlocked ? ach.dot : ach.dot}`}
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
                const unlocked = skill.unlocked || (stats ? i < Math.floor(ACHIEVEMENTS.filter(a => a.progress(stats) >= a.goal).length * 0.8) : false);
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
                          Complete more achievements to unlock
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
                const earned = stats ? (
                  item.id === "old_letter"    ? stats.oral_histories >= 1 :
                  item.id === "family_bible"  ? stats.family_tree_people >= 5 :
                  item.id === "photograph"    ? stats.vault_items >= 3 :
                  item.id === "recipe_book"   ? stats.oral_histories >= 1 :
                  item.id === "birth_cert"    ? stats.family_tree_people >= 3 :
                  item.id === "migration_map" ? stats.dna_connections >= 1 :
                  false
                ) : false;
                return (
                  <div
                    key={item.id}
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
                    {earned && (
                      <span className="inline-block mt-2 text-[9px] bg-amber-400 text-black px-1.5 py-0.5 rounded-full font-bold">
                        COLLECTED
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nia inventory prompt */}
            <button
              onClick={() => (window as any).openNia?.("What items might be in my family's inventory based on our history?")}
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
