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
}

const SCENE_CHOICES: Record<string, Choice[]> = {
  narration: [
    { text: "Continue", consequence: "The story moves forward.", action: "next" },
  ],
  dialogue: [
    { text: "Listen and remember", consequence: "You absorb this moment into your family's memory.", action: "next" },
    { text: "Ask a question", consequence: "A new mystery quest is created — ask a relative to fill this gap.", action: "preserve" },
    { text: "Reflect quietly", consequence: "You gain cultural wisdom from this moment.", action: "reflect" },
  ],
  reflection: [
    { text: "Record a memory", consequence: "Add your own memory to the vault.", action: "preserve" },
    { text: "Continue the journey", consequence: "The chapter moves forward.", action: "next" },
  ],
  context: [
    { text: "Continue", consequence: "You carry this history with you.", action: "next" },
  ],
};

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

  const handleChoice = async (choiceIdx: number) => {
    if (!sceneData || selectedChoice !== null) return;
    const scene = sceneData.scenes[currentSceneIdx];
    if (!scene) return;

    setSelectedChoice(choiceIdx);
    setShowConsequence(true);

    // Mark scene as completed
    const newCompleted = new Set(completedScenes);
    newCompleted.add(scene.sceneNumber);
    setCompletedScenes(newCompleted);

    // Save progress to server
    try {
      await fetch(`/api/legacy/sessions/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          chapterId,
          sceneNumber: scene.sceneNumber,
          completed: true,
        }),
      });
    } catch {
      // Non-fatal — progress is tracked client-side too
    }
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
          <p className="text-sm text-stone-400 mb-6">
            You've walked through "{sceneData?.chapterTitle}". Your family's story continues.
          </p>
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
          </div>
        </div>
      </div>
    );
  }

  if (!sceneData) return null;

  const scene = sceneData.scenes[currentSceneIdx];
  if (!scene) return null;

  const choices = SCENE_CHOICES[scene.type] ?? SCENE_CHOICES.narration;
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
        <div className="prose prose-invert max-w-none mb-8">
          <p className="text-stone-300 leading-relaxed text-base whitespace-pre-line">
            {scene.content}
          </p>
        </div>

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

        {/* Choices */}
        {!showConsequence && (
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
            <p className="text-sm text-stone-300 mb-4">
              {choices[selectedChoice].consequence}
            </p>
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
