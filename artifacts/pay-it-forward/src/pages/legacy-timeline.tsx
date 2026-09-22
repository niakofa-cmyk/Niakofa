/**
 * Family history timeline
 * Route: /diaspora/timeline
 *
 * Platform-owned timeline view for dated Family Vault memories. The Vault
 * remains the source of truth for these events.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  BookHeart,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Image,
  Loader2,
  MapPin,
  Mic,
  Plus,
  RefreshCw,
  Sparkles,
  TreePine,
  X,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface FamilySpace {
  id: number;
  name: string;
  status: "active" | "invited";
  memory_count?: number;
}

interface TimelineEvent {
  id: number;
  year: number | null;
  date: string | null;
  title: string;
  description: string | null;
  location: string | null;
  type: string;
  event_type: string | null;
  memory_id: number;
  family_id: number;
}

const EVENT_TYPES = [
  { value: "milestone", label: "Milestone" },
  { value: "migration", label: "Migration" },
  { value: "tradition", label: "Tradition" },
  { value: "place", label: "Place" },
  { value: "interview", label: "Oral history" },
] as const;

function eventIcon(event: TimelineEvent) {
  if (event.event_type === "migration" || event.event_type === "place") {
    return <MapPin className="w-4 h-4" />;
  }
  if (event.event_type === "interview" || event.type === "interview") {
    return <Mic className="w-4 h-4" />;
  }
  if (event.type === "document") {
    return <FileText className="w-4 h-4" />;
  }
  if (event.type === "upload") {
    return <Image className="w-4 h-4" />;
  }
  return <BookHeart className="w-4 h-4" />;
}

function eventLabel(event: TimelineEvent) {
  if (event.event_type) {
    return event.event_type.replace(/[_-]/g, " ");
  }
  if (event.type === "interview") return "oral history";
  if (event.type === "import") return "milestone";
  return "family memory";
}

function eventYear(event: TimelineEvent) {
  if (event.year) return String(event.year);
  if (event.date) {
    const year = new Date(event.date).getUTCFullYear();
    return Number.isFinite(year) ? String(year) : "Undated";
  }
  return "Undated";
}

function sortEvents(events: TimelineEvent[]) {
  return [...events].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || a.id - b.id;
  });
}

export default function LegacyTimelinePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [families, setFamilies] = useState<FamilySpace[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventYearValue, setEventYearValue] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]["value"]>("milestone");

  async function loadFamilies() {
    setFamiliesLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!response.ok) throw new Error("Couldn't load your Family Spaces");
      const data = await response.json() as { families?: FamilySpace[] };
      const activeFamilies = (data.families ?? []).filter(family => family.status === "active");
      setFamilies(activeFamilies);
      setSelectedFamilyId(currentId => {
        if (currentId && activeFamilies.some(family => family.id === currentId)) return currentId;
        return activeFamilies[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't load your Family Spaces");
    } finally {
      setFamiliesLoading(false);
    }
  }

  async function loadTimeline(familyId: number) {
    setTimelineLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/family/${familyId}/timeline`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Couldn't load this family's timeline");
      const data = await response.json() as { events?: TimelineEvent[] };
      setEvents(sortEvents(data.events ?? []));
    } catch (err: unknown) {
      setEvents([]);
      setError(err instanceof Error ? err.message : "Couldn't load this family's timeline");
    } finally {
      setTimelineLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    void loadFamilies();
  }, [currentUser]);

  useEffect(() => {
    if (selectedFamilyId) void loadTimeline(selectedFamilyId);
  }, [selectedFamilyId]);

  const selectedFamily = families.find(family => family.id === selectedFamilyId) ?? null;
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const year = eventYear(event);
      const group = groups.get(year) ?? [];
      group.push(event);
      groups.set(year, group);
    }
    return [...groups.entries()];
  }, [events]);

  function resetEventForm() {
    setEventTitle("");
    setEventYearValue("");
    setEventDescription("");
    setEventLocation("");
    setEventType("milestone");
  }

  async function handleAddEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFamilyId || !eventTitle.trim() || !eventYearValue) return;

    setSavingEvent(true);
    try {
      const response = await fetch(`/api/family/${selectedFamilyId}/timeline`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventTitle.trim(),
          year: Number(eventYearValue),
          description: eventDescription.trim() || undefined,
          location: eventLocation.trim() || undefined,
          event_type: eventType,
        }),
      });
      const data = await response.json() as { event?: TimelineEvent; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error ?? "Couldn't add milestone");
      setEvents(currentEvents => sortEvents([...currentEvents, data.event!]));
      setShowAddEvent(false);
      resetEventForm();
      toast.success("Milestone added to your legacy timeline");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't add milestone");
    } finally {
      setSavingEvent(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">Sign in to view your Legacy Timeline.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/diaspora")}
            aria-label="Back to Diaspora Dashboard"
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Diaspora · Family history</p>
            <h1 className="text-xl font-bold text-foreground">Family Timeline</h1>
          </div>
          {selectedFamilyId && (
            <button
              type="button"
              onClick={() => setShowAddEvent(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add milestone</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6">
        <section className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/15 via-rose-500/5 to-transparent p-5 sm:p-7 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <TreePine className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">Where your story lives</p>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Follow the moments that shaped your family.</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                Your dated memories, oral histories, and milestones become a living record for the generations that follow.
              </p>
            </div>
          </div>
        </section>

        {familiesLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading your Family Spaces…</span>
          </div>
        ) : families.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <BookHeart className="w-10 h-10 mx-auto text-primary/60 mb-3" />
            <h2 className="font-bold text-foreground mb-1">Start with a Family Space</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Create a private home for your family’s stories, then return here to build its timeline.
            </p>
            <button
              type="button"
              onClick={() => navigate("/diaspora/family")}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold"
            >
              Open Family Spaces <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {families.length > 1 && (
              <label className="block mb-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Family Space</span>
                <span className="relative block">
                  <select
                    value={selectedFamilyId ?? ""}
                    onChange={event => setSelectedFamilyId(Number(event.target.value))}
                    className="w-full appearance-none rounded-xl border border-input bg-card px-3 py-3 pr-10 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {families.map(family => (
                      <option key={family.id} value={family.id}>{family.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                </span>
              </label>
            )}

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-foreground">{selectedFamily?.name ?? "Your Family"}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {events.length} {events.length === 1 ? "moment" : "moments"} preserved
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectedFamilyId && void loadTimeline(selectedFamilyId)}
                disabled={timelineLoading}
                className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label="Refresh timeline"
              >
                <RefreshCw className={`w-4 h-4 ${timelineLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-center mb-5">
                <p className="text-sm text-destructive mb-3">{error}</p>
                <button
                  type="button"
                  onClick={() => selectedFamilyId && void loadTimeline(selectedFamilyId)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold"
                >
                  Try again
                </button>
              </div>
            ) : timelineLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : groupedEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
                <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <h2 className="font-bold text-foreground mb-1">Your timeline is waiting</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  Add a dated memory in the Vault or record the first milestone that your family wants to remember.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Add first milestone
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedFamilyId && navigate(`/family/${selectedFamilyId}`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
                  >
                    Open Family Vault <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[19px] top-3 bottom-5 w-px bg-border" aria-hidden="true" />
                <div className="space-y-7">
                  {groupedEvents.map(([year, yearEvents]) => (
                    <section key={year} className="relative">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center relative z-10 shadow-sm">
                          <span className="text-xs font-black">{year === "Undated" ? "—" : year}</span>
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500">{year}</h3>
                      </div>
                      <div className="ml-12 space-y-2">
                        {yearEvents.map(event => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => navigate(`/family/${event.family_id}/memory/${event.memory_id}`)}
                            className="w-full text-left rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                {eventIcon(event)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h4 className="font-semibold text-sm text-foreground">{event.title}</h4>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                                    {eventLabel(event)}
                                  </span>
                                </div>
                                {event.description && (
                                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{event.description}</p>
                                )}
                                {event.location && (
                                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                                    <MapPin className="w-3 h-3" /> {event.location}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 mt-8">
          <Clock3 className="w-3.5 h-3.5" />
          A living timeline grows every time your family preserves a story.
        </p>
      </main>

      {showAddEvent && selectedFamilyId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <p className="text-xs text-amber-500 font-semibold uppercase tracking-wider">Add to {selectedFamily?.name}</p>
                <h2 className="text-lg font-bold text-foreground">Add a milestone</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddEvent(false)}
                aria-label="Close add milestone"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddEvent} className="p-5 space-y-4">
              <div>
                <label htmlFor="timeline-title" className="block text-sm font-medium mb-1.5">Title *</label>
                <input
                  id="timeline-title"
                  value={eventTitle}
                  onChange={event => setEventTitle(event.target.value)}
                  placeholder="e.g. Grandma moved to Fort Worth"
                  maxLength={200}
                  required
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="timeline-year" className="block text-sm font-medium mb-1.5">Year *</label>
                  <input
                    id="timeline-year"
                    type="number"
                    value={eventYearValue}
                    onChange={event => setEventYearValue(event.target.value)}
                    min={1600}
                    max={new Date().getFullYear()}
                    placeholder="1957"
                    required
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div>
                  <label htmlFor="timeline-type" className="block text-sm font-medium mb-1.5">Type</label>
                  <select
                    id="timeline-type"
                    value={eventType}
                    onChange={event => setEventType(event.target.value as typeof eventType)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    style={{ fontSize: "16px" }}
                  >
                    {EVENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="timeline-description" className="block text-sm font-medium mb-1.5">What happened?</label>
                <textarea
                  id="timeline-description"
                  value={eventDescription}
                  onChange={event => setEventDescription(event.target.value)}
                  placeholder="Add the details your family will want to remember…"
                  maxLength={2000}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div>
                <label htmlFor="timeline-location" className="block text-sm font-medium mb-1.5">Place <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  id="timeline-location"
                  value={eventLocation}
                  onChange={event => setEventLocation(event.target.value)}
                  placeholder="e.g. Cape Coast, Ghana"
                  maxLength={200}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddEvent(false)}
                  className="flex-1 rounded-xl border border-input py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent || !eventTitle.trim() || !eventYearValue}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {savingEvent ? "Saving…" : "Save milestone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}