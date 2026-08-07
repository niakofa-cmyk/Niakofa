/**
 * Legacy Core Loop — Visible World Evolution Indicator
 *
 * Makes the core loop visible to the player:
 *   Memory → AI → World Changes → Player Notices → New Gameplay → New Memory
 */

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, Brain, Globe2, Eye, Gamepad2, Heart,
  CheckCircle2, ChevronRight, X,
} from "lucide-react";

export interface WorldChange {
  type: "memory" | "ai_insight" | "world_change" | "player_notice" | "new_gameplay" | "new_memory";
  label: string;
  description: string;
  icon: typeof Sparkles;
  color: string;
}

const LOOP_STAGES: Array<{
  key: WorldChange["type"];
  label: string;
  icon: typeof Sparkles;
  color: string;
  bgColor: string;
}> = [
  { key: "memory", label: "Memory", icon: Heart, color: "text-rose-400", bgColor: "bg-rose-500/10" },
  { key: "ai_insight", label: "AI Insight", icon: Brain, color: "text-sky-400", bgColor: "bg-sky-500/10" },
  { key: "world_change", label: "World Changes", icon: Globe2, color: "text-amber-400", bgColor: "bg-amber-500/10" },
  { key: "player_notice", label: "You Notice", icon: Eye, color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  { key: "new_gameplay", label: "New Gameplay", icon: Gamepad2, color: "text-purple-400", bgColor: "bg-purple-500/10" },
  { key: "new_memory", label: "New Memory", icon: Heart, color: "text-pink-400", bgColor: "bg-pink-500/10" },
];

interface LegacyCoreLoopProps {
  changes: WorldChange[];
  onComplete: () => void;
  autoDismissMs?: number;
}

export default function LegacyCoreLoop({
  changes,
  onComplete,
  autoDismissMs = 8000,
}: LegacyCoreLoopProps) {
  const [visibleStage, setVisibleStage] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (changes.length === 0) { onComplete(); return; }
    let stageIndex = 0;
    const interval = setInterval(() => {
      stageIndex++;
      setVisibleStage(stageIndex);
      if (stageIndex >= changes.length) clearInterval(interval);
    }, 600);
    return () => clearInterval(interval);
  }, [changes.length, onComplete]);

  useEffect(() => {
    if (visibleStage < changes.length) return;
    const timer = setTimeout(() => handleDismiss(), autoDismissMs);
    return () => clearTimeout(timer);
  }, [visibleStage, changes.length, autoDismissMs]);

  const handleDismiss = useCallback(() => {
    if (dismissed) return;
    setDismissed(true);
    onComplete();
  }, [dismissed, onComplete]);

  if (changes.length === 0 || dismissed) return null;

  const allVisible = visibleStage >= changes.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4 animate-[fadeIn_0.3s_ease-out]">
      <div className="max-w-sm w-full bg-gradient-to-b from-[#1a1308] to-[#0a0604] border border-amber-700/30 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <h2 className="text-sm font-black text-amber-300 uppercase tracking-widest">Your World Evolved</h2>
          </div>
          <button onClick={handleDismiss} className="text-amber-700 hover:text-amber-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 mb-5">
          {changes.map((change, i) => {
            const stage = LOOP_STAGES.find((s) => s.key === change.type) ?? LOOP_STAGES[0];
            const Icon = stage.icon;
            const isVisible = visibleStage > i;
            return (
              <div key={i} className={`flex items-start gap-3 transition-all duration-500 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
                <div className={`w-8 h-8 rounded-lg ${stage.bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon className={`w-4 h-4 ${stage.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${stage.color} uppercase tracking-wider mb-0.5`}>{stage.label}</p>
                  <p className="text-sm text-stone-200 leading-snug">{change.description}</p>
                </div>
                {isVisible && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-1" />}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-1 mb-5">
          {LOOP_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const isActive = visibleStage > i;
            const showArrow = i !== LOOP_STAGES.length - 1;
            return (
              <div key={stage.key} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${isActive ? `${stage.bgColor} border border-amber-500/30` : "bg-stone-900 border border-stone-800"}`}>
                  <Icon className={`w-3 h-3 ${isActive ? stage.color : "text-stone-700"}`} />
                </div>
                {showArrow && <ChevronRight className={`w-3 h-3 ${isActive ? "text-amber-600" : "text-stone-800"}`} />}
              </div>
            );
          })}
        </div>

        {allVisible && (
          <button onClick={handleDismiss} className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-3.5 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 animate-[fadeIn_0.4s_ease-out]">
            Continue Your Journey
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function buildWorldChanges(
  type: "scene_complete" | "interview_complete" | "chapter_complete",
  data: {
    statChanges?: Record<string, number>;
    worldChanges?: string[];
    newDialogue?: string;
    newChapterUnlocked?: boolean;
    newPlaces?: string[];
    newEvents?: string[];
    summary?: string;
  },
): WorldChange[] {
  const changes: WorldChange[] = [];

  changes.push({
    type: "memory", label: "Memory",
    description: type === "interview_complete" ? "Your interview was recorded and preserved in the Family Vault." : "Your choice in this scene has been recorded.",
    icon: Heart, color: "text-rose-400",
  });

  if (data.summary) {
    changes.push({ type: "ai_insight", label: "AI Insight", description: data.summary.slice(0, 120), icon: Brain, color: "text-sky-400" });
  }

  if (data.newPlaces?.length) {
    changes.push({ type: "world_change", label: "World Changes", description: `New place discovered: ${data.newPlaces[0]}`, icon: Globe2, color: "text-amber-400" });
  }
  if (data.newEvents?.length) {
    changes.push({ type: "world_change", label: "World Changes", description: `Timeline event added: ${data.newEvents[0]}`, icon: Globe2, color: "text-amber-400" });
  }

  if (data.newDialogue) {
    changes.push({ type: "player_notice", label: "You Notice", description: "New dialogue is available with this ancestor.", icon: Eye, color: "text-emerald-400" });
  }

  if (data.newChapterUnlocked) {
    changes.push({ type: "new_gameplay", label: "New Gameplay", description: "A new chapter has been unlocked — your world has grown.", icon: Gamepad2, color: "text-purple-400" });
  }

  if (type === "chapter_complete") {
    changes.push({ type: "new_memory", label: "New Memory", description: "Your journal has been written. New memories await discovery.", icon: Heart, color: "text-pink-400" });
  }

  return changes;
}
