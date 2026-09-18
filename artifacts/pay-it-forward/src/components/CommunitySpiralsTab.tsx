import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Loader2, Mic, Radio, RefreshCw, Users, Video } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { SPIRALS_PATHS } from "@/lib/spirals";
import { SpiralMark } from "@/components/SpiralMark";

interface NeighborhoodInfo {
  id: number;
  neighborhood_id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  city_key: string;
  city_display: string;
}

interface LiveSession {
  id: number;
  host_name: string;
  speaker_count: number;
  listener_count: number;
  video_enabled: boolean;
}

interface SpiralSummary {
  id: number;
  neighborhood_id?: string | null;
  neighborhood_name: string | null;
  live_session: LiveSession | null;
}

function keyFor(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Canonical Community → Spirals surface.
 *
 * This component intentionally does not read GPS, Map Locator, village-pulse,
 * geometry status, or nearby-location APIs. Community Spirals are curated and
 * manually selectable; live state is display-only and comes from the Spiral
 * API. The backend's curated catalog is the source of truth for the nine
 * neighborhood choices for a configured city.
 */
export function CommunitySpiralsTab() {
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const city = currentUser?.city?.trim() || "Fort Worth";

  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodInfo[]>([]);
  const [liveByNeighborhood, setLiveByNeighborhood] = useState<Map<string, LiveSession>>(new Map());
  const [citywide, setCitywide] = useState<SpiralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSpirals = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [neighborhoodResponse, spiralResponse] = await Promise.all([
        fetch(`${base}/api/community/neighborhoods?city=${encodeURIComponent(city)}`, { headers: authHeaders() }),
        fetch(`${base}/api/audio-circles?city=${encodeURIComponent(city)}`, { headers: authHeaders() }),
      ]);
      if (!neighborhoodResponse.ok) throw new Error(`Neighborhood catalog unavailable (HTTP ${neighborhoodResponse.status}).`);
      if (!spiralResponse.ok) throw new Error(`Spiral status unavailable (HTTP ${spiralResponse.status}).`);

      const neighborhoodData = await neighborhoodResponse.json() as { neighborhoods?: NeighborhoodInfo[] };
      const spiralData = await spiralResponse.json() as { circles?: SpiralSummary[] };
      const curated = Array.isArray(neighborhoodData.neighborhoods) ? neighborhoodData.neighborhoods : [];
      const circles = Array.isArray(spiralData.circles) ? spiralData.circles : [];
      const live = new Map<string, LiveSession>();
      let citywideCircle: SpiralSummary | null = null;

      for (const circle of circles) {
        if (!circle.neighborhood_name && !circle.neighborhood_id) {
          citywideCircle = circle;
          continue;
        }
        if (circle.live_session) {
          for (const value of [circle.neighborhood_id, circle.neighborhood_name]) {
            if (value) live.set(keyFor(value), circle.live_session);
          }
        }
      }

      setNeighborhoods(curated.slice(0, 9));
      setLiveByNeighborhood(live);
      setCitywide(citywideCircle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Community Spirals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [base, city]);

  useEffect(() => {
    void loadSpirals();
    const refreshTimer = window.setInterval(() => void loadSpirals(true), 20_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadSpirals]);

  const ordered = useMemo(() => neighborhoods.slice(0, 9), [neighborhoods]);

  const openSpiral = (neighborhoodName?: string) => {
        const live = neighborhoodName ? liveByNeighborhood.get(keyFor(neighborhoodName)) : citywide?.live_session;
    if (live?.id) {
      setLocation(SPIRALS_PATHS.room(live.id));
      return;
    }
    const query = neighborhoodName ? `?neighborhood=${encodeURIComponent(neighborhoodName)}` : "";
    setLocation(`${SPIRALS_PATHS.discovery}${query}`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
        <h3 className="font-black text-sm flex items-center gap-2 mb-1">
          <SpiralMark className="w-4 h-4 text-primary" /> Community Spirals
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose a curated neighborhood Spiral or the city-wide Spiral. Discovery, joining, and hosting do not require GPS.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading Community Spirals…</span>
        </div>
      )}

      {error && (
        <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <div className="text-sm font-bold text-muted-foreground">Couldn't refresh Community Spirals</div>
          <div className="text-xs text-muted-foreground/60">{error}</div>
          <button type="button" onClick={() => void loadSpirals()} className="mx-auto mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      )}

      {!loading && citywide && (
        <button
          type="button"
          onClick={() => openSpiral()}
          className={`w-full text-left bg-card border rounded-2xl p-4 transition-all active:scale-[0.98] ${
            citywide.live_session ? "border-red-500/50 bg-red-500/5" : "border-primary/30 hover:border-primary/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <SpiralMark className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-black text-sm">{city} — City-wide Spiral</div>
                {citywide.live_session && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5" /> Live
                  </span>
                )}
              </div>
              {citywide.live_session ? (
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {citywide.live_session.speaker_count} speakers</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {citywide.live_session.listener_count} audience</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5">Open a city-wide community conversation.</div>
              )}
            </div>
            <span className="shrink-0 text-xs font-black bg-muted px-3 py-1.5 rounded-xl">
              {citywide.live_session ? "Join" : "Host"}
            </span>
          </div>
        </button>
      )}

      {!loading && ordered.map((hood) => {
        const live = liveByNeighborhood.get(keyFor(hood.neighborhood_id)) ?? liveByNeighborhood.get(keyFor(hood.name));
        return (
          <button
            type="button"
            key={hood.id}
            onClick={() => openSpiral(hood.name)}
            className={`w-full text-left bg-card border rounded-2xl p-4 transition-all active:scale-[0.98] ${
              live ? "border-red-500/50 bg-red-500/5" : "border-border hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                {hood.emoji ?? "🏘️"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-black text-sm">{hood.name}</div>
                  {live && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                      <Radio className="w-2.5 h-2.5" /> Live
                    </span>
                  )}
                </div>
                {live ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-xs text-muted-foreground">Hosted by <span className="font-bold text-foreground">{live.host_name}</span></div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {live.speaker_count} speakers</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {live.listener_count} audience</span>
                      {live.video_enabled && <span className="flex items-center gap-1 text-primary"><Video className="w-3 h-3" /> Video</span>}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">{hood.description ?? "Neighborhood Spiral"}</div>
                )}
              </div>
              <span className="shrink-0 text-xs font-bold text-muted-foreground bg-muted px-3 py-1.5 rounded-xl">
                {live ? "Join" : "Host"}
              </span>
            </div>
          </button>
        );
      })}

      {!loading && ordered.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">No curated neighborhood Spirals are configured for {city} yet.</div>
      )}

      <button
        type="button"
        onClick={() => void loadSpirals(true)}
        disabled={refreshing}
        className="mx-auto flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Refresh live status
      </button>

      <button
        type="button"
        onClick={() => setLocation(SPIRALS_PATHS.discovery)}
        className="w-full bg-gradient-to-br from-primary/15 via-card to-card border border-primary/30 rounded-2xl p-4 flex items-center gap-3 text-left cursor-pointer hover:border-primary/50 transition-colors"
      >
        <SpiralMark className="w-5 h-5 text-primary" />
        <div>
          <div className="text-sm font-black">Open full Spiral directory</div>
          <div className="text-xs text-muted-foreground mt-0.5">Browse the curated city catalog without location services.</div>
        </div>
      </button>
    </div>
  );
}
