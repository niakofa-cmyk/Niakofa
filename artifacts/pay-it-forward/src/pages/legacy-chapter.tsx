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

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Loader2, Calendar, BookOpen,
  CheckCircle2, ChevronRight, Sparkles, AlertCircle,
  Sunrise, MessageSquare, Compass, Map as MapIcon,
  Moon, BookMarked, Save,
  Footprints, Sword, Scroll,
} from "lucide-react";
import { authHeaders } from "@/lib/auth";
import LegacyCoreLoop, { buildWorldChanges, type WorldChange } from "@/components/legacy-core-loop";
import { LegacyJournalPanel } from "@/components/legacy-journal-panel";
import LegacyMapPage from "@/pages/legacy-map";
import { LegacyChapterWorld } from "@/components/legacy-chapter-world";
import { LegacyWeatherOverlay, deriveChapterWeather } from "@/components/legacy-weather-overlay";
import { LegacySceneRenderer } from "@/components/legacy-scene-renderer";
import { getMapScene } from "@/lib/legacy-map-scenes";
import { LegacyQuestsPanel } from "@/components/legacy-quests-panel";
import { LegacyBattleScene } from "@/components/legacy-battle-scene";
import { LegacyGameCanvas } from "@/legacy-runtime/LegacyGameCanvas";
import { KwameAttributeSystem } from "@/legacy-runtime/legacy-attributes";
import { KWAME_SHEET_MANIFEST } from "@/legacy-runtime/kwame-sheet-manifest";
import { capeCoastCompoundScene, capeCoastCompoundAssets, environmentBaseUrl } from "@/legacy-runtime/scene-cape-coast-compound";

// Ambient background gradient shifts based on the day-cycle position.
// Morning → warm amber, midday → bright gold, evening → deep amber, night → dark with stars.
/**
 * Maps a chapter era string to a known LegacyMapScene ID.
 * When a match is found, LegacySceneRenderer shows the location's real hand-drawn
 * art as the background when the player enters a landmark and reads a scene.
 */
function sceneIdForEra(era: string | undefined | null): string | undefined {
  if (!era) return undefined;
  const e = era.toLowerCase();
  if (e.includes("1890") || e.includes("1895")) return "cape-coast-compound-1890";
  if (e.includes("1905") || e.includes("1900") || e.includes("trade") || e.includes("market")) return "cape-coast-market-1905";
  if (e.includes("1912") || e.includes("harbour") || e.includes("harbor") || e.includes("coast")) return "cape-coast-harbour-1912";
  if (e.includes("compound") || e.includes("village")) return "cape-coast-compound-1890";
  return undefined;
}

function ambientGradient(sceneIdx: number, totalScenes: number): string {
  const pct = totalScenes > 1 ? sceneIdx / (totalScenes - 1) : 0;
  if (pct < 0.25) return "radial-gradient(ellipse at top, #1a1308 0%, #0e1111 70%)";
  if (pct < 0.5)  return "radial-gradient(ellipse at top, #1f1a0e 0%, #0e1111 70%)";
  if (pct < 0.75) return "radial-gradient(ellipse at top, #1a1208 0%, #0e1111 70%)";
  return "radial-gradient(ellipse at top, #0e0e14 0%, #0e1111 70%)";
}

// Scene transition: fade overlay that plays on scene change.
function useSceneTransition() {
  const [transitioning, setTransitioning] = useState(false);
  const trigger = useCallback((onComplete: () => void) => {
    setTransitioning(true);
    setTimeout(() => {
      onComplete();
      setTimeout(() => setTransitioning(false), 50);
    }, 400);
  }, []);
  return { transitioning, trigger };
}

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
  ancestorMemberId?: number | null;
  ancestorName?: string | null;
  /**
   * Real walking-character appearance for this chapter's ancestor, resolved
   * server-side (GET /legacy/chapters/:id/scenes → resolveFamilyMemberAppearance
   * in legacy-character-asset-engine.ts). Null when the ancestor's gender
   * hasn't been set on their family_members row, or their age during this
   * chapter's era can't be computed — never guessed. LegacyChapterWorld
   * falls back to a neutral placeholder sprite in that case.
   */
  ancestorAppearance?: {
    ageGroup: "adult" | "kid";
    gender: "male" | "female";
    lifeStage: "youth" | "adult" | "mature" | "elder";
    era: string;
    appearanceSeed: string;
  } | null;
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
  faith: number;
}

const STAT_LABELS: Record<keyof SessionStats, string> = {
  knowledge: "Knowledge",
  relationships: "Relationships",
  culturalWisdom: "Cultural Wisdom",
  courage: "Courage",
  reputation: "Reputation",
  legacy: "Legacy",
  faith: "Faith",
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
        { text: "Listen and remember", consequence: "You absorb this moment into your family's memory.", action: "next", statChanges: { relationships: 5, culturalWisdom: 3, faith: 2 } },
        {
          text: event ? `Ask about ${event.title}` : "Ask a question",
          consequence: "A Mystery Quest has been added to your Family Vault — ask a relative to help fill this gap.",
          action: "preserve",
          createsMysteryQuest: true,
          statChanges: { knowledge: 8, courage: 3 },
        },
        { text: "Reflect quietly", consequence: "You gain cultural wisdom from this moment.", action: "reflect", statChanges: { culturalWisdom: 6, reputation: 2, faith: 3 } },
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
        { text: "Sit with this moment", consequence: "You let the weight of this memory settle.", action: "reflect", statChanges: { culturalWisdom: 4, reputation: 2, faith: 4 } },
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
  const [nextChapterId, setNextChapterId] = useState<number | null>(null);
  const [journalSaved, setJournalSaved] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [worldChanges, setWorldChanges] = useState<WorldChange[]>([]);
  const [showCoreLoop, setShowCoreLoop] = useState(false);
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
    knowledge: 0, relationships: 0, culturalWisdom: 0, courage: 0, reputation: 0, legacy: 0, faith: 0,
  });
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sceneFadeKey, setSceneFadeKey] = useState(0);
  const { transitioning: sceneTransitioning, trigger: triggerSceneTransition } = useSceneTransition();

  // Audio playback state for memory scenes
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // In-runtime overlays — the Journal and Map used to be full-page
  // navigations (navigate("/legacy/journal"), navigate("/legacy/map")),
  // which yanked the player out of the running chapter every time they
  // wanted to check something. They now render as slide-over sheets on
  // top of the live scene instead, exactly like LegacyCoreLoop already
  // does below. Nothing about the world is paused or unmounted while a
  // sheet is open — closing it returns you to the exact scene you left.
  const [journalOpen, setJournalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false);
  // In-session overlays added per RUNTIME_ARCHITECTURE_UPDATE.md rollout:
  const [questsOpen, setQuestsOpen] = useState(false);
  // Default true — the Living World PixiJS canvas is now the primary entry
  // point for each chapter. The scene reading / choice UI opens over it via
  // the "Return to Chapter" button (or by walking into a landmark tile).
  const [gameCanvasOpen, setGameCanvasOpen] = useState(true);
  // Path A side-view combat — opens over exploration world on Training Ground landmark
  const [battleOpen, setBattleOpen] = useState(false);
  // Shared attribute system — bridges battle combat hits to Layer 10 XP tracking.
  // Kept at page level so both LegacyBattleScene and LegacyGameCanvas can share one
  // KwameAttributeSystem instance once the latter accepts it via prop (future wiring).
  const pageAttrSystem = useRef(new KwameAttributeSystem());

  // World view — the chapter now opens into a walkable grid built from its
  // real scenes/places (legacy-dynamic-world-layout.ts) instead of jumping
  // straight to scene text. Walking onto a scene's landmark tile opens that
  // scene's reading/dialogue/choice UI (unchanged below); finishing a scene
  // returns to the world so the player walks to the next landmark rather
  // than being auto-advanced through a list.
  const [worldViewOpen, setWorldViewOpen] = useState(true);

  const handleEnterScene = useCallback((sceneNumber: number) => {
    if (!sceneData) return;
    const idx = sceneData.scenes.findIndex((s) => s.sceneNumber === sceneNumber);
    if (idx === -1) return;
    setShowConsequence(false);
    setSelectedChoice(null);
    setCurrentSceneIdx(idx);
    setSceneFadeKey((k) => k + 1);
    setWorldViewOpen(false);
  }, [sceneData]);

  // Stop audio when navigating between scenes
  useEffect(() => {
    const el = audioRef.current;
    if (el && !el.paused) {
      el.pause();
      el.currentTime = 0;
    }
    setAudioPlaying(false);
    setAudioError(null);
  }, [currentSceneIdx]);

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
            if (sessData?.session?.id) setSessionId(sessData.session.id);
            const sessStats = sessData?.session?.session_state?.stats;
            if (sessStats && typeof sessStats === "object") {
              setSessionStats({
                knowledge: sessStats.knowledge ?? 0,
                relationships: sessStats.relationships ?? 0,
                culturalWisdom: sessStats.culturalWisdom ?? 0,
                courage: sessStats.courage ?? 0,
                reputation: sessStats.reputation ?? 0,
                legacy: sessStats.legacy ?? 0,
                faith: sessStats.faith ?? 0,
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
    if (isNaN(chapterId)) {
      setError("Invalid chapter ID");
      setLoading(false);
      return;
    }
    loadScenes();
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

      // Autosave indicator
      setAutosaveState("saving");
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        setAutosaveState("saved");
        setTimeout(() => setAutosaveState("idle"), 2000);
      }, 600);
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
          body: JSON.stringify({ sceneNumber: scene.sceneNumber, question: `What more can our family discover about "${scene.title}" — ${scene.content.slice(0, 120)}?` }),
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
    if (transitioning) return;
    setShowConsequence(false);
    setSelectedChoice(null);

    if (currentSceneIdx + 1 >= sceneData.scenes.length) {
      // All scenes done — complete the chapter
      if (chapterCompleted) return;
      const totalScenesCompleted = completedScenes.size + 1;
      setTransitioning(true);
      try {
        const completeRes = await fetch(`/api/legacy/chapters/${chapterId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "completed" }),
        });

        // The backend returns the updated chapter; it also unlocks the next
        // chapter and logs world evolution. We check the response for the next
        // chapter ID so we can offer a "Continue to Next Chapter" button.
        let unlockedNextChapterId: number | null = null;
        if (completeRes.ok) {
          const completeData = await completeRes.json().catch(() => ({}));
          if (typeof completeData?.nextChapterId === "number") {
            unlockedNextChapterId = completeData.nextChapterId;
            setNextChapterId(unlockedNextChapterId);
          }
        }

        setChapterCompleted(true);

        // Auto-generate a narrative journal entry from the player's decisions
        if (sessionId) {
          try {
            const journalRes = await fetch(`/api/legacy/journal/${sessionId}/auto-generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
            });
            if (journalRes.ok) {
              const journalData = await journalRes.json();
              if (journalData?.generated) {
                setJournalSaved(true);
              }
            }
          } catch {
            // Non-fatal — journal is also built from session decisions via GET /journal
          }
        }

        // Show the core loop overlay: Memory→AI→World Changes→Player Notices→New Gameplay→New Memory
        const changes = buildWorldChanges("chapter_complete", {
          summary: completionNarration ?? undefined,
          // React state updates are asynchronous. Use the response-local ID
          // here so the first render of the overlay reflects the chapter that
          // was actually unlocked by this completion request.
          newChapterUnlocked: unlockedNextChapterId !== null,
        });
        setWorldChanges(changes);
        setShowCoreLoop(true);

        // Also flag journal saved as fallback (GET /journal builds it from decisions)
        setJournalSaved(true);

        // Fetch AI-generated chapter summary narration for the completion screen
        if (sceneData?.familyId) {
          setCompletionNarrationLoading(true);
          const params = new URLSearchParams({
            type: "chapter_summary",
            chapterId: String(chapterId),
            sceneContext: `Completed "${sceneData.chapterTitle}" with ${totalScenesCompleted} scenes explored.`,
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
      // Return to the walkable world so the player walks to the next
      // landmark, instead of auto-advancing straight into the next scene's
      // text. handleEnterScene (triggered by stepping onto that landmark)
      // is what actually sets currentSceneIdx from here on.
      triggerSceneTransition(() => {
        setWorldViewOpen(true);
      });
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
          {/* Journal save indicator */}
          {journalSaved && (
            <div className="flex items-center justify-center gap-1.5 mb-4 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>A journal entry has been written for this session.</span>
            </div>
          )}

          {/* World Regeneration indicator — makes the flywheel visible */}
          {journalSaved && (
            <div className="bg-gradient-to-r from-teal-900/20 to-transparent border border-teal-400/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">World Regenerated</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Your journey has been preserved. New dialogue, quests, and memories may now appear in your family's world.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {nextChapterId && (
              <button
                onClick={() => navigate(`/legacy/chapter/${nextChapterId}`)}
                className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm flex items-center justify-center gap-2"
              >
                Continue to Next Chapter
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => navigate("/legacy")}
              className={nextChapterId
                ? "text-stone-400 font-medium rounded-xl px-6 py-3 text-sm border border-stone-700"
                : "bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm"
              }
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
              onClick={() => setJournalOpen(true)}
              className="text-amber-400 font-medium rounded-xl px-6 py-3 text-sm border border-amber-700/30"
            >
              Read Your Journal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // sceneData loaded but scenes array is empty — show a recoverable error, not a blank screen
  if (sceneData && sceneData.scenes.length === 0) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0e1111] px-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-black text-stone-100 mb-2">Chapter Not Ready</h2>
          <p className="text-sm text-stone-400 mb-2">
            Your family's chapter exists but scenes haven't been generated yet.
          </p>
          <p className="text-xs text-stone-500 mb-6">
            This usually means the world is still building. Try refreshing or add more family
            memories to unlock scene content.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { setSceneData(null); loadScenes(); }}
              className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-2.5 text-sm"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate("/legacy")}
              className="text-amber-400 font-medium rounded-xl px-6 py-2.5 text-sm border border-amber-700/30"
            >
              Back to Legacy Hub
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sceneData) return null;

  const scene = sceneData.scenes[currentSceneIdx];
  // sceneData present but currentSceneIdx is out of bounds — reset to first scene
  if (!scene) {
    if (sceneData.scenes.length > 0) {
      setCurrentSceneIdx(0);
      return null;
    }
    return null;
  }

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
    <div
      className="min-h-[100dvh] text-stone-100 flex flex-col transition-all duration-700"
      style={{ background: ambientGradient(currentSceneIdx, sceneData.scenes.length) }}
    >
      {/* Scene transition overlay */}
      {sceneTransitioning && (
        <div className="fixed inset-0 z-50 bg-black animate-[fadeIn_0.4s_ease-out] pointer-events-none" />
      )}

      {/* Ambient particles for night scenes */}
      {currentSceneIdx / Math.max(sceneData.scenes.length - 1, 1) >= 0.75 && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-amber-400/10"
              style={{
                width: `${1 + (i % 2)}px`,
                height: `${1 + (i % 2)}px`,
                top: `${(i * 41) % 100}%`,
                left: `${(i * 67) % 100}%`,
                animation: `pulse ${3 + (i % 3)}s ease-in-out ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
      )}

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

      {/* RPG Stats HUD — colored progress bars matching reference design */}
      <div className="px-3 py-2 border-b border-stone-800/30 bg-stone-900/40">
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
          {[
            { key: "relationships" as const, label: "Health",    color: "bg-emerald-500",  max: 100 },
            { key: "knowledge"     as const, label: "Knowledge", color: "bg-sky-400",      max: 100 },
            { key: "courage"       as const, label: "Courage",   color: "bg-orange-400",   max: 100 },
            { key: "faith"         as const, label: "Faith",     color: "bg-violet-400",   max: 100 },
            { key: "reputation"    as const, label: "Reputation",color: "bg-cyan-400",     max: 100 },
            { key: "legacy"        as const, label: "Legacy",    color: "bg-amber-400",    max: 100 },
          ].map(({ key, label, color, max }) => {
            const val = Math.min(max, sessionStats[key]);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-wide text-stone-500">{label}</span>
                  <span className="text-[8px] font-black text-stone-400">{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-800/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${Math.max(2, val)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {/* Autosave indicator */}
        {(autosaveState === "saving" || autosaveState === "saved") && (
          <div className="flex justify-end mt-1">
            {autosaveState === "saving" && (
              <span className="flex items-center gap-1 text-[9px] text-amber-400 animate-pulse">
                <Save className="w-2.5 h-2.5" /> Saving...
              </span>
            )}
            {autosaveState === "saved" && (
              <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                <CheckCircle2 className="w-2.5 h-2.5" /> Saved
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── World always running ────────────────────────────────────────────
          The chapter world is the persistent game backdrop. Scene content
          slides up as a bottom overlay when the player enters a landmark tile,
          keeping the world visible and alive underneath.
          Architecture decision: ROOT_CAUSE_TWO_GAMES.md. */}

      {/* Chapter-driven weather — narrative phase maps to atmosphere */}
      <LegacyWeatherOverlay
        weather={deriveChapterWeather(
          currentSceneIdx / Math.max(sceneData.scenes.length - 1, 1),
          sceneData.ancestorAppearance?.era,
        )}
      />

      {/* World viewport — always mounted, never unmounted during scene reading */}
      <div className="flex-1 min-h-0 relative">
        {/* Location art backdrop — shows real hand-drawn scene art when a
            LegacyMapScene matches the chapter era. Rendered beneath the
            walkable chapter world so the transition from navigation → scene
            reading reveals actual location art. Hidden when worldViewOpen
            (player navigating the grid). */}
        {(() => {
          const mapSceneId = sceneIdForEra(sceneData.ancestorAppearance?.era);
          const mapScene = mapSceneId ? getMapScene(mapSceneId) : undefined;
          if (!mapScene || worldViewOpen) return null;
          return (
            <div className="absolute inset-0 z-0 overflow-hidden opacity-75">
              <LegacySceneRenderer
                scene={mapScene}
                tileSizePx={52}
                className="w-full h-full"
              />
              {/* Gradient fade at bottom so scene content overlay reads cleanly */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, rgba(14,17,17,0) 30%, rgba(14,17,17,0.85) 70%, rgba(14,17,17,1) 100%)" }}
              />
            </div>
          );
        })()}
        <LegacyChapterWorld
          chapterId={sceneData.chapterId}
          scenes={sceneData.scenes.map((s) => ({
            sceneNumber: s.sceneNumber,
            title: s.title,
            type: s.type,
            placeId: s.placeId,
          }))}
          activeSceneNumber={
            sceneData.scenes.find((s) => !completedScenes.has(s.sceneNumber))?.sceneNumber
              ?? sceneData.scenes[currentSceneIdx]?.sceneNumber
              ?? sceneData.scenes[0].sceneNumber
          }
          completedSceneNumbers={completedScenes}
          ageGroup={sceneData.ancestorAppearance?.ageGroup ?? "adult"}
          gender={sceneData.ancestorAppearance?.gender ?? "unspecified"}
          characterId={sceneData.ancestorMemberId ? `ancestor-${sceneData.familyId}-${sceneData.ancestorMemberId}` : undefined}
          lifeStage={sceneData.ancestorAppearance?.lifeStage}
          era={sceneData.ancestorAppearance?.era}
          appearanceSeed={sceneData.ancestorAppearance?.appearanceSeed}
          characterName={sceneData.ancestorName}
          onEnterScene={handleEnterScene}
          onEnterBattle={() => setBattleOpen(true)}
          inputEnabled={!battleOpen && !journalOpen && !mapOpen && !placeSheetOpen && !questsOpen && !gameCanvasOpen}
        />

        {/* Scene content — absolute overlay inside world viewport.
            Slides up from bottom when a landmark is entered. The world
            continues running in the top portion of the screen. */}
        {!worldViewOpen && (
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]"
          style={{
            maxHeight: "68%",
            background: "linear-gradient(180deg, rgba(8,8,6,0) 0%, rgba(10,9,7,0.96) 8%, #0a0907 100%)",
            backdropFilter: "blur(2px)",
          }}
        >
        {/* Drag handle + scene indicator */}
        <div className="flex items-center justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-amber-900/50" />
        </div>
      {/* Day-Cycle Progression Bar — Living Game Session */}
      <div className="px-4 py-2 border-b border-stone-800/30 bg-transparent shrink-0">
        <div className="flex items-center justify-between gap-1">
          {(() => {
            const totalScenes = sceneData.scenes.length;
            const currentSceneNum = currentSceneIdx + 1;
            const cycleSteps = [
              { icon: Sunrise, label: "Morning", scene: 1 },
              { icon: MessageSquare, label: "Dialogue", scene: 2 },
              { icon: Compass, label: "Choice", scene: 3 },
              { icon: MapIcon, label: "Travel", scene: 4 },
              { icon: Sparkles, label: "Discovery", scene: 5 },
              { icon: BookOpen, label: "Quest", scene: 6 },
              { icon: Moon, label: "Evening", scene: 7 },
              { icon: BookMarked, label: "Journal", scene: 8 },
              { icon: Save, label: "Autosave", scene: 9 },
            ];
            const activeStepIdx = Math.min(
              Math.floor((currentSceneNum / Math.max(totalScenes, 1)) * cycleSteps.length),
              cycleSteps.length - 1
            );
            return cycleSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === activeStepIdx;
              const isPast = idx < activeStepIdx;
              return (
                <div key={idx} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isActive ? "bg-amber-500/20 border border-amber-400/50 scale-110" :
                    isPast ? "bg-emerald-500/10 border border-emerald-400/20" :
                    "bg-stone-800/40 border border-stone-700/30"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${
                      isActive ? "text-amber-400" :
                      isPast ? "text-emerald-400" :
                      "text-stone-600"
                    }`} />
                  </div>
                  <span className={`text-[7px] font-bold uppercase tracking-wide ${
                    isActive ? "text-amber-400" :
                    isPast ? "text-emerald-400/70" :
                    "text-stone-600"
                  }`}>{step.label}</span>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Scene content — scrollable within the overlay panel */}
      <div
        key={sceneFadeKey}
        className="overflow-y-auto px-5 py-4 animate-[fadeIn_0.6s_ease-out]"
        style={{ maxHeight: "42vh" }}
      >
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

        {/* Context tags — "Walk Here" is prominent for place-based scenes */}
        {(place || event) && (
          <div className="flex flex-wrap gap-2 mb-5">
            {place && (
              <button
                onClick={() => setPlaceSheetOpen(true)}
                className="flex items-center gap-2 text-sm text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-2.5 hover:bg-amber-400/20 hover:border-amber-400/40 transition-all active:scale-95 group"
              >
                <Footprints className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold">Walk to {place.label}</span>
                {place.country && <span className="text-xs text-stone-500">{place.country}</span>}
              </button>
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

        {/* Dialogue scenes: NPC portrait + speech bubble layout */}
        {scene.type === "dialogue" ? (
          <div className="mb-6">
            {/* NPC portrait card */}
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10"
                  style={{ background: "linear-gradient(135deg, #2A1A0F 0%, #1A0F08 100%)" }}
                >
                  {sceneData.chapterTitle?.charAt(0) ?? "A"}
                </div>
                <p className="text-[8px] text-amber-700 text-center mt-1 uppercase tracking-wide font-bold truncate w-14">
                  Ancestor
                </p>
              </div>
              {/* Speech bubble */}
              <div className="flex-1 relative">
                <div
                  className="rounded-2xl rounded-tl-sm p-4"
                  style={{ background: "linear-gradient(135deg, #1f1a0e 0%, #141108 100%)", border: "1px solid rgba(180,120,40,0.25)" }}
                >
                  <p className="text-sm text-amber-100/90 leading-relaxed whitespace-pre-line italic">
                    "{scene.content}"
                  </p>
                </div>
                {/* Bubble tail */}
                <div className="absolute top-3 -left-2 w-0 h-0 border-t-[6px] border-t-transparent border-r-[8px] border-r-amber-900/60 border-b-[6px] border-b-transparent" />
              </div>
            </div>
          </div>
        ) : (
          /* Non-dialogue: standard narration / reflection / context text */
          <div className="prose prose-invert max-w-none mb-6">
            <p className="text-stone-300 leading-relaxed text-base whitespace-pre-line">
              {scene.content}
            </p>
          </div>
        )}

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

        {/* Memory reference with audio playback */}
        {memory && (
          <div className="bg-stone-800/30 border border-stone-700/50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">From the Vault</span>
            </div>
            <p className="text-sm text-stone-300 mb-3">
              {(memory as { description?: string; title?: string; audioUrl?: string }).description ||
               (memory as { title?: string }).title ||
               "A preserved family memory."}
            </p>
            {/* Audio playback — only shown when the vault has a real audio recording */}
            {(memory as { audioUrl?: string }).audioUrl && (
              <div className="mt-2">
                <audio
                  ref={audioRef}
                  src={(memory as { audioUrl?: string }).audioUrl}
                  preload="none"
                  onPlay={() => { setAudioPlaying(true); setAudioError(null); }}
                  onPause={() => setAudioPlaying(false)}
                  onEnded={() => setAudioPlaying(false)}
                  onError={() => { setAudioPlaying(false); setAudioError("Could not play recording"); }}
                  className="hidden"
                />
                <button
                  onClick={() => {
                    const el = audioRef.current;
                    if (!el) return;
                    if (audioPlaying) {
                      el.pause();
                    } else {
                      el.play().catch(() => setAudioError("Could not play recording"));
                    }
                  }}
                  className={`flex items-center gap-2 text-xs font-bold rounded-xl px-3 py-2 transition-all active:scale-95 ${
                    audioPlaying
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                      : "bg-stone-800/60 border border-stone-600/50 text-stone-300 hover:border-amber-500/40 hover:text-amber-300"
                  }`}
                >
                  {audioPlaying ? (
                    <>
                      <span className="flex gap-[2px] items-end h-3">
                        {[1,2,3,4].map(i => (
                          <span
                            key={i}
                            className="w-[3px] rounded-full bg-amber-400"
                            style={{ height: `${6 + (i % 3) * 4}px`, animation: `pulse 0.${6+i}s ease-in-out infinite` }}
                          />
                        ))}
                      </span>
                      Pause Recording
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M2 1l9 5-9 5z" />
                      </svg>
                      Play Family Recording
                    </>
                  )}
                </button>
                {audioError && (
                  <p className="text-[10px] text-red-400 mt-1">{audioError}</p>
                )}
              </div>
            )}
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
        </div>
        )}
      </div>

      {/* Scene dots + floating action buttons — always visible at bottom */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-stone-800/50 bg-stone-950/80 shrink-0">
        {!worldViewOpen && (
          <button
            onClick={() => setWorldViewOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 active:opacity-70 transition-all"
          >
            <Footprints className="w-3.5 h-3.5" /> Back to World
          </button>
        )}
        {/* Journal button — opens in place, never leaves the running chapter */}
        <button
          onClick={() => setJournalOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-400 bg-stone-800/60 border border-stone-700/50 rounded-xl px-3 py-2 active:opacity-70 hover:border-amber-500/30 hover:text-amber-400 transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" /> Journal
        </button>

        {/* Quests button — opens character + quest sheet without leaving chapter */}
        <button
          onClick={() => setQuestsOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-400 bg-stone-800/60 border border-stone-700/50 rounded-xl px-3 py-2 active:opacity-70 hover:border-amber-500/30 hover:text-amber-400 transition-all"
        >
          <Scroll className="w-3.5 h-3.5" /> Quests
        </button>

        {/* Scene progress dots */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
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

        {/* Map button — opens as an overlay on top of the running chapter */}
        <button
          onClick={() => setMapOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-400 bg-stone-800/60 border border-stone-700/50 rounded-xl px-3 py-2 active:opacity-70 hover:border-amber-500/30 hover:text-amber-400 transition-all"
        >
          <MapIcon className="w-3.5 h-3.5" /> Map
        </button>

        {/* Live World — opens the real PixiJS game canvas (RUNTIME_ARCHITECTURE_UPDATE.md step 2) */}
        <button
          onClick={() => setGameCanvasOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-400 bg-stone-800/60 border border-stone-700/50 rounded-xl px-3 py-2 active:opacity-70 hover:border-amber-500/30 hover:text-amber-400 transition-all"
        >
          <Sword className="w-3.5 h-3.5" /> World
        </button>
      </div>

      {/* Core Loop Overlay — makes Memory→AI→World Changes→Player Notices→New Gameplay→New Memory visible */}
      {showCoreLoop && worldChanges.length > 0 && (
        <LegacyCoreLoop
          changes={worldChanges}
          onComplete={() => setShowCoreLoop(false)}
        />
      )}

      {/* Place sheet — "Walk to {place}" used to navigate away to /legacy/map
          and abandon the scene. It now surfaces the same vault place info
          in place, over the running chapter, using data already loaded with
          the scene (sceneData.vaultContext.places) — no extra fetch, no exit. */}
      {placeSheetOpen && place && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-lg bg-[#171310] border-t border-amber-900/40 rounded-t-2xl p-5 pb-8 animate-[slideUp_0.25s_ease-out]">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] text-amber-600 uppercase tracking-widest font-bold mb-1">Family Place</p>
                <h3 className="text-lg font-black text-stone-100">{place.label}</h3>
                {place.country && <p className="text-xs text-stone-500 mt-0.5">{place.country}</p>}
              </div>
              <button
                onClick={() => setPlaceSheetOpen(false)}
                className="p-2 -mr-2 -mt-1 rounded-lg hover:bg-stone-800/50 text-stone-500"
              >
                <ArrowLeft className="w-4 h-4 rotate-45" />
              </button>
            </div>
            <p className="text-sm text-stone-400 leading-relaxed mb-5">
              This place is part of your family's living world. Open the full map to see it
              alongside every other place your family has discovered, or stay here and
              continue the scene.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setPlaceSheetOpen(false); setMapOpen(true); }}
                className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm flex items-center justify-center gap-2"
              >
                <MapIcon className="w-4 h-4" /> Open Full Map
              </button>
              <button
                onClick={() => setPlaceSheetOpen(false)}
                className="text-stone-400 font-medium rounded-xl px-6 py-3 text-sm border border-stone-700"
              >
                Continue the Scene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journal overlay — slide-over sheet, the running scene stays mounted underneath */}
      {journalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0e1111] animate-[fadeIn_0.2s_ease-out]">
          <LegacyJournalPanel
            familyId={sceneData.familyId ?? null}
            embedded
            onClose={() => setJournalOpen(false)}
            onRevisitChapter={(chapterId) => {
              setJournalOpen(false);
              // Only actually navigate if it's a different chapter than the one
              // already running underneath the sheet — revisiting the current
              // chapter just closes the journal and resumes where you were.
              if (chapterId !== sceneData.chapterId) {
                navigate(`/legacy/chapter/${chapterId}`);
              }
            }}
          />
        </div>
      )}

      {/* Map overlay — same real per-family map used by the standalone /legacy/map
          route, now mounted in place so checking the map doesn't exit the chapter. */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 animate-[fadeIn_0.2s_ease-out]">
          <LegacyMapPage onClose={() => setMapOpen(false)} />
        </div>
      )}

      {/* Quests + Character overlay — shows active mystery quests, chapter objectives,
          and accumulated stat gains without leaving the running chapter.
          Pattern: same slide-over approach as Journal and Map above. */}
      {questsOpen && (
        <LegacyQuestsPanel
          familyId={sceneData.familyId ?? null}
          chapterId={sceneData.chapterId}
          chapterTitle={sceneData.chapterTitle}
          ancestorName={sceneData.ancestorName}
          sessionStats={sessionStats}
          scenes={sceneData.scenes.map(s => ({ sceneNumber: s.sceneNumber, title: s.title, type: s.type }))}
          completedSceneNumbers={completedScenes}
          onClose={() => setQuestsOpen(false)}
        />
      )}

      {/* Battle overlay — Path A real-time combat (COMBAT_PATCH_README.md).
          LegacyBattleScene is a full-screen PixiJS side-view arena with real
          gravity/jump, 3-hit ground combo, aerial combo, dash i-frames, and a
          Legacy Burst skill. Input leak fixed: LegacyChapterWorld receives
          inputEnabled=false while this is open, so arrow keys don't move the
          hidden exploration character at the same time as the fighter. */}
      {battleOpen && (
        <div className="fixed inset-0 z-50 animate-[fadeIn_0.2s_ease-out]">
          <LegacyBattleScene
            enemyName="Rival Guard"
            onVictory={() => setBattleOpen(false)}
            onDefeat={() => setBattleOpen(false)}
            onFlee={() => setBattleOpen(false)}
            onCombatHit={(dmg) =>
              pageAttrSystem.current.processEvent({ type: "combat_hit", damage: dmg })
            }
          />
        </div>
      )}

      {/* Live World Canvas — real PixiJS game canvas per RUNTIME_ARCHITECTURE_UPDATE.md
          rollout step 2: proves the rendering pipeline with real hand-drawn art before
          wiring movement into the chapter-scene system. Opens as a full-screen overlay.
          Uses the Cape Coast Compound 1890 scene (the first complete hand-authored
          LegacyMapScene) and Kwame's hand-drawn character manifest (384 frames). */}
      {gameCanvasOpen && (
        <div className="fixed inset-0 z-50 bg-[#1a0f08] flex flex-col animate-[fadeIn_0.2s_ease-out]">
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid rgba(214,158,46,0.2)" }}
          >
            <button
              onClick={() => setGameCanvasOpen(false)}
              className="flex items-center gap-2 text-sm font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 active:opacity-70 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Chapter
            </button>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">Living World</p>
              <p className="text-xs text-stone-500 font-semibold">Cape Coast Compound · 1890</p>
            </div>
            <div className="w-28 flex justify-end">
              <span className="text-[9px] text-amber-800 bg-amber-900/20 border border-amber-900/30 rounded-full px-2 py-1 font-bold uppercase tracking-wide">
                PixiJS · WebGL
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <LegacyGameCanvas
              scene={capeCoastCompoundScene}
              environmentAssets={capeCoastCompoundAssets}
              environmentBaseUrl={environmentBaseUrl}
              characterManifest={KWAME_SHEET_MANIFEST}
            />
          </div>
          <div className="flex-shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-stone-600"
               style={{ borderTop: "1px solid rgba(214,158,46,0.1)" }}>
            <span>Arrow keys / WASD — move</span>
            <span>Shift — run</span>
            <span>Space — interact</span>
            <span>J/K — attack (no art yet)</span>
            <span>L — jump</span>
          </div>
        </div>
      )}
    </div>
  );
}
