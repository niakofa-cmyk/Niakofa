/**
 * Legacy Mode — The Living Family RPG
 * Route: /legacy
 *
 * The 5th bottom-nav tab. Transforms family vault data into an evolving
 * RPG experience: ancestors become playable characters, memories become
 * quests, and the family vault becomes the game database.
 *
 * AI Quest generation is powered by Nia (Anthropic) reading from a cached
 * Family Knowledge Reservoir — so Claude is called once per fingerprint
 * change, not on every page load.
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
  RefreshCw, ChevronLeft,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

// ─── API response types ─────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface FamilyData {
  id: number;
  name: string;
  member_count: number;
  memory_count?: number;
  my_role: string;
  status: string;
}

/** Shape returned by GET /api/family/:id/members — uses display_name, relation_note */
interface FamilyMember {
  id: number;
  display_name: string;
  role: string;
  relation_note: string | null;
}

interface FamilyMemory {
  id: number;
  title: string | null;
  description: string | null;
  memory_date: string | null;
  location_label: string | null;
  source: string;
  asset_count?: number;
}

interface LegacyState {
  families:      FamilyData[];
  members:       FamilyMember[];
  memories:      FamilyMemory[];
  interviewCount: number;
  loading:       boolean;
}

/** Quest returned by GET /api/legacy/quests/:familyId */
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

/** Fallback quests shown while AI loads or if API unavailable */
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

function memberInitials(m: FamilyMember): string {
  return (m.display_name ?? "?")
    .split(" ")
    .map(p => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function memberFirstName(m: FamilyMember): string {
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
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
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
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-amber-700 mt-1">{current} / {total}</p>
      </div>
      {done && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LegacyModePage() {
  const { currentUser } = useAppContext();
  const [, navigate]   = useLocation();

  // Family data
  const [legacyState, setLegacyState] = useState<LegacyState>({
    families: [], members: [], memories: [], interviewCount: 0, loading: true,
  });

  // Game UI state
  const [activeMode,    setActiveMode]    = useState<GameMode>("legacy");
  const [inventoryTab,  setInventoryTab]  = useState<InventoryTab>("memories");
  const [currentStage,  setCurrentStage]  = useState(0);
  const [recording,     setRecording]     = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [promptIdx,     setPromptIdx]     = useState(0);

  // AI quest state
  const [aiQuests,        setAiQuests]        = useState<AiQuest[]>([]);
  const [questsLoading,   setQuestsLoading]   = useState(false);
  const [questsRefreshing, setQuestsRefreshing] = useState(false);
  const [activeQuestIdx,  setActiveQuestIdx]  = useState(0);
  const [isAiEnabled,     setIsAiEnabled]     = useState(false);
  const questsLoadedRef = useRef(false);

  // Legacy Engine state — real API data
  const [completeness,   setCompleteness]   = useState<CompletenessResponse | null>(null);
  const [ancestors,      setAncestors]      = useState<AncestorCandidate[]>([]);
  const [chapters,       setChapters]       = useState<LegacyChapter[]>([]);
  const [selectedAncestorId, setSelectedAncestorId] = useState<number | null>(null);
  const [scenes,         setScenes]         = useState<ScenesResponse | null>(null);
  const [activeSceneIdx,  setActiveSceneIdx]  = useState(0);
  const [scenesLoading,   setScenesLoading]   = useState(false);

  // Real audio recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);

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

  // ── Load completeness + ancestors after family data is ready ───────────────
  const loadLegacyEngine = useCallback(async (familyId: number) => {
    try {
      const [compRes, ancRes] = await Promise.all([
        fetch(`/api/legacy/completeness/${familyId}`, { headers: authHeaders() }),
        fetch(`/api/legacy/ancestors/${familyId}`,    { headers: authHeaders() }),
      ]);
      if (compRes.ok) setCompleteness(await compRes.json());
      if (ancRes.ok) {
        const ancData = await ancRes.json() as { ancestors: AncestorCandidate[] };
        setAncestors(ancData.ancestors ?? []);
        if (ancData.ancestors?.length > 0 && selectedAncestorId === null) {
          setSelectedAncestorId(ancData.ancestors[0].memberId);
        }
      }
    } catch {
      // Non-critical — game still works with fallback data
    }
  }, [selectedAncestorId]);

  useEffect(() => {
    const { loading, families } = legacyState;
    if (!loading && families.length > 0) {
      loadLegacyEngine(families[0].id);
    }
  }, [legacyState.loading, legacyState.families, loadLegacyEngine]);

  // ── Initialize chapters when readiness is sufficient ───────────────────────
  const initChapters = useCallback(async (familyId: number) => {
    try {
      const res = await fetch(`/api/legacy/chapters/${familyId}/init`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json() as { chapters: LegacyChapter[] };
        setChapters(data.chapters ?? []);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    if (completeness?.chapterUnlockReady && legacyState.families.length > 0 && chapters.length === 0) {
      initChapters(legacyState.families[0].id);
    }
  }, [completeness, legacyState.families, chapters.length, initChapters]);

  // ── Load scenes when a chapter is selected ────────────────────────────────
  const loadScenes = useCallback(async (chapterId: number) => {
    setScenesLoading(true);
    setActiveSceneIdx(0);
    try {
      const res = await fetch(`/api/legacy/chapters/${chapterId}/scenes`, { headers: authHeaders() });
      if (res.ok) {
        setScenes(await res.json());
      }
    } catch {
      // Non-critical
    } finally {
      setScenesLoading(false);
    }
  }, []);

  // ── Transition chapter status ─────────────────────────────────────────────
  const transitionChapter = useCallback(async (chapterId: number, status: string) => {
    try {
      const res = await fetch(`/api/legacy/chapters/${chapterId}/status`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json() as { chapter: LegacyChapter };
        setChapters(prev => prev.map(c => c.id === data.chapter.id ? data.chapter : c));
        return data.chapter;
      }
    } catch {
      // Non-critical
    }
    return null;
  }, []);

  // ── Load AI quests after family data is ready ─────────────────────────────

  const loadAiQuests = useCallback(async (familyId: number) => {
    if (questsLoadedRef.current) return; // only auto-load once per mount
    questsLoadedRef.current = true;
    setQuestsLoading(true);
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { quests: AiQuest[]; isAiEnabled?: boolean };
      setAiQuests(data.quests ?? []);
      setIsAiEnabled(Boolean(data.isAiEnabled));
    } catch {
      // Silently fall back to FALLBACK_QUESTS — no toast, non-critical
      setAiQuests([]);
    } finally {
      setQuestsLoading(false);
    }
  }, []);

  useEffect(() => {
    const { loading, families } = legacyState;
    if (!loading && families.length > 0) {
      loadAiQuests(families[0].id);
    }
  }, [legacyState.loading, legacyState.families, loadAiQuests]);

  // ── Force-refresh AI quests ───────────────────────────────────────────────

  const handleRefreshQuests = useCallback(async (familyId: number) => {
    setQuestsRefreshing(true);
    try {
      const res = await fetch(`/api/legacy/quests/${familyId}/refresh`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json() as { quests?: AiQuest[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Quest refresh failed");
        return;
      }
      setAiQuests(data.quests ?? []);
      setActiveQuestIdx(0);
      toast.success("Nia has crafted new quests from your family's stories!");
    } catch {
      toast.error("Couldn't refresh quests right now");
    } finally {
      setQuestsRefreshing(false);
    }
  }, []);

  // ── Recording timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // ── Real audio recording using MediaRecorder ───────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        // Upload to family vault
        if (families.length > 0) {
          try {
            const formData = new FormData();
            formData.append("audio", audioBlob, `oral-history-${Date.now()}.webm`);
            formData.append("familyId", String(families[0].id));
            formData.append("prompt", ORAL_PROMPTS[promptIdx]);

            const res = await fetch("/api/family/upload-audio", {
              method: "POST",
              headers: authHeaders(),
              body: formData,
            });

            if (res.ok) {
              toast.success("Story saved to your vault!");
              loadData();
            } else {
              toast.error("Failed to save recording — please try again.");
            }
          } catch {
            toast.error("Network error — recording not saved.");
          }
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
    } catch {
      toast.error("Microphone access denied or unavailable.");
    }
  }, [promptIdx, loadData]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordSeconds(0);
  }, []);

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <p className="text-amber-400">Sign in to access Legacy Mode</p>
      </div>
    );
  }

  const { loading, members, memories, interviewCount } = legacyState;
  const families = legacyState.families;
  const ready    = isReady(legacyState);
  const progress = completeness?.readinessScore ?? deriveProgress(legacyState);
  const ancestor = ancestors.length > 0
    ? ancestors[0]
    : null;
  const mm       = Math.floor(recordSeconds / 60);
  const ss       = recordSeconds % 60;

  // Build dynamic world stages from chapters (replaces static WORLD_STAGES)
  const worldStages = chapters.length > 0
    ? chapters.map((ch, i) => ({
        id: ch.id,
        label: (ch.chapter_data as Record<string, unknown>)?.location as string ?? ch.title,
        chapter: ch.title,
        locked: ch.status === "locked",
        completed: ch.status === "completed",
        inProgress: ch.status === "in_progress",
        era: (ch.chapter_data as Record<string, unknown>)?.era as string ?? "",
      }))
    : [];

  // Stats from real ancestor data instead of count-derived math
  const stats = ancestor
    ? {
        knowledge:    Math.min(100, ancestor.storyCount * 15 + ancestor.memoryCount * 3 + 10),
        reputation:   Math.min(100, (ancestor.relation ? 20 : 0) + ancestor.eventCount * 10 + 10),
        health:       Math.min(100, ancestor.interviewCount * 20 + ancestor.photoCount * 5 + 30),
        culturalWisdom: Math.min(100, ancestor.storyCount * 10 + ancestor.eventCount * 5 + 15),
        courage:      Math.min(100, ancestor.eventCount * 8 + ancestor.interviewCount * 10 + 20),
        legacy:       ancestor.completenessScore,
      }
    : { knowledge: 10, reputation: 5, health: 20, culturalWisdom: 10, courage: 15, legacy: 0 };

  // Determine which quests to display: AI quests if loaded, otherwise fallback templates
  const displayQuests: AiQuest[] = aiQuests.length > 0
    ? aiQuests
    : FALLBACK_QUESTS.map(q => ({
        ...q,
        actionPath: q.actionPath || (families[0] ? `/family/${families[0].id}` : "/diaspora/family"),
      }));
  const activeQuest = displayQuests[activeQuestIdx] ?? displayQuests[0];

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
              <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${unlockPct}%` }} />
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

      {!loading && ready && (
        <div className="max-w-lg mx-auto">

          {/* ── Progress Hero ── */}
          <div className="px-4 py-5" style={{ background: "linear-gradient(to bottom, #0A0604, #1A0F08)" }}>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-amber-700 uppercase tracking-widest">Journey Readiness</p>
                  <p className="text-3xl font-black text-amber-400">{progress}%</p>
                  <p className="text-xs text-amber-600">{completeness?.chapterUnlockReady ? "Chapters Unlocked" : "Add more to unlock"}</p>
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
                <button
                  onClick={() => navigate("/legacy/play")}
                  className="flex-1 bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-80 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Begin Journey
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

          {/* ── Active Ancestor / Character ── */}
          {ancestor && (
            <div className="px-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Your Ancestor</h2>
                <button onClick={() => navigate("/diaspora/tree")} className="text-xs text-amber-600 flex items-center gap-1">
                  Change <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0 text-xl font-black text-amber-400">
                    {ancestor.name.split(" ").map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-amber-100">{ancestor.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-amber-500 bg-amber-900/30 px-2 py-0.5 rounded-full capitalize">{ancestor.role}</p>
                      {ancestor.relation && (
                        <p className="text-xs text-amber-600">{ancestor.relation}</p>
                      )}
                      {ancestor.birthYear && (
                        <p className="text-xs text-amber-700 mt-0.5">Born: {ancestor.birthYear}{ancestor.deathYear ? ` — Died: ${ancestor.deathYear}` : ""}</p>
                      )}
                      {ancestor.selectionReason && (
                        <p className="text-xs text-amber-600/70 mt-1 italic">{ancestor.selectionReason}</p>
                      )}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <StatBar label="Knowledge"     value={stats.knowledge}     color="bg-blue-500" />
                      <StatBar label="Relationships"  value={stats.reputation}    color="bg-teal-500" />
                      <StatBar label="Cultural Wisdom" value={stats.culturalWisdom} color="bg-amber-500" />
                      <StatBar label="Courage"        value={stats.courage}       color="bg-rose-500" />
                      <StatBar label="Legacy"         value={stats.legacy}        color="bg-emerald-500" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-amber-900/30">
                  <p className="text-xs text-amber-700">
                    Preserving their memory strengthens the family legacy — add their birth year and stories.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── World Map / Stages ── */}
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">World Map</h2>
              <button onClick={() => navigate("/diaspora/timeline")} className="text-xs text-amber-600 flex items-center gap-1">
                Full Map <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max px-1">
                {(worldStages.length > 0 ? worldStages : []).map((stage, i) => {
                  const active = currentStage === i;
                  const done   = stage.completed;
                  return (
                    <div key={stage.id} className="flex items-center gap-2">
                      <button
                        onClick={() => !stage.locked && setCurrentStage(i)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                          stage.locked
                            ? "bg-[#1A1008] border-amber-950/40 opacity-50 cursor-not-allowed"
                            : active
                              ? "bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/10"
                              : done
                                ? "bg-amber-900/20 border-amber-700/40"
                                : "bg-[#2A1A0F] border-amber-900/30"
                        }`}
                        style={{ minWidth: 90 }}
                      >
                        {stage.locked
                          ? <Lock className="w-5 h-5 text-amber-900" />
                          : done
                            ? <CheckCircle2 className="w-5 h-5 text-amber-500" />
                            : <Map className={`w-5 h-5 ${active ? "text-amber-400" : "text-amber-700"}`} />}
                        <p className={`text-xs font-bold text-center leading-tight ${active ? "text-amber-200" : stage.locked ? "text-amber-900" : "text-amber-600"}`}>
                          {stage.era ? `${stage.era} — ` : ""}{stage.label}
                        </p>
                        <p className={`text-xs ${active ? "text-amber-500" : "text-amber-900"}`}>{stage.chapter}</p>
                      </button>
                      {i < worldStages.length - 1 && (
                        <div className={`w-6 h-0.5 flex-shrink-0 ${done ? "bg-amber-500" : "bg-amber-900/40"}`} />
                      )}
                    </div>
                  );
                })}
                {worldStages.length === 0 && (
                  <p className="text-xs text-amber-700 px-4 py-3">
                    {completeness?.chapterUnlockReady
                      ? "Initializing chapters from your family data..."
                      : `Journey readiness: ${completeness?.readinessScore ?? 0}% — add more family data to unlock the world map.`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── In-Game Characters Panel ── */}
          {members.length > 0 && (
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

          {/* ── AI Quest Panel ── */}
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
                  <button
                    onClick={() => navigate(activeQuest.actionPath || (families[0] ? `/family/${families[0].id}` : "/diaspora/family"))}
                    className="mt-3 w-full bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70 flex items-center justify-center gap-2"
                  >
                    <Target className="w-3.5 h-3.5" /> Start Quest
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* ── Inventory / Collections ── */}
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
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: FileText, label: "Old Letter",      earned: memories.some(m => m.source === "upload") },
                      { icon: Camera,   label: "Family Photo",    earned: memories.some(m => m.source === "upload") },
                      { icon: Mic,      label: "Voice Recording", earned: interviewCount > 0 },
                      { icon: BookOpen, label: "Family Bible",    earned: false },
                      { icon: Star,     label: "Gold Medal",      earned: members.length >= 5 },
                      { icon: Globe2,   label: "Passport",        earned: false },
                    ].map(({ icon: Icon, label, earned }, i) => (
                      <div key={i} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${earned ? "border-amber-600/40 bg-amber-900/20" : "border-amber-950/40 bg-[#1A1008] opacity-50"}`}>
                        <Icon className={`w-5 h-5 ${earned ? "text-amber-400" : "text-amber-900"}`} />
                        <p className="text-xs text-amber-600 text-center leading-tight">{label}</p>
                        {earned && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </div>
                    ))}
                  </div>
                )}
                {inventoryTab === "artifacts" && (
                  <div className="space-y-2">
                    {[
                      { label: "Ancestral Necklace",  desc: "Passed down through generations",  earned: members.length >= 3   },
                      { label: "Mission School Book",  desc: "Knowledge from the old ways",       earned: false                 },
                      { label: "Traditional Drum",     desc: "The heartbeat of the village",      earned: interviewCount >= 1   },
                      { label: "Diary Page",           desc: "A window into another time",        earned: memories.length >= 2  },
                    ].map(({ label, desc, earned }, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${earned ? "border-amber-700/40 bg-amber-900/20" : "border-amber-950/40 bg-[#1A1008] opacity-50"}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${earned ? "bg-amber-500/20" : "bg-[#2A1A0F]"}`}>
                          <Crown className={`w-4 h-4 ${earned ? "text-amber-400" : "text-amber-900"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${earned ? "text-amber-200" : "text-amber-800"}`}>{label}</p>
                          <p className="text-xs text-amber-700">{desc}</p>
                        </div>
                        {earned && <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Achievements ── */}
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Achievements</h2>
            </div>
            <div className="space-y-2.5">
              <AchievementBadge icon={BookHeart} label="Story Keeper"     current={memories.length}       total={100} color="bg-amber-500" />
              <AchievementBadge icon={Globe2}    label="Roots Explorer"   current={families.length}       total={10}  color="bg-teal-500" />
              <AchievementBadge icon={Users}     label="Family Connector" current={members.length}        total={5}   color="bg-rose-500" />
              <AchievementBadge icon={Trophy}    label="Legacy Builder"   current={Math.min(50, memories.length * 2 + members.length * 3)} total={50} color="bg-purple-500" />
            </div>
          </div>

          {/* ── Oral Story Recording ── */}
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
                    if (recording) {
                      stopRecording();
                      // Invalidate reservoir so next quest load gets updated counts
                      if (families[0]) {
                        fetch(`/api/legacy/reservoir/${families[0].id}/invalidate`, {
                          method: "POST", headers: authHeaders(),
                        }).catch(() => { /* fire-and-forget */ });
                      }
                    } else {
                      startRecording();
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${
                    recording
                      ? "bg-rose-500/20 border border-rose-500/40 text-rose-400"
                      : "bg-amber-500 text-amber-950"
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  {recording ? "Stop & Save" : "Record Story"}
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

          {/* ── Progress Dashboard ── */}
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
                    {[3, 5, 2, 6, 4, 7, 3].map((h, i) => (
                      <div key={i} className="w-4 rounded-sm bg-amber-800/40" style={{ height: h * 4 }} />
                    ))}
                  </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-4xl font-black text-amber-400">{progress}%</p>
                    <p className="text-xs text-amber-600 uppercase tracking-widest">Journey Readiness</p>
                  </div>
                </div>
              </div>
              {completeness && completeness.suggestions.length > 0 && (
                <div className="mt-3 bg-amber-900/20 border border-amber-800/30 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">Next Steps</p>
                  <ul className="space-y-1">
                    {completeness.suggestions.slice(0, 3).map((s, i) => (
                      <li key={i} className="text-xs text-amber-600/80 flex items-start gap-1.5">
                        <ChevronRight className="w-3 h-3 text-amber-700 flex-shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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

          {/* ── Multiplayer / Family Reunion ── */}
          <div className="px-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Family Reunion Challenge</h2>
            </div>
            <div className="bg-[#2A1A0F] border border-amber-800/30 rounded-2xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-amber-100">Family Reunion Event</p>
                  <p className="text-xs text-amber-700">Ongoing — Work together</p>
                </div>
              </div>
              <div className="bg-[#3A2A1A] rounded-xl p-3 mb-3">
                <p className="text-xs font-bold text-amber-200 mb-1">Everyone must record one elder's story.</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-amber-950 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (interviewCount / 5) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-amber-600 font-bold flex-shrink-0">{interviewCount} / 5</p>
                </div>
                <p className="text-xs text-amber-700 mt-1.5">
                  Reward: Unlock <span className="text-amber-500 font-bold">The Family Migration Story</span>
                </p>
              </div>
              <div className="space-y-1.5">
                {members.slice(0, 4).map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2 py-1">
                    <p className="text-xs text-amber-800 w-4 font-bold">{i + 1}</p>
                    <div className="w-6 h-6 rounded-full bg-amber-900/40 flex items-center justify-center text-xs font-bold text-amber-600">
                      {(m.display_name ?? "?")[0]}
                    </div>
                    <p className="flex-1 text-xs text-amber-300">{memberFirstName(m)}</p>
                    <p className="text-xs text-amber-600 font-bold">{(5 - i) * 400 + 200} XP</p>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-amber-700 text-center py-2">Invite family members to start the challenge</p>
                )}
              </div>
              <button
                onClick={() => navigate("/diaspora/family")}
                className="mt-3 w-full bg-amber-500/10 border border-amber-600/30 text-amber-400 font-bold text-xs uppercase tracking-wide py-2.5 rounded-xl active:opacity-70"
              >
                Invite Family Members
              </button>
            </div>
          </div>

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
