import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Radio, Users, Mic, Video, ArrowLeft, Search, WifiOff, Plus, Loader2 } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCachedList } from "@/hooks/useCachedList";
import { useWebSocket } from "@/lib/useWebSocket";

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

  const [city, setCity] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || currentUser?.city?.trim() || "Fort Worth";
    } catch {
      return currentUser?.city?.trim() || "Fort Worth";
    }
  });
  const [cityInput, setCityInput] = useState(city);
  const [startingId, setStartingId] = useState<number | null>(null);
  // Video-enabled toggle for hosting
  const [videoEnabled, setVideoEnabled] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, city); } catch { /* storage blocked */ }
  }, [city]);

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

  // ── Real-time list updates ─────────────────────────────────────────────────
  // When any session starts or ends anywhere, refresh the list immediately so
  // "Live" badges appear/disappear without waiting for the next 15-second poll.
  useWebSocket("circle_session_started", (e) => {
    const p = e.payload as { circle_id?: number; city_key?: string };
    // Only refresh if it's for the city we're currently viewing
    const currentCityKey = city.trim().toLowerCase().replace(/\s+/g, "_");
    if (!p.city_key || p.city_key === currentCityKey) {
      refresh().catch(() => {});
    }
  });
  useWebSocket("circle_session_ended", () => {
    refresh().catch(() => {});
  });

  const startRoom = async (circle: CircleSummary) => {
    setStartingId(circle.id);
    try {
      const title = circle.neighborhood_name
        ? `${circle.neighborhood_name} Circle`
        : `${circle.city_display} Circle`;
      const res = await fetch(`${base}/api/audio-circles/${circle.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title, video_enabled: videoEnabled }),
      });
      const data = await res.json();
      if (res.status === 409 && data.session_id) {
        // Already a live session — just join it
        setLocation(`/audio-circle/${data.session_id}`);
        return;
      }
      if (!res.ok) {
        toast({ title: "Couldn't start the circle", description: data.error ?? "Try again in a moment.", variant: "destructive" });
        return;
      }
      await refresh();
      setLocation(`/audio-circle/${data.session.id}`);
    } catch {
      toast({ title: "Connection error", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  const joinRoom = (sessionId: number) => setLocation(`/audio-circle/${sessionId}`);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
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
        {stale && circles && circles.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <WifiOff className="w-3 h-3" />
            <span>Reconnecting…</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Intro card */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Think call-in radio, live. Host a room, raise your hand to speak, or just listen in —
            every neighborhood (and your whole city) has its own circle.
          </p>
        </div>

        {/* City search */}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setCity(cityInput.trim() || city); }}
        >
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Search a city…"
            style={{ fontSize: "16px" }}
            className="flex-1 px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
          <Button type="submit" size="icon" variant="outline">
            <Search className="w-4 h-4" />
          </Button>
        </form>

        {/* Video toggle for hosting */}
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => setVideoEnabled(v => !v)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              videoEnabled
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            {videoEnabled ? "Video ON when hosting" : "Audio only when hosting"}
          </button>
        </div>

        {/* Loading state — only on first load, never on polls */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading circles…
          </div>
        )}

        {circles?.length === 0 && !loading && (
          <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center">
            <div className="text-sm font-bold text-muted-foreground">No circles yet for {city}</div>
            <div className="text-xs text-muted-foreground/60 mt-1">Try a different city, or check back soon.</div>
          </div>
        )}

        {/* Circle cards */}
        <div className="space-y-3">
          {circles?.map((circle, i) => {
            const live = circle.live_session;
            const isStarting = startingId === circle.id;
            return (
              <motion.div
                key={circle.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-card border rounded-2xl p-4 transition-colors ${live ? "border-primary/50 bg-primary/5" : "border-border"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0 mt-0.5">
                    {circle.neighborhood_emoji ?? "🌆"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-black text-sm">
                        {circle.neighborhood_name ?? `${circle.city_display} (city-wide)`}
                      </div>
                      {live && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
                        </span>
                      )}
                    </div>
                    {live ? (
                      <>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          "{live.title}" · {live.host_name}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {live.speaker_count} speaking</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {live.listener_count} listening</span>
                          {live.video_enabled && <span className="flex items-center gap-1 text-primary/70"><Video className="w-3 h-3" /> Video</span>}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-0.5">No live session right now</div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {live ? (
                      <Button size="sm" onClick={() => joinRoom(live.id)} className="gap-1.5">
                        <Radio className="w-3 h-3" /> Join
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isStarting}
                        onClick={() => startRoom(circle)}
                        className="gap-1.5"
                      >
                        {isStarting ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Starting…</>
                        ) : (
                          <><Plus className="w-3 h-3" /> Host</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
