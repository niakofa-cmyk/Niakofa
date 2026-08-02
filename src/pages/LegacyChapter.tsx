import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, BookHeart, Sparkles,
  Users, MapPin, Calendar, Crown, BookOpen, Flame,
  CheckCircle2, ArrowRight, MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import {
  getChapters, getScenes, getChoices, getDialogues, getActiveSession,
  updateSessionStats, advanceSessionScene, selectChoice, completeChapter,
  applyStatEffects, capStat,
  type LegacyChapter, type LegacyScene, type LegacyChoice,
  type LegacyDialogue, type LegacySession,
  type StatEffects, type StatKey,
} from "@/lib/api";
import {
  STAT_LABELS, STAT_ICONS, STAT_COLORS, STAT_BAR_COLORS,
} from "@/lib/types";

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen, Crown, Flame, Users, Sparkles, MapPin, Calendar, BookHeart,
};

function StatPill({ statKey, value, delta }: { statKey: StatKey; value: number; delta?: number }) {
  const Icon = ICON_MAP[STAT_ICONS[statKey]] ?? BookOpen;
  return (
    <div className="flex items-center gap-1.5 bg-[#3A2A1A] rounded-lg px-2.5 py-1.5">
      <Icon className={`w-3.5 h-3.5 ${STAT_COLORS[statKey]}`} />
      <span className="text-xs text-amber-700">{STAT_LABELS[statKey]}</span>
      <span className={`text-xs font-bold ${STAT_COLORS[statKey]}`}>{value}</span>
      {delta && delta > 0 ? <span className="text-xs text-emerald-400 font-bold animate-pulse">+{delta}</span> : null}
    </div>
  );
}

export default function LegacyChapterPage({ chapterId }: { chapterId: string }) {
  const [, navigate] = useRoute();
  const [chapter, setChapter] = useState<LegacyChapter | null>(null);
  const [scenes, setScenes] = useState<LegacyScene[]>([]);
  const [choices, setChoices] = useState<LegacyChoice[]>([]);
  const [dialogues, setDialogues] = useState<LegacyDialogue[]>([]);
  const [session, setSession] = useState<LegacySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [stats, setStats] = useState<StatEffects>({
    knowledge: 10, relationships: 10, cultural_wisdom: 10, courage: 10, legacy: 10,
  });
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [statDeltas, setStatDeltas] = useState<Partial<StatEffects>>({});
  const [showConsequence, setShowConsequence] = useState(false);
  const [chapterComplete, setChapterComplete] = useState(false);
  const [narrationLoading, setNarrationLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [ch, sc, sess] = await Promise.all([
        getChapters(), getScenes(chapterId), getActiveSession(),
      ]);
      const currentChapter = (ch as LegacyChapter[]).find(c => c.id === chapterId) ?? null;
      setChapter(currentChapter);
      setScenes(sc);
      setSession(sess);
      if (sess) {
        setStats(sess.stats);
        const startScene = sc.findIndex(s => s.scene_number === sess.current_scene_number);
        setSceneIdx(startScene >= 0 ? startScene : 0);
      }
      if (currentChapter?.status === "completed") setChapterComplete(true);
      setLoading(false);
    })();
  }, [chapterId]);

  // Load choices and dialogues for current scene
  useEffect(() => {
    if (!scenes[sceneIdx]) return;
    const scene = scenes[sceneIdx];
    (async () => {
      const [ch, dl] = await Promise.all([getChoices(scene.id), getDialogues(scene.id)]);
      setChoices(ch);
      setDialogues(dl);
      setSelectedChoiceId(null);
      setShowConsequence(false);
      setStatDeltas({});
      // Simulate AI narration loading
      if (scene.narration) {
        setNarrationLoading(true);
        const t = setTimeout(() => setNarrationLoading(false), 1200);
        return () => clearTimeout(t);
      }
    })();
  }, [sceneIdx, scenes]);

  const handleSelectChoice = useCallback(async (choice: LegacyChoice) => {
    if (selectedChoiceId) return;
    setSelectedChoiceId(choice.id);
    setStatDeltas(choice.stat_effects);
    const newStats = applyStatEffects(stats, choice.stat_effects);
    setStats(newStats);
    setShowConsequence(true);

    await selectChoice(choice.id);
    if (session) {
      await updateSessionStats(session.id, newStats);
    }
  }, [selectedChoiceId, stats, session]);

  const handleNextScene = useCallback(async () => {
    if (sceneIdx < scenes.length - 1) {
      const nextIdx = sceneIdx + 1;
      setSceneIdx(nextIdx);
      if (session) {
        await advanceSessionScene(session.id, scenes[nextIdx].scene_number);
      }
    } else {
      // Chapter complete
      setChapterComplete(true);
      await completeChapter(chapterId);
      if (session) {
        await advanceSessionScene(session.id, scenes[sceneIdx].scene_number + 1);
      }
    }
  }, [sceneIdx, scenes, session, chapterId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ background: "#1A0F08" }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1A0F08" }}>
        <p className="text-amber-600">Chapter not found.</p>
      </div>
    );
  }

  // Chapter complete screen
  if (chapterComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#1A0F08" }}>
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-lg font-black text-amber-100 uppercase tracking-widest mb-2">Chapter Complete</h1>
          <p className="text-sm text-amber-300 mb-1">{chapter.title}</p>
          {chapter.synopsis && <p className="text-xs text-amber-600 mb-6 leading-relaxed">{chapter.synopsis}</p>}

          {/* Stat summary */}
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 mb-6">
            <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Your Character Has Grown</p>
            <div className="space-y-2">
              {(Object.keys(stats) as StatKey[]).map(key => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-amber-200">{STAT_LABELS[key]}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-amber-900/40 overflow-hidden">
                      <div className={`h-full rounded-full ${STAT_BAR_COLORS[key]}`} style={{ width: `${stats[key]}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${STAT_COLORS[key]}`}>{stats[key]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => navigate("legacy")}
            className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-wide py-3 rounded-xl active:opacity-80 flex items-center justify-center gap-2">
            Return to Legacy Hub <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const scene = scenes[sceneIdx];
  const isLastScene = sceneIdx === scenes.length - 1;

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      {/* Header with chapter info and stats */}
      <div className="sticky top-0 z-10 px-4 py-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-amber-500 uppercase tracking-wide">Chapter {chapter.chapter_number}</p>
            <h1 className="text-sm font-black text-amber-100 truncate">{chapter.title}</h1>
          </div>
          <span className="text-xs text-amber-700 flex-shrink-0">{sceneIdx + 1}/{scenes.length}</span>
        </div>
        {/* Stats bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(stats) as StatKey[]).map(key => (
            <StatPill key={key} statKey={key} value={stats[key]} delta={statDeltas[key]} />
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Era and location banner */}
        {(chapter.era || chapter.location) && (
          <div className="flex items-center gap-2 mb-4 text-center justify-center">
            {chapter.year_start && <span className="text-lg font-black text-amber-400">{chapter.year_start}{chapter.year_end ? `–${chapter.year_end}` : ""}</span>}
            {chapter.location && <span className="text-lg font-black text-amber-400">· {chapter.location.toUpperCase()}</span>}
          </div>
        )}

        {/* Scene content */}
        {scene && (
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-5 shadow-lg mb-4">
            <div className="flex items-center gap-2 mb-3">
              <BookHeart className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-black text-amber-200 uppercase tracking-wide">{scene.title}</h2>
            </div>

            {narrationLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                  <p className="text-xs text-amber-600">Nia is narrating this moment from your family's history...</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
              </div>
            ) : (
              <>
                {/* Narration */}
                {scene.narration && (
                  <p className="text-sm text-amber-100 leading-relaxed mb-3 italic">
                    {scene.narration}
                  </p>
                )}

                {/* Content */}
                <p className="text-sm text-amber-200/80 leading-relaxed mb-3">
                  {scene.content}
                </p>

                {/* Historical layer badge */}
                <div className="flex items-center gap-1.5 mb-3">
                  <div className={`text-xs px-2 py-0.5 rounded-full ${
                    scene.historical_layer === "verified" ? "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30" :
                    scene.historical_layer === "historical" ? "bg-blue-900/30 text-blue-400 border border-blue-700/30" :
                    "bg-purple-900/30 text-purple-400 border border-purple-700/30"
                  }`}>
                    {scene.historical_layer === "verified" ? "Verified History" :
                     scene.historical_layer === "historical" ? "Historical Context" :
                     "Narrative Interpretation"}
                  </div>
                </div>

                {/* Dialogue lines */}
                {dialogues.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {dialogues.map(d => (
                      <div key={d.id} className="flex items-start gap-2 bg-[#3A2A1A] rounded-xl p-3">
                        <div className="w-8 h-8 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-amber-300">{d.speaker}</p>
                          <p className="text-xs text-amber-200/80 italic mt-0.5 leading-relaxed">"{d.line}"</p>
                          {d.tone && <p className="text-xs text-amber-700 mt-0.5 capitalize">— {d.tone}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Choices */}
        {!narrationLoading && scene && choices.length > 0 && !showConsequence && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-2">What do you do?</p>
            {choices.map(choice => (
              <button key={choice.id} onClick={() => handleSelectChoice(choice)}
                disabled={!!selectedChoiceId}
                className={`w-full text-left p-4 rounded-xl border transition-all active:scale-98 ${
                  selectedChoiceId === choice.id
                    ? "bg-amber-500/20 border-amber-500 ring-2 ring-amber-500"
                    : "bg-[#2A1A0F] border-amber-800/40 active:opacity-70"
                }`}>
                <p className="text-sm font-bold text-amber-200">{choice.label}</p>
                {choice.description && <p className="text-xs text-amber-600 mt-1 leading-relaxed">{choice.description}</p>}
                {choice.stat_effects && Object.keys(choice.stat_effects).length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {Object.entries(choice.stat_effects).map(([key, val]) => (
                      <span key={key} className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-full px-2 py-0.5">
                        +{val} {STAT_LABELS[key as StatKey]}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Consequence */}
        {!narrationLoading && showConsequence && selectedChoiceId && (
          <div className="bg-gradient-to-br from-amber-900/30 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-black text-amber-300 uppercase tracking-widest">What Happened</p>
            </div>
            {(() => {
              const choice = choices.find(c => c.id === selectedChoiceId);
              return choice?.consequence_text ? (
                <p className="text-sm text-amber-100 leading-relaxed italic">{choice.consequence_text}</p>
              ) : null;
            })()}
            {Object.keys(statDeltas).length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {Object.entries(statDeltas).map(([key, val]) => {
                  const statKey = key as StatKey;
                  return (
                    <span key={key} className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-full px-2 py-0.5 animate-pulse">
                      +{val} {STAT_LABELS[statKey]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {!narrationLoading && (
          <div className="flex gap-2">
            {sceneIdx > 0 && (
              <button onClick={() => setSceneIdx(i => i - 1)}
                className="bg-[#3A2A1A] border border-amber-900/30 text-amber-700 font-bold text-xs uppercase tracking-wide px-4 py-3 rounded-xl active:opacity-70 flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
            )}
            <button onClick={handleNextScene}
              className="flex-1 bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-wide py-3 rounded-xl active:opacity-80 flex items-center justify-center gap-2">
              {isLastScene ? "Complete Chapter" : "Continue"} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scene progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {scenes.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === sceneIdx ? "bg-amber-400 w-4" : i < sceneIdx ? "bg-amber-700" : "bg-amber-900/40"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
