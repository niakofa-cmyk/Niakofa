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

// Emotional depth classification — drives badge color and atmospheric tone
const MISSION_DEPTH: Record<string, { label: string; color: string; dot: string }> = {
  record_interview:    { label: "Deep",       color: "text-rose-400",    dot: "bg-rose-500" },
  add_ancestor:        { label: "Deep",       color: "text-rose-400",    dot: "bg-rose-500" },
  reconnect_relative:  { label: "Deep",       color: "text-rose-400",    dot: "bg-rose-500" },
  identify_photo:      { label: "Reflective", color: "text-amber-400",   dot: "bg-amber-500" },
  add_event:           { label: "Reflective", color: "text-amber-400",   dot: "bg-amber-500" },
  upload_document:     { label: "Reflective", color: "text-amber-400",   dot: "bg-amber-500" },
  tag_location:        { label: "Light",      color: "text-teal-400",    dot: "bg-teal-500" },
  complete_chapter:    { label: "Light",      color: "text-teal-400",    dot: "bg-teal-500" },
  preserve_tradition:  { label: "Light",      color: "text-teal-400",    dot: "bg-teal-500" },
};

// Where a mission leads the player — maps type → URL path in the app
const MISSION_ACTION_PATHS: Record<string, string> = {
  record_interview:   "/legacy/interview-quest",
  identify_photo:     "/diaspora/family",
  add_ancestor:       "/diaspora/family",
  tag_location:       "/legacy/map",
  add_event:          "/diaspora/family",
  upload_document:    "/diaspora/family",
  reconnect_relative: "/diaspora/family",
  complete_chapter:   "/legacy/play",
  preserve_tradition: "/legacy/interview-quest",
};

// Border accent color per mission type for card differentiation
const MISSION_BORDER: Record<string, string> = {
  record_interview:   "border-l-rose-600",
  add_ancestor:       "border-l-rose-600",
  reconnect_relative: "border-l-rose-600",
  identify_photo:     "border-l-amber-600",
  add_event:          "border-l-amber-600",
  upload_document:    "border-l-amber-600",
  tag_location:       "border-l-teal-600",
  complete_chapter:   "border-l-teal-600",
  preserve_tradition: "border-l-teal-600",
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

        // Auto-generate missions if none exist for today
        if ((data.todayMissions ?? []).length === 0) {
          try {
            const genRes = await fetch(`/api/legacy/ai-director/${famId}/generate`, {
              method: "POST",
              headers: authHeaders(),
            });
            if (genRes.ok) {
              const genData = await genRes.json();
              if (genData.missions?.length > 0) {
                setMissions(genData.missions);
              }
            }
          } catch {
            // Non-fatal — user can manually generate later
          }
        }

        // Fetch today's journey and vault gaps in parallel
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
      } catch {
        setError("Failed to load missions.");
      } finally {
        setLoading(false);
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
          {/* Today's Journey — cinematic ancestor focus card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-950/60 via-[#2A1A0F] to-stone-950 border border-amber-700/40 rounded-2xl p-5 shadow-xl">
            {/* Decorative glow dot */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="flex items-center gap-2 mb-3">
              <Compass className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Today's Journey</h3>
            </div>
            {/* Ancestor name as bold headline */}
            <p className="text-base font-black text-amber-100 leading-tight mb-1">
              {todayJourney.journey.ancestor.name}
            </p>
            {todayJourney.journey.ancestor.role && (
              <p className="text-[10px] text-amber-600 uppercase tracking-wider mb-3">
                {todayJourney.journey.ancestor.role}
                {todayJourney.journey.ancestor.birthYear
                  ? ` · b. ${todayJourney.journey.ancestor.birthYear}`
                  : ""}
              </p>
            )}
            {/* Narration as poetic pull-quote */}
            <div className="border-l-2 border-amber-700/50 pl-3 mb-4">
              <p className="text-sm text-amber-200/90 italic leading-relaxed">
                "{todayJourney.journey.narration}"
              </p>
            </div>
            {/* Vault depth indicators */}
            <div className="flex gap-3 mb-4">
              {[
                { label: "Stories", val: todayJourney.journey.storyCount },
                { label: "Events",  val: todayJourney.journey.eventCount },
                { label: "Places",  val: todayJourney.journey.placeCount },
              ].map(({ label, val }) => (
                <div key={label} className="flex-1 bg-amber-900/20 rounded-lg py-1.5 px-2 text-center">
                  <p className="text-sm font-black text-amber-300">{val}</p>
                  <p className="text-[9px] text-amber-700">{label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate(`/legacy/character/${todayJourney.journey!.ancestor.memberId}`)}
              className="w-full bg-amber-500/15 border border-amber-600/30 text-amber-300 font-bold text-xs uppercase tracking-widest py-2.5 rounded-xl active:opacity-80 flex items-center justify-center gap-2"
            >
              <Footprints className="w-3.5 h-3.5" />
              Walk as {todayJourney.journey.ancestor.name.split(" ")[0]}
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
              const depth = MISSION_DEPTH[mission.mission_type] ?? { label: "Light", color: "text-teal-400", dot: "bg-teal-500" };
              const borderAccent = MISSION_BORDER[mission.mission_type] ?? "border-l-amber-600";
              const actionPath = MISSION_ACTION_PATHS[mission.mission_type] ?? "/legacy";
              return (
                <div
                  key={mission.id}
                  className={`bg-[#2A1A0F] border border-amber-700/30 border-l-4 ${borderAccent} rounded-2xl p-4 shadow-lg`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                          {MISSION_LABELS[mission.mission_type] ?? mission.mission_type}
                        </span>
                        {/* Emotional depth badge */}
                        <span className={`flex items-center gap-1 text-[10px] font-bold ${depth.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${depth.dot}`} />
                          {depth.label}
                        </span>
                        <span className="text-[10px] text-amber-600 bg-amber-900/30 px-1.5 py-0.5 rounded-full ml-auto">
                          +{mission.reward_xp} XP
                        </span>
                      </div>
                      <p className="text-sm font-bold text-amber-200 leading-tight">{mission.title}</p>
                      <p className="text-xs text-amber-600 mt-1 leading-relaxed">{mission.description}</p>
                      {mission.gap_description && mission.gap_description !== mission.description && (
                        <p className="text-[10px] text-amber-700/70 mt-1 italic leading-relaxed border-l-2 border-amber-900/40 pl-2">
                          Gap: {mission.gap_description}
                        </p>
                      )}
                      {mission.reward_description && (
                        <p className="text-xs text-emerald-400/70 mt-2 flex items-center gap-1">
                          <Gift className="w-3 h-3" /> {mission.reward_description}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => navigate(actionPath)}
                          className="flex-1 bg-amber-500/20 border border-amber-600/40 text-amber-300 font-bold text-xs uppercase tracking-wide py-2 rounded-lg active:opacity-80 flex items-center justify-center gap-1"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Start
                        </button>
                        <button
                          onClick={() => completeMission(mission.id)}
                          disabled={completing === mission.id}
                          className="flex-1 bg-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wide py-2 rounded-lg active:opacity-80 disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          {completing === mission.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Done
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
