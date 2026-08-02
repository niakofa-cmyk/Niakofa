/**
 * Legacy Family Challenges — Collaborative Quests & Reunion Events.
 *
 * This page replaces the simulated "Reunion mode" on the legacy home page
 * with real server-backed collaborative quests. Family members can:
 *   - See active challenges with real progress
 *   - Create new challenges from templates
 *   - Contribute to challenges (interviews, photos, stories, locations, etc.)
 *   - See completed challenges and unlocked rewards
 *
 * The auto-complete trigger in the DB marks challenges as "completed" when
 * the contribution count reaches the goal.
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Users, Trophy, Plus, CheckCircle2, Gift, Sparkles, X } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface Contribution {
  id: number;
  challenge_id: number;
  member_id: number | null;
  contribution_type: string;
  vault_item_ref: string | null;
  contribution_note: string | null;
  created_at: string;
}

interface Challenge {
  id: number;
  family_id: number;
  challenge_type: string;
  title: string;
  description: string;
  goal: number;
  reward_title: string | null;
  reward_description: string | null;
  status: string;
  deadline: string | null;
  completed_at: string | null;
  created_at: string;
  contributions: Contribution[];
  progress: number;
  isComplete: boolean;
}

interface Template {
  challenge_type: string;
  title: string;
  description: string;
  goal: number;
  reward_title: string;
  reward_description: string;
}

const TYPE_ICONS: Record<string, typeof Users> = {
  story_collection: Users,
  preservation: Trophy,
  exploration: Sparkles,
  reunion: Gift,
};

const CONTRIBUTION_LABELS: Record<string, string> = {
  interview: "Interview Recorded",
  photo: "Photo Uploaded",
  story: "Story Added",
  location: "Location Tagged",
  document: "Document Preserved",
  checkin: "Place Visited",
};

export default function LegacyChallengesPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [contributing, setContributing] = useState<string | null>(null);
  const [contribTypes, setContribTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to see challenges.");
          return;
        }
        setFamilyId(famId);

        const res = await fetch(`/api/legacy/challenges/${famId}`, { headers: authHeaders() });
        if (!res.ok) {
          setError("Failed to load challenges.");
          return;
        }
        const body = await res.json();
        setChallenges(body.challenges || []);
        setTemplates(body.templates || []);
      } catch {
        setError("Failed to load challenges.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const createChallenge = useCallback(async (templateIndex: number) => {
    if (!familyId) return;
    try {
      const res = await fetch(`/api/legacy/challenges/${familyId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ templateIndex }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create challenge");
      }
      const body = await res.json();
      setChallenges((c) => [body.challenge, ...c]);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
    }
  }, [familyId]);

  const contribute = useCallback(async (challengeId: number) => {
    setContributing(challengeId);
    try {
      const res = await fetch(`/api/legacy/challenges/${challengeId}/contribute`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ contributionType: contribTypes[challengeId] || "story" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to contribute");
      }
      const body = await res.json();
      setChallenges((cs) =>
        cs.map((c) => {
          if (c.id === challengeId) {
            const newContribs = [...c.contributions, body.contribution];
            const newProgress = newContribs.length;
            return {
              ...c,
              contributions: newContribs,
              progress: newProgress,
              isComplete: newProgress >= c.goal,
              status: body.challenge?.status || c.status,
              completed_at: body.challenge?.completed_at || c.completed_at,
            };
          }
          return c;
        }),
      );
      setContributing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to contribute");
      setContributing(null);
    }
  }, [contribTypes]);

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
        <p className="text-amber-400 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to Legacy</button>
      </div>
    );
  }

  const activeChallenges = challenges.filter((c) => c.status === "active");
  const completedChallenges = challenges.filter((c) => c.status === "completed");

  return (
    <div className="min-h-screen bg-[#1A0F08] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30">
        <button onClick={() => navigate("/legacy")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family Challenges</h1>
          <p className="text-xs text-amber-700">Work together to preserve your legacy</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-amber-500 text-xs font-bold bg-amber-900/30 rounded-md px-2 py-1 active:bg-amber-900/50"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeChallenges.length === 0 && completedChallenges.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Users className="w-12 h-12 text-amber-800/50" />
            <p className="text-amber-600 text-sm text-center max-w-xs">
              No family challenges yet. Create one to start working together with your family.
            </p>
          </div>
        )}

        {activeChallenges.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-amber-500 uppercase tracking-wider mb-3">Active Challenges</h2>
            <div className="space-y-3">
              {activeChallenges.map((ch) => {
                const Icon = TYPE_ICONS[ch.challenge_type] ?? Users;
                const pct = Math.min(100, Math.round((ch.progress / ch.goal) * 100));
                return (
                  <div key={ch.id} className="bg-[#2A1A0F] border border-amber-900/40 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-amber-200 text-sm">{ch.title}</h3>
                        <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{ch.description}</p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-amber-600 font-semibold">{ch.progress} / {ch.goal}</span>
                        <span className="text-xs text-amber-800">{pct}%</span>
                      </div>
                      <div className="h-2 bg-amber-950 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {ch.contributions.length > 0 && (
                      <div className="mb-3 space-y-1">
                        {ch.contributions.slice(0, 3).map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-[11px] text-amber-700">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{CONTRIBUTION_LABELS[c.contribution_type] || c.contribution_type}</span>
                            <span className="text-amber-900">· {new Date(c.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                        {ch.contributions.length > 3 && (
                          <p className="text-[10px] text-amber-800 pl-5">+{ch.contributions.length - 3} more</p>
                        )}
                      </div>
                    )}

                    {ch.reward_title && (
                      <div className="mb-3 flex items-center gap-2 bg-amber-950/50 rounded-lg px-3 py-2">
                        <Gift className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="text-[11px] font-bold text-amber-500">Reward: {ch.reward_title}</p>
                          {ch.reward_description && (
                            <p className="text-[10px] text-amber-700 line-clamp-1">{ch.reward_description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <select
                        value={contribTypes[ch.id] || "story"}
                        onChange={(e) => setContribTypes(prev => ({ ...prev, [ch.id]: e.target.value }))}
                        className="bg-amber-950 text-amber-300 text-xs rounded-md px-2 py-1.5 border border-amber-900/50 flex-1"
                      >
                        <option value="interview">Record Interview</option>
                        <option value="photo">Upload Photo</option>
                        <option value="story">Add Story</option>
                        <option value="location">Tag Location</option>
                        <option value="document">Preserve Document</option>
                        <option value="checkin">GPS Check-in</option>
                      </select>
                      <button
                        onClick={() => contribute(ch.id)}
                        disabled={contributing === ch.id}
                        className="flex items-center gap-1 bg-amber-600 text-white text-xs font-bold rounded-md px-3 py-1.5 active:bg-amber-700 disabled:opacity-60 whitespace-nowrap"
                      >
                        {contributing === ch.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Contribute
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {completedChallenges.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-emerald-500 uppercase tracking-wider mb-3">Completed</h2>
            <div className="space-y-2">
              {completedChallenges.map((ch) => (
                <div key={ch.id} className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-emerald-300 text-sm">{ch.title}</h3>
                    {ch.reward_title && (
                      <p className="text-[11px] text-emerald-600 mt-0.5">Unlocked: {ch.reward_title}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-emerald-800">
                    {ch.completed_at ? new Date(ch.completed_at).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[#2A1A0F] border border-amber-900/50 rounded-2xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-amber-200 uppercase tracking-wide">New Challenge</h2>
              <button onClick={() => setShowCreate(false)} className="text-amber-700 hover:text-amber-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {templates.map((tpl, i) => {
                const Icon = TYPE_ICONS[tpl.challenge_type] ?? Users;
                return (
                  <button
                    key={i}
                    onClick={() => createChallenge(i)}
                    className="w-full text-left bg-amber-950/50 border border-amber-900/40 rounded-xl p-3 hover:border-amber-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-900/50 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-amber-200 text-sm">{tpl.title}</h3>
                        <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{tpl.description}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-amber-600 font-semibold">Goal: {tpl.goal}</span>
                          {tpl.reward_title && (
                            <span className="text-[10px] text-amber-500">Reward: {tpl.reward_title}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
