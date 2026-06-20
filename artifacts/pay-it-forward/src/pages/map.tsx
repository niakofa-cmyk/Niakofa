import { useState, useCallback, useRef, useEffect } from "react";
import type mapboxgl from "mapbox-gl";
import { useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest, HelperLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { BottomSheet } from "@/components/BottomSheet";
import { RequestMarker } from "@/components/RequestMarker";
import { HelperMarker } from "@/components/HelperMarker";
import { DispatchIntelligenceCard } from "@/components/DispatchIntelligenceCard";
import { MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle, Navigation2, Layers, X, Siren } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { OrientationToggle } from "@/components/OrientationToggle";

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Multi-factor Dispatch Intelligence (enhanced §3.2.1):
 * Urgency → age boost → category weight → skill match → distance
 * Skill match awards a +20 bonus when the helper has a specialty that maps to the request category.
 */
const SKILL_CATEGORY_MAP: Record<string, string[]> = {
  truck_owner:          ["transportation", "delivery_run", "stock_shelves", "errands"],
  medical_background:   ["medical", "emergency"],
  bilingual:            ["groceries", "errands", "medical", "other"],
  licensed_electrician: ["home_repair"],
  licensed_plumber:     ["home_repair"],
  carpenter:            ["home_repair", "event_setup"],
  tech_support:         ["tech_support"],
};

const CATEGORY_WEIGHT: Record<string, number> = {
  emergency: 30, medical: 20, home_repair: 5, groceries: 3,
  transportation: 3, errands: 2, stock_shelves: 2, event_setup: 2,
  delivery_run: 2, tech_support: 2, other: 0,
};

function pickBestMatch(
  requests: HelpRequest[],
  helperSpecialties?: string[] | null
): HelpRequest | null {
  if (requests.length === 0) return null;
  const urgencyScore: Record<string, number> = { emergency: 100, high: 50, medium: 20, low: 5 };
  const now = Date.now();
  const specs = (helperSpecialties ?? []).map(s => s.toLowerCase().replace(/\s+/g, "_"));

  return [...requests].sort((a, b) => {
    const uA = urgencyScore[a.urgency ?? "low"] ?? 5;
    const uB = urgencyScore[b.urgency ?? "low"] ?? 5;

    // Age boost: waiting > 10 min earns +15 pts, > 5 min earns +7 pts
    const ageA = a.created_at ? (now - new Date(a.created_at).getTime()) / 60000 : 0;
    const ageB = b.created_at ? (now - new Date(b.created_at).getTime()) / 60000 : 0;
    const ageBoostA = ageA > 10 ? 15 : ageA > 5 ? 7 : 0;
    const ageBoostB = ageB > 10 ? 15 : ageB > 5 ? 7 : 0;

    // Category weight — emergency/medical get priority bonus
    const catA = CATEGORY_WEIGHT[a.category ?? "other"] ?? 0;
    const catB = CATEGORY_WEIGHT[b.category ?? "other"] ?? 0;

    // Skill match — +20 if this helper has a specialty relevant to the request category
    let skillA = 0, skillB = 0;
    if (specs.length > 0) {
      for (const [skill, cats] of Object.entries(SKILL_CATEGORY_MAP)) {
        if (specs.includes(skill)) {
          if (cats.includes(a.category ?? "")) skillA = 20;
          if (cats.includes(b.category ?? "")) skillB = 20;
        }
      }
    }

    const scoreA = uA + ageBoostA + catA + skillA;
    const scoreB = uB + ageBoostB + catB + skillB;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // Distance tie-break
    const distDiff = (a.distance_miles ?? 99) - (b.distance_miles ?? 99);
    if (Math.abs(distDiff) > 0.3) return distDiff;
    return 0;
  })[0];
}

interface CrisisState {
  active: boolean;
  message: string;
  level: "info" | "warning" | "critical";
  activatedAt?: string;
  resources?: Array<{ label: string; phone?: string; url?: string }>;
}

export default function MapScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive, myLocation } = useAppContext();
  const queryClient = useQueryClient();
  const [webGLSupported] = useState(checkWebGL);
  const [mapError, setMapError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(() => wsIsConnected());
  const [statsVisible, setStatsVisible] = useState(true);
  const [bestMatchDismissed, setBestMatchDismissed] = useState<number | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string | null>(null);
  const prevHelperMode = useRef(false);
  const [crisis, setCrisis] = useState<CrisisState | null>(null);
  const [crisisDismissed, setCrisisDismissed] = useState(false);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/crisis/status`)
      .then(r => r.json())
      .then((data: CrisisState) => { if (data.active) setCrisis(data); })
      .catch(() => {});
  }, []);

  const onMapError = useCallback((e: unknown) => {
    const msg = (e as { error?: { message?: string } })?.error?.message ?? "Map failed to load";
    setMapError(msg);
  }, []);

  const { data: requests = [] } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
  );
  const { data: helpers = [] } = useGetOnlineHelpers(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 },
    { query: {
      enabled: !!myLocation,
      queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }),
      refetchInterval: showHeatmap ? 300000 : false, // refresh heatmap data every 5 min
    }}
  );
  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000 }
  });

  const [liveHelpers, setLiveHelpers] = useState<HelperLocation[]>([]);
  const [liveRequests, setLiveRequests] = useState<HelpRequest[]>([]);
  const initHelpers = useRef(false);
  const initRequests = useRef(false);

  useEffect(() => {
    if (helpers.length > 0 && !initHelpers.current) { setLiveHelpers(helpers as HelperLocation[]); initHelpers.current = true; }
    else if (helpers.length > 0) setLiveHelpers(helpers as HelperLocation[]);
  }, [helpers]);
  useEffect(() => {
    if (requests.length > 0 && !initRequests.current) { setLiveRequests(requests as HelpRequest[]); initRequests.current = true; }
    else if (requests.length > 0) setLiveRequests(requests as HelpRequest[]);
  }, [requests]);

  // Reset best match dismissal when helper mode toggles ON
  useEffect(() => {
    if (helperModeActive && !prevHelperMode.current) {
      setBestMatchDismissed(null);
    }
    prevHelperMode.current = helperModeActive;
  }, [helperModeActive]);

  const [activeHelperRoute, setActiveHelperRoute] = useState<{ helperId: number; requestId: number } | null>(null);

  useWebSocket(useCallback((event) => {
    if (event.type === "connected") {
      setWsConnected(true);
    } else if (event.type === "REQUEST_CREATED" || event.type === "new_request") {
      const req = event.payload as HelpRequest;
      setLiveRequests(prev => {
        if (prev.find(r => r.id === req.id)) return prev;
        if (req.urgency === "emergency") {
          toast({ title: "🚨 EMERGENCY nearby!", description: req.title });
        } else {
          toast({ title: "📍 New request nearby", description: req.title });
        }
        return [req, ...prev];
      });
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
    } else if (event.type === "REQUEST_ACCEPTED" || event.type === "HELPER_MOVING" || event.type === "HELPER_ARRIVED" || event.type === "REQUEST_COMPLETED" || event.type === "request_updated") {
      const req = event.payload as HelpRequest;
      setLiveRequests(prev => {
        const filtered = prev.filter(r => r.id !== req.id);
        if ((req.status === "en_route" || req.status === "arrived") && req.helper_id) {
          setActiveHelperRoute({ helperId: req.helper_id, requestId: req.id });
        }
        if (req.status === "completed" || req.status === "cancelled") {
          setActiveHelperRoute(null);
        }
        if (req.status === "open") return [req, ...filtered];
        return filtered;
      });
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
    } else if (event.type === "helper_location") {
      const loc = event.payload as { id: number; lat: number; lng: number; heading?: number };
      if (loc.id === currentUser?.id) return;
      setLiveHelpers(prev => {
        const exists = prev.find(h => h.id === loc.id);
        if (!exists) return prev;
        return prev.map(h => h.id === loc.id ? { ...h, lat: loc.lat, lng: loc.lng, heading: loc.heading ?? h.heading } : h);
      });
    } else if (event.type === "crisis_update") {
      const state = event.payload as CrisisState;
      if (state.active) {
        setCrisis(state);
        setCrisisDismissed(false);
        toast({ title: "⚠️ Community Alert", description: state.message, variant: "destructive" });
      } else {
        setCrisis(null);
      }
    } else if (event.type === "helper_online") {
      setWsConnected(true);
    } else if (event.type === "helper_offline") {
      const loc = event.payload as { id: number };
      setLiveHelpers(prev => prev.filter(h => h.id !== loc.id));
    }
  }, [currentUser?.id, queryClient]));

  const activeHelper = activeHelperRoute
    ? (Array.isArray(liveHelpers) ? liveHelpers : []).find(h => h.id === activeHelperRoute.helperId)
    : null;
  const activeRequest = activeHelperRoute
    ? (Array.isArray(liveRequests) ? liveRequests : []).find(r => r.id === activeHelperRoute.requestId) ??
      requests.find(r => r.id === activeHelperRoute.requestId) ?? null
    : null;

  const routeForActiveHelper = {
    start_lat: activeHelper?.lat || 0,
    start_lng: activeHelper?.lng || 0,
    end_lat: activeRequest?.lat || 0,
    end_lng: activeRequest?.lng || 0,
  };
  const { data: activeHelperRouteData } = useGetRoute(routeForActiveHelper, {
    query: {
      enabled: !!(activeHelper && activeRequest),
      refetchInterval: 10000,
      queryKey: getGetRouteQueryKey(routeForActiveHelper),
    }
  });

  const claimMutation = useClaimRequest();
  const mapRef = useRef<mapboxgl.Map | null>(null);
  useTerrain(mapRef);
  const deviceHeading = useDeviceHeading();
  const { mode: orientMode, setMode: setOrientMode, applyHeading } = useMapOrientation(mapRef);
  useEffect(() => { if (deviceHeading !== null) applyHeading(deviceHeading); }, [deviceHeading, applyHeading]);
  const handleClaim = useCallback((request: HelpRequest) => {
    if (!currentUser) return;
    claimMutation.mutate(
      { id: request.id, data: { helper_id: currentUser.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          setLocation(`/request/${request.id}`);
        },
        onError: () => toast({ title: "Failed to claim request", variant: "destructive" }),
      }
    );
  }, [currentUser, claimMutation, queryClient, setLocation]);

  const safeRequests = Array.isArray(liveRequests) ? liveRequests : [];
  const safeHelpers = Array.isArray(liveHelpers) ? liveHelpers : [];
  const allOpenRequests = safeRequests.filter(r => r.status === "open");

  // Derive unique neighborhoods from visible open requests for the filter
  const availableNeighborhoods = Array.from(
    new Set(allOpenRequests.map(r => (r as { neighborhood?: string | null }).neighborhood).filter((n): n is string => !!n))
  ).sort();

  const openRequests = neighborhoodFilter
    ? allOpenRequests.filter(r => (r as { neighborhood?: string | null }).neighborhood === neighborhoodFilter)
    : allOpenRequests;

  const emergencyRequests = openRequests.filter(r => r.urgency === "emergency");
  const displayHelpers = safeHelpers.filter(h => h.id !== currentUser?.id);

  // Heatmap GeoJSON — built from all visible helpers (§4.1 geospatial analytics)
  const helperHeatmapGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: displayHelpers
      .filter(h => typeof h.lat === "number" && typeof h.lng === "number" && isFinite(h.lat) && isFinite(h.lng))
      .map(h => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [h.lng!, h.lat!] },
        properties: { weight: Math.max(0.2, ((h.trust_score ?? 50) / 100)) },
      })),
  };

  // Dispatch Intelligence — Best Match card
  const bestMatch = helperModeActive ? pickBestMatch(openRequests, currentUser?.specialties) : null;
  const showBestMatch = bestMatch && bestMatch.id !== bestMatchDismissed;

  const showCrisisBanner = crisis?.active && !crisisDismissed;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      <TopBar />

      {/* Crisis Mode Banner — admin-triggered for emergencies, tornados, floods */}
      {showCrisisBanner && (
        <div className={`absolute top-14 left-3 right-3 z-30 rounded-2xl border p-3 shadow-2xl backdrop-blur-sm ${
          crisis.level === "critical"
            ? "bg-destructive/95 border-destructive/60 text-destructive-foreground"
            : crisis.level === "warning"
            ? "bg-yellow-900/95 border-yellow-500/60 text-yellow-100"
            : "bg-primary/95 border-primary/60 text-primary-foreground"
        }`}>
          <div className="flex items-start gap-2">
            <Siren className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">
                Community Emergency Alert · Tarrant County
              </div>
              <p className="text-xs leading-relaxed font-medium">{crisis.message}</p>
              {crisis.resources && crisis.resources.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {crisis.resources.map((r, i) => (
                    <a
                      key={i}
                      href={r.phone ? `tel:${r.phone}` : r.url}
                      target={r.url ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full transition-colors"
                    >
                      {r.phone ? `📞 ${r.label}` : `🌐 ${r.label}`}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setCrisisDismissed(true)}
              className="p-1 rounded-full hover:bg-white/20 transition-colors shrink-0"
              aria-label="Dismiss alert"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live stats overlay */}
      {statsVisible && (
        <div
          className="absolute top-16 right-4 z-10 flex flex-col gap-1.5 cursor-pointer"
          onClick={() => setStatsVisible(false)}
        >
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
            {wsConnected
              ? <Wifi className="w-3 h-3 text-green-400" />
              : <WifiOff className="w-3 h-3 text-muted-foreground" />}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${wsConnected ? "text-green-400" : "text-muted-foreground"}`}>
              {wsConnected ? "Live" : "Connecting"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
            <Users className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary">{stats?.total_helpers_online ?? 0} helpers</span>
          </div>
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
            <Activity className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] font-bold text-yellow-400">{openRequests.length} open</span>
          </div>
          {emergencyRequests.length > 0 && (
            <div className="flex items-center gap-1.5 bg-destructive/20 backdrop-blur-md border border-destructive/50 px-2.5 py-1.5 rounded-full shadow-lg animate-pulse">
              <AlertTriangle className="w-3 h-3 text-destructive" />
              <span className="text-[10px] font-bold text-destructive">{emergencyRequests.length} 🚨</span>
            </div>
          )}
          {activeHelperRoute && (
            <div className="flex items-center gap-1.5 bg-primary/10 backdrop-blur-md border border-primary/30 px-2.5 py-1.5 rounded-full shadow-lg">
              <Navigation2 className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-primary">En Route</span>
            </div>
          )}
        </div>
      )}

      {/* Map fallback — shown immediately when WebGL unavailable, or after a GL error */}
      {(!webGLSupported || !!mapError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-20 gap-3 px-6 pt-20 pb-28">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          <p className="text-base font-bold text-center">Map needs WebGL</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Open in Chrome or Firefox for the full live map. Requests listed below.
          </p>
          <div className="w-full max-w-sm space-y-2 mt-2">
            {openRequests.map(r => (
              <button
                key={r.id}
                onClick={() => helperModeActive && handleClaim(r)}
                className={`w-full text-left border rounded-xl p-3 transition-colors ${
                  r.urgency === "emergency"
                    ? "bg-destructive/10 border-destructive/40 hover:border-destructive"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                <div className="font-semibold text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.category} · {r.requester_name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {webGLSupported && (
      <Map
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        attributionControl={false}
        onError={onMapError}
        initialViewState={{
          longitude: myLocation?.lng ?? -97.33,
          latitude: myLocation?.lat ?? 32.75,
          zoom: 13.5,
          pitch: 45,
          bearing: 0,
        }}
        ref={(ref) => { if (ref) (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = ref.getMap(); }}
      >
        {/* My location dot with accuracy ring */}
        {myLocation && (
          <Marker longitude={myLocation.lng} latitude={myLocation.lat} anchor="center">
            <div className="relative flex items-center justify-center w-8 h-8">
              <div className="absolute w-8 h-8 bg-primary rounded-full opacity-15 animate-ping" style={{ animationDuration: "2s" }} />
              <div className="absolute w-5 h-5 bg-primary rounded-full opacity-25 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
              <div className="w-3 h-3 bg-primary rounded-full shadow-[0_0_12px_rgba(0,212,255,0.9)] border-2 border-background" />
            </div>
          </Marker>
        )}

        {/* Online helpers — animated dots */}
        {displayHelpers
          .filter(h => typeof h.lat === "number" && typeof h.lng === "number" && isFinite(h.lat) && isFinite(h.lng))
          .map(h => (
            <Marker key={h.id} longitude={h.lng} latitude={h.lat} anchor="center">
              <HelperMarker helper={h} />
            </Marker>
          ))}

        {/* Open request markers with emergency pulse rings */}
        {openRequests
          .filter(r => typeof r.lat === "number" && typeof r.lng === "number" && isFinite(r.lat) && isFinite(r.lng))
          .map(r => (
            <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor="bottom">
              <RequestMarker request={r} />
            </Marker>
          ))}

        {/* Live route line */}
        {activeHelperRouteData?.geometry && (
          <Source id="helper-route" type="geojson" data={activeHelperRouteData.geometry as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="helper-route-casing"
              type="line"
              paint={{ "line-color": "#000", "line-width": 8, "line-opacity": 0.3 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="helper-route-line"
              type="line"
              paint={{ "line-color": "hsl(190, 100%, 55%)", "line-width": 4, "line-opacity": 0.75, "line-dasharray": [2, 1] }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}
        {/* Helper availability heatmap — §3.3, §4.1, §4.7 */}
        {showHeatmap && helperHeatmapGeoJSON.features.length > 0 && (
          <Source id="helper-heatmap" type="geojson" data={helperHeatmapGeoJSON}>
            <Layer
              id="helper-heatmap-layer"
              type="heatmap"
              paint={{
                "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 2],
                "heatmap-color": [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0,   "rgba(0,0,0,0)",
                  0.2, "rgba(0,100,255,0.35)",
                  0.5, "rgba(0,212,255,0.6)",
                  0.8, "rgba(80,255,180,0.85)",
                  1.0, "rgba(255,230,50,1)"
                ],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 20, 15, 45],
                "heatmap-opacity": 0.72,
              }}
            />
          </Source>
        )}

        {/* Heatmap legend overlay */}
        {showHeatmap && (
          <div className="absolute bottom-32 left-4 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 pointer-events-none">
            <div className="text-[9px] text-white/60 uppercase tracking-wider mb-1.5">Helper Density</div>
            <div className="flex items-center gap-0.5">
              {["rgba(0,100,255,0.5)", "rgba(0,212,255,0.7)", "rgba(80,255,180,0.9)", "rgba(255,230,50,1)"].map((c, i) => (
                <div key={i} className="w-5 h-2 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-white/50 mt-0.5">
              <span>Low</span><span>High</span>
            </div>
            <div className="text-[8px] text-white/40 mt-1">Refreshes every 5 min</div>
          </div>
        )}

        <OrientationToggle mode={orientMode} onToggle={() => setOrientMode(orientMode === "heading-up" ? "north-up" : "heading-up")} />
      </Map>
      )}

      {/* Neighborhood filter chips — appear when requests have neighborhood data */}
      {availableNeighborhoods.length > 0 && helperModeActive && (
        <div className="absolute bottom-[14.5rem] left-0 right-0 z-10 flex gap-2 px-4 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setNeighborhoodFilter(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shadow-sm ${
              neighborhoodFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:border-primary/50"
            }`}
            aria-label="Show all neighborhoods"
            aria-pressed={neighborhoodFilter === null}
          >
            All
          </button>
          {availableNeighborhoods.map(hood => (
            <button
              key={hood}
              onClick={() => setNeighborhoodFilter(neighborhoodFilter === hood ? null : hood)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shadow-sm whitespace-nowrap ${
                neighborhoodFilter === hood
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:border-primary/50"
              }`}
              aria-label={`Filter by ${hood}`}
              aria-pressed={neighborhoodFilter === hood}
            >
              {hood}
            </button>
          ))}
        </div>
      )}

      {/* Heatmap toggle button */}
      {webGLSupported && !mapError && (
        <button
          onClick={() => setShowHeatmap(v => !v)}
          title={showHeatmap ? "Hide helper heatmap" : "Show helper availability heatmap"}
          aria-label={showHeatmap ? "Hide helper heatmap" : "Show helper availability heatmap"}
          aria-pressed={showHeatmap}
          className={`absolute bottom-28 right-4 z-10 w-10 h-10 rounded-xl border flex items-center justify-center shadow-lg transition-all ${
            showHeatmap
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>
      )}

      {/* Dispatch Intelligence — Best Match card */}
      {showBestMatch && webGLSupported && !mapError && (
        <DispatchIntelligenceCard
          bestMatch={bestMatch}
          onAccept={handleClaim}
          onDismiss={() => setBestMatchDismissed(bestMatch.id)}
          isClaiming={claimMutation.isPending}
        />
      )}

      {/* Helper mode bottom sheet */}
      {helperModeActive && openRequests.length > 0 && webGLSupported && !mapError && !showBestMatch && (
        <div className="pb-20">
          <BottomSheet requests={openRequests} onClaim={handleClaim} isClaiming={claimMutation.isPending} />
        </div>
      )}

      {helperModeActive && openRequests.length === 0 && webGLSupported && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-sm border border-border px-6 py-3 rounded-full shadow-lg w-[90%] max-w-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-sm font-medium">Online — waiting for nearby requests...</p>
          </div>
        </div>
      )}
    </div>
  );
}
