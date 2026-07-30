/**
 * Legacy Timeline — Family memories organized chronologically by decade
 * Route: /diaspora/timeline
 *
 * Shows all dated memories across all the user's Family Spaces,
 * grouped by decade with a visual timeline.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, History, Calendar, MapPin, Loader2,
  ChevronRight, BookHeart, Mic, Image,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface TimelineEvent {
  id: number;
  year: number | null;
  date: string | null;
  title: string;
  description: string | null;
  location: string | null;
  type: string;
  memory_id: number;
  family_id: number;
}

export default function LegacyTimelinePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [families, setFamilies] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    loadFamilies();
  }, [currentUser]);

  useEffect(() => {
    if (selectedFamilyId) loadTimeline(selectedFamilyId);
  }, [selectedFamilyId]);

  async function loadFamilies() {
    try {
      const res = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const fams = data.families ?? [];
      setFamilies(fams.map((f: { id: number; name: string }) => ({ id: f.id, name: f.name })));
      if (fams.length > 0) setSelectedFamilyId(fams[0].id);
      else setLoading(false); // no families → stop spinner
    } catch {
      toast.error("Couldn't load families");
      setLoading(false); // always stop spinner on error
    }
  }

  async function loadTimeline(familyId: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/timeline`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
      toast.error("Couldn't load timeline");
    } finally {
      setLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to view your legacy timeline</p>
      </div>
    );
  }

  const byDecade = events.reduce((acc, e) => {
    const decade = e.year ? `${Math.floor(e.year / 10) * 10}s` : "Unknown";
    if (!acc[decade]) acc[decade] = [];
    acc[decade].push(e);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const sortedDecades = Object.entries(byDecade).sort(([a], [b]) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return parseInt(a) - parseInt(b);
  });

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <History className="w-4 h-4 text-rose-400" />
              Legacy Timeline
            </h1>
            <p className="text-xs text-muted-foreground">Your family story through time</p>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1a0010] via-[#2a0020] to-[#1a0010] border-b border-rose-800/30">
        <div className="max-w-lg mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-rose-100 mb-2">Your Family Story Through Time</h2>
          <p className="text-sm text-rose-300/70 leading-relaxed">
            Every memory is a chapter. See how your family's story unfolds across generations.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-300">{events.length}</p>
              <p className="text-xs text-rose-400/60">Events</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-300">{sortedDecades.length}</p>
              <p className="text-xs text-rose-400/60">Decades</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-rose-300">
                {events.length > 0 ? sortedDecades[0][0] : "—"}
              </p>
              <p className="text-xs text-rose-400/60">Earliest</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Family selector */}
        {families.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {families.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFamilyId(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedFamilyId === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <Calendar className="w-12 h-12 text-rose-400/40 mx-auto" />
            <p className="font-semibold">No dated memories yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Add memories with dates to your Family Vault to build your legacy timeline.
            </p>
            <button
              onClick={() => navigate(selectedFamilyId ? `/family/${selectedFamilyId}` : "/diaspora/family")}
              className="bg-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium active:opacity-80"
            >
              Add Memories
            </button>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="space-y-6">
            {sortedDecades.map(([decade, decEvents]) => (
              <div key={decade}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <h3 className="text-sm font-bold text-rose-400">{decade}</h3>
                  <span className="text-xs text-muted-foreground">{decEvents.length} {decEvents.length === 1 ? "event" : "events"}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2 ml-4 border-l-2 border-rose-500/20 pl-4">
                  {decEvents.map(e => (
                    <button
                      key={e.id}
                      onClick={() => navigate(`/family/${e.family_id}/memory/${e.memory_id}`)}
                      className="w-full text-left bg-card border border-border rounded-xl p-3 active:opacity-70 transition-opacity"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          {e.type === "interview" ? (
                            <Mic className="w-4 h-4 text-rose-400" />
                          ) : (
                            <BookHeart className="w-4 h-4 text-rose-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{e.title}</p>
                          {e.year && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {e.year}
                            </p>
                          )}
                          {e.location && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {e.location}
                            </p>
                          )}
                          {e.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>
                          )}
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
