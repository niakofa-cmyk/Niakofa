import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Radio, Users, Mic, Video, ArrowLeft, Search, WifiOff } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCachedList } from "@/hooks/useCachedList";

interface LiveSessionSummary {
  id: number;
  title: string;
  host_id: number;
  host_name: string;
  video_enabled: boolean;
  is_recording: boolean;
  started_at: string;
  speaker_count: number;
  listener_count: number;
}

interface CircleSummary {
  id: number;
  city_key: string;
  city_display: string;
  neighborhood_id: number | null;
  name: string;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  live_session: LiveSessionSummary | null;
}

const SESSION_KEY = "niakofa_circles_city";

export default function AudioCirclesScreen() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();

  // Restore last-browsed city from sessionStorage so leaving a room or
  // refreshing the page keeps you looking at the same city's circles instead
  // of silently snapping back to your profile default (which may have zero
  // circles if you'd searched into a different city).
  const [city, setCity] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || currentUser?.city?.trim() || "Fort Worth";
    } catch {
      return currentUser?.city?.trim() || "Fort Worth";
    }
  });
  const [cityInput, setCityInput] = useState(city);
  const [startingId, setStartingId] = useState<number | null>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  // Persist city to sessionStorage whenever it changes so navigating away and
  // back (including a room exit that unmounts this screen) restores the right
  // city instead of defaulting to the profile city every time.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, city); } catch { /* storage blocked */ }
  }, [city]);

  // useCachedList replaces the manual useState/useEffect/fetch pattern.
  //
  // Key improvements over the old approach:
  // 1. Synchronous hydration from sessionStorage on mount — no blank/loading
  //    frame when the user navigates back to this screen.
  // 2. On any network/server failure the last-known-good list is left on
  //    screen untouched — a failed poll is never evidence the data is gone.
  // 3. City-switch safety: the cache key includes the city name so switching
  //    cities re-hydrates from the correct cache slot instead of flickering
  //    stale data from the previous city.
  const fetcher = useCallback(async () => {
    const res = await fetch(
      `${base}/api/audio-circles?city=${encodeURIComponent(city.trim())}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return (data.circles ?? []) as CircleSummary[];
  }, [base, city]);

  const {
    data: circles,
    loading,
    stale,
    refresh,
  } = useCachedList<CircleSummary[]>({
    cacheKey: `niakofa_circles_cache_${city.trim().toLowerCase()}`,
    fetcher,
    pollMs: 15000,
    enabled: !!city.trim(),
  });

  const startRoom = async (circle: CircleSummary) => {
    setStartingId(circle.id);
    try {
      const title = circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`;
      const res = await fetch(`${base}/api/audio-circles/${circle.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (res.status === 409 && data.session_id) {
        setLocation(`/audio-circle/${data.session_id}`);
        return;
      }
      if (!res.ok) {
        toast({ title: "Couldn't start the circle", description: data.error ?? "Try again in a moment.", variant: "destructive" });
        return;
      }
      // Refresh the list so the new live session appears immediately.
      await refresh();
      setLocation(`/audio-circle/${data.session.id}`);
    } catch {
      toast({ title: "Couldn't start the circle", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  const joinRoom = (sessionId: number) => setLocation(`/audio-circle/${sessionId}`);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/community")} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-lg flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" /> Audio Circles
          </h1>
          <p className="text-xs text-muted-foreground">Live voice rooms for your neighborhood</p>
        </div>
        {/* Stale indicator — shown only when a background poll failed but we
            still have cached data to show. Never shown as a hard error. */}
        {stale && circles && circles.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <WifiOff className="w-3 h-3" />
            <span>Reconnecting…</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Think call-in radio, live. Host a room, raise your hand to speak, or just listen in —
            every neighborhood (and your whole city) has its own circle.
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setCity(cityInput); }}
        >
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Search a city…"
            style={{ fontSize: "16px" }}
            className="flex-1 px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
          <Button type="submit" size="icon" variant="outline"><Search className="w-4 h-4" /></Button>
        </form>

        {/* Show spinner only on the very first load (no cache, no data yet).
            Background polls never re-show the spinner — the list stays visible. */}
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading circles…</div>
        )}

        {circles?.length === 0 && !loading && (
          <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center">
            <div className="text-sm font-bold text-muted-foreground">No circles yet for {city}</div>
            <div className="text-xs text-muted-foreground/60 mt-1">Try a different city, or check back soon.</div>
          </div>
        )}

        <div className="space-y-3">
          {circles?.map((circle, i) => {
            const live = circle.live_session;
            return (
              <motion.div
                key={circle.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-card border rounded-2xl p-4 ${live ? "border-primary/50" : "border-border"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                    {circle.neighborhood_emoji ?? "🌆"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-black text-sm">{circle.neighborhood_name ?? `${circle.city_display} (city-wide)`}</div>
                      {live && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5" /> Live
                        </span>
                      )}
                    </div>
                    {live ? (
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="truncate">"{live.title}" · hosted by {live.host_name}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-0.5">No live session right now</div>
                    )}
                    {live && (
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {live.speaker_count}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {live.listener_count}</span>
                        {live.video_enabled && <span className="flex items-center gap-1"><Video className="w-3 h-3" /> Video</span>}
                      </div>
                    )}
                  </div>
                  {live ? (
                    <Button size="sm" onClick={() => joinRoom(live.id)}>Join</Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={startingId === circle.id}
                      onClick={() => startRoom(circle)}
                    >
                      {startingId === circle.id ? "Starting…" : "Host"}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
