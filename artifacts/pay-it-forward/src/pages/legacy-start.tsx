/**
 * Legacy Start — Ancestor Selection & Journey Begin
 * Route: /legacy/start
 *
 * This is the "Start Journey" experience described in the design doc.
 * It shows ancestor candidates with their completeness scores and
 * lets the player choose who to walk in the footsteps of.
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Play, Crown, MapPin, BookOpen, Mic,
  Camera, Users, Star, Loader2, Sparkles,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

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

interface CompletenessResponse {
  familyId: number;
  readinessScore: number;
  chapterUnlockReady: boolean;
  threshold: number;
  dimensions: { key: string; label: string; score: number; max: number; count: number; hint: string }[];
  missingData: string[];
  suggestions: string[];
}

export default function LegacyStartPage() {
  const [, navigate] = useLocation();
  const { legacyState } = useAppContext();
  const [ancestors, setAncestors] = useState<AncestorCandidate[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(false);

  const familyId = legacyState.families[0]?.id;

  const loadData = useCallback(async () => {
    if (!familyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [ancRes, compRes] = await Promise.all([
        fetch(`/api/legacy/ancestors/${familyId}`, { headers: authHeaders() }),
        fetch(`/api/legacy/completeness/${familyId}`, { headers: authHeaders() }),
      ]);

      if (ancRes.ok) {
        const data = await ancRes.json() as { ancestors: AncestorCandidate[] };
        setAncestors(data.ancestors ?? []);
        if (data.ancestors?.length > 0) setSelectedId(data.ancestors[0].memberId);
      }
      if (compRes.ok) {
        setCompleteness(await compRes.json() as CompletenessResponse);
      }
    } catch {
      toast.error("Failed to load ancestor data");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBegin = useCallback(async () => {
    if (!familyId || !selectedId) return;
    setInitializing(true);
    try {
      // Initialize chapters for this family
      const res = await fetch(`/api/legacy/chapters/${familyId}/init`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch({}) as { error?: string; suggestions?: string[] };
        toast.error(err.error ?? "Not enough vault data to begin");
        if (err.suggestions?.length) {
          toast.info(err.suggestions[0], { duration: 6000 });
        }
        setInitializing(false);
        return;
      }

      const data = await res.json() as { worldId: number; chapters: { id: number; status: string }[] };
      const firstChapter = data.chapters.find(c => c.status === "unlocked") ?? data.chapters[0];

      if (firstChapter) {
        // Transition first chapter to in_progress
        await fetch(`/api/legacy/chapters/${firstChapter.id}/status`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        });
        navigate(`/legacy/chapter/${firstChapter.id}`);
      } else {
        navigate("/legacy");
      }
    } catch {
      toast.error("Failed to start journey");
    } finally {
      setInitializing(false);
    }
  }, [familyId, selectedId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1008] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const selected = ancestors.find(a => a.memberId === selectedId);
  const ready = completeness?.chapterUnlockReady ?? false;

  return (
    <div className="min-h-screen bg-[#1A1008] text-amber-100 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Start Journey</h1>
      </div>

      {/* Hero text */}
      <div className="px-6 pt-8 pb-6 text-center">
        <Sparkles className="w-6 h-6 text-amber-500 mx-auto mb-3" />
        <p className="text-lg font-bold text-amber-200 leading-relaxed">
          Tonight, you will walk in the footsteps of someone who came before you.
        </p>
      </div>

      {/* Readiness score */}
      {completeness && (
        <div className="px-4 mb-6">
          <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Journey Readiness</span>
              <span className={`text-sm font-black ${ready ? "text-emerald-400" : "text-amber-500"}`}>
                {completeness.readinessScore}%
              </span>
            </div>
            <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${completeness.readinessScore}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {completeness.dimensions.map(d => (
                <div key={d.key} className="text-center">
                  <p className="text-xs text-amber-700">{d.label}</p>
                  <p className="text-xs font-bold text-amber-400">{d.score}/{d.max}</p>
                </div>
              ))}
            </div>
            {!ready && completeness.suggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-900/30">
                <p className="text-xs text-amber-600 mb-1">To unlock playable chapters:</p>
                {completeness.suggestions.slice(0, 2).map((s, i) => (
                  <p key={i} className="text-xs text-amber-500 leading-relaxed">• {s}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ancestor selection */}
      {ancestors.length === 0 ? (
        <div className="px-6 text-center py-8">
          <Users className="w-10 h-10 text-amber-800 mx-auto mb-3" />
          <p className="text-sm text-amber-600 mb-4">No family members found yet.</p>
          <button
            onClick={() => navigate("/diaspora/tree")}
            className="bg-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wide px-6 py-3 rounded-xl active:opacity-80"
          >
            Add Family Members
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 mb-4">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Choose Your Ancestor</h2>
            <div className="space-y-3">
              {ancestors.map((a) => {
                const isSelected = a.memberId === selectedId;
                return (
                  <button
                    key={a.memberId}
                    onClick={() => setSelectedId(a.memberId)}
                    className={`w-full text-left rounded-2xl p-4 border transition-all ${
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/50 shadow-lg"
                        : "bg-[#2A1A0F] border-amber-900/30 active:opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-amber-500/20" : "bg-amber-900/30"
                      }`}>
                        <Crown className={`w-5 h-5 ${isSelected ? "text-amber-400" : "text-amber-700"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-amber-200">{a.name}</p>
                        {a.relation && <p className="text-xs text-amber-600">{a.relation}</p>}
                        {a.birthYear && (
                          <p className="text-xs text-amber-700 mt-0.5">
                            Born: {a.birthYear}{a.deathYear ? ` — Died: ${a.deathYear}` : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2">
                          {a.storyCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <BookOpen className="w-3 h-3" /> {a.storyCount} stories
                            </span>
                          )}
                          {a.memoryCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Star className="w-3 h-3" /> {a.memoryCount} memories
                            </span>
                          )}
                          {a.interviewCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Mic className="w-3 h-3" /> {a.interviewCount} interviews
                            </span>
                          )}
                          {a.photoCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Camera className="w-3 h-3" /> {a.photoCount} photos
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-amber-700 mt-1 italic">{a.selectionReason}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-amber-700">Score</p>
                        <p className={`text-sm font-black ${isSelected ? "text-amber-400" : "text-amber-600"}`}>
                          {a.completenessScore}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected ancestor preview */}
          {selected && (
            <div className="px-4 mb-6">
              <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-5">
                <div className="text-center mb-4">
                  <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Your Ancestor</p>
                  <p className="text-xl font-black text-amber-200">{selected.name}</p>
                  {selected.birthYear && (
                    <p className="text-xs text-amber-700 mt-1">
                      Born: {selected.birthYear}{selected.deathYear ? ` — Died: ${selected.deathYear}` : ""}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-xs text-amber-700">Stories</p>
                    <p className="text-sm font-bold text-amber-400">{selected.storyCount}</p>
                  </div>
                  <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                    <MapPin className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-xs text-amber-700">Memories</p>
                    <p className="text-sm font-bold text-amber-400">{selected.memoryCount}</p>
                  </div>
                </div>
                <p className="text-xs text-amber-600 text-center italic mb-4">
                  {ready
                    ? "Chapter I is ready. Your journey begins now."
                    : `Readiness at ${completeness?.readinessScore ?? 0}%. Add more vault data to unlock chapters.`}
                </p>
                <button
                  onClick={handleBegin}
                  disabled={!ready || initializing}
                  className={`w-full font-black text-sm uppercase tracking-wide py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                    ready && !initializing
                      ? "bg-amber-500 text-amber-950 active:opacity-80"
                      : "bg-amber-900/30 text-amber-700 cursor-not-allowed"
                  }`}
                >
                  {initializing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating chapters...</>
                  ) : (
                    <><Play className="w-4 h-4" /> Begin Journey</>
                  )}
                </button>
                {!ready && (
                  <button
                    onClick={() => navigate("/diaspora/family")}
                    className="mt-2 w-full text-xs text-amber-500 underline py-2"
                  >
                    Add more family data →
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
