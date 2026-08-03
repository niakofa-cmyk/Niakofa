/**
 * Legacy Home — The Living Family RPG
 * Route: /legacy
 *
 * The 5th bottom-nav tab. Transforms family vault data into an evolving
 * RPG experience: ancestors become playable characters, memories become
 * quests, and the family vault becomes the game database.
 *
 * Enhanced from legacy-mode.tsx with:
 *  - First-time setup check ("Building Your Family World..." sequence)
 *  - Story Chapters section (life chapters derived from timeline decades)
 *  - Link to /legacy/achievements (dedicated achievements page)
 *  - Dynamic "Today's Journey" start screen concept
 *  - Improved visual hierarchy and micro-interactions
 *  - Real API integration: completeness scores, ancestor candidates,
 *    chapter state machine, scene rendering
 *  - Functional game mode selector (changes displayed content per mode)
 *  - Dialogue panel wired to real scene/chapter data
 *
 * Design reference: docs/legacy-mode-design/ui-reference.png
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  BookHeart, Scroll, Trophy, Map, Users, Mic,
  Star, Play, CheckCircle2, Clock, Loader2,
  ChevronRight, Plus, Globe2, Heart,
  Camera, FileText, Crown, Flame,
  Sparkles, Shield, Zap, Target,
  Volume2, BookOpen, Lock,
  RefreshCw, ChevronLeft, Calendar, TrendingUp,
  Search, X, MapPin,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FamilyData {
  id: number;
  name: string;
  member_count: number;
  memory_count?: number;
  my_role: string;
  status: string;
}

interface FamilyMember {
  id: number;
  display_name: string;
  role: string;
  relation_note: string | null;
  birth_year?: number | null;
  location?: string | null;
}

interface FamilyMemory {
  id: number;
  title: string | null;
  description: string | null;
  memory_date: string | null;
  location_label: string | null;
  source: string;
  asset_count?: number;
  created_at?: string;
}

interface LegacyState {
  families:       FamilyData[];
  members:        FamilyMember[];
  memories:       FamilyMemory[];
  interviewCount: number;
  loading:        boolean;
}

interface AiQuest {
  id:            string;
  title:         string;
  description:   string;
  xp:            number;
  category:      "record" | "document" | "connect" | "explore" | "discover";
  actionPath:    string;
  isAiGenerated: boolean;
  ancestorName?: string;
}

interface CompletenessResponse {
  familyId: number;
  readinessScore: number;
  chapterUnlockReady: boolean;
  threshold: number;
  dimensions: { key: string; label: string; score: number; max: number; count: number; hint: string }[];
  missingData: string[];
  suggestions: string[];
}

interface AncestorCandidate {
  memberId: number;
  name: string;
  role: string;
  relation: string | null;
  birthYear: string | null;
  deathYear: string | null;
  storyCount: number;
  eventCount: number;
  placeCount: number;
  memoryCount: number;
  interviewCount: number;
  photoCount: number;
  completenessScore: number;
  selectionReason: string;
}

interface LegacyChapter {
  id: number;
  world_id: number;
  family_id: number;
  ancestor_member_id: number | null;
  chapter_number: number;
  title: string;
  synopsis: string | null;
  status: "locked" | "unlocked" | "in_progress" | "completed" | "skipped";
  chapter_data: Record<string, unknown>;
  unlocked_at: string | null;
  completed_at: string | null;
}

interface SceneData {
  sceneNumber: number;
  title: string;
  type: string;
  content: string;
  placeId?: number | null;
  eventId?: number | null;
  memoryId?: number | null;
  historicalLayer: string;
}

interface ScenesResponse {
  chapterId: number;
  chapterTitle: string;
  chapterStatus: string;
  scenes: SceneData[];
  vaultContext: { places: unknown[]; events: unknown[]; memories: unknown[] };
}

interface MapPlace {
  id: number;
  label: string;
  placeType: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  year: number | null;
  chapterNumbers: number[];
  discovered: boolean;
  discoveredAt: string | null;
  discoveredBy: string | null;
}

interface MapData {
  places: MapPlace[];
  placesWithCoordinates: number;
  placesWithoutCoordinates: number;
  placesDiscovered: number;
  route: [number, number][];
}

type GameMode     = "legacy" | "exploration" | "quests" | "reunion";
type InventoryTab = "items" | "memories" | "artifacts";

// ─── Static game data ─────────────────────────────────────────────────────────

const GAME_MODES = [
  { id: "legacy"      as GameMode, label: "Legacy Mode",     description: "Play through your ancestor's journey",       icon: BookHeart, color: "amber"  },
  { id: "exploration" as GameMode, label: "Exploration Mode", description: "Visit family landmarks & locations",          icon: Globe2,    color: "teal"   },
  { id: "quests"      as GameMode, label: "Family Quests",   description: "Complete challenges together",                icon: Target,    color: "purple" },
  { id: "reunion"     as GameMode, label: "Reunion Mode",    description: "Reconnect with living relatives",             icon: Heart,     color: "rose"   },
];

const MODE_COLORS: Record<string, { ring: string; bg: string; text: string; glow: string }> = {
  amber:  { ring: "ring-amber-500",  bg: "bg-amber-500/10",  text: "text-amber-400",  glow: "shadow-amber-500/20"  },
  teal:   { ring: "ring-teal-500",   bg: "bg-teal-500/10",   text: "text-teal-400",   glow: "shadow-teal-500/20"   },
  purple: { ring: "ring-purple-500", bg: "bg-purple-500/10", text: "text-purple-400", glow: "shadow-purple-500/20" },
  rose:   { ring: "ring-rose-500",   bg: "bg-rose-500/10",   text: "text-rose-400",   glow: "shadow-rose-500/20"   },
};

const FALLBACK_QUESTS: AiQuest[] = [
  { id: "t0", isAiGenerated: false, title: "Record an Elder's Story",  xp: 100, category: "record",   actionPath: "",               description: "Interview a living relative and preserve their voice for the family vault." },
  { id: "t1", isAiGenerated: false, title: "Add a Family Photo",        xp: 50,  category: "document", actionPath: "",               description: "Upload a photograph — every image unlocks historical context." },
  { id: "t2", isAiGenerated: false, title: "Expand the Family Tree",    xp: 75,  category: "connect",  actionPath: "/diaspora/tree", description: "Add an ancestor to your family tree to unlock a new playable chapter." },
  { id: "t3", isAiGenerated: false, title: "Visit a Family Landmark",   xp: 120, category: "explore",  actionPath: "",               description: "Go to a place meaningful to your family and check in with the app." },
  { id: "t4", isAiGenerated: false, title: "Write a Family Memory",     xp: 60,  category: "document", actionPath: "",               description: "Document a story from your family's past as a vault memory." },
  { id: "t5", isAiGenerated: false, title: "Invite a Family Member",    xp: 80,  category: "connect",  actionPath: "/diaspora/family", description: "Grow your family network — every cousin enriches everyone's game." },
];

const ORAL_PROMPTS = [
  "Tell me about Grandma's first home.",
  "What was your family's biggest challenge?",
  "Describe a meal that defined your family.",
  "Who was the strongest person in your family and why?",
  "What tradition do you want to never lose?",
  "Tell me about a time the family overcame hardship.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Real ancestor data comes from API — see loadLegacyEngine below

function deriveProgress(state: LegacyState): number {
  const familyScore    = Math.min(25, state.families.length * 25);
  const memberScore    = Math.min(25, state.members.length  * 5);
  const memoryScore    = Math.min(25, state.memories.length * 5);
  const interviewScore = Math.min(25, state.interviewCount  * 12);
  return Math.round(familyScore + memberScore + memoryScore + interviewScore);
}

function isReady(state: LegacyState): boolean {
  return state.families.length >= 1 && state.members.length >= 1;
}

interface MinimalMember {
  display_name: string;
  role?: string;
  relation_note?: string | null;
  birth_year?: number | null;
  location?: string | null;
}

function memberInitials(m: MinimalMember): string {
  return (m.display_name ?? "?")
    .split(" ")
    .map(p => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function memberFirstName(m: MinimalMember): string {
  return (m.display_name ?? "Unknown").split(" ")[0] ?? "Unknown";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function AchievementBadge({
  icon: Icon, label, current, total, color,
}: { icon: React.ElementType; label: string; current: number; total: number; color: string }) {
  const pct  = Math.min(100, Math.round((current / total) * 100));
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

// ─── Setup check sequence (first-time experience) ─────────────────────────────

function SetupCheck({ state, onComplete }: { state: LegacyState; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const checks = [
    { label: "Checking Family Tree...",   done: state.members.length > 0,   detail: `${state.members.length} relatives` },
    { label: "Checking Stories...",        done: state.memories.length > 0,  detail: `${state.memories.length} stories` },
    { label: "Checking Photos...",         done: state.memories.some(m => m.source === "upload"), detail: `${state.memories.filter(m => m.source === "upload").length} memories` },
    { label: "Checking Audio...",          done: state.interviewCount > 0,   detail: `${state.interviewCount} interviews` },
    { label: "Checking Timeline...",       done: state.memories.some(m => m.memory_date), detail: "Ready" },
  ];

  useEffect(() => {
    if (step < checks.length) {
      const t = setTimeout(() => setStep(s => s + 1), 600);
      return () => clearTimeout(t);
    }
    const t2 = setTimeout(onComplete, 800);
    return () => clearTimeout(t2);
  }, [step]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#1A0F08" }}>
      <div className="max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <BookHeart className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-lg font-black text-amber-100 uppercase tracking-widest">Building Your Family World</h1>
          <p className="text-xs text-amber-700 mt-1">Analyzing your family data…</p>
        </div>
        <div className="space-y-2.5">
          {checks.map((c, i) => {
            const visible = i <= step;
            const current = i === step;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                  !visible ? "opacity-0" :
                  c.done ? "bg-amber-900/20 border-amber-700/30" :
                  current ? "bg-[#2A1A0F] border-amber-800/40" : "bg-[#2A1A0F] border-amber-900/20 opacity-50"
                }`}
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                  {c.done && visible
                    ? <CheckCircle2 className="w-5 h-5 text-amber-400" />
                    : current
                      ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                      : <div className="w-2 h-2 rounded-full bg-amber-900" />}
                </div>
                <p className={`text-xs flex-1 ${c.done ? "text-amber-200" : "text-amber-700"}`}>{c.label}</p>
                {c.done && visible && (
                  <span className="text-xs text-amber-500 font-bold">{c.detail}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LegacyHomePage() {
  const { currentUser } = useAppContext();
  const [, navigate]   = useLocation();

  const [legacyState, setLegacyState] = useState<LegacyState>({
    families: [], members: [], memories: [], interviewCount: 0, loading: true,
  });

  const [activeMode,    setActiveMode]    = useState<GameMode>("legacy");
  const [inventoryTab,  setInventoryTab]  = useState<InventoryTab>("memories");
  const [recording,     setRecording]     = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [promptIdx,     setPromptIdx]     = useState(0);
  const [setupDone,     setSetupDone]     = useState(false);

  // Real audio recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const [uploading, setUploading] = useState(false);

  const [aiQuests,        setAiQuests]        = useState<AiQuest[]>([]);
  const [questsLoading,   setQuestsLoading]   = useState(false);
  const [questsRefreshing, setQuestsRefreshing] = useState(false);
  const [activeQuestIdx,  setActiveQuestIdx]  = useState(0);
  const [isAiEnabled,     setIsAiEnabled]     = useState(false);
  const [questFingerprint, setQuestFingerprint] = useState<string | null>(null);
  const [completedQuestIds, setCompletedQuestIds] = useState<Set<string>>(new Set());
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const questsLoadedRef = useRef(false);

  // ── Legacy Engine state (real API data) ──────────────────────────────────
  const [completeness, setCompleteness] = useState<CompletenessResponse | null>(null);
  const [ancestorCandidate, setAncestorCandidate] = useState<AncestorCandidate | null>(null);
  const [chapters, setChapters] = useState<LegacyChapter[]>([]);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);

  // ── Today's Journey + World Version (Phase 5) ─────────────────────────────
  const [todaysJourney, setTodaysJourney] = useState<{
    ancestor: { memberId: number; name: string; role: string; relation: string | null; birthYear: number | null };
    storyCount: number; eventCount: number; placeCount: number;
    narration: string; narrationId: number | null; date: string;
  } | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [worldVersion, setWorldVersion] = useState<{
    currentVersion: number; versionCreatedAt: string | null; totalChanges: number;
    recentChanges: Array<{ id: number; changeType: string; description: string; affectedCount: number; createdAt: string; newVersion: number | null }>;
  } | null>(null);

  // ── Daily Welcome + Emotional Calendar (Phase 5: Living Family Universe) ──
  const [dailyWelcome, setDailyWelcome] = useState<{
    hasChanges: boolean;
    worldVersion: number;
    newMemoryCount: number;
    newMemberCount: number;
    newPlaceCount: number;
    newCharacterCount: number;
    recentChanges: Array<{ changeType: string; description: string; createdAt: string }>;
    newChapters: Array<{ id: number; title: string; chapterNumber: number }>;
    upcomingEvents: Array<{ id: number; title: string; eventDate: string; category: string }>;
  } | null>(null);
  const [worldEvolvedDismissed, setWorldEvolvedDismissed] = useState(false);
  const [emotionalCalendar, setEmotionalCalendar] = useState<Array<{
    id: number; type: string; title: string; description: string | null;
    date: string | null; memberName: string | null; isToday: boolean; isUpcoming: boolean;
    daysUntil: number; yearsAgo: number | null;
  }>>([]);

  // ── Family Quests (cooperative, real data from /api/legacy/family-quests/:familyId) ─
  const [familyQuests, setFamilyQuests] = useState<Array<{
    key: string; title: string; description: string;
    goal: number; progress: number; reward: string;
    completed: boolean;
    leaderboard: Array<{ memberId: number; name: string; count: number }> | null;
  }>>([]);
  const [familyQuestsLoading, setFamilyQuestsLoading] = useState(false);
  const familyQuestsLoadedRef = useRef(false);
  const [missionCount, setMissionCount] = useState(0);
  const [mysteryCount, setMysteryCount] = useState(0);
  const [challengeCount, setChallengeCount] = useState(0);

  // ── Reunion Challenge (real data from /api/legacy/reunion/:familyId) ──────
  const [reunionData, setReunionData] = useState<{
    challenge: {
      title: string; description: string; goal: number; progress: number;
      reward: string; completed: boolean;
    };
    challenges: Array<{
      id: string; title: string; description: string; goal: number;
      progress: number; reward: string; completed: boolean; metric: string;
    }>;
    leaderboard: Array<{ memberId: number; name: string; publishedInterviews: number }>;
  } | null>(null);

  // ── Achievement progress (real data from /api/legacy/achievements/:familyId) ─
  const [achievementMap, setAchievementMap] = useState<globalThis.Map<string, { progress: number; goal: number; unlocked: boolean }>>(new globalThis.Map());

  // ── Load family data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const familyRes  = await fetch("/api/family/mine", { headers: authHeaders() });
      const familyData = familyRes.ok ? await familyRes.json() : { families: [] };
      const families: FamilyData[] = (familyData.families ?? []).filter(
        (f: FamilyData) => f.status === "active",
      );

      if (!families.length) {
        setLegacyState({ families: [], members: [], memories: [], interviewCount: 0, loading: false });
        return;
      }

      const primary = families[0];
      const [membersRes, memoriesRes, interviewsRes] = await Promise.all([
        fetch(`/api/family/${primary.id}/members`,                   { headers: authHeaders() }),
        fetch(`/api/family/${primary.id}/memories?limit=20`,         { headers: authHeaders() }),
        fetch(`/api/family/${primary.id}/interviews`,                { headers: authHeaders() }),
      ]);

      const membersData   = membersRes.ok    ? await membersRes.json()    : {};
      const memoriesData  = memoriesRes.ok   ? await memoriesRes.json()   : {};
      const interviewData = interviewsRes.ok ? await interviewsRes.json() : {};

      setLegacyState({
        families,
        members:        membersData.members    ?? [],
        memories:       memoriesData.memories  ?? [],
        interviewCount: (interviewData.interviews ?? []).length,
        loading:        false,
      });
    } catch {
      toast.error("Couldn't load legacy data");
      setLegacyState(s => ({ ...s, loading: false }));
    }
  }, [currentUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load Legacy Engine data (completeness, ancestor, chapters) ──────────────

  const loadLegacyEngine = useCallback(async (familyId: number) => {
    try {
      const [compRes, ancestorRes, chaptersRes, mapRes] = await Promise.all([
        fetch(`/api/legacy/completeness/${familyId}`, { headers: authHeaders() }),
        fetch(`/api/legacy/ancestors/${familyId}`,    { headers: authHeaders() }),
        fetch(`/api/legacy/chapters/${familyId}`,      { headers: authHeaders() }),
        fetch(`/api/legacy/map/${familyId}`,            { headers: authHeaders() }),
      ]);

      if (compRes.ok) {
        const data = await compRes.json() as CompletenessResponse;
        setCompleteness(data);
      }
      if (ancestorRes.ok) {
        const data = await ancestorRes.json() as { ancestors: AncestorCandidate[] };
        setAncestorCandidate(data.ancestors?.[0] ?? null);
      }
      if (chaptersRes.ok) {
        const data = await chaptersRes.json() as { chapters: LegacyChapter[] };
        setChapters(data.chapters ?? []);
        const firstUnlocked = (data.chapters ?? []).find(c => c.status === "unlocked" || c.status === "in_progress");
        if (firstUnlocked) setActiveChapterId(firstUnlocked.id);
      }
      if (mapRes.ok) {
        const data = await mapRes.json() as MapData;
        setMapData(data);
      }

      // Load Today's Journey + World Version (Phase 5)
      setJourneyLoading(true);
      try {
        const [journeyRes, versionRes] = await Promise.all([
          fetch(`/api/legacy/game-master/${familyId}/today`, { headers: authHeaders() }),
          fetch(`/api/legacy/world-evolution/${familyId}/version-summary`, { headers: authHeaders() }),
        ]);
        if (journeyRes.ok) {
          const jd = await journeyRes.json();
          if (jd.journey) setTodaysJourney(jd.journey);
        }
        if (versionRes.ok) {
          const vd = await versionRes.json();
          setWorldVersion(vd);
        }

        // Load daily welcome + emotional calendar
        const [welcomeRes, calendarRes] = await Promise.all([
          fetch(`/api/legacy/game-master/${familyId}/daily-welcome`, { headers: authHeaders() }),
          fetch(`/api/legacy/game-master/${familyId}/emotional-calendar`, { headers: authHeaders() }),
        ]);
        if (welcomeRes.ok) {
          const wd = await welcomeRes.json();
          setDailyWelcome(wd);
        }
        if (calendarRes.ok) {
          const cd = await calendarRes.json();
          setEmotionalCalendar(cd.calendar ?? []);
        }
        // Fetch real reunion challenge data
        const reunionRes = await fetch(`/api/legacy/reunion/${familyId}`, { headers: authHeaders() });
        if (reunionRes.ok) {
          setReunionData(await reunionRes.json());
        }
        // Fetch real cooperative family quests
        if (!familyQuestsLoadedRef.current) {
          familyQuestsLoadedRef.current = true;
          setFamilyQuestsLoading(true);
          fetch(`/api/legacy/family-quests/${familyId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.quests) setFamilyQuests(d.quests); })
            .catch(() => {})
            .finally(() => setFamilyQuestsLoading(false));
        }
        // Fetch live counts for Phase 5 hub cards
        Promise.all([
          fetch(`/api/legacy/ai-director/${familyId}/missions`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/legacy/memory-mysteries/${familyId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/legacy/challenges/${familyId}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]).then(([missionsData, mysteriesData, challengesData]) => {
          if (missionsData?.totalActive !== undefined) setMissionCount(missionsData.totalActive);
          if (mysteriesData?.mysteries) setMysteryCount(mysteriesData.mysteries.filter((m: { status: string }) => m.status === "open").length);
          if (challengesData?.challenges) setChallengeCount(challengesData.challenges.filter((c: { status: string }) => c.status === "active").length);
        }).catch(() => {});

        // Fetch real achievement progress for inventory items
        const achRes = await fetch(`/api/legacy/achievements/${familyId}`, { headers: authHeaders() });
        if (achRes.ok) {
          const achData = await achRes.json() as { achievements: Array<{ achievement_key: string; progress: number; goal: number; unlocked: boolean }> };
          const map = new globalThis.Map() as globalThis.Map<string, { progress: number; goal: number; unlocked: boolean }>;
          for (const a of achData.achievements ?? []) {
            map.set(a.achievement_key, { progress: a.progress, goal: a.goal, unlocked: a.unlocked });
          }
          setAchievementMap(map);
        }
      } catch {
        // Silent fail
      } finally {
        setJourneyLoading(false);
      }
    } catch {
      // Silent fail — fallback UI will handle
    }
  }, []);

  useEffect(() => {
    if (!legacyState.loading && legacyState.families.length > 0) {
      loadLegacyEngine(legacyState.families[0].id);
    }
  }, [legacyState.loading, legacyState.families, loadLegacyEngine]);

  // ── Load scenes for active chapter ──────────────────────────────────────────

  const loadScenes = useCallback(async (chapterId: number) => {
    if (!legacyState.families.length) return;
    setScenesLoading(true);
    try {
      const res = await fetch(`/api/legacy/chapters/${chapterId}/scenes`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json() as ScenesResponse;
        setScenes(data.scenes ?? []);
      }
    } catch {
      setScenes([]);
    } finally {
      setScenesLoading(false);
    }
  }, [legacyState.families]);

  useEffect(() => {
    if (activeChapterId) loadScenes(activeChapterId);
  }, [activeChapterId, loadScenes]);

  // ── Real audio recording with MediaRecorder API ─────────────────────────────
  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setUploading(true);
        try {
          const familyId = legacyState.families[0]?.id;
          if (!familyId) throw new Error("No family selected");

          // 1. Create the memory record
          const memRes = await fetch(`/api/family/${familyId}/memories`, {
            method:  "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
              title:  `Oral Story — ${ORAL_PROMPTS[promptIdx].slice(0, 40)}`,
              source: "interview",
            }),
          });
          if (!memRes.ok) throw new Error(`Failed to create memory (${memRes.status})`);
          const { memory } = await memRes.json();

          // 2. Upload the audio as a base64 data URL to the memory's asset endpoint
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });
          const uploadRes = await fetch(`/api/family/${familyId}/memories/${memory.id}/assets/upload-direct`, {
            method:  "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
              dataUrl,
              filename:  `oral-story-${Date.now()}.webm`,
              mimeType:  "audio/webm",
              assetType: "audio",
            }),
          });
          if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
          toast.success("Story saved to your vault!");
          fetch(`/api/legacy/reservoir/${familyId}/invalidate`, { method: "POST", headers: authHeaders() }).catch(() => {});
          loadData();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to save recording");
        } finally { setUploading(false); }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
    } catch (err) {
      toast.error(err instanceof Error ? `Microphone error: ${err.message}` : "Couldn't access microphone");
    }
  }, [legacyState.families, promptIdx, loadData]);

  const handleStopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
    setRecordSeconds(0);
    mediaRecorderRef.current = null;
  }, []);

  // ── Load AI quests after family data is ready ─────────────────────────────

  const loadAiQuests = useCallback(async (familyId: number) => {
    if (questsLoadedRef.current) return;
    questsLoadedRef.current = true;
    setQuestsLoading(true);
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { quests: AiQuest[]; fingerprint?: string; isAiEnabled?: boolean };
      setAiQuests(data.quests ?? []);
      setIsAiEnabled(Boolean(data.isAiEnabled));
      setQuestFingerprint(data.fingerprint ?? null);
    } catch {
      setAiQuests([]);
    } finally {
      setQuestsLoading(false);
    }
  }, []);

  // Load this user's real quest-completion history so already-completed
  // quests render correctly on page load, not just after a fresh completion
  // in the current session.
  const loadQuestHistory = useCallback(async (familyId: number) => {
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}/history`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json() as { completions?: { quest_id: string }[] };
      setCompletedQuestIds(new Set((data.completions ?? []).map(c => c.quest_id)));
    } catch {
      // Non-critical — completed-state just won't be pre-populated this load.
    }
  }, []);

  useEffect(() => {
    const { loading, families } = legacyState;
    if (!loading && families.length > 0) {
      loadAiQuests(families[0].id);
      loadQuestHistory(families[0].id);
    }
  }, [legacyState.loading, legacyState.families, loadAiQuests, loadQuestHistory]);

  // ── Force-refresh AI quests ───────────────────────────────────────────────

  const handleRefreshQuests = useCallback(async (familyId: number) => {
    setQuestsRefreshing(true);
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}/refresh`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json() as { quests?: AiQuest[]; fingerprint?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Quest refresh failed");
        return;
      }
      setAiQuests(data.quests ?? []);
      setQuestFingerprint(data.fingerprint ?? null);
      setActiveQuestIdx(0);
      toast.success("Nia has crafted new quests from your family's stories!");
    } catch {
      toast.error("Couldn't refresh quests right now");
    } finally {
      setQuestsRefreshing(false);
    }
  }, []);

  // ── Complete a quest ──────────────────────────────────────────────────────
  // Persists completion server-side (legacy_quest_progress) and awards XP.
  // Idempotent: completing the same quest twice under the same fingerprint
  // is a no-op server-side, so this is safe to fire even on a double-tap.
  const handleCompleteQuest = useCallback(async (familyId: number, quest: AiQuest) => {
    if (completedQuestIds.has(quest.id) || completingQuestId) return;
    setCompletingQuestId(quest.id);
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}/${quest.id}/complete`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: questFingerprint,
          questTitle: quest.title,
          questCategory: quest.category,
          xp: quest.xp,
        }),
      });
      const data = await res.json() as {
        completed?: boolean; alreadyCompleted?: boolean; xpAwarded?: number; error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't complete quest");
        return;
      }
      setCompletedQuestIds(prev => new Set(prev).add(quest.id));
      if (data.alreadyCompleted) {
        toast.message("You've already completed this quest.");
      } else {
        toast.success(`Quest complete! +${data.xpAwarded ?? quest.xp} XP`);
      }
    } catch {
      toast.error("Couldn't complete quest right now");
    } finally {
      setCompletingQuestId(null);
    }
  }, [completedQuestIds, completingQuestId, questFingerprint]);

  // ── Recording timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <p className="text-amber-400">Sign in to access Legacy Mode</p>
      </div>
    );
  }

  const { loading, families, members, memories, interviewCount } = legacyState;
  const ready    = isReady(legacyState);
  const progress = completeness?.readinessScore ?? deriveProgress(legacyState);
  const ancestor = ancestorCandidate
    ? {
        display_name: ancestorCandidate.name,
        role: ancestorCandidate.role,
        relation_note: ancestorCandidate.relation,
        birth_year: ancestorCandidate.birthYear ? parseInt(ancestorCandidate.birthYear) : null,
        location: null as string | null,
      } as MinimalMember
    : (members[0] as MinimalMember | undefined) ?? null;
  const mm       = Math.floor(recordSeconds / 60);
  const ss       = recordSeconds % 60;

  const displayQuests: AiQuest[] = aiQuests.length > 0
    ? aiQuests
    : FALLBACK_QUESTS.map(q => ({
        ...q,
        actionPath: q.actionPath || (families[0] ? `/family/${families[0].id}` : "/diaspora/family"),
      }));
  const activeQuest = displayQuests[activeQuestIdx] ?? displayQuests[0];

  // ── Setup check (first-time experience) ────────────────────────────────────

  if (!loading && ready && !setupDone) {
    return <SetupCheck state={legacyState} onComplete={() => setSetupDone(true)} />;
  }

  // ── Readiness check screen ────────────────────────────────────────────────

  if (!loading && !ready) {
    const checks = [
      { label: "Family Space Created",     done: families.length >= 1,   cta: "/diaspora/family",                                                  ctaLabel: "Create Space"  },
      { label: "Family Tree (1+ members)", done: members.length  >= 1,   cta: "/diaspora/tree",                                                    ctaLabel: "Add Ancestor"  },
      { label: "Stories / Memories",       done: memories.length >= 1,   cta: families[0] ? `/family/${families[0].id}` : "/diaspora/family",      ctaLabel: "Add Memory"    },
      { label: "Oral History Recording",   done: interviewCount  >= 1,   cta: families[0] ? `/family/${families[0].id}` : "/diaspora/family",      ctaLabel: "Record Story"  },
    ];
    const doneCount = checks.filter(c => c.done).length;
    const unlockPct = Math.round((doneCount / checks.length) * 100);

    return (
      <div className="min-h-screen bg-[#1A0F08] pb-28">
        <div className="bg-gradient-to-b from-[#0A0604] to-[#1A0F08] px-4 pt-8 pb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black text-amber-100 uppercase tracking-widest">Unlock Legacy Mode</h1>
          <p className="text-sm text-amber-700 mt-2 max-w-xs mx-auto">
            Build your family foundation to unlock the Living Family RPG experience.
          </p>
        </div>

        <div className="max-w-lg mx-auto px-4">
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-5 mb-4 text-center">
            <p className="text-5xl font-black text-amber-400">{unlockPct}%</p>
            <p className="text-xs text-amber-700 uppercase tracking-widest mt-1">Legacy Ready</p>
            <div className="mt-3 h-2 rounded-full bg-amber-950 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${unlockPct}%` }} />
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {checks.map((c, i) => (
              <div key={i} className={`bg-[#2A1A0F] border rounded-xl p-4 flex items-center gap-3 ${c.done ? "border-amber-600/40" : "border-amber-900/30"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${c.done ? "bg-amber-500/20" : "bg-[#3A2A1A]"}`}>
                  {c.done
                    ? <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    : <span className="text-amber-700 text-xs font-bold">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${c.done ? "text-amber-200" : "text-amber-600"}`}>{c.label}</p>
                </div>
                {!c.done && (
                  <button
                    onClick={() => navigate(c.cta)}
                    className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 active:opacity-70"
                  >
                    {c.ctaLabel}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-3">What Awaits You</h3>
            <div className="space-y-2.5">
              {[
                { icon: BookHeart, text: "Play as your ancestors — live their journey" },
                { icon: Map,       text: "World map built from real family locations" },
                { icon: Trophy,    text: "Achievements earned by preserving history" },
                { icon: Users,     text: "Multiplayer family reunion challenges" },
                { icon: Sparkles,  text: "Nia AI generates quests from your family stories" },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-300/70">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Full game UI ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-28" style={{ background: "#1A0F08" }}>

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}
      >
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <BookHeart className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Niakofa Legacy</h1>
          <p className="text-xs text-amber-700">The Living Family Experience</p>
        </div>
        <button
          onClick={() => navigate("/legacy/achievements")}
          className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5 flex items-center gap-1 active:opacity-70"
        >
          <Trophy className="w-3 h-3" /> Awards
        </button>
        <button
          onClick={() => navigate("/diaspora/timeline")}
          className="text-xs text-amber-600 bg-amber-900/30 border border-amber-800/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1"
        >
          <Scroll className="w-3 h-3" /> Timeline
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      )}

      {!loading && ready && setupDone && (
        <div className="max-w-lg mx-auto">

          {/* ── Progress Hero ── */}
          <div className="px-4 py-5" style={{ background: "linear-gradient(to bottom, #0A0604, #1A0F08)" }}>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-amber-700 uppercase tracking-widest">Your Family World</p>
                  <p className="text-3xl font-black text-amber-400">{progress}%</p>
                  <p className="text-xs text-amber-600">Legacy Complete</p>
                  {worldVersion && worldVersion.currentVersion > 0 && (
                    <p className="text-xs text-amber-500/80 mt-0.5">World v{worldVersion.currentVersion}</p>
                  )}
                </div>
                <div className="w-20 h-20 relative">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(180,100,20,0.2)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#F59E0B"
                      strokeWidth="6" strokeLinecap="round"
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
                <button onClick={() => navigate("/diaspora/family")} className="text-center text-xs active:opacity-70">
                  <p className="text-lg font-black text-amber-300">{families.length}</p>
                  <p className="text-amber-700">Families</p>
                </button>
                <button onClick={() => navigate("/diaspora/tree")} className="text-center text-xs active:opacity-70">
                  <p className="text-lg font-black text-amber-300">{members.length}</p>
                  <p className="text-amber-700">Ancestors</p>
                </button>
                <button
                  onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                  className="text-center text-xs active:opacity-70"
                >
                  <p className="text-lg font-black text-amber-300">{memories.length}</p>
                  <p className="text-amber-700">Stories</p>
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                {chapters.some(c => c.status === "in_progress") && (
                  <button
                    onClick={() => {
                      const inProgress = chapters.find(c => c.status === "in_progress");
                      if (inProgress) navigate(`/legacy/chapter/${inProgress.id}`);
                    }}
                    className="flex-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70 flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> Resume Chapter
                  </button>
                )}
                <button
                  onClick={() => navigate("/legacy/start")}
                  className={`flex-1 ${chapters.some(c => c.status === "in_progress") ? "bg-amber-900/40 border border-amber-700/30 text-amber-400" : "bg-amber-500 text-amber-950"} font-black text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-80 flex items-center justify-center gap-1.5 transition-opacity`}
                >
                  <Play className="w-3.5 h-3.5" /> {chapters.some(c => c.status === "in_progress") ? "New Journey" : "Continue Journey"}
                </button>
                <button
                  onClick={() => navigate("/diaspora/family")}
                  className="bg-amber-900/40 border border-amber-700/30 text-amber-400 font-bold text-xs uppercase tracking-wide px-3 py-2.5 rounded-xl active:opacity-70 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> New
                </button>
              </div>
            </div>
          </div>

          {/* ── Today's Journey (Phase 5: Living Family Universe) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Today's Journey</h2>
              {journeyLoading ? (
                <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                </div>
              ) : todaysJourney ? (
                <div className="bg-gradient-to-b from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-100">{todaysJourney.ancestor.name}</p>
                      <p className="text-xs text-amber-500 mt-0.5">
                        {todaysJourney.ancestor.role && <span className="capitalize">{todaysJourney.ancestor.role}</span>}
                        {todaysJourney.ancestor.birthYear && ` · Born ${todaysJourney.ancestor.birthYear}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-amber-300/80 leading-relaxed italic mb-3">"{todaysJourney.narration}"</p>
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="text-xs text-amber-600 bg-amber-900/30 px-2 py-0.5 rounded-full">{todaysJourney.storyCount} stories</span>
                    <span className="text-xs text-amber-600 bg-amber-900/30 px-2 py-0.5 rounded-full">{todaysJourney.eventCount} events</span>
                    <span className="text-xs text-amber-600 bg-amber-900/30 px-2 py-0.5 rounded-full">{todaysJourney.placeCount} places</span>
                    <span className="text-xs text-amber-500 bg-amber-800/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" /> ~{Math.max(5, Math.min(20, (todaysJourney.storyCount + todaysJourney.eventCount) * 2))} min
                    </span>
                  </div>
                  <button
                    onClick={() => navigate("/legacy/start")}
                    className="w-full bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-80 flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" /> Begin Journey
                  </button>
                </div>
              ) : (
                <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4">
                  <p className="text-xs text-amber-600">Add more family members and stories to unlock your daily journey.</p>
                </div>
              )}
            </div>
          )}

          {/* ── World Evolution (Phase 5: Living Family Universe) ── */}
          {activeMode === "legacy" && worldVersion && worldVersion.currentVersion > 0 && (
            <div className="px-4 mb-5">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Family World Evolution</h2>
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-2xl font-black text-amber-400">Version {worldVersion.currentVersion}</p>
                    <p className="text-xs text-amber-600">{worldVersion.totalChanges} total changes</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
                {worldVersion.recentChanges.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-amber-900/30">
                    {worldVersion.recentChanges.slice(0, 3).map((change) => (
                      <div key={change.id} className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                          change.changeType === "world_regenerated" ? "bg-purple-400" :
                          change.changeType === "member_added" ? "bg-emerald-400" :
                          change.changeType === "memory_added" ? "bg-amber-400" :
                          change.changeType === "story_added" ? "bg-sky-400" :
                          change.changeType === "interview_added" ? "bg-rose-400" :
                          change.changeType === "place_added" ? "bg-teal-400" :
                          "bg-amber-600"
                        }`} />
                        <p className="text-xs text-amber-400/70 leading-tight">{change.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── World Evolution Celebration (Phase 5: Living Family Universe) ── */}
          {activeMode === "legacy" && dailyWelcome && dailyWelcome.hasChanges && !worldEvolvedDismissed && (
            <div className="px-4 mb-5">
              <div className="bg-gradient-to-br from-amber-500/15 via-amber-900/10 to-[#2A1A0F] border border-amber-500/40 rounded-2xl p-5 shadow-xl animate-[fadeIn_0.6s_ease-out] relative overflow-hidden">
                {/* Ambient shimmer */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent animate-pulse" />
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-amber-300 uppercase tracking-widest">Your Family World Has Evolved</h2>
                      {dailyWelcome.worldVersion > 0 && (
                        <p className="text-xs text-amber-500 font-bold mt-0.5">Version {dailyWelcome.worldVersion}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setWorldEvolvedDismissed(true)}
                    className="text-amber-700 active:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Evolution stats grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {dailyWelcome.newMemoryCount > 0 && (
                    <div className="bg-amber-500/10 border border-amber-600/20 rounded-xl p-3 text-center">
                      <Camera className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <p className="text-lg font-black text-amber-300">{dailyWelcome.newMemoryCount}</p>
                      <p className="text-[10px] text-amber-600 uppercase">New Memories</p>
                    </div>
                  )}
                  {dailyWelcome.newMemberCount > 0 && (
                    <div className="bg-emerald-500/10 border border-emerald-600/20 rounded-xl p-3 text-center">
                      <Users className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <p className="text-lg font-black text-emerald-300">{dailyWelcome.newMemberCount}</p>
                      <p className="text-[10px] text-emerald-600 uppercase">New Characters</p>
                    </div>
                  )}
                  {dailyWelcome.newChapters.length > 0 && (
                    <div className="bg-purple-500/10 border border-purple-600/20 rounded-xl p-3 text-center">
                      <BookOpen className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                      <p className="text-lg font-black text-purple-300">{dailyWelcome.newChapters.length}</p>
                      <p className="text-[10px] text-purple-600 uppercase">New Chapters</p>
                    </div>
                  )}
                  {dailyWelcome.recentChanges.length > 0 && (
                    <div className="bg-teal-500/10 border border-teal-600/20 rounded-xl p-3 text-center">
                      <TrendingUp className="w-4 h-4 text-teal-400 mx-auto mb-1" />
                      <p className="text-lg font-black text-teal-300">{dailyWelcome.recentChanges.length}</p>
                      <p className="text-[10px] text-teal-600 uppercase">World Changes</p>
                    </div>
                  )}
                </div>
                {/* Recent changes list */}
                {dailyWelcome.recentChanges.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {dailyWelcome.recentChanges.slice(0, 3).map((change, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                          change.changeType === "world_regenerated" ? "bg-purple-400" :
                          change.changeType === "member_added" ? "bg-emerald-400" :
                          change.changeType === "memory_added" ? "bg-amber-400" :
                          change.changeType === "story_added" ? "bg-sky-400" :
                          change.changeType === "interview_added" ? "bg-rose-400" :
                          change.changeType === "place_added" ? "bg-teal-400" :
                          "bg-amber-600"
                        }`} />
                        <p className="text-xs text-amber-400/80">{change.description}</p>
                      </div>
                    ))}
                  </div>
                )}
                {/* New chapters */}
                {dailyWelcome.newChapters.length > 0 && (
                  <div className="pt-3 border-t border-amber-700/30 mb-3">
                    <p className="text-xs text-amber-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> New Chapter Unlocked
                    </p>
                    {dailyWelcome.newChapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => navigate(`/legacy/chapter/${ch.id}`)}
                        className="block w-full text-left bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-sm text-amber-300 active:opacity-70 mb-1.5 flex items-center justify-between"
                      >
                        <span>{ch.title}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setWorldEvolvedDismissed(true); navigate("/legacy/start"); }}
                  className="w-full bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-80 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Continue Journey
                </button>
              </div>
            </div>
          )}

          {/* ── Emotional Calendar (Phase 5: Living Family Universe) ── */}
          {activeMode === "legacy" && emotionalCalendar.length > 0 && (
            <div className="px-4 mb-5">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Family Calendar</h2>
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
                {emotionalCalendar.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      entry.isToday
                        ? "bg-amber-500/20 border border-amber-400/40 animate-pulse"
                        : entry.type === "birthday"
                        ? "bg-rose-500/10 border border-rose-500/20"
                        : entry.type === "anniversary"
                        ? "bg-purple-500/10 border border-purple-500/20"
                        : entry.type === "memorial"
                        ? "bg-stone-500/10 border border-stone-500/20"
                        : "bg-teal-500/10 border border-teal-500/20"
                    }`}>
                      <span className="text-xs font-bold text-amber-300">
                        {entry.isToday ? "NOW" : entry.daysUntil === 0 ? "TODAY" : entry.daysUntil > 0 ? `${entry.daysUntil}d` : "PAST"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-100">{entry.title}</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {entry.yearsAgo ? `${entry.yearsAgo} ${entry.yearsAgo === 1 ? "year" : "years"} ago` : ""}
                        {entry.memberName && ` · ${entry.memberName}`}
                      </p>
                      {entry.description && (
                        <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{entry.description}</p>
                      )}
                      {entry.isToday && (
                        <button
                          onClick={() => navigate("/legacy/ai-director")}
                          className="mt-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1 active:opacity-70"
                        >
                          <Heart className="w-3 h-3" /> Honor this day
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Phase 5 Navigation: AI Director, Mysteries, Characters ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => navigate("/legacy/ai-director")} className="bg-[#2A1A0F] border border-amber-700/30 rounded-xl p-3 text-center active:opacity-70 transition-opacity relative">
                  <Sparkles className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] font-bold text-amber-300 uppercase">AI Director</p>
                  <p className="text-[8px] text-amber-700 mt-0.5">Daily Missions</p>
                  {missionCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-amber-500 text-amber-950 text-[9px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {missionCount}
                    </span>
                  )}
                </button>
                <button onClick={() => navigate("/legacy/mysteries")} className="bg-[#2A1A0F] border border-amber-700/30 rounded-xl p-3 text-center active:opacity-70 transition-opacity relative">
                  <Search className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] font-bold text-amber-300 uppercase">Mysteries</p>
                  <p className="text-[8px] text-amber-700 mt-0.5">Investigate</p>
                  {mysteryCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-rose-500 text-white text-[9px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {mysteryCount}
                    </span>
                  )}
                </button>
                <button onClick={() => navigate("/legacy/characters")} className="bg-[#2A1A0F] border border-amber-700/30 rounded-xl p-3 text-center active:opacity-70 transition-opacity">
                  <TrendingUp className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] font-bold text-amber-300 uppercase">Characters</p>
                  <p className="text-[8px] text-amber-700 mt-0.5">Living Family</p>
                </button>
              </div>
            </div>
          )}

          {/* ── Game Mode Selector ── */}
          <div className="px-4 mb-5">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Game Modes</h2>
            <div className="grid grid-cols-2 gap-2">
              {GAME_MODES.map(mode => {
                const c = MODE_COLORS[mode.color];
                const isActive = activeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setActiveMode(mode.id)}
                    className={`text-left p-3 rounded-xl border transition-all active:scale-95 ${
                      isActive
                        ? `${c.bg} ${c.ring} ring-2 shadow-lg ${c.glow}`
                        : "bg-[#2A1A0F] border-amber-900/30"
                    }`}
                  >
                    <mode.icon className={`w-5 h-5 mb-1.5 ${isActive ? c.text : "text-amber-800"}`} />
                    <p className={`text-xs font-bold uppercase tracking-wide ${isActive ? c.text : "text-amber-600"}`}>
                      {mode.label}
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5 leading-tight">{mode.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Active Ancestor / Character (Legacy mode only) ── */}
          {activeMode === "legacy" && ancestor && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Your Ancestor</h2>
                <div className="flex items-center gap-3">
                  {ancestorCandidate && (
                    <button onClick={() => navigate(`/legacy/character/${ancestorCandidate.memberId}`)} className="text-xs text-amber-500 flex items-center gap-1">
                      Bio <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => navigate("/diaspora/tree")} className="text-xs text-amber-600 flex items-center gap-1">
                    Change <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0 text-xl font-black text-amber-400">
                    {memberInitials(ancestor)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-amber-100">{ancestor.display_name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-amber-500 bg-amber-900/30 px-2 py-0.5 rounded-full capitalize">{ancestor.role}</p>
                      {ancestor.relation_note && (
                        <p className="text-xs text-amber-600">{ancestor.relation_note}</p>
                      )}
                    </div>
                    {ancestorCandidate && (
                      <p className="text-xs text-purple-400/70 mt-1.5 italic">{ancestorCandidate.selectionReason}</p>
                    )}
                    {completeness && ancestorCandidate && (
                      <div className="mt-2 space-y-1.5">
                        <StatBar label="Knowledge" value={Math.min(100, (ancestorCandidate.storyCount * 10) + (ancestorCandidate.memoryCount * 5))} color="bg-sky-500" />
                        <StatBar label="Relationships" value={Math.min(100, ancestorCandidate.eventCount * 15)} color="bg-rose-500" />
                        <StatBar label="Cultural Wisdom" value={Math.min(100, ancestorCandidate.interviewCount * 25)} color="bg-amber-500" />
                        <StatBar label="Courage" value={Math.min(100, ancestorCandidate.completenessScore)} color="bg-emerald-500" />
                        <StatBar label="Reputation" value={Math.min(100, ancestorCandidate.photoCount * 10)} color="bg-purple-500" />
                        <StatBar label="Legacy" value={Math.min(100, ancestorCandidate.placeCount * 15)} color="bg-teal-500" />
                        <StatBar label="Faith" value={Math.min(100, ancestorCandidate.interviewCount * 15 + ancestorCandidate.storyCount * 5)} color="bg-pink-500" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-amber-900/30">
                  <p className="text-xs text-amber-700">
                    {completeness?.missingData.length
                      ? `Missing: ${completeness.missingData.slice(0, 2).join(", ")}`
                      : "Ancestor profile is rich and ready for chapter play."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── World Map: Real family migration timeline (Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family World Map</h2>
                {families[0] && (
                  <button onClick={() => navigate(`/legacy/map/${families[0].id}`)} className="text-xs text-amber-600 flex items-center gap-1">
                    Full Map <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {mapData && mapData.places.length > 0 ? (
                <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
                  {/* Migration summary */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Map className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-100">Your Family's Journey</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {mapData.places.length} places
                        {mapData.placesDiscovered > 0 && <> · <span className="text-emerald-400">{mapData.placesDiscovered} discovered</span></>}
                        {mapData.placesWithCoordinates > 0 && <> · {mapData.placesWithCoordinates} on map</>}
                      </p>
                    </div>
                  </div>
                  {/* Migration timeline — real places in chronological order */}
                  <div className="relative pl-5">
                    <div className="absolute left-1.5 top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-600/40 via-amber-700/30 to-amber-900/20" />
                    {mapData.places.slice(0, 6).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/legacy/map/${families[0]?.id ?? 0}`)}
                        className="relative flex items-start gap-3 pb-4 w-full text-left active:opacity-70"
                      >
                        <div className={`absolute -left-[14px] w-3 h-3 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                          p.discovered
                            ? "bg-emerald-500 border-emerald-300"
                            : p.lat !== null
                              ? "bg-amber-500 border-amber-300"
                              : "bg-amber-900 border-amber-700"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-amber-200 truncate">{p.label}</p>
                            {p.year && <span className="text-xs text-amber-500 font-bold flex-shrink-0">{p.year}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.country && <p className="text-xs text-amber-700 truncate">{p.country}</p>}
                            {p.discovered && (
                              <span className="flex items-center gap-0.5 text-xs text-emerald-400 flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" /> Visited
                              </span>
                            )}
                          </div>
                          {p.chapterNumbers.length > 0 && (
                            <p className="text-xs text-amber-800 mt-0.5">Chapter {p.chapterNumbers.join(", ")}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {mapData.places.length > 6 && (
                    <button
                      onClick={() => navigate(`/legacy/map/${families[0]?.id ?? 0}`)}
                      className="w-full mt-1 text-xs text-amber-500 font-bold uppercase tracking-wide py-2 active:opacity-70"
                    >
                      View all {mapData.places.length} places
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 text-center">
                  <Map className="w-8 h-8 text-amber-900 mx-auto mb-2" />
                  <p className="text-xs text-amber-700 mb-2">No family places tagged yet</p>
                  <button
                    onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                    className="text-xs text-amber-500 underline"
                  >
                    Add your first family landmark
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Story Chapters (Legacy mode only) ── */}
          {activeMode === "legacy" && chapters.length > 0 && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Story Chapters</h2>
                <button onClick={() => navigate("/diaspora/timeline")} className="text-xs text-amber-600 flex items-center gap-1">
                  Full Timeline <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max px-1">
                  {chapters.map((ch, i) => {
                    const unlocked = ch.status !== "locked";
                    return (
                      <button
                        key={ch.id}
                        onClick={() => unlocked && navigate(`/legacy/chapter/${ch.id}`)}
                        className={`flex flex-col gap-2 p-3 rounded-xl border transition-all active:opacity-70 ${
                          unlocked
                            ? "bg-[#2A1A0F] border-amber-900/30"
                            : "bg-[#1A1008] border-amber-950/40 opacity-50"
                        }`}
                        style={{ minWidth: 130 }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-500 uppercase tracking-wide">Ch {ch.chapter_number}</span>
                          {unlocked
                            ? <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                            : <Lock className="w-3.5 h-3.5 text-amber-900" />}
                        </div>
                        <p className={`text-xs font-bold ${unlocked ? "text-amber-200" : "text-amber-900"}`}>
                          {ch.title}
                        </p>
                        <p className="text-xs text-amber-700 capitalize">
                          {ch.status}
                        </p>
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

          {/* ── AI Dialogue Panel (real scene data, Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family Dialogue</h2>
                <div className="flex items-center gap-1 bg-purple-900/30 border border-purple-700/30 rounded-full px-2 py-0.5">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span className="text-xs text-purple-400 font-medium">Nia AI</span>
                </div>
              </div>
            </div>
            <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4">
              {scenesLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                  <p className="text-xs text-amber-600">Loading scenes from your family vault…</p>
                </div>
              ) : scenes.length > 0 ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-200">{scenes[0].title}</p>
                      <p className="text-xs text-amber-600 mt-1 leading-relaxed italic">
                        "{scenes[0].content.slice(0, 180)}{scenes[0].content.length > 180 ? "…" : ""}"
                      </p>
                      <p className="text-xs text-purple-400/60 mt-1.5">
                        {scenes[0].historicalLayer === "verified" ? "Verified History" : "Narrative Interpretation"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => activeChapterId && navigate(`/legacy/chapter/${activeChapterId}`)}
                      className="flex-1 bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70"
                    >
                      Enter Scene
                    </button>
                    <button
                      onClick={() => {
                        if (scenes.length > 1) {
                          setActiveSceneIdx(prev => (prev + 1) % scenes.length);
                        } else {
                          setActiveChapterId(prev => {
                            const idx = chapters.findIndex(c => c.id === prev);
                            const next = chapters[idx + 1] ?? chapters[0];
                            return next?.id ?? prev;
                          });
                        }
                      }}
                      className="flex-1 bg-[#3A2A1A] border border-amber-900/30 text-amber-700 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70"
                    >
                      Next Scene
                    </button>
                  </div>
                  <p className="text-xs text-amber-700 mt-2 text-center">
                    From your family vault — {chapters.find(c => c.id === activeChapterId)?.title ?? "Chapter 1"}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-200">{ancestor?.display_name ?? "Elder"}</p>
                      <p className="text-xs text-amber-600 mt-1 leading-relaxed italic">
                        "Add memories and stories to your family vault to unlock dialogue scenes."
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                    className="w-full bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70"
                  >
                    Add a Memory
                  </button>
                </>
              )}
            </div>
            </div>
          )}

          {/* ── In-Game Characters Panel (Legacy mode only) ── */}
          {activeMode === "legacy" && members.length > 0 && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Characters</h2>
                <button onClick={() => navigate("/diaspora/tree")} className="text-xs text-amber-600 flex items-center gap-1">
                  Full Tree <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="flex gap-3 min-w-max px-1">
                  {members.slice(0, 8).map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => navigate("/diaspora/tree")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:opacity-70 ${
                        i === 0 ? "bg-amber-500/10 border-amber-500/40" : "bg-[#2A1A0F] border-amber-900/30"
                      }`}
                      style={{ minWidth: 76 }}
                    >
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-black ${
                        i === 0 ? "bg-amber-500/30 text-amber-300" : "bg-amber-900/40 text-amber-700"
                      }`}>
                        {memberInitials(m)}
                      </div>
                      <p className="text-xs font-medium text-amber-200 text-center leading-tight line-clamp-2" style={{ maxWidth: 70 }}>
                        {memberFirstName(m)}
                      </p>
                      <p className="text-xs text-amber-800 capitalize">{m.role}</p>
                    </button>
                  ))}
                  <button
                    onClick={() => navigate("/diaspora/tree")}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-amber-900/40 active:opacity-70"
                    style={{ minWidth: 76 }}
                  >
                    <Plus className="w-5 h-5 text-amber-800" />
                    <p className="text-xs text-amber-800">Add</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Cooperative Family Quests (Quests mode only) ── */}
          {activeMode === "quests" && (
            <div className="px-4 mb-5">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Family Quests</h2>
              {familyQuestsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                </div>
              ) : familyQuests.length > 0 ? (
                <div className="space-y-3">
                  {familyQuests.map((q) => (
                    <div
                      key={q.key}
                      className={`rounded-2xl p-4 border ${
                        q.completed
                          ? "bg-emerald-900/15 border-emerald-700/30"
                          : "bg-[#2A1A0F] border-amber-700/30"
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          q.completed ? "bg-emerald-500/15" : "bg-amber-500/10"
                        }`}>
                          {q.completed
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <Target className={`w-4 h-4 ${q.completed ? "text-emerald-400" : "text-amber-400"}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-amber-100">{q.title}</p>
                          <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">{q.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2 bg-[#3A2A1A] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${q.completed ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${Math.min(100, (q.progress / q.goal) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-amber-400">
                          {q.progress}/{q.goal}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-700">Reward:</span>
                        <span className="text-xs text-amber-500 font-medium">{q.reward}</span>
                      </div>
                      {q.leaderboard && q.leaderboard.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-amber-900/30">
                          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-2">Family Leaderboard</p>
                          <div className="space-y-1">
                            {q.leaderboard.slice(0, 3).map((p, i) => (
                              <div key={p.memberId} className="flex items-center gap-2">
                                <span className={`text-xs font-bold w-4 ${i === 0 ? "text-amber-400" : "text-amber-700"}`}>
                                  {i + 1}
                                </span>
                                <span className="text-xs text-amber-200 flex-1 truncate">{p.name}</span>
                                <span className="text-xs text-amber-500 font-bold">{p.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Target className="w-8 h-8 text-amber-800 mx-auto mb-2" />
                  <p className="text-xs text-amber-700">Loading family quests...</p>
                </div>
              )}
            </div>
          )}

          {/* ── AI Director Missions Link (Quests mode only) ── */}
          {activeMode === "quests" && (
            <div className="px-4 mb-5">
              <button
                onClick={() => navigate("/legacy/ai-director")}
                className="w-full bg-gradient-to-r from-purple-900/20 to-amber-900/20 border border-purple-700/30 rounded-2xl p-4 flex items-center gap-3 active:opacity-80 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-200">AI Game Director</p>
                  <p className="text-xs text-amber-600 mt-0.5">Get today's missions based on what's missing in your vault</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-700 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── AI Quest Panel (Quests mode or Legacy mode) ── */}
          {(activeMode === "legacy" || activeMode === "quests") && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Active Quest</h2>
                  {isAiEnabled && !questsLoading && aiQuests.length > 0 && (
                    <div className="flex items-center gap-1 bg-purple-900/30 border border-purple-700/30 rounded-full px-2 py-0.5">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="text-xs text-purple-400 font-medium">Nia</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {families[0] && (
                    <button
                      onClick={() => handleRefreshQuests(families[0].id)}
                      disabled={questsRefreshing}
                      className="flex items-center gap-1 text-xs text-amber-600 disabled:opacity-40"
                      title="Nia will re-read your family stories and generate new quests (once per 6h)"
                    >
                      <RefreshCw className={`w-3 h-3 ${questsRefreshing ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  )}
                  {displayQuests.length > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveQuestIdx(i => (i - 1 + displayQuests.length) % displayQuests.length)}
                        className="text-amber-600 active:opacity-70"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-amber-800">{activeQuestIdx + 1}/{displayQuests.length}</span>
                      <button
                        onClick={() => setActiveQuestIdx(i => (i + 1) % displayQuests.length)}
                        className="text-amber-600 active:opacity-70"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg min-h-[140px]">
                {questsLoading ? (
                  <div className="flex flex-col items-center justify-center h-24 gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                      <p className="text-xs text-amber-600">Nia is reading your family stories…</p>
                    </div>
                    <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                  </div>
                ) : activeQuest ? (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        {activeQuest.isAiGenerated
                          ? <Sparkles className="w-5 h-5 text-purple-400" />
                          : <Target className="w-5 h-5 text-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-amber-100">{activeQuest.title}</p>
                        {activeQuest.ancestorName && (
                          <p className="text-xs text-purple-400/80 mt-0.5 flex items-center gap-1">
                            <Crown className="w-3 h-3" /> {activeQuest.ancestorName}
                          </p>
                        )}
                        <p className="text-xs text-amber-600 mt-1 leading-relaxed">{activeQuest.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span className="text-xs text-amber-500 font-bold">+{activeQuest.xp} XP</span>
                          </div>
                          <div className="h-3 w-px bg-amber-900/40" />
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-700" />
                            <span className="text-xs text-amber-700 capitalize">{activeQuest.category}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => navigate(activeQuest.actionPath || (families[0] ? `/family/${families[0].id}` : "/diaspora/family"))}
                        className="flex-1 bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                      >
                        <Target className="w-3.5 h-3.5" /> Start Quest
                      </button>
                      <button
                        onClick={() => families[0] && handleCompleteQuest(families[0].id, activeQuest)}
                        disabled={completedQuestIds.has(activeQuest.id) || completingQuestId === activeQuest.id}
                        className={`flex-1 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl flex items-center justify-center gap-2 border transition-colors ${
                          completedQuestIds.has(activeQuest.id)
                            ? "bg-emerald-500/15 border-emerald-600/30 text-emerald-300"
                            : "bg-amber-500/15 border-amber-600/30 text-amber-300 active:opacity-70"
                        }`}
                      >
                        {completingQuestId === activeQuest.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        {completedQuestIds.has(activeQuest.id) ? "Completed" : "Mark Complete"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* ── Inventory / Collections (Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Inventory</h2>
              </div>
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl overflow-hidden">
                <div className="flex border-b border-amber-900/30">
                  {(["memories", "items", "artifacts"] as InventoryTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setInventoryTab(tab)}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                        inventoryTab === tab ? "text-amber-400 border-b-2 border-amber-500" : "text-amber-700"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="p-3">
                  {inventoryTab === "memories" && (
                    <div className="space-y-2">
                      {memories.slice(0, 4).map(m => (
                        <button
                          key={m.id}
                          onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                          className="w-full flex items-center gap-3 bg-[#3A2A1A] rounded-xl p-3 active:opacity-70 text-left"
                        >
                          <div className="w-9 h-9 rounded-lg bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                            {m.source === "interview"
                              ? <Mic      className="w-4 h-4 text-amber-500" />
                              : <BookHeart className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-200 truncate">{m.title ?? "Untitled memory"}</p>
                            {m.location_label && <p className="text-xs text-amber-700 truncate">{m.location_label}</p>}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
                        </button>
                      ))}
                      {memories.length === 0 && (
                        <div className="text-center py-6">
                          <BookHeart className="w-8 h-8 text-amber-900 mx-auto mb-2" />
                          <p className="text-xs text-amber-700">No memories yet</p>
                          <button
                            onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                            className="mt-2 text-xs text-amber-500 underline"
                          >
                            Add your first memory
                          </button>
                        </div>
                      )}
                      {memories.length > 4 && (
                        <button
                          onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                          className="w-full text-xs text-amber-600 text-center py-2"
                        >
                          View all {memories.length} memories →
                        </button>
                      )}
                    </div>
                  )}
                  {inventoryTab === "items" && (
                    <div className="space-y-2">
                      {(() => {
                        const ach = (k: string) => achievementMap.get(k);
                        const items = [
                          { icon: FileText, label: "Family Storybook",     source: "Memory Keeper",     earned: ach("memory_keeper")?.unlocked ?? false,  provenance: ach("memory_keeper") ? `${ach("memory_keeper")!.progress} / ${ach("memory_keeper")!.goal} memories` : null },
                          { icon: Camera,   label: "Restored Photograph",   source: "Memory Restorer",   earned: ach("memory_restorer")?.unlocked ?? false,  provenance: ach("memory_restorer") ? `${ach("memory_restorer")!.progress} / ${ach("memory_restorer")!.goal} photos` : null },
                          { icon: Mic,      label: "Elder's Voice",        source: "Voice of Elders",   earned: ach("voice_of_elders")?.unlocked ?? false,  provenance: ach("voice_of_elders") ? `${ach("voice_of_elders")!.progress} / ${ach("voice_of_elders")!.goal} interviews` : null },
                          { icon: BookOpen, label: "Heritage Archive",      source: "Legacy Guardian",   earned: ach("legacy_guardian")?.unlocked ?? false,  provenance: ach("legacy_guardian") ? `${ach("legacy_guardian")!.progress} / ${ach("legacy_guardian")!.goal} artifacts` : null },
                          { icon: Star,     label: "Reunion Quilt",        source: "Bridge Builder",    earned: ach("bridge_builder")?.unlocked ?? false,   provenance: ach("bridge_builder") ? `${ach("bridge_builder")!.progress} / ${ach("bridge_builder")!.goal} connections` : null },
                          { icon: Globe2,   label: "Migration Map",        source: "Roots Traveler",    earned: ach("roots_traveler")?.unlocked ?? false,   provenance: ach("roots_traveler") ? `${ach("roots_traveler")!.progress} / ${ach("roots_traveler")!.goal} landmarks` : null },
                        ];
                        return items.map(({ icon: Icon, label, source, earned, provenance }, i) => (
                          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${earned ? "border-amber-600/40 bg-amber-900/20" : "border-amber-950/40 bg-[#1A1008] opacity-50"}`}>
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${earned ? "bg-amber-500/20" : "bg-[#2A1A0F]"}`}>
                              <Icon className={`w-4 h-4 ${earned ? "text-amber-400" : "text-amber-900"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${earned ? "text-amber-200" : "text-amber-800"}`}>{label}</p>
                              <p className="text-[10px] text-amber-700">{source}{provenance ? ` · ${provenance}` : ""}</p>
                            </div>
                            {earned && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {inventoryTab === "artifacts" && (
                    <div className="space-y-2">
                      {(() => {
                        const ach = (k: string) => achievementMap.get(k);
                        const artifacts = [
                          { label: "Family Tree Scroll",     desc: "Your mapped family lineage",          earned: ach("family_detective")?.unlocked ?? false,  source: ach("family_detective") ? `${ach("family_detective")!.progress} / ${ach("family_detective")!.goal} relations` : null },
                          { label: "Ancestor's Walking Stick", desc: "Earned by completing Legacy chapters", earned: ach("ancestor_walker")?.unlocked ?? false,    source: ach("ancestor_walker") ? `${ach("ancestor_walker")!.progress} / ${ach("ancestor_walker")!.goal} chapters` : null },
                          { label: "Traditional Drum",     desc: "The heartbeat of the village",      earned: ach("voice_of_elders")?.unlocked ?? false,  source: ach("voice_of_elders") ? `From oral history` : null },
                          { label: "Diary Page",           desc: "A window into another time",        earned: ach("memory_keeper")?.unlocked ?? false,    source: ach("memory_keeper") ? `${ach("memory_keeper")!.progress} memories preserved` : null },
                          { label: "Family Recipe",        desc: "A taste of home, preserved",        earned: memories.some(m => m.title?.toLowerCase().includes("recipe") || m.description?.toLowerCase().includes("recipe")), source: "From family memories" },
                          { label: "Military Medal",       desc: "Service remembered",                earned: memories.some(m => m.title?.toLowerCase().includes("military") || m.description?.toLowerCase().includes("military") || m.title?.toLowerCase().includes("service")), source: "From family stories" },
                        ];
                        return artifacts.map(({ label, desc, earned, source }, i) => (
                          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${earned ? "border-amber-700/40 bg-amber-900/20" : "border-amber-950/40 bg-[#1A1008] opacity-50"}`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${earned ? "bg-amber-500/20" : "bg-[#2A1A0F]"}`}>
                              <Crown className={`w-4 h-4 ${earned ? "text-amber-400" : "text-amber-900"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold ${earned ? "text-amber-200" : "text-amber-800"}`}>{label}</p>
                              <p className="text-xs text-amber-700">{desc}</p>
                              {source && <p className="text-[10px] text-amber-600 mt-0.5">Source: {source}</p>}
                            </div>
                            {earned && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Achievements (Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Achievements</h2>
                <button
                  onClick={() => navigate("/legacy/achievements")}
                  className="text-xs text-amber-600 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2.5">
                <AchievementBadge icon={BookHeart}  label="Memory Keeper"   current={achievementMap.get("memory_keeper")?.progress ?? memories.length}    total={achievementMap.get("memory_keeper")?.goal ?? 5}   color="bg-amber-500" />
                <AchievementBadge icon={Globe2}     label="Roots Traveler"  current={achievementMap.get("roots_traveler")?.progress ?? 0}                 total={achievementMap.get("roots_traveler")?.goal ?? 10}  color="bg-teal-500" />
                <AchievementBadge icon={Users}      label="Bridge Builder"  current={achievementMap.get("bridge_builder")?.progress ?? members.length}   total={achievementMap.get("bridge_builder")?.goal ?? 3}   color="bg-rose-500" />
                <AchievementBadge icon={Trophy}     label="Ancestor Walker" current={achievementMap.get("ancestor_walker")?.progress ?? 0}                total={achievementMap.get("ancestor_walker")?.goal ?? 3}   color="bg-purple-500" />
              </div>
            </div>
          )}

          {/* ── Oral Story Recording (Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Oral Story Recording</h2>
              </div>
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4">
                <p className="text-xs text-amber-600 mb-3 italic leading-relaxed">
                  "{ORAL_PROMPTS[promptIdx]}"
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-8 rounded-lg bg-[#3A2A1A] overflow-hidden relative">
                    {recording ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-px">
                        {Array.from({ length: 28 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-px bg-amber-500 rounded-full animate-pulse"
                            style={{ height: `${30 + ((i * 7 + recordSeconds * 3) % 50)}%`, opacity: 0.7 }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-xs text-amber-900">Record your story…</p>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-mono text-amber-400 flex-shrink-0">
                    {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (recording) { handleStopRecording(); } else { handleStartRecording(); }
                    }}
                    disabled={uploading}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${
                      recording ? "bg-rose-500/20 border border-rose-500/40 text-rose-400" : "bg-amber-500 text-amber-950"
                    } ${uploading ? "opacity-50" : ""}`}
                  >
                    {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Mic className="w-4 h-4" /> {recording ? "Stop & Save" : "Record Story"}</>}
                  </button>
                  <button
                    onClick={() => setPromptIdx(i => (i + 1) % ORAL_PROMPTS.length)}
                    className="bg-[#3A2A1A] border border-amber-900/30 text-amber-700 px-3 rounded-xl text-xs font-bold"
                  >
                    New Prompt
                  </button>
                </div>
                <button
                  onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                  className="mt-3 w-full text-center text-xs text-amber-700 py-1.5"
                >
                  View all recordings in Family Vault →
                </button>
              </div>
            </div>
          )}

          {/* ── Progress Dashboard (Legacy mode only) ── */}
          {activeMode === "legacy" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Progress Dashboard</h2>
                <button onClick={() => navigate("/diaspora/timeline")} className="text-xs text-amber-600 flex items-center gap-1">
                  View Timeline <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4">
                <div className="relative h-32 mb-4">
                  <div className="absolute inset-0 rounded-xl overflow-hidden bg-gradient-to-b from-amber-900/20 to-amber-950/40">
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-amber-900/30 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      {(() => {
                        const now = Date.now();
                        const days = Array.from({ length: 7 }, (_, i) => {
                          const dayStart = new Date(now - (6 - i) * 86400000);
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = dayStart.getTime() + 86400000;
                          return memories.filter((m) => {
                            const ts = new Date(m.created_at ?? Date.now()).getTime();
                            return ts >= dayStart.getTime() && ts < dayEnd;
                          }).length;
                        });
                        const maxVal = Math.max(...days, 1);
                        return days.map((h, i) => (
                          <div key={i} className="w-4 rounded-sm bg-amber-800/40 transition-all duration-300" style={{ height: (h / maxVal) * 24 + 4 }} />
                        ));
                      })()}
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-4xl font-black text-amber-400">{progress}%</p>
                      <p className="text-xs text-amber-600 uppercase tracking-widest">Legacy Complete</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Stories",   value: memories.length,       icon: BookHeart },
                    { label: "Relatives", value: members.length,        icon: Users     },
                    { label: "Families",  value: families.length,       icon: Shield    },
                    { label: "Quests",    value: displayQuests.length,  icon: Target    },
                  ].map(({ label, value, icon: Icon }, i) => (
                    <div key={i} className="text-center bg-[#3A2A1A] rounded-xl p-2">
                      <Icon className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                      <p className="text-sm font-black text-amber-300">{value}</p>
                      <p className="text-xs text-amber-800">{label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/diaspora/timeline")}
                  className="mt-3 w-full bg-amber-900/30 border border-amber-800/30 text-amber-500 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70"
                >
                  View Full Progress
                </button>
              </div>
            </div>
          )}

          {/* ── Multiplayer / Family Reunion (Reunion mode only) ── */}
          {activeMode === "reunion" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Living Family Universe</h2>
              </div>

              {/* Family Reunion Challenges — real progress from live DB data */}
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg mb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-rose-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-100">Family Challenges</p>
                    <p className="text-xs text-amber-600 mt-0.5">Complete challenges together to unlock family stories.</p>
                  </div>
                </div>

                {/* Challenge cards */}
                {reunionData?.challenges?.length ? (
                  <div className="space-y-3 mb-4">
                    {reunionData.challenges.map((ch) => (
                      <div key={ch.id} className={`rounded-xl border p-3 ${ch.completed ? "bg-emerald-500/5 border-emerald-600/20" : "bg-[#3A2A1A] border-amber-900/20"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-bold text-amber-200">{ch.title}</p>
                          <span className="text-xs font-bold text-amber-400">{ch.progress} / {ch.goal}</span>
                        </div>
                        <p className="text-[10px] text-amber-600 mb-2">{ch.description}</p>
                        <div className="h-1.5 bg-[#2A1A0F] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${ch.completed ? "bg-emerald-500" : "bg-gradient-to-r from-rose-500 to-amber-500"}`}
                            style={{ width: `${Math.min(100, (ch.progress / ch.goal) * 100)}%` }}
                          />
                        </div>
                        {ch.completed && (
                          <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
                            <Star className="w-3 h-3" /> Complete! Reward: {ch.reward}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Backwards-compatible single challenge fallback */
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-amber-700">Progress</span>
                      <span className="text-xs font-bold text-amber-300">
                        {reunionData?.challenge.progress} / {reunionData?.challenge.goal}
                      </span>
                    </div>
                    <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((reunionData?.challenge.progress ?? 0) / (reunionData?.challenge.goal ?? 1)) * 100)}%` }}
                      />
                    </div>
                    {reunionData?.challenge.completed && (
                      <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                        <Star className="w-3 h-3" /> Challenge complete! Reward: {reunionData.challenge.reward}
                      </p>
                    )}
                  </div>
                )}

                {/* Leaderboard */}
                {reunionData && reunionData.leaderboard.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Leaderboard</p>
                    {reunionData.leaderboard.map((entry, i) => (
                      <div key={entry.memberId} className="flex items-center gap-3 bg-[#3A2A1A] rounded-xl p-2.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          i === 0 ? "bg-amber-500/20 text-amber-300" :
                          i === 1 ? "bg-gray-400/20 text-gray-300" :
                          i === 2 ? "bg-orange-700/20 text-orange-400" :
                          "bg-[#2A1A0F] text-amber-700"
                        }`}>
                          {i + 1}
                        </div>
                        <span className="text-sm text-amber-100 flex-1 truncate">{entry.name}</span>
                        <span className="text-xs font-bold text-rose-400">{entry.publishedInterviews}</span>
                      </div>
                    ))}
                  </div>
                )}

                {reunionData && reunionData.leaderboard.length === 0 && (
                  <p className="text-xs text-amber-700 text-center italic mb-4">
                    No interviews published yet. Be the first to record an elder's story!
                  </p>
                )}

                <button
                  onClick={() => navigate("/legacy/challenges")}
                  className="w-full bg-rose-500/15 border border-rose-600/30 text-rose-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                >
                  <Trophy className="w-4 h-4" /> Open Family Challenges
                  {challengeCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {challengeCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Seasonal Events */}
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg mb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-100">Seasonal Events</p>
                    <p className="text-xs text-amber-600 mt-0.5">Shared family missions tied to anniversaries, reunions, and cultural holidays.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/legacy/seasonal-events")}
                  className="w-full bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" /> View Seasonal Events
                </button>
              </div>

              {/* World Evolution */}
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-100">World Evolution</p>
                    <p className="text-xs text-amber-600 mt-0.5">See how your family world has grown and evolved over time.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/legacy/world-evolution")}
                  className="w-full bg-teal-500/15 border border-teal-600/30 text-teal-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> View World Evolution
                </button>
              </div>

              {/* Living Characters */}
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg mt-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-pink-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-100">Living Characters</p>
                    <p className="text-xs text-amber-600 mt-0.5">See how your ancestors evolve as the family preserves more.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/legacy/characters")}
                  className="w-full bg-pink-500/15 border border-pink-600/30 text-pink-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" /> View Character Evolution
                </button>
              </div>
            </div>
          )}

          {/* ── Exploration Mode: Real World Map & Landmarks ── */}
          {activeMode === "exploration" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family World Map</h2>
                {families[0] && (
                  <button
                    onClick={() => navigate(`/legacy/map/${families[0].id}`)}
                    className="text-xs text-amber-600 flex items-center gap-1"
                  >
                    Open Map <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                    <Map className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-100">Explore Your Family's World</p>
                    <p className="text-xs text-amber-600 mt-0.5">Visit real family landmarks and check in via GPS to discover your heritage.</p>
                  </div>
                </div>
                {families[0] ? (
                  <>
                    <button
                      onClick={() => navigate(`/legacy/map/${families[0].id}`)}
                      className="w-full bg-teal-500/15 border border-teal-600/30 text-teal-300 font-bold text-xs uppercase tracking-wide py-3 rounded-xl active:opacity-70 flex items-center justify-center gap-2 mb-3"
                    >
                      <Map className="w-4 h-4" /> Open Family World Map
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                        <p className="text-lg font-black text-teal-400">{completeness?.dimensions.find(d => d.key === "places")?.count ?? 0}</p>
                        <p className="text-xs text-amber-700">Family Places</p>
                      </div>
                      <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                        <p className="text-lg font-black text-emerald-400">{completeness?.dimensions.find(d => d.key === "discovery")?.count ?? 0}</p>
                        <p className="text-xs text-amber-700">Discovered</p>
                      </div>
                    </div>
                    {(completeness?.dimensions.find(d => d.key === "discovery")?.count ?? 0) === 0 &&
                     (completeness?.dimensions.find(d => d.key === "places")?.count ?? 0) > 0 && (
                      <p className="text-xs text-amber-600 mt-3 text-center italic">
                        Visit a family landmark and check in to start discovering your world.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-amber-700 text-center py-4">Join or create a family to explore your world map.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Exploration Mode: Memory Mysteries Link ── */}
          {activeMode === "exploration" && (
            <div className="px-4 mb-5">
              <button
                onClick={() => navigate("/legacy/mysteries")}
                className="w-full bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 flex items-center gap-4 active:opacity-80 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                  <Search className="w-5 h-5 text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-100">Memory Mysteries</p>
                  <p className="text-xs text-amber-700 mt-0.5">Investigate unknown faces, places, and dates in your vault</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-700 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── Exploration Mode: Collaborative Challenges Link ── */}
          {activeMode === "exploration" && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family Challenges</h2>
                <button
                  onClick={() => navigate("/legacy/challenges")}
                  className="text-xs text-amber-600 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => navigate("/legacy/challenges")}
                className="w-full bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 flex items-center gap-4 active:opacity-80"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-amber-100">Collaborative Quests</p>
                  <p className="text-xs text-amber-700 mt-0.5">Work together with family on preservation missions</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-700 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── Family Vault Quick Access ── */}
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family Vault</h2>
              <button
                onClick={() => navigate(families[0] ? `/family/${families[0].id}` : "/diaspora/family")}
                className="text-xs text-amber-600 flex items-center gap-1"
              >
                Open Vault <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: Camera,   label: "Photos",  path: families[0] ? `/family/${families[0].id}?tab=photos`      : "/diaspora/family" },
                { icon: BookOpen, label: "Stories", path: families[0] ? `/family/${families[0].id}`                 : "/diaspora/family" },
                { icon: Volume2,  label: "Audio",   path: families[0] ? `/family/${families[0].id}?tab=interviews`  : "/diaspora/family" },
                { icon: FileText, label: "Docs",    path: families[0] ? `/family/${families[0].id}`                 : "/diaspora/family" },
              ].map(({ icon: Icon, label, path }, i) => (
                <button
                  key={i}
                  onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-2 bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 active:opacity-70"
                >
                  <Icon className="w-5 h-5 text-amber-600" />
                  <p className="text-xs text-amber-700">{label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── Preserve the Culture Card Game ── */}
          <div className="px-4 mb-6">
            <button
              onClick={() => navigate("/diaspora/preserve")}
              className="w-full bg-gradient-to-r from-amber-900/40 to-amber-800/20 border border-amber-700/30 rounded-2xl p-4 flex items-center gap-4 active:opacity-80"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Scroll className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-black text-amber-200 uppercase tracking-wide">Preserve the Culture</p>
                <p className="text-xs text-amber-700 mt-0.5">Conversation card game — spark stories with your family</p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-700 flex-shrink-0" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
