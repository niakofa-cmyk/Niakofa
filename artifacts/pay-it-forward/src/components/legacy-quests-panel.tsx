/**
 * LegacyQuestsPanel — in-session quests overlay.
 *
 * Follows the same slide-over pattern as LegacyJournalPanel so the player
 * never leaves the running chapter to check their active quests.
 *
 * Shows:
 *   1. Character sheet — who you're playing as, current stat profile
 *   2. Active mystery quests — created via "Ask a question" choices inside
 *      scenes (POST /api/legacy/chapters/:id/mystery-quest)
 *   3. Chapter objectives — the scenes remaining in the current chapter
 *
 * Wired from the action bar in legacy-chapter.tsx, same as Journal.
 */

import { useState, useEffect } from "react";
import {
  ArrowLeft, Loader2, Star, Scroll, Target,
  BookOpen, X, Users, Award, AlertCircle,
} from "lucide-react";
import { authHeaders } from "@/lib/auth";

interface QuestEntry {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  category: "mystery" | "record" | "connect" | "discover" | "explore";
  createdAt: string;
  relatedChapterId?: number;
  ancestorName?: string;
}

interface StatBlock {
  knowledge: number;
  relationships: number;
  culturalWisdom: number;
  courage: number;
  reputation: number;
  legacy: number;
  faith: number;
}

const STAT_ICONS: Record<string, string> = {
  knowledge: "BK", relationships: "HR", culturalWisdom: "CW",
  courage: "CG", reputation: "RP", legacy: "LG", faith: "FA",
};

const STAT_COLORS: Record<string, string> = {
  knowledge: "text-sky-400",
  relationships: "text-rose-400",
  culturalWisdom: "text-amber-400",
  courage: "text-orange-400",
  reputation: "text-teal-400",
  legacy: "text-purple-400",
  faith: "text-pink-400",
};

const CATEGORY_ICONS: Record<string, string> = {
  mystery: "?", record: "◎", connect: "⊕", discover: "◈", explore: "◆",
};

interface LegacyQuestsPanelProps {
  familyId?: number | null;
  chapterId?: number | null;
  chapterTitle?: string | null;
  ancestorName?: string | null;
  /** Current stats accumulated this session — passed in from parent to avoid a separate fetch */
  sessionStats?: Partial<StatBlock> | null;
  /** Scene completion data for the chapter objectives section */
  scenes?: Array<{ sceneNumber: number; title: string; type: string }>;
  completedSceneNumbers?: ReadonlySet<number>;
  onClose: () => void;
}

export function LegacyQuestsPanel({
  familyId,
  chapterId,
  chapterTitle,
  ancestorName,
  sessionStats,
  scenes = [],
  completedSceneNumbers = new Set(),
  onClose,
}: LegacyQuestsPanelProps) {
  const [quests, setQuests] = useState<QuestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/legacy/quests?familyId=${familyId}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`${res.status}`);
        const data: QuestEntry[] = await res.json();
        setQuests(data);
      } catch {
        // Non-fatal: quests panel still shows chapter objectives and stats
        setError("Could not load quests right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [familyId]);

  const activeQuests = quests.filter(q => q.status === "active");
  const chapterQuests = activeQuests.filter(q => q.relatedChapterId === chapterId);
  const otherQuests = activeQuests.filter(q => q.relatedChapterId !== chapterId);

  const doneCount = completedSceneNumbers.size;
  const totalCount = scenes.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1111] animate-[slideUp_0.25s_ease-out]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "rgba(214,158,46,0.2)", background: "rgba(14,17,17,0.98)" }}
      >
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-xl hover:bg-stone-800/60 text-stone-400 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">Quests & Character</p>
          {ancestorName && (
            <p className="text-xs text-amber-300/80 font-semibold mt-0.5">Playing as {ancestorName}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 -mr-2 rounded-xl hover:bg-stone-800/60 text-stone-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">

        {/* ── Chapter Progress ───────────────────────────────────────────── */}
        {chapterTitle && (
          <div className="px-4 pt-5 pb-3">
            <div className="rounded-2xl p-4" style={{ background: "rgba(20,12,4,0.9)", border: "1px solid rgba(214,158,46,0.22)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">Chapter Objectives</p>
              </div>
              <p className="text-sm font-bold text-stone-200 mb-3">{chapterTitle}</p>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-stone-500 font-semibold">Progress</p>
                  <p className="text-[10px] font-bold text-amber-400">{doneCount}/{totalCount} scenes</p>
                </div>
                <div className="w-full h-1.5 rounded-full bg-stone-800">
                  <div
                    className="h-1.5 rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Scene list */}
              <div className="space-y-1.5">
                {scenes.map((s) => {
                  const done = completedSceneNumbers.has(s.sceneNumber);
                  return (
                    <div key={s.sceneNumber} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                        done ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-stone-800 text-stone-600 border border-stone-700"
                      }`}>
                        {done ? "✓" : s.sceneNumber}
                      </div>
                      <p className={`text-xs leading-relaxed ${done ? "text-stone-500 line-through" : "text-stone-300"}`}>
                        {s.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Session Stats ──────────────────────────────────────────────── */}
        {sessionStats && Object.values(sessionStats).some(v => (v ?? 0) > 0) && (
          <div className="px-4 pb-3">
            <div className="rounded-2xl p-4" style={{ background: "rgba(20,12,4,0.9)", border: "1px solid rgba(214,158,46,0.15)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">Character Stats</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(sessionStats) as [string, number | undefined][])
                  .filter(([, v]) => (v ?? 0) > 0)
                  .map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded flex-shrink-0 bg-stone-900 text-[8px] font-black flex items-center justify-center ${STAT_COLORS[key] ?? "text-amber-400"}`}>
                        {STAT_ICONS[key] ?? "??"}
                      </span>
                      <div>
                        <p className={`text-xs font-bold ${STAT_COLORS[key] ?? "text-amber-400"}`}>+{val ?? 0}</p>
                        <p className="text-[9px] text-stone-500 capitalize leading-none">{key}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Quests ──────────────────────────────────────────────── */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Scroll className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-500">Mystery Quests</p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              <p className="text-xs text-stone-500">Loading quests…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-xl p-3 bg-stone-900/60 border border-stone-800">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-stone-500">{error}</p>
            </div>
          )}

          {!loading && !error && activeQuests.length === 0 && (
            <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(20,12,4,0.8)", border: "1px solid rgba(214,158,46,0.12)" }}>
              <Star className="w-7 h-7 text-amber-800 mx-auto mb-2" />
              <p className="text-xs font-bold text-stone-400 mb-1">No active mystery quests yet</p>
              <p className="text-[10px] text-stone-600 leading-relaxed">
                During a dialogue scene, choose "Ask a question" to create a mystery quest that
                family members can help answer.
              </p>
            </div>
          )}

          {!loading && chapterQuests.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600/60 mb-2">This Chapter</p>
              {chapterQuests.map((q) => <QuestRow key={q.id} quest={q} />)}
            </div>
          )}

          {!loading && otherQuests.length > 0 && (
            <div className="space-y-2">
              {chapterQuests.length > 0 && (
                <p className="text-[9px] font-bold uppercase tracking-widest text-stone-600 mb-2">Other Chapters</p>
              )}
              {otherQuests.slice(0, 5).map((q) => <QuestRow key={q.id} quest={q} />)}
              {otherQuests.length > 5 && (
                <p className="text-[10px] text-stone-600 text-center pt-1">
                  +{otherQuests.length - 5} more in the full quests list
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Ancestor info footer ───────────────────────────────────────── */}
        {ancestorName && (
          <div className="px-4 pt-2">
            <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(20,12,4,0.7)", border: "1px solid rgba(214,158,46,0.1)" }}>
              <div className="w-10 h-10 rounded-full bg-amber-900/30 border border-amber-700/30 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-black text-amber-200">{ancestorName}</p>
                <p className="text-[10px] text-stone-500">Your family ancestor · playing now</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestRow({ quest }: { quest: QuestEntry }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "rgba(20,12,4,0.85)", border: "1px solid rgba(214,158,46,0.18)" }}
    >
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded flex-shrink-0 bg-amber-900/30 text-amber-500 text-xs font-black flex items-center justify-center mt-0.5">
          {CATEGORY_ICONS[quest.category] ?? "?"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-bold text-amber-100 leading-snug">{quest.title}</p>
            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
              quest.status === "active" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
            }`}>
              {quest.status}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 leading-relaxed mt-0.5 line-clamp-2">{quest.description}</p>
          {quest.ancestorName && (
            <p className="text-[9px] text-amber-700 mt-1 font-semibold">
              <BookOpen className="w-2.5 h-2.5 inline mr-0.5" />
              {quest.ancestorName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
