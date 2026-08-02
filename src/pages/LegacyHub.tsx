import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookHeart, Scroll, Trophy, Map as MapIcon, Users, Mic,
  Star, Play, CheckCircle2, Clock, Loader2,
  ChevronRight, Plus, Globe2, Heart,
  Camera, FileText, Crown, Flame,
  Sparkles, Shield, Zap, Target,
  Volume2, BookOpen, Lock,
  RefreshCw, ChevronLeft, Calendar, TrendingUp,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import {
  getWorld, getAncestors, getFamilyMembers, getChapters,
  getPlaces, getQuests, getAchievements, getInventory,
  getMemories, getActiveSession, completeQuest,
  type LegacyWorld, type LegacyAncestor, type LegacyChapter,
  type LegacyPlace, type LegacyQuest, type LegacyAchievement,
  type LegacyInventoryItem, type LegacyMemory, type LegacySession,
  type LegacyFamilyMember,
} from "@/lib/api";

const GAME_MODES = [
  { id: "legacy", label: "Legacy Mode", description: "Play through your ancestor's journey", icon: BookHeart },
  { id: "exploration", label: "Exploration", description: "Visit family landmarks & locations", icon: Globe2 },
  { id: "quests", label: "Family Quests", description: "Complete challenges together", icon: Target },
  { id: "reunion", label: "Reunion Mode", description: "Reconnect with living relatives", icon: Heart },
] as const;

type GameMode = (typeof GAME_MODES)[number]["id"];

function memberInitials(name: string): string {
  return name.split(" ").map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

function memberFirstName(name: string): string {
  return name.split(" ")[0] ?? "Unknown";
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-amber-200/70">{label}</span>
        <span className="text-amber-300 font-bold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-amber-900/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AchievementBadge({ icon: Icon, label, current, total, color }: {
  icon: React.ElementType; label: string; current: number; total: number; color: string;
}) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  const done = current >= total;
  return (
    <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${done ? "bg-amber-500/20" : "bg-[#3A2A1A]"}`}>
        <Icon className={`w-5 h-5 ${done ? "text-amber-400" : "text-amber-700"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-100 uppercase tracking-wide">{label}</p>
        <div className="mt-1 h-1.5 rounded-full bg-amber-900/40 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-amber-700 mt-1">{current} / {total}</p>
      </div>
      {done && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
    </div>
  );
}

export default function LegacyHub() {
  const [, navigate] = useRoute();

  const [world, setWorld] = useState<LegacyWorld | null>(null);
  const [ancestors, setAncestors] = useState<LegacyAncestor[]>([]);
  const [members, setMembers] = useState<LegacyFamilyMember[]>([]);
  const [chapters, setChapters] = useState<LegacyChapter[]>([]);
  const [places, setPlaces] = useState<LegacyPlace[]>([]);
  const [quests, setQuests] = useState<LegacyQuest[]>([]);
  const [achievements, setAchievements] = useState<LegacyAchievement[]>([]);
  const [inventory, setInventory] = useState<LegacyInventoryItem[]>([]);
  const [memories, setMemories] = useState<LegacyMemory[]>([]);
  const [session, setSession] = useState<LegacySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<GameMode>("legacy");
  const [inventoryTab, setInventoryTab] = useState<"memories" | "items" | "artifacts">("memories");
  const [activeQuestIdx, setActiveQuestIdx] = useState(0);
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [setupStep, setSetupStep] = useState(0);

  const loadData = useCallback(async () => {
    const [w, anc, mem, ch, pl, qst, ach, inv, mems, sess] = await Promise.all([
      getWorld(), getAncestors(), getFamilyMembers(), getChapters(),
      getPlaces(), getQuests(), getAchievements(), getInventory(),
      getMemories(), getActiveSession(),
    ]);
    setWorld(w);
    setAncestors(anc);
    setMembers(mem);
    setChapters(ch);
    setPlaces(pl);
    setQuests(qst);
    setAchievements(ach);
    setInventory(inv);
    setMemories(mems);
    setSession(sess);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Setup check animation
  useEffect(() => {
    if (!loading && world?.is_ready && !setupDone) {
      const checks = [members.length > 0, memories.length > 0, true, true, true];
      if (setupStep < checks.length) {
        const t = setTimeout(() => setSetupStep(s => s + 1), 500);
        return () => clearTimeout(t);
      }
      const t2 = setTimeout(() => setSetupDone(true), 700);
      return () => clearTimeout(t2);
    }
  }, [loading, world, setupDone, setupStep, members.length, memories.length]);

  const handleCompleteQuest = useCallback(async (quest: LegacyQuest) => {
    if (quest.is_completed || completingQuestId) return;
    setCompletingQuestId(quest.id);
    await completeQuest(quest.id);
    setQuests(prev => prev.map(q => q.id === quest.id ? { ...q, is_completed: true, completed_at: new Date().toISOString() } : q));
    setCompletingQuestId(null);
  }, [completingQuestId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ background: "#1A0F08" }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // Setup check screen
  if (!loading && world?.is_ready && !setupDone) {
    const checks = [
      { label: "Checking Family Tree...", done: members.length > 0, detail: `${members.length} relatives` },
      { label: "Checking Stories...", done: memories.length > 0, detail: `${memories.length} stories` },
      { label: "Checking Photos...", done: memories.some(m => m.source === "upload"), detail: `${memories.filter(m => m.source === "upload").length} memories` },
      { label: "Checking Audio...", done: memories.some(m => m.source === "interview"), detail: `${memories.filter(m => m.source === "interview").length} interviews` },
      { label: "Checking Timeline...", done: true, detail: "Ready" },
    ];
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#1A0F08" }}>
        <div className="max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
              <BookHeart className="w-7 h-7 text-amber-400" />
            </div>
            <h1 className="text-lg font-black text-amber-100 uppercase tracking-widest">Building Your Family World</h1>
            <p className="text-xs text-amber-700 mt-1">Analyzing your family data...</p>
          </div>
          <div className="space-y-2.5">
            {checks.map((c, i) => {
              const visible = i <= setupStep;
              const current = i === setupStep;
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                  !visible ? "opacity-0" : c.done ? "bg-amber-900/20 border-amber-700/30" : current ? "bg-[#2A1A0F] border-amber-800/40" : "bg-[#2A1A0F] border-amber-900/20 opacity-50"
                }`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                    {c.done && visible ? <CheckCircle2 className="w-5 h-5 text-amber-400" /> : current ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-amber-900" />}
                  </div>
                  <p className={`text-xs flex-1 ${c.done ? "text-amber-200" : "text-amber-700"}`}>{c.label}</p>
                  {c.done && visible && <span className="text-xs text-amber-500 font-bold">{c.detail}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const ancestor = ancestors[0] ?? null;
  const progress = world?.readiness_score ?? 0;
  const activeQuests = quests.filter(q => !q.is_completed);
  const completedQuests = quests.filter(q => q.is_completed);
  const activeQuest = activeQuests[activeQuestIdx] ?? activeQuests[0] ?? quests[0];
  const earnedInventory = inventory.filter(i => i.is_earned);
  const lockedInventory = inventory.filter(i => !i.is_earned);
  const discoveredPlaces = places.filter(p => p.is_discovered);
  const undiscoveredPlaces = places.filter(p => !p.is_discovered);

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <BookHeart className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Niakofa Legacy</h1>
          <p className="text-xs text-amber-700">The Living Family Experience</p>
        </div>
        {world && (
          <div className="flex items-center gap-1 bg-teal-900/30 border border-teal-700/30 rounded-full px-2.5 py-1">
            <Sparkles className="w-3 h-3 text-teal-400" />
            <span className="text-xs text-teal-400 font-bold">v{world.world_version}</span>
          </div>
        )}
        <button onClick={() => navigate("legacy/achievements")} className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5 flex items-center gap-1 active:opacity-70">
          <Trophy className="w-3 h-3" /> Awards
        </button>
      </div>

      <div className="max-w-lg mx-auto">
        {/* Progress Hero */}
        <div className="px-4 py-5" style={{ background: "linear-gradient(to bottom, #0A0604, #1A0F08)" }}>
          <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-amber-700 uppercase tracking-widest">Your Family World</p>
                <p className="text-3xl font-black text-amber-400">{progress}%</p>
                <p className="text-xs text-amber-600">Legacy Complete</p>
              </div>
              <div className="w-20 h-20 relative">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(180,100,20,0.2)" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Flame className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-amber-900/30">
              <div className="text-center text-xs">
                <p className="text-lg font-black text-amber-300">{members.length}</p>
                <p className="text-amber-700">Relatives</p>
              </div>
              <div className="text-center text-xs">
                <p className="text-lg font-black text-amber-300">{memories.length}</p>
                <p className="text-amber-700">Stories</p>
              </div>
              <div className="text-center text-xs">
                <p className="text-lg font-black text-amber-300">{chapters.filter(c => c.status === "completed").length}/{chapters.length}</p>
                <p className="text-amber-700">Chapters</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => navigate("legacy/start")}
                className="flex-1 bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-80 flex items-center justify-center gap-1.5 transition-opacity">
                <Play className="w-3.5 h-3.5" /> Continue Journey
              </button>
              <button onClick={() => navigate("legacy/world-evolution")}
                className="bg-amber-900/40 border border-amber-700/30 text-amber-400 font-bold text-xs uppercase tracking-wide px-3 py-2.5 rounded-xl active:opacity-70 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> World
              </button>
            </div>
          </div>
        </div>

        {/* Game Mode Selector */}
        <div className="px-4 mb-5">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Game Modes</h2>
          <div className="grid grid-cols-2 gap-2">
            {GAME_MODES.map(mode => {
              const isActive = activeMode === mode.id;
              return (
                <button key={mode.id} onClick={() => setActiveMode(mode.id)}
                  className={`text-left p-3 rounded-xl border transition-all active:scale-95 ${
                    isActive ? "bg-amber-500/10 ring-2 ring-amber-500 shadow-lg shadow-amber-500/20" : "bg-[#2A1A0F] border-amber-900/30"
                  }`}>
                  <mode.icon className={`w-5 h-5 mb-1.5 ${isActive ? "text-amber-400" : "text-amber-800"}`} />
                  <p className={`text-xs font-bold uppercase tracking-wide ${isActive ? "text-amber-400" : "text-amber-600"}`}>{mode.label}</p>
                  <p className="text-xs text-amber-800 mt-0.5 leading-tight">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Ancestor */}
        {activeMode === "legacy" && ancestor && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Your Ancestor</h2>
              <button onClick={() => navigate("legacy/start")} className="text-xs text-amber-600 flex items-center gap-1">
                Change <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0 text-xl font-black text-amber-400">
                  {memberInitials(ancestor.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-amber-100">{ancestor.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-amber-500 bg-amber-900/30 px-2 py-0.5 rounded-full capitalize">{ancestor.role}</p>
                    {ancestor.relation && <p className="text-xs text-amber-600">{ancestor.relation}</p>}
                  </div>
                  <p className="text-xs text-purple-400/70 mt-1.5 italic">{ancestor.selection_reason}</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-[#3A2A1A] rounded-lg px-2.5 py-1.5">
                      <p className="text-xs text-amber-700">Born</p>
                      <p className="text-sm font-bold text-amber-300">{ancestor.birth_year ?? "Unknown"}</p>
                    </div>
                    <div className="bg-[#3A2A1A] rounded-lg px-2.5 py-1.5">
                      <p className="text-xs text-amber-700">From</p>
                      <p className="text-sm font-bold text-amber-300">{ancestor.birth_location ?? "Unknown"}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-900/30 space-y-1.5">
                <StatBar label="Stories" value={Math.min(100, ancestor.story_count * 10)} color="bg-amber-500" />
                <StatBar label="Photos" value={Math.min(100, ancestor.photo_count * 15)} color="bg-teal-500" />
                <StatBar label="Interviews" value={Math.min(100, ancestor.interview_count * 25)} color="bg-rose-500" />
              </div>
            </div>
          </div>
        )}

        {/* Story Chapters */}
        {activeMode === "legacy" && chapters.length > 0 && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Story Chapters</h2>
              <button onClick={() => navigate("legacy/timeline")} className="text-xs text-amber-600 flex items-center gap-1">
                Timeline <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max px-1">
                {chapters.map(ch => {
                  const unlocked = ch.status !== "locked";
                  return (
                    <button key={ch.id} onClick={() => unlocked && navigate(`legacy/chapter/${ch.id}`)}
                      className={`flex flex-col gap-2 p-3 rounded-xl border transition-all active:opacity-70 ${
                        unlocked ? "bg-[#2A1A0F] border-amber-900/30" : "bg-[#1A1008] border-amber-950/40 opacity-50"
                      }`} style={{ minWidth: 130 }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-500 uppercase tracking-wide">Ch {ch.chapter_number}</span>
                        {unlocked ? <BookOpen className="w-3.5 h-3.5 text-amber-500" /> : <Lock className="w-3.5 h-3.5 text-amber-900" />}
                      </div>
                      <p className={`text-xs font-bold ${unlocked ? "text-amber-200" : "text-amber-900"}`}>{ch.title}</p>
                      <p className="text-xs text-amber-700 capitalize">{ch.status}</p>
                      {unlocked && (
                        <div className="h-1 rounded-full bg-amber-900/40 overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: ch.status === "completed" ? "100%" : ch.status === "in_progress" ? "50%" : "15%" }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Today's Journey */}
        {activeMode === "legacy" && ancestor && (
          <div className="px-4 mb-5">
            <div className="bg-gradient-to-br from-amber-900/30 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-black text-amber-300 uppercase tracking-widest">Today's Journey</h2>
              </div>
              <p className="text-sm font-bold text-amber-100 mb-1">You awaken as {memberFirstName(ancestor.name)}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-[#3A2A1A] rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Year</p>
                  <p className="text-sm font-bold text-amber-300">{ancestor.birth_year ?? "Unknown"}</p>
                </div>
                <div className="bg-[#3A2A1A] rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Location</p>
                  <p className="text-sm font-bold text-amber-300">{ancestor.birth_location ?? "Unknown"}</p>
                </div>
              </div>
              <p className="text-xs text-amber-600 mb-3">Today's Goal: Preserve a family memory</p>
              <button onClick={() => navigate("legacy/start")}
                className="w-full bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70 flex items-center justify-center gap-2">
                <Play className="w-3.5 h-3.5" /> Begin Today's Journey
              </button>
            </div>
          </div>
        )}

        {/* World Map Preview */}
        {activeMode === "legacy" && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family World Map</h2>
              <button onClick={() => navigate("legacy/map")} className="text-xs text-amber-600 flex items-center gap-1">
                Full Map <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {places.length > 0 ? (
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <MapIcon className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-100">Your Family's Journey</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {places.length} places · <span className="text-emerald-400">{discoveredPlaces.length} discovered</span>
                    </p>
                  </div>
                </div>
                <div className="relative pl-5">
                  <div className="absolute left-1.5 top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-600/40 via-amber-700/30 to-amber-900/20" />
                  {places.slice(0, 6).map(p => (
                    <button key={p.id} onClick={() => navigate("legacy/map")}
                      className="relative flex items-start gap-3 pb-4 w-full text-left active:opacity-70">
                      <div className={`absolute -left-[14px] w-3 h-3 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                        p.is_discovered ? "bg-emerald-500 border-emerald-300" : p.lat !== null ? "bg-amber-500 border-amber-300" : "bg-amber-900 border-amber-700"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-amber-200 truncate">{p.label}</p>
                          {p.year && <span className="text-xs text-amber-500 font-bold flex-shrink-0">{p.year}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.country && <p className="text-xs text-amber-700 truncate">{p.country}</p>}
                          {p.is_discovered && <span className="flex items-center gap-0.5 text-xs text-emerald-400 flex-shrink-0"><CheckCircle2 className="w-3 h-3" /> Visited</span>}
                        </div>
                        {p.chapter_numbers.length > 0 && <p className="text-xs text-amber-800 mt-0.5">Chapter {p.chapter_numbers.join(", ")}</p>}
                      </div>
                    </button>
                  ))}
                </div>
                {places.length > 6 && (
                  <button onClick={() => navigate("legacy/map")} className="w-full mt-1 text-xs text-amber-500 font-bold uppercase tracking-wide py-2 active:opacity-70">
                    View all {places.length} places
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 text-center">
                <MapIcon className="w-8 h-8 text-amber-900 mx-auto mb-2" />
                <p className="text-xs text-amber-700">No family places tagged yet</p>
              </div>
            )}
          </div>
        )}

        {/* Active Quest */}
        {(activeMode === "legacy" || activeMode === "quests") && activeQuest && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Active Quest</h2>
                {activeQuest.is_ai_generated && (
                  <div className="flex items-center gap-1 bg-purple-900/30 border border-purple-700/30 rounded-full px-2 py-0.5">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span className="text-xs text-purple-400 font-medium">Nia</span>
                  </div>
                )}
              </div>
              {activeQuests.length > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setActiveQuestIdx(i => (i - 1 + activeQuests.length) % activeQuests.length)} className="text-amber-600 active:opacity-70"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-amber-800">{activeQuestIdx + 1}/{activeQuests.length}</span>
                  <button onClick={() => setActiveQuestIdx(i => (i + 1) % activeQuests.length)} className="text-amber-600 active:opacity-70"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  {activeQuest.is_ai_generated ? <Sparkles className="w-5 h-5 text-purple-400" /> : <Target className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-amber-100">{activeQuest.title}</p>
                  {activeQuest.ancestor_name && <p className="text-xs text-purple-400/80 mt-0.5 flex items-center gap-1"><Crown className="w-3 h-3" /> {activeQuest.ancestor_name}</p>}
                  <p className="text-xs text-amber-600 mt-1 leading-relaxed">{activeQuest.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /><span className="text-xs text-amber-500 font-bold">+{activeQuest.xp} XP</span></div>
                    <div className="h-3 w-px bg-amber-900/40" />
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-700" /><span className="text-xs text-amber-700 capitalize">{activeQuest.category}</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => navigate("legacy/start")} className="flex-1 bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70 flex items-center justify-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Start Quest
                </button>
                <button onClick={() => handleCompleteQuest(activeQuest)} disabled={activeQuest.is_completed || completingQuestId === activeQuest.id}
                  className={`flex-1 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl flex items-center justify-center gap-2 border transition-colors ${
                    activeQuest.is_completed ? "bg-emerald-500/15 border-emerald-600/30 text-emerald-300" : "bg-amber-500/15 border-amber-600/30 text-amber-300 active:opacity-70"
                  }`}>
                  {completingQuestId === activeQuest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {activeQuest.is_completed ? "Completed" : "Mark Complete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Characters */}
        {activeMode === "legacy" && members.length > 0 && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Characters</h2>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max px-1">
                {members.slice(0, 10).map((m, i) => (
                  <div key={m.id} className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${i === 0 ? "bg-amber-500/10 border-amber-500/40" : "bg-[#2A1A0F] border-amber-900/30"}`} style={{ minWidth: 76 }}>
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? "bg-amber-500/30 text-amber-300" : "bg-amber-900/40 text-amber-700"}`}>
                      {memberInitials(m.display_name)}
                    </div>
                    <p className="text-xs font-medium text-amber-200 text-center leading-tight line-clamp-2" style={{ maxWidth: 70 }}>{memberFirstName(m.display_name)}</p>
                    <p className="text-xs text-amber-800 capitalize">{m.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Inventory */}
        {activeMode === "legacy" && (
          <div className="px-4 mb-5">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Inventory</h2>
            <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl overflow-hidden">
              <div className="flex border-b border-amber-900/30">
                {(["memories", "items", "artifacts"] as const).map(tab => (
                  <button key={tab} onClick={() => setInventoryTab(tab)}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${inventoryTab === tab ? "text-amber-400 border-b-2 border-amber-500" : "text-amber-700"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              <div className="p-3">
                {inventoryTab === "memories" && (
                  <div className="space-y-2">
                    {memories.slice(0, 5).map(m => (
                      <div key={m.id} className="w-full flex items-center gap-3 bg-[#3A2A1A] rounded-xl p-3 text-left">
                        <div className="w-9 h-9 rounded-lg bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                          {m.source === "interview" ? <Mic className="w-4 h-4 text-amber-500" /> : <BookHeart className="w-4 h-4 text-amber-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-amber-200 truncate">{m.title}</p>
                          {m.location_label && <p className="text-xs text-amber-700 truncate">{m.location_label}</p>}
                        </div>
                        {m.memory_date && <span className="text-xs text-amber-600 flex-shrink-0">{new Date(m.memory_date).getFullYear()}</span>}
                      </div>
                    ))}
                    {memories.length === 0 && <p className="text-xs text-amber-700 text-center py-6">No memories yet</p>}
                  </div>
                )}
                {inventoryTab === "items" && (
                  <div className="grid grid-cols-3 gap-2">
                    {earnedInventory.filter(i => i.item_type === "document" || i.item_type === "photo").map(item => (
                      <div key={item.id} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-amber-600/40 bg-amber-900/20">
                        <FileText className="w-5 h-5 text-amber-400" />
                        <p className="text-xs text-amber-600 text-center leading-tight">{item.label}</p>
                        {item.is_earned && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </div>
                    ))}
                    {lockedInventory.filter(i => i.item_type === "document" || i.item_type === "photo").map(item => (
                      <div key={item.id} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-amber-950/40 bg-[#1A1008] opacity-50">
                        <Lock className="w-5 h-5 text-amber-900" />
                        <p className="text-xs text-amber-600 text-center leading-tight">{item.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {inventoryTab === "artifacts" && (
                  <div className="space-y-2">
                    {inventory.map(item => (
                      <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${item.is_earned ? "border-amber-700/40 bg-amber-900/20" : "border-amber-950/40 bg-[#1A1008] opacity-50"}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.is_earned ? "bg-amber-500/20" : "bg-[#2A1A0F]"}`}>
                          {item.is_earned ? <Crown className="w-4 h-4 text-amber-400" /> : <Lock className="w-4 h-4 text-amber-900" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${item.is_earned ? "text-amber-200" : "text-amber-800"}`}>{item.label}</p>
                          <p className="text-xs text-amber-700 truncate">{item.description}</p>
                          {item.is_earned && item.unlock_reason && <p className="text-xs text-emerald-500/70 mt-0.5">{item.unlock_reason}</p>}
                        </div>
                        {item.is_earned && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Achievements Preview */}
        {activeMode === "legacy" && (
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Achievements</h2>
              <button onClick={() => navigate("legacy/achievements")} className="text-xs text-amber-600 flex items-center gap-1">View All <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="space-y-2.5">
              {achievements.slice(0, 4).map(a => (
                <AchievementBadge key={a.id} icon={BookHeart} label={a.title} current={a.current_progress} total={a.target_progress} color="bg-amber-500" />
              ))}
            </div>
          </div>
        )}

        {/* Exploration Mode */}
        {activeMode === "exploration" && (
          <div className="px-4 mb-5">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Family World Map</h2>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                  <MapIcon className="w-5 h-5 text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-100">Explore Your Family's World</p>
                  <p className="text-xs text-amber-600 mt-0.5">Visit real family landmarks and discover your heritage.</p>
                </div>
              </div>
              <button onClick={() => navigate("legacy/map")} className="w-full bg-teal-500/15 border border-teal-600/30 text-teal-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2 mb-3">
                <MapIcon className="w-4 h-4" /> Open Family World Map
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-teal-400">{places.length}</p>
                  <p className="text-xs text-amber-700">Family Places</p>
                </div>
                <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-emerald-400">{discoveredPlaces.length}</p>
                  <p className="text-xs text-amber-700">Discovered</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reunion Mode */}
        {activeMode === "reunion" && (
          <div className="px-4 mb-5">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Living Family Universe</h2>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg mb-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center"><Trophy className="w-5 h-5 text-rose-400" /></div>
                <div className="flex-1"><p className="text-sm font-bold text-amber-100">Collaborative Challenges</p><p className="text-xs text-amber-600 mt-0.5">Work together on preservation missions.</p></div>
              </div>
              <div className="space-y-2">
                {activeQuests.slice(0, 3).map(q => (
                  <div key={q.id} className="bg-[#3A2A1A] rounded-xl p-3 flex items-center gap-3">
                    <Target className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-xs font-bold text-amber-200 truncate">{q.title}</p><p className="text-xs text-amber-700">+{q.xp} XP</p></div>
                    <button onClick={() => handleCompleteQuest(q)} disabled={q.is_completed || completingQuestId === q.id}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${q.is_completed ? "bg-emerald-500/15 border-emerald-600/30 text-emerald-300" : "bg-rose-500/15 border-rose-600/30 text-rose-300 active:opacity-70"}`}>
                      {q.is_completed ? "Done" : "Join"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-teal-400" /></div>
                <div className="flex-1"><p className="text-sm font-bold text-amber-100">World Evolution</p><p className="text-xs text-amber-600 mt-0.5">See how your family world has grown.</p></div>
              </div>
              <button onClick={() => navigate("legacy/world-evolution")} className="w-full bg-teal-500/15 border border-teal-600/30 text-teal-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2">
                <TrendingUp className="w-4 h-4" /> View World Evolution
              </button>
            </div>
          </div>
        )}

        {/* Family Vault Quick Access */}
        <div className="px-4 mb-5">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Family Vault</h2>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Camera, label: "Photos" }, { icon: BookOpen, label: "Stories" },
              { icon: Volume2, label: "Audio" }, { icon: FileText, label: "Docs" },
            ].map(({ icon: Icon, label }, i) => (
              <button key={i} className="flex flex-col items-center gap-2 bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 active:opacity-70">
                <Icon className="w-5 h-5 text-amber-600" />
                <p className="text-xs text-amber-700">{label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Preserve the Culture */}
        <div className="px-4 mb-6">
          <button className="w-full bg-gradient-to-r from-amber-900/40 to-amber-800/20 border border-amber-700/30 rounded-2xl p-4 flex items-center gap-4 active:opacity-80">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Scroll className="w-6 h-6 text-amber-400" /></div>
            <div className="flex-1 text-left">
              <p className="text-sm font-black text-amber-200 uppercase tracking-wide">Preserve the Culture</p>
              <p className="text-xs text-amber-700 mt-0.5">Conversation card game — spark stories with your family</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-700 flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ background: "linear-gradient(to top, #0A0604, #1A0F08)", borderTop: "1px solid rgba(180,120,40,0.15)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
          {[
            { icon: Users, label: "Community", active: false },
            { icon: MapIcon, label: "Map", active: false, onClick: () => navigate("legacy/map") },
            { icon: Globe2, label: "Diaspora", active: false },
            { icon: Shield, label: "Circles", active: false },
            { icon: BookHeart, label: "Legacy", active: true },
          ].map((tab, i) => (
            <button key={i} onClick={tab.onClick} className={`flex flex-col items-center gap-1 px-2 py-1 ${tab.active ? "text-amber-400" : "text-amber-800"}`}>
              <tab.icon className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wide">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
