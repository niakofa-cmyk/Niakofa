/**
 * Legacy AI Game Director — Daily Missions from Vault Gaps
 * Route: /legacy/ai-director
 *
 * The AI Game Director wakes up each day, scans the family's knowledge graph,
 * and generates targeted missions that drive preservation. Instead of generic
 * "do this" prompts, the Director identifies what's actually missing in the
 * vault and creates missions to fill those gaps.
 *
 * This is the "AI Director" from the design docs:
 *   "Every morning the AI asks: What family information is missing?
 *    What chapter is incomplete? What photos are unidentified?
 *    What interviews are unfinished? Generate today's missions."
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Sparkles, Target, Gift, CheckCircle2,
  SkipForward, RefreshCw, AlertCircle, Zap, Mic, Camera,
  MapPin, Users, Calendar, FileText, BookOpen, Heart,
  Compass, Search, ChevronRight,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Mission {
  id: number;
  family_id: number;
  mission_type: string;
  status: string;
  title: string;
  description: string;
  gap_description: string | null;
  target_member_id: number | null;
  target_vault_item: string | null;
  reward_xp: number;
  reward_description: string | null;
  generated_at: string;
  expires_at: string | null;
  completed_at: string | null;
}

interface MissionResponse {
  todayMissions: Mission[];
  recentCompleted: Mission[];
  totalActive: number;
}

interface VaultGap {
  type: string;
  description: string;
  suggestedMission: string;
  missionType: string;
  targetMemberId: number | null;
  rewardXp: number;
  rewardDescription: string;
}

const MISSION_ICONS: Record<string, typeof Mic> = {
  record_interview: Mic,
  identify_photo: Camera,
  add_ancestor: Users,
  tag_location: MapPin,
  add_event: Calendar,
  upload_document: FileText,
  reconnect_relative: Users,
  complete_chapter: BookOpen,
  preserve_tradition: Heart,
};

const MISSION_LABELS: Record<string, string> = {
  record_interview: "Record Interview",
  identify_photo: "Identify Photo",
  add_ancestor: "Add Ancestor",
  tag_location: "Tag Location",
  add_event: "Add Event",
  upload_document: "Upload Document",
  reconnect_relative: "Reconnect Relative",
  complete_chapter: "Complete Chapter",
  preserve_tradition: "Preserve Tradition",
};

export default function LegacyAiDirectorPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<VaultGap[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [todayJourney, setTodayJourney] = useState<{
    journey: {
      ancestor: { memberId: number; name: string; role: string | null; relation: string | null; birthYear: number | null };
      storyCount: number; eventCount: number; placeCount: number;
      narration: string; narrationId: number | null; date: string;
    } | null;
    message?: string;
  } | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to use the AI Director.");
          return;
        }
        setFamilyId(famId);

        const res = await fetch(`/api/legacy/ai-director/${famId}/missions`, { headers: authHeaders() });
        if (!res.ok) {
          setError("Failed to load missions.");
          return;
        }
        const data = (await res.json()) as MissionResponse;
        setMissions(data.todayMissions ?? []);
        setRecentCompleted(data.recentCompleted ?? []);
      } catch {
        setError("Failed to load missions.");
      } finally {
        setLoading(false);
      }

      // Fetch today's journey and vault gaps in parallel
      if (famId) {
        setTodayLoading(true);
        fetch(`/api/legacy/game-master/${famId}/today`, { headers: authHeaders() })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) setTodayJourney(data); })
          .catch(() => {})
          .finally(() => setTodayLoading(false));

        setGapsLoading(true);
        fetch(`/api/legacy/ai-director/${famId}/gaps`, { headers: authHeaders() })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data?.gaps) setGaps(data.gaps); })
          .catch(() => {})
          .finally(() => setGapsLoading(false));
      }
    })();
  }, [currentUser]);

  const generateMissions = useCallback(async () => {
    if (!familyId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/legacy/ai-director/${familyId}/generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate missions");
      }
      const data = await res.json();
      if (data.missions?.length > 0) {
        setMissions(data.missions);
        toast.success(`${data.missions.length} new mission${data.missions.length === 1 ? "" : "s"} generated!`);
      } else {
        toast.info(data.message || "Your vault is looking great — no urgent missions today");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }, [familyId]);

  const completeMission = useCallback(async (missionId: number) => {
    setCompleting(missionId);
    try {
      const res = await fetch(`/api/legacy/ai-director/${missionId}/complete`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to complete mission");
      const data = await res.json();
      setMissions((m) => m.filter((x) => x.id !== missionId));
      setRecentCompleted((c) => [data.mission, ...c].slice(0, 5));
      toast.success(`Mission complete! +${data.mission?.reward_xp ?? 0} XP`);
    } catch {
      toast.error("Failed to complete mission");
    } finally {
      setCompleting(null);
    }
  }, []);

  const skipMission = useCallback(async (missionId: number) => {
    try {
      const res = await fetch(`/api/legacy/ai-director/${missionId}/skip`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to skip mission");
      setMissions((m) => m.filter((x) => x.id !== missionId));
      toast.info("Mission skipped");
    } catch {
      toast.error("Failed to skip mission");
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <p className="text-amber-400 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to Legacy</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A0F08] pb-28">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30 sticky top-0 bg-[#1A0F08] z-10">
        <button onClick={() => navigate("/legacy")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">AI Director</h1>
          <p className="text-[10px] text-amber-700">Today's Missions</p>
        </div>
        <button
          onClick={generateMissions}
          disabled={generating}
          className="flex items-center gap-1 text-amber-500 text-xs font-semibold disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
          Generate
        </button>
      </div>

      {/* Intro */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-gradient-to-br from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-200">AI Game Director</p>
              <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                Every morning the AI scans your family vault and creates missions from what's missing.
                Complete missions to unlock new chapters, achievements, and world content.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Journey */}
      {todayLoading && (
        <div className="px-4 mt-4">
          <div className="bg-gradient-to-br from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            <p className="text-xs text-amber-600">Nia is choosing today's ancestor...</p>
          </div>
        </div>
      )}
      {!todayLoading && todayJourney?.journey && (
        <div className="px-4 mt-4">
          <div className="bg-gradient-to-br from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Compass className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">Today's Journey</h3>
            </div>
            <p className="text-sm text-amber-200 italic leading-relaxed mb-3">{todayJourney.journey.narration}</p>
            <div className="flex gap-3 text-[10px] text-amber-700">
              <span>{todayJourney.journey.storyCount} stories</span>
              <span>{todayJourney.journey.eventCount} events</span>
              <span>{todayJourney.journey.placeCount} places</span>
            </div>
            <button
              onClick={() => navigate(`/legacy/character/${todayJourney.journey!.ancestor.memberId}`)}
              className="mt-3 text-xs text-amber-400 font-semibold flex items-center gap-1 hover:text-amber-300 transition-colors"
            >
              Walk as {todayJourney.journey.ancestor.name} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      {!todayLoading && todayJourney && !todayJourney.journey && todayJourney.message && (
        <div className="px-4 mt-4">
          <div className="bg-[#2A1A0F] border border-amber-900/20 rounded-2xl p-4 text-center">
            <p className="text-xs text-amber-600">{todayJourney.message}</p>
          </div>
        </div>
      )}

      {/* Vault Gaps */}
      {(gapsLoading || gaps.length > 0) && (
        <div className="px-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-3.5 h-3.5 text-amber-700" />
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest">Vault Gaps</h2>
          </div>
          {gapsLoading ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
              <p className="text-xs text-amber-700">Analyzing your vault...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gaps.slice(0, 5).map((gap, i) => (
                <div key={i} className="bg-[#2A1A0F]/70 border border-amber-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{gap.type.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-amber-600 bg-amber-900/30 px-1.5 py-0.5 rounded-full">+{gap.rewardXp} XP</span>
                  </div>
                  <p className="text-xs text-amber-500 leading-relaxed">{gap.description}</p>
                  <p className="text-[10px] text-amber-600 mt-1">Suggested: {gap.suggestedMission}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Today's Missions */}
      <div className="px-4 mt-4">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">
          Today's Missions {missions.length > 0 && `(${missions.length})`}
        </h2>

        {missions.length === 0 ? (
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-6 text-center">
            <Target className="w-8 h-8 text-amber-700 mx-auto mb-2" />
            <p className="text-sm text-amber-500 font-semibold mb-1">No active missions</p>
            <p className="text-xs text-amber-700 mb-4">
              Tap "Generate" to let the AI Director scan your vault and create today's missions.
            </p>
            <button
              onClick={generateMissions}
              disabled={generating}
              className="bg-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wide px-4 py-2 rounded-xl active:opacity-80 disabled:opacity-40 flex items-center gap-1.5 mx-auto"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate Missions
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {missions.map((mission) => {
              const Icon = MISSION_ICONS[mission.mission_type] ?? Target;
              return (
                <div
                  key={mission.id}
                  className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                          {MISSION_LABELS[mission.mission_type] ?? mission.mission_type}
                        </span>
                        <span className="text-[10px] text-amber-600 bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                          +{mission.reward_xp} XP
                        </span>
                      </div>
                      <p className="text-sm font-bold text-amber-200 leading-tight">{mission.title}</p>
                      <p className="text-xs text-amber-600 mt-1 leading-relaxed">{mission.description}</p>
                      {mission.reward_description && (
                        <p className="text-xs text-emerald-400/70 mt-2 flex items-center gap-1">
                          <Gift className="w-3 h-3" /> {mission.reward_description}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => completeMission(mission.id)}
                          disabled={completing === mission.id}
                          className="flex-1 bg-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wide py-2 rounded-lg active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          {completing === mission.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Complete
                        </button>
                        <button
                          onClick={() => skipMission(mission.id)}
                          className="bg-amber-900/30 border border-amber-700/30 text-amber-500 font-bold text-xs px-3 py-2 rounded-lg active:opacity-70 flex items-center gap-1"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Completed */}
      {recentCompleted.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Recently Completed</h2>
          <div className="space-y-2">
            {recentCompleted.map((mission) => (
              <div key={mission.id} className="bg-[#2A1A0F]/50 border border-amber-900/20 rounded-xl p-3 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-300 truncate">{mission.title}</p>
                  <p className="text-[10px] text-amber-700">
                    {mission.completed_at ? new Date(mission.completed_at).toLocaleDateString() : ""}
                  </p>
                </div>
                <span className="text-[10px] text-amber-600">+{mission.reward_xp} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
