/**
 * Legacy Chapter Play — Interactive Scene Viewer
 * Route: /legacy/chapter/:chapterId
 *
 * This is the actual gameplay page. It:
 * 1. Loads chapter scenes from the API
 * 2. Renders each scene with its historical layer label
 * 3. Shows dialogue choices with consequences
 * 4. Tracks scene progress and saves to server
 * 5. Transitions chapter to completed when all scenes are done
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen,
  CheckCircle2, ChevronRight, Sparkles, AlertCircle,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Scene {
  sceneNumber: number;
  title: string;
  type: "narration" | "dialogue" | "reflection" | "context";
  content: string;
  placeId: number | null;
  eventId: number | null;
  memoryId: number | null;
  /** Only present on "context" scenes — short real-world historical topic tags. */
  topics?: string[];
  historicalLayer: "verified" | "narrative_interpretation" | "historical_context";
}

interface SceneResponse {
  chapterId: number;
  familyId?: number;
  chapterTitle: string;
  chapterStatus: string;
  scenes: Scene[];
  vaultContext: {
    places: Array<{ id: number; label: string; country?: string }>;
    events: Array<{ id: number; title: string; description?: string }>;
    memories: Array<{ id: number; title?: string; description?: string }>;
  };
}

interface Choice {
  text: string;
  consequence: string;
  action: "next" | "reflect" | "preserve";
  /** True only for the choice that should create a real Mystery Quest vault entry. */
  createsMysteryQuest?: boolean;
  /** True only for the choice that should prompt the player to write and save a real memory. */
  requiresMemoryText?: boolean;
  /** RPG stat changes applied when this choice is selected. */
  statChanges?: Partial<SessionStats>;
}

interface SessionStats {
  knowledge: number;
  relationships: number;
  culturalWisdom: number;
  courage: number;
  reputation: number;
  legacy: number;
}

const STAT_LABELS: Record<keyof SessionStats, string> = {
  knowledge: "Knowledge",
  relationships: "Relationships",
  culturalWisdom: "Cultural Wisdom",
  courage: "Courage",
  reputation: "Reputation",
  legacy: "Legacy",
};

const STAT_ICONS: Record<keyof SessionStats, string> = {
  knowledge: "BookOpen",
  relationships: "Heart",
  culturalWisdom: "Sparkles",
  courage: "Sword",
  reputation: "Star",
  legacy: "Crown",
};

// Choices are parameterized by scene type and enriched with vault context
// (place names, event titles, memory descriptions) so they feel specific to
// the family's actual history rather than generic for every family.
function buildSceneChoices(scene: Scene, vault: SceneResponse["vaultContext"]): Choice[] {
  const place = scene.placeId ? vault.places.find(p => p.id === scene.placeId) : null;
  const event = scene.eventId ? vault.events.find(e => e.id === scene.eventId) : null;
  const memory = scene.memoryId ? vault.memories.find(m => m.id === scene.memoryId) : null;

  switch (scene.type) {
    case "narration":
      return [
        { text: "Continue the story", consequence: "The story moves forward.", action: "next", statChanges: { knowledge: 2 } },
        ...(place ? [{ text: `Remember ${place.label}`, consequence: `You hold the memory of ${place.label} close.`, action: "reflect" as const, statChanges: { legacy: 5, knowledge: 1 } }] : []),
      ];
    case "dialogue":
      return [
        { text: "Listen and remember", consequence: "You absorb this moment into your family's memory.", action: "next", statChanges: { relationships: 5, culturalWisdom: 3 } },
        {
          text: event ? `Ask about ${event.title}` : "Ask a question",
          consequence: "A Mystery Quest has been added to your Family Vault — ask a relative to help fill this gap.",
          action: "preserve",
          createsMysteryQuest: true,
          statChanges: { knowledge: 8, courage: 3 },
        },
        { text: "Reflect quietly", consequence: "You gain cultural wisdom from this moment.", action: "reflect", statChanges: { culturalWisdom: 6, reputation: 2 } },
      ];
    case "reflection":
      return [
        {
          text: memory ? `Add to this memory` : "Record a memory",
          consequence: "Your memory has been added to the Family Vault.",
          action: "preserve",
          requiresMemoryText: true,
          statChanges: { legacy: 10, knowledge: 5, relationships: 3 },
        },
        { text: "Continue the journey", consequence: "The chapter moves forward.", action: "next", statChanges: { courage: 3 } },
        { text: "Sit with this moment", consequence: "You let the weight of this memory settle.", action: "reflect", statChanges: { culturalWisdom: 4, reputation: 2 } },
      ];
    case "context":
      return [
        { text: "Continue", consequence: "You carry this history with you.", action: "next", statChanges: { knowledge: 3 } },
        { text: "Reflect on the times", consequence: "You consider what life was like in those days.", action: "reflect", statChanges: { culturalWisdom: 5, knowledge: 2 } },
      ];
    default:
      return [{ text: "Continue", consequence: "The story moves forward.", action: "next", statChanges: { knowledge: 1 } }];
  }
}

export default function LegacyChapterPlay() {
  const params = useParams<{ chapterId: string }>();
  const [, navigate] = useLocation();
  const { currentUser } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sceneData, setSceneData] = useState<SceneResponse | null>(null);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(new Set());
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [showConsequence, setShowConsequence] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  const [completionNarration, setCompletionNarration] = useState<string | null>(null);
  const [completionNarrationLoading, setCompletionNarrationLoading] = useState(false);
  const [mysteryQuestState, setMysteryQuestState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // "Record a memory" flow: unlike every other choice, this one needs real
  // player-authored text before it can be saved, so it interrupts the normal
  // choice → consequence flow with a small writing step.
  const [awaitingMemoryText, setAwaitingMemoryText] = useState(false);
  const [pendingMemoryChoiceIdx, setPendingMemoryChoiceIdx] = useState<number | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [recordMemoryState, setRecordMemoryState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // AI Game Master narration for the current scene
  const [aiNarration, setAiNarration] = useState<string | null>(null);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    knowledge: 0, relationships: 0, culturalWisdom: 0, courage: 0, reputation: 0, legacy: 0,
  });

  const chapterId = parseInt(params.chapterId, 10);

  const loadScenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/chapters/${chapterId}/scenes`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to load scenes" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: SceneResponse = await res.json();
      setSceneData(data);

      // Restore accumulated RPG stats from any existing session for this chapter
      if (data.familyId) {
        try {
          const sessRes = await fetch(`/api/legacy/sessions/active/${data.familyId}?chapterId=${chapterId}`, { headers: authHeaders() });
          if (sessRes.ok) {
            const sessData = await sessRes.json();
            const sessStats = sessData?.session?.session_state?.stats;
            if (sessStats && typeof sessStats === "object") {
              setSessionStats({
                knowledge: sessStats.knowledge ?? 0,
                relationships: sessStats.relationships ?? 0,
                culturalWisdom: sessStats.culturalWisdom ?? 0,
                courage: sessStats.courage ?? 0,
                reputation: sessStats.reputation ?? 0,
                legacy: sessStats.legacy ?? 0,
              });
            }
            // Also restore completed scenes so the player resumes where they left off
            const sessCompleted = sessData?.session?.session_state?.completedScenes;
            if (Array.isArray(sessCompleted) && sessCompleted.length > 0) {
              setCompletedScenes(new Set(sessCompleted));
              // Advance to the first uncompleted scene
              const firstUncompleted = data.scenes.findIndex((s: { sceneNumber: number }) => !sessCompleted.includes(s.sceneNumber));
              if (firstUncompleted > 0) setCurrentSceneIdx(firstUncompleted);
            }
          }
        } catch {
          // Non-fatal — fresh session starts with zero stats
        }
      }

      // Transition chapter to in_progress if it's unlocked
      if (data.chapterStatus === "unlocked") {
        await fetch(`/api/legacy/chapters/${chapterId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "in_progress" }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chapter");
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    if (!isNaN(chapterId)) loadScenes();
  }, [chapterId, loadScenes]);

  // Fetch AI narration for the current scene
  useEffect(() => {
    if (!sceneData || !sceneData.scenes[currentSceneIdx]) return;
    const scene = sceneData.scenes[currentSceneIdx];
    setAiNarration(null);
    setNarrationLoading(true);

    const familyId = sceneData.familyId;
    const params = new URLSearchParams({
      type: scene.type === "dialogue" ? "dialogue" : "scene_intro",
      chapterId: String(chapterId),
      sceneContext: `${scene.title}: ${scene.content.slice(0, 200)}`,
    });

    if (!familyId) { setNarrationLoading(false); return; }

    fetch(`/api/legacy/game-master/${familyId}/narration?${params}`, {
      headers: authHeaders(),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.narration?.content) {
          setAiNarration(data.narration.content);
        }
      })
      .catch(() => {})
      .finally(() => setNarrationLoading(false));
  }, [sceneData, currentSceneIdx, chapterId]);

  const finalizeChoice = async (choiceIdx: number) => {
    if (!sceneData) return;
    const scene = sceneData.scenes[currentSceneIdx];
    if (!scene) return;
    const choices = buildSceneChoices(scene, sceneData.vaultContext);
    const choice = choices[choiceIdx];

    setSelectedChoice(choiceIdx);
    setShowConsequence(true);
    setMysteryQuestState("idle");

    // Mark scene as completed
    const newCompleted = new Set(completedScenes);
    newCompleted.add(scene.sceneNumber);
    setCompletedScenes(newCompleted);

    // Save progress + which choice was made to server (durable decision memory)
    try {
      // Accumulate RPG stats from this choice
    if (choice?.statChanges) {
      setSessionStats((prev) => {
        const next = { ...prev };
        for (const [k, delta] of Object.entries(choice.statChanges!)) {
          next[k as keyof SessionStats] = Math.max(0, Math.min(100, next[k as keyof SessionStats] + (delta ?? 0)));
        }
        return next;
      });
    }

    await fetch(`/api/legacy/sessions/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          chapterId,
          sceneNumber: scene.sceneNumber,
          completed: true,
          choiceAction: choice?.action,
          choiceText: choice?.text,
          statChanges: choice?.statChanges,
        }),
      });
    } catch {
      // Non-fatal — progress is tracked client-side too
    }

    // "Ask a question" is the one choice with a real, persisted consequence:
    // it writes an actual Mystery Quest into the Family Vault.
    if (choice?.createsMysteryQuest) {
      setMysteryQuestState("saving");
      try {
        const res = await fetch(`/api/legacy/chapters/${chapterId}/mystery-quest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ sceneNumber: scene.sceneNumber }),
        });
        setMysteryQuestState(res.ok ? "saved" : "error");
      } catch {
        setMysteryQuestState("error");
      }
    }
  };

  const handleChoice = (choiceIdx: number) => {
    if (!sceneData || selectedChoice !== null || awaitingMemoryText) return;
    const scene = sceneData.scenes[currentSceneIdx];
    if (!scene) return;
    const choices = buildSceneChoices(scene, sceneData.vaultContext);
    const choice = choices[choiceIdx];

    // "Record a memory" needs real player-authored text before anything is
    // saved — open the writing step instead of finalizing immediately.
    if (choice?.requiresMemoryText) {
      setPendingMemoryChoiceIdx(choiceIdx);
      setAwaitingMemoryText(true);
      setMemoryDraft("");
      setMemoryError(null);
      setRecordMemoryState("idle");
      return;
    }

    void finalizeChoice(choiceIdx);
  };

  const handleSaveMemory = async () => {
    if (!sceneData || pendingMemoryChoiceIdx === null) return;
    const scene = sceneData.scenes[currentSceneIdx];
    if (!scene) return;

    const trimmed = memoryDraft.trim();
    if (trimmed.length < 3) {
      setMemoryError("Write a little more before saving.");
      return;
    }

    setRecordMemoryState("saving");
    setMemoryError(null);
    try {
      const res = await fetch(`/api/legacy/chapters/${chapterId}/record-memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ sceneNumber: scene.sceneNumber, body: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to save memory" }));
        setRecordMemoryState("error");
        setMemoryError(data.error || "Failed to save memory");
        return;
      }
      setRecordMemoryState("saved");
      setAwaitingMemoryText(false);
      const choiceIdx = pendingMemoryChoiceIdx;
      setPendingMemoryChoiceIdx(null);
      await finalizeChoice(choiceIdx);
    } catch {
      setRecordMemoryState("error");
      setMemoryError("Couldn't reach the server — check your connection and try again.");
    }
  };

  const handleCancelMemory = () => {
    setAwaitingMemoryText(false);
    setPendingMemoryChoiceIdx(null);
    setMemoryDraft("");
    setMemoryError(null);
    setRecordMemoryState("idle");
  };

  const handleNext = async () => {
    if (!sceneData) return;
    setShowConsequence(false);
    setSelectedChoice(null);

    if (currentSceneIdx + 1 >= sceneData.scenes.length) {
      // All scenes done — complete the chapter
      setTransitioning(true);
      try {
        await fetch(`/api/legacy/chapters/${chapterId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "completed" }),
        });
        setChapterCompleted(true);

        // Fetch AI-generated chapter summary narration for the completion screen
        if (sceneData?.familyId) {
          setCompletionNarrationLoading(true);
          const params = new URLSearchParams({
            type: "chapter_summary",
            chapterId: String(chapterId),
            sceneContext: `Completed "${sceneData.chapterTitle}" with ${completedScenes.size} scenes explored.`,
          });
          fetch(`/api/legacy/game-master/${sceneData.familyId}/narration?${params}`, {
            headers: authHeaders(),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data?.narration?.content) setCompletionNarration(data.narration.content);
            })
            .catch(() => {})
            .finally(() => setCompletionNarrationLoading(false));
        }
      } catch {
        // Still show completion UI even if API fails
        setChapterCompleted(true);
      } finally {
        setTransitioning(false);
      }
    } else {
      setCurrentSceneIdx(currentSceneIdx + 1);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0e1111]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-stone-400">Loading your family's chapter...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0e1111] px-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-black text-stone-100 mb-2">Chapter Unavailable</h2>
          <p className="text-sm text-stone-400 mb-6">{error}</p>
          <button
            onClick={() => navigate("/legacy")}
            className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-2.5 text-sm"
          >
            Back to Legacy Hub
          </button>
        </div>
      </div>
    );
  }

  // ── Chapter completed ──────────────────────────────────────────────────────
  if (chapterCompleted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0e1111] px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-black text-stone-100 mb-2">Chapter Complete</h2>
          <p className="text-sm text-stone-400 mb-4">
            You've walked through "{sceneData?.chapterTitle}".
          </p>
          {/* Narrator message */}
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Nia</span>
            </div>
            {completionNarrationLoading ? (
              <p className="text-sm text-stone-500 italic leading-relaxed">
                Nia is reflecting on your journey...
              </p>
            ) : completionNarration ? (
              <p className="text-sm text-stone-300 italic leading-relaxed">
                {completionNarration}
              </p>
            ) : (
              <p className="text-sm text-stone-300 italic leading-relaxed">
                "Today you uncovered another chapter of your family's journey.
                {completedScenes.size > 3
                  ? " You listened, reflected, and preserved memories that will last for generations."
                  : " Each step you take brings your ancestors' world to life."}
                Your family would be proud."
              </p>
            )}
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-stone-800/40 border border-stone-700/50 rounded-xl p-3 text-center">
              <BookOpen className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-stone-200">{completedScenes.size}</p>
              <p className="text-[10px] text-stone-500 uppercase">Scenes</p>
            </div>
            <div className="bg-stone-800/40 border border-stone-700/50 rounded-xl p-3 text-center">
              <Sparkles className="w-4 h-4 text-purple-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-stone-200">{sceneData?.scenes.length ?? 0}</p>
              <p className="text-[10px] text-stone-500 uppercase">Total</p>
            </div>
            <div className="bg-stone-800/40 border border-stone-700/50 rounded-xl p-3 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-stone-200">1</p>
              <p className="text-[10px] text-stone-500 uppercase">Chapter</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/legacy")}
              className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm"
            >
              Return to Legacy Hub
            </button>
            <button
              onClick={() => navigate("/legacy/start")}
              className="text-stone-400 font-medium rounded-xl px-6 py-3 text-sm border border-stone-700"
            >
              Begin a New Journey
            </button>
            <button
              onClick={() => navigate("/legacy/journal")}
              className="text-amber-400 font-medium rounded-xl px-6 py-3 text-sm border border-amber-700/30"
            >
              Read Your Journal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sceneData) return null;

  const scene = sceneData.scenes[currentSceneIdx];
  if (!scene) return null;

  const choices = buildSceneChoices(scene, sceneData.vaultContext);
  const progress = ((currentSceneIdx + 1) / sceneData.scenes.length) * 100;
  const place = scene.placeId
    ? sceneData.vaultContext.places.find(p => p.id === scene.placeId)
    : null;
  const event = scene.eventId
    ? sceneData.vaultContext.events.find(e => e.id === scene.eventId)
    : null;
  const memory = scene.memoryId
    ? sceneData.vaultContext.memories.find(m => m.id === scene.memoryId)
    : null;

  return (
    <div className="min-h-[100dvh] bg-[#0e1111] text-stone-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-800/50">
        <button
          onClick={() => navigate("/legacy")}
          className="p-2 -ml-2 rounded-lg hover:bg-stone-800/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-stone-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-stone-500 uppercase tracking-wider">
            Chapter {sceneData.chapterId} · Scene {currentSceneIdx + 1} of {sceneData.scenes.length}
          </p>
          <h1 className="text-sm font-bold text-stone-200 truncate">{sceneData.chapterTitle}</h1>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-stone-800/50">
        <div
          className="h-full bg-amber-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* RPG Stats HUD */}
      <div className="px-4 py-2.5 border-b border-stone-800/30 bg-stone-900/30">
        <div className="flex items-center justify-between gap-2">
          {(Object.keys(sessionStats) as (keyof SessionStats)[]).map((statKey) => (
            <div key={statKey} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-stone-500">{STAT_LABELS[statKey]}</span>
              <span className={`text-sm font-black ${sessionStats[statKey] > 0 ? "text-amber-400" : "text-stone-600"}`}>
                {sessionStats[statKey]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scene content */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {/* Scene type badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
            scene.historicalLayer === "verified"
              ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
              : scene.historicalLayer === "historical_context"
                ? "bg-sky-400/10 text-sky-400 border border-sky-400/20"
                : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
          }`}>
            {scene.historicalLayer === "verified"
              ? "Verified History"
              : scene.historicalLayer === "historical_context"
                ? "Historical Context"
                : "Narrative Interpretation"}
          </span>
          <span className="text-xs text-stone-500 uppercase tracking-wider">
            {scene.type}
          </span>
        </div>

        {/* Context tags */}
        {(place || event) && (
          <div className="flex flex-wrap gap-2 mb-5">
            {place && (
              <div className="flex items-center gap-1.5 text-xs text-stone-400 bg-stone-800/30 rounded-lg px-3 py-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {place.label}{place.country ? `, ${place.country}` : ""}
              </div>
            )}
            {event && (
              <div className="flex items-center gap-1.5 text-xs text-stone-400 bg-stone-800/30 rounded-lg px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {event.title}
              </div>
            )}
          </div>
        )}

        {/* Scene title */}
        <h2 className="text-2xl font-black text-stone-100 mb-4">{scene.title}</h2>

        {/* Scene content */}
        <div className="prose prose-invert max-w-none mb-6">
          <p className="text-stone-300 leading-relaxed text-base whitespace-pre-line">
            {scene.content}
          </p>
        </div>

        {/* AI Game Master Narration */}
        {narrationLoading ? (
          <div className="flex items-center gap-2 mb-6 text-amber-500/60">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-xs italic">Nia is narrating...</span>
          </div>
        ) : aiNarration ? (
          <div className="bg-gradient-to-r from-amber-900/20 to-transparent border-l-2 border-amber-500/40 rounded-r-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Nia Narrates</span>
            </div>
            <p className="text-sm text-amber-200/80 leading-relaxed italic whitespace-pre-line">
              {aiNarration}
            </p>
          </div>
        ) : null}

        {/* Historical context topic tags — only present on "context" scenes */}
        {scene.topics && scene.topics.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {scene.topics.map((topic, i) => (
              <span
                key={i}
                className="text-xs text-sky-400 bg-sky-400/10 border border-sky-400/20 rounded-full px-3 py-1"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Memory reference */}
        {memory && (
          <div className="bg-stone-800/30 border border-stone-700/50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">From the Vault</span>
            </div>
            <p className="text-sm text-stone-300">
              {memory.description || memory.title || "A preserved family memory."}
            </p>
          </div>
        )}

        {/* Memory-writing step ("Record a memory" choice) */}
        {!showConsequence && awaitingMemoryText && (
          <div className="bg-stone-800/40 border border-amber-400/20 rounded-xl p-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Add to the Family Vault
              </span>
            </div>
            <textarea
              autoFocus
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
              placeholder="Write your own memory of this moment..."
              rows={4}
              maxLength={4000}
              disabled={recordMemoryState === "saving"}
              className="w-full bg-stone-900/60 border border-stone-700/50 rounded-lg px-3 py-2.5 text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/40 resize-none disabled:opacity-60"
            />
            {memoryError && (
              <p className="text-xs text-red-400 mt-2">{memoryError}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleSaveMemory}
                disabled={recordMemoryState === "saving" || memoryDraft.trim().length < 3}
                className="bg-amber-500 text-stone-900 font-bold rounded-lg px-4 py-2 text-xs flex items-center gap-1.5 hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {recordMemoryState === "saving" ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                ) : (
                  "Save Memory"
                )}
              </button>
              <button
                onClick={handleCancelMemory}
                disabled={recordMemoryState === "saving"}
                className="text-stone-400 font-medium rounded-lg px-4 py-2 text-xs border border-stone-700/50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Choices */}
        {!showConsequence && !awaitingMemoryText && (
          <div className="space-y-3">
            {choices.map((choice, idx) => (
              <button
                key={idx}
                onClick={() => handleChoice(idx)}
                className="w-full text-left bg-stone-800/40 border border-stone-700/50 rounded-xl px-4 py-3.5 hover:border-amber-400/30 hover:bg-stone-800/60 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-stone-200">{choice.text}</span>
                  <ChevronRight className="w-4 h-4 text-stone-500 group-hover:text-amber-400 transition-colors" />
                </div>
                {choice.statChanges && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(choice.statChanges).map(([stat, delta]) => (
                      <span
                        key={stat}
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          delta > 0
                            ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                            : "bg-red-400/10 text-red-400 border border-red-400/20"
                        }`}
                      >
                        {STAT_LABELS[stat as keyof SessionStats] ?? stat} {delta > 0 ? "+" : ""}{delta}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Consequence */}
        {showConsequence && selectedChoice !== null && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-5 mb-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Consequence</span>
            </div>
            <p className="text-sm text-stone-300 mb-2">
              {choices[selectedChoice].consequence}
            </p>
            {choices[selectedChoice].createsMysteryQuest && (
              <p className="text-xs mb-2">
                {mysteryQuestState === "saving" && (
                  <span className="text-stone-500 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Adding to Family Vault...
                  </span>
                )}
                {mysteryQuestState === "saved" && (
                  <span className="text-emerald-400 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Saved to Family Vault
                  </span>
                )}
                {mysteryQuestState === "error" && (
                  <span className="text-red-400">
                    Couldn't save this to the vault right now — you can try again next time.
                  </span>
                )}
              </p>
            )}
            {choices[selectedChoice].requiresMemoryText && recordMemoryState === "saved" && (
              <p className="text-xs mb-2">
                <span className="text-emerald-400 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" /> Your memory was saved to the Family Vault
                </span>
              </p>
            )}
            <div className="mb-2" />
            <button
              onClick={handleNext}
              disabled={transitioning}
              className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm flex items-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {transitioning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</>
              ) : currentSceneIdx + 1 >= sceneData.scenes.length ? (
                "Complete Chapter"
              ) : (
                <>Next Scene <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Scene dots */}
      <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-stone-800/50">
        {sceneData.scenes.map((s, i) => (
          <div
            key={s.sceneNumber}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === currentSceneIdx
                ? "w-6 bg-amber-400"
                : completedScenes.has(s.sceneNumber)
                  ? "w-1.5 bg-emerald-400"
                  : "w-1.5 bg-stone-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
