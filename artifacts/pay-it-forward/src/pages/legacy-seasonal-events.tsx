/**
 * Legacy Seasonal Events — Shared Family Missions & Reunion Events.
 *
 * Phase 5 of the Living Family Universe. Families create seasonal events
 * tied to anniversaries, reunions, cultural holidays, birthdays, and
 * migration anniversaries. Everyone contributes together; when the goal
 * is met, a reward unlocks.
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Users, Calendar, Plus, CheckCircle2,
  Gift, Sparkles, X, Trophy, Heart, Cake, Globe2, MapPin,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface Participation {
  id: number;
  event_id: number;
  member_id: number | null;
  user_id: number | null;
  contribution_type: string;
  contribution_note: string | null;
  created_at: string;
}

interface SeasonalEvent {
  id: number;
  family_id: number;
  event_type: string;
  title: string;
  description: string | null;
  trigger_type: string;
  trigger_date: string | null;
  target_member_id: number | null;
  goal: number;
  reward_title: string | null;
  reward_description: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  participations: Participation[];
  progress: number;
  isComplete: boolean;
}

interface Template {
  event_type: string;
  title: string;
  description: string;
  goal: number;
  reward_title: string;
  reward_description: string;
}

const TYPE_ICONS: Record<string, typeof Users> = {
  reunion: Users,
  cultural_holiday: Globe2,
  birthday: Cake,
  migration_anniversary: MapPin,
  anniversary: Heart,
  custom: Sparkles,
};

const CONTRIBUTION_LABELS: Record<string, string> = {
  interview: "Interview Recorded",
  photo: "Photo Uploaded",
  story: "Story Shared",
  location: "Location Tagged",
  document: "Document Added",
  checkin: "Place Visited",
  recipe: "Recipe Preserved",
  tradition: "Tradition Documented",
};

export default function LegacySeasonalEventsPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [events, setEvents] = useState<SeasonalEvent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [participating, setParticipating] = useState<number | null>(null);
  const [contribTypes, setContribTypes] = useState<Record<string, string>>({});
  const [autoGenerating, setAutoGenerating] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to see seasonal events.");
          return;
        }
        setFamilyId(famId);

        const res = await fetch(`/api/legacy/seasonal-events/${famId}`, { headers: authHeaders() });
        if (!res.ok) {
          setError("Failed to load seasonal events.");
          return;
        }
        const body = await res.json();
        setEvents(body.events || []);
        setTemplates(body.templates || []);

        // Auto-generate events from family calendar if none exist
        if ((body.events || []).length === 0) {
          try {
            const autoRes = await fetch(`/api/legacy/seasonal-events/${famId}/auto-generate`, {
              method: "POST",
              headers: authHeaders(),
            });
            if (autoRes.ok) {
              const autoBody = await autoRes.json();
              if (autoBody.created?.length > 0) {
                setEvents(autoBody.created);
              }
            }
          } catch {
            // Non-fatal — user can manually generate later
          }
        }
      } catch {
        setError("Failed to load seasonal events.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const createEvent = useCallback(async (templateIndex: number) => {
    if (!familyId) return;
    try {
      const res = await fetch(`/api/legacy/seasonal-events/${familyId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ templateIndex }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create event");
      }
      const body = await res.json();
      setEvents((prev) => [body.event, ...prev]);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    }
  }, [familyId]);

  const participate = useCallback(async (eventId: number) => {
    setParticipating(eventId);
    try {
      const res = await fetch(`/api/legacy/seasonal-events/${eventId}/participate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ contributionType: contribTypes[eventId] || "story" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to participate");
      }
      const body = await res.json();
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                participations: [...e.participations, body.participation],
                progress: (e.progress ?? 0) + 1,
                status: body.event?.status ?? e.status,
                isComplete: body.event?.status === "completed",
                completed_at: body.event?.completed_at ?? e.completed_at,
              }
            : e,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to participate");
    } finally {
      setParticipating(null);
    }
  }, [contribTypes]);

  const deleteEvent = useCallback(async (eventId: number) => {
    try {
      const res = await fetch(`/api/legacy/seasonal-events/${eventId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete event");
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    }
  }, []);

  const autoGenerate = useCallback(async () => {
    if (!familyId) return;
    setAutoGenerating(true);
    try {
      const res = await fetch(`/api/legacy/seasonal-events/${familyId}/auto-generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to generate events");
      const data = await res.json();
      if (data.totalCreated > 0) {
        toast.success(`${data.totalCreated} new event${data.totalCreated === 1 ? "" : "s"} created from your family calendar!`);
        // Reload events
        const eventsRes = await fetch(`/api/legacy/seasonal-events/${familyId}`, { headers: authHeaders() });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setEvents(eventsData.events ?? []);
        }
      } else {
        toast.info("Your family calendar events are already up to date.");
      }
    } catch {
      toast.error("Failed to generate calendar events");
    } finally {
      setAutoGenerating(false);
    }
  }, [familyId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-stone-900/95 backdrop-blur-md border-b border-stone-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/legacy")}
            className="p-2 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-amber-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-amber-100">Seasonal Events</h1>
            <p className="text-xs text-stone-400">Shared family missions & celebrations</p>
          </div>
          <button
            onClick={autoGenerate}
            disabled={autoGenerating}
            title="Auto-generate events from your family calendar"
            className="p-2 rounded-lg bg-stone-700 hover:bg-stone-600 transition-colors disabled:opacity-50"
          >
            {autoGenerating ? (
              <Loader2 className="w-5 h-5 text-amber-300 animate-spin" />
            ) : (
              <Calendar className="w-5 h-5 text-amber-300" />
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 transition-colors"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 mt-4">
          <div className="bg-red-900/40 border border-red-800 rounded-xl p-4 text-sm text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {events.length === 0 && !error && (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-stone-600 mx-auto mb-4" />
            <p className="text-stone-400 text-sm">No seasonal events yet.</p>
            <p className="text-stone-500 text-xs mt-1">Create one to start a shared family mission.</p>
          </div>
        )}

        {events.map((event) => {
          const Icon = TYPE_ICONS[event.event_type] ?? Sparkles;
          const progressPct = Math.min((event.progress / event.goal) * 100, 100);
          return (
            <div
              key={event.id}
              className={`rounded-2xl border p-5 transition-all ${
                event.isComplete
                  ? "bg-emerald-900/30 border-emerald-700"
                  : "bg-stone-800/60 border-stone-700"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`p-2.5 rounded-xl ${event.isComplete ? "bg-emerald-800" : "bg-amber-900/40"}`}>
                  <Icon className={`w-5 h-5 ${event.isComplete ? "text-emerald-300" : "text-amber-300"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-stone-100">{event.title}</h3>
                  {event.description && (
                    <p className="text-sm text-stone-400 mt-1">{event.description}</p>
                  )}
                </div>
                {event.isComplete && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                )}
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-stone-400">
                    {event.progress} / {event.goal} contributions
                  </span>
                  <span className="text-stone-500">{Math.round(progressPct)}%</span>
                </div>
                <div className="h-2 bg-stone-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      event.isComplete ? "bg-emerald-500" : "bg-amber-500"
                    }`
                  }
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Reward */}
              {event.reward_title && (
                <div className={`rounded-xl p-3 mb-4 ${event.isComplete ? "bg-emerald-900/30" : "bg-stone-900/50"}`}>
                  <div className="flex items-center gap-2">
                    <Gift className={`w-4 h-4 ${event.isComplete ? "text-emerald-400" : "text-amber-400"}`} />
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-400">Reward</span>
                  </div>
                  <p className="text-sm font-semibold text-stone-200 mt-1">{event.reward_title}</p>
                  {event.reward_description && (
                    <p className="text-xs text-stone-400 mt-0.5">{event.reward_description}</p>
                  )}
                </div>
              )}

              {/* Participations */}
              {event.participations.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {event.participations.slice(-3).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-stone-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>{CONTRIBUTION_LABELS[p.contribution_type] ?? p.contribution_type}</span>
                      <span className="text-stone-600">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {!event.isComplete && (
                <div className="flex items-center gap-2">
                  <select
                    value={contribTypes[event.id] || "story"}
                    onChange={(ev2) => setContribTypes(prev => ({ ...prev, [event.id]: ev2.target.value }))}
                    className="flex-1 bg-stone-700 text-stone-200 text-sm rounded-lg px-3 py-2 border border-stone-600"
                  >
                    {Object.entries(CONTRIBUTION_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => participate(event.id)}
                    disabled={participating === event.id}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {participating === event.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Contribute"
                    )}
                  </button>
                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="p-2 rounded-lg text-stone-500 hover:text-red-400 hover:bg-stone-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div
            className="bg-stone-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-amber-100">Create Seasonal Event</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-stone-700">
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            <div className="space-y-3">
              {templates.map((tpl, i) => {
                const Icon = TYPE_ICONS[tpl.event_type] ?? Sparkles;
                return (
                  <button
                    key={i}
                    onClick={() => createEvent(i)}
                    className="w-full text-left p-4 rounded-xl bg-stone-700/60 hover:bg-stone-700 border border-stone-600 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-900/40">
                        <Icon className="w-4 h-4 text-amber-300" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-stone-100 text-sm">{tpl.title}</p>
                        <p className="text-xs text-stone-400 mt-1">{tpl.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-amber-400">Goal: {tpl.goal}</span>
                          <span className="text-xs text-stone-500">Reward: {tpl.reward_title}</span>
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
