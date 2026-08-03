/**
 * Legacy Journal — Dynamic Journal
 * Route: /legacy/journal
 *
 * Reads back the player's own recorded chapter decisions (persisted by
 * POST /api/legacy/sessions/progress into session_state.decisions) as a
 * readable, chronological log. Every line here is either real scene
 * content — built the same way GET /legacy/chapters/:id/scenes builds it —
 * or the player's own recorded choice. Nothing on this page is AI-narrated
 * or fabricated; see artifacts/api-server/src/routes/legacy-chapters.ts
 * (GET /legacy/journal/:familyId) for how entries are compiled.
 *
 * Enhanced with:
 *  - Stat impact badges per decision (Knowledge, Courage, etc.)
 *  - Cumulative stats summary header showing total progression
 *  - Search across chapter titles, scene titles, and choice text
 *  - Chapter completion indicators
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, BookOpen, Loader2, MapPin, ChevronRight,
  Search, X, Sparkles, Zap,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface JournalEntry {
  chapterId: number;
  chapterNumber: number;
  chapterTitle: string;
  sceneNumber: number;
  sceneTitle: string;
  sceneExcerpt: string;
  historicalLayer: "verified" | "narrative_interpretation" | "historical_context";
  choiceText: string;
  decidedAt: string;
  statChanges: Record<string, number>;
}

const LAYER_STYLES: Record<string, string> = {
  verified: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  historical_context: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  narrative_interpretation: "bg-amber-400/10 text-amber-400 border-amber-400/20",
};

const LAYER_LABELS: Record<string, string> = {
  verified: "Verified History",
  historical_context: "Historical Context",
  narrative_interpretation: "Narrative Interpretation",
};

const STAT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  knowledge: { label: "Knowledge", color: "text-sky-400", icon: "BK" },
  relationships: { label: "Relationships", color: "text-rose-400", icon: "HR" },
  culturalWisdom: { label: "Cultural Wisdom", color: "text-amber-400", icon: "CW" },
  courage: { label: "Courage", color: "text-orange-400", icon: "CG" },
  reputation: { label: "Reputation", color: "text-teal-400", icon: "RP" },
  legacy: { label: "Legacy", color: "text-purple-400", icon: "LG" },
};

export default function LegacyJournalPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const familyRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const familyData = familyRes.ok ? await familyRes.json() : { families: [] };
        const families = (familyData.families ?? []).filter((f: { status: string }) => f.status === "active");
        const primaryFamilyId = families[0]?.id;
        if (!primaryFamilyId) {
          setError("Join or create a family to start your journal.");
          return;
        }

        const res = await fetch(`/api/legacy/journal/${primaryFamilyId}`, { headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to load journal" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json() as { entries: JournalEntry[] };
        setEntries(data.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load journal");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  // Compute cumulative stats from all entries
  const cumulativeStats = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
      for (const [stat, delta] of Object.entries(entry.statChanges ?? {})) {
        totals[stat] = (totals[stat] ?? 0) + delta;
      }
    }
    return totals;
  }, [entries]);

  // Group entries by chapter
  const chapterGroups = useMemo(() => {
    const groups: Array<{ chapterId: number; chapterNumber: number; chapterTitle: string; entries: JournalEntry[] }> = [];
    for (const entry of entries) {
      let group = groups.find((g) => g.chapterId === entry.chapterId);
      if (!group) {
        group = { chapterId: entry.chapterId, chapterNumber: entry.chapterNumber, chapterTitle: entry.chapterTitle, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  }, [entries]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchQ.trim()) return chapterGroups;
    const q = searchQ.toLowerCase();
    return chapterGroups
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) =>
          e.chapterTitle.toLowerCase().includes(q) ||
          e.sceneTitle.toLowerCase().includes(q) ||
          e.choiceText.toLowerCase().includes(q) ||
          (e.sceneExcerpt ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [chapterGroups, searchQ]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Sign in to view your journal</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0e1111] text-stone-100 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0e1111]/95 backdrop-blur border-b border-stone-800/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="p-2 -ml-2 rounded-lg hover:bg-stone-800/50 transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-400" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-200 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              Your Journal
            </h1>
            <p className="text-xs text-stone-500">Every moment you've lived, in your own choices</p>
          </div>
          {!loading && entries.length > 0 && (
            <span className="text-xs text-stone-500">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400 mb-3" />
            <p className="text-sm text-stone-500">Gathering your entries...</p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-16">
            <p className="text-sm text-stone-400">{error}</p>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-center py-16">
            <BookOpen className="w-10 h-10 text-stone-700 mx-auto mb-4" />
            <h2 className="text-base font-bold text-stone-300 mb-2">Your journal is empty</h2>
            <p className="text-sm text-stone-500 mb-6 max-w-xs mx-auto">
              Every choice you make while playing a chapter is recorded here — nothing written until you start.
            </p>
            <button
              onClick={() => navigate("/legacy")}
              className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-2.5 text-sm"
            >
              Begin a Journey
            </button>
          </div>
        )}

        {/* Stats Summary + Search */}
        {!loading && !error && entries.length > 0 && (
          <>
            {/* Cumulative Stats */}
            {Object.keys(cumulativeStats).length > 0 && (
              <div className="mb-5 bg-gradient-to-br from-[#1a1400] to-[#0e1111] border border-amber-900/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h2 className="text-xs font-bold text-amber-200 uppercase tracking-wider">Your Journey So Far</h2>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(cumulativeStats)
                    .filter(([, val]) => val !== 0)
                    .map(([stat, total]) => {
                      const config = STAT_CONFIG[stat];
                      if (!config) return null;
                      return (
                        <div key={stat} className="text-center">
                          <p className={`text-lg font-bold ${config.color}`}>{total > 0 ? "+" : ""}{total}</p>
                          <p className="text-[10px] text-stone-500 uppercase tracking-wide">{config.label}</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search your journal..."
                className="w-full bg-stone-900/60 border border-stone-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-amber-700/50 transition-colors"
              />
              {searchQ && (
                <button
                  onClick={() => setSearchQ("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {filteredGroups.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-stone-500">No entries match "{searchQ}"</p>
              </div>
            )}

            {filteredGroups.map((group) => (
              <div key={group.chapterId} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                    Chapter {group.chapterNumber}
                  </span>
                  <span className="text-xs text-stone-500 truncate">{group.chapterTitle}</span>
                </div>

                <div className="space-y-3 border-l-2 border-stone-800 pl-4 ml-1.5">
                  {group.entries.map((entry) => (
                    <div key={`${entry.chapterId}-${entry.sceneNumber}`} className="relative">
                      <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500" />

                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${LAYER_STYLES[entry.historicalLayer] ?? LAYER_STYLES.narrative_interpretation}`}>
                          {LAYER_LABELS[entry.historicalLayer] ?? "Narrative Interpretation"}
                        </span>
                        <span className="text-[10px] text-stone-600">
                          {new Date(entry.decidedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-stone-200 mb-1">{entry.sceneTitle}</h3>
                      {entry.sceneExcerpt && (
                        <p className="text-xs text-stone-400 leading-relaxed mb-1.5 line-clamp-3">
                          {entry.sceneExcerpt}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 text-xs text-amber-300/90 bg-amber-400/5 border border-amber-400/10 rounded-lg px-2.5 py-1.5 w-fit">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>You chose: {entry.choiceText}</span>
                      </div>

                      {/* Stat Impact Badges */}
                      {entry.statChanges && Object.keys(entry.statChanges).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(entry.statChanges)
                            .filter(([, delta]) => delta !== 0)
                            .map(([stat, delta]) => {
                              const config = STAT_CONFIG[stat];
                              if (!config) return null;
                              return (
                                <span
                                  key={stat}
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800/60 border border-stone-700/50 ${config.color}`}
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  {config.label} {delta > 0 ? "+" : ""}{delta}
                                </span>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => navigate(`/legacy/chapter/${group.chapterId}`)}
                  className="mt-3 ml-1.5 text-xs text-stone-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
                >
                  Revisit this chapter <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
