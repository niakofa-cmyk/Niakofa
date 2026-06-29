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
<<<<<<< HEAD
import { BestMatchCard } from "@/components/BestMatchCard";
import { MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle, Navigation2, Layers, X, Siren, Zap, Locate } from "lucide-react";
=======
import { DispatchIntelligenceCard } from "@/components/DispatchIntelligenceCard";
import { MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle, Navigation2 } from "lucide-react";
>>>>>>> ea36d2ac (feat(map): audit + enhance — filters, clustering, peek sheet, urgency colors, style toggle, stale WS banner)
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { OrientationToggle } from "@/components/OrientationToggle";

function pickBestMatch(requests: HelpRequest[]): HelpRequest | null {
  if (requests.length === 0) return null;
  const urgencyScore: Record<string, number> = { emergency: 100, high: 50, medium: 20, low: 5 };
  return [...requests].sort((a, b) => {
    const uA = urgencyScore[a.urgency ?? "low"] ?? 5;
    const uB = urgencyScore[b.urgency ?? "low"] ?? 5;
    if (uA !== uB) return uB - uA;
    return (a.distance_miles ?? 99) - (b.distance_miles ?? 99);
  })[0];
}

export default function MapScreen() {
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive, myLocation } = useAppContext();
  const queryClient = useQueryClient();
  const [mapError, setMapError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(() => wsIsConnected());
  const [statsVisible, setStatsVisible] = useState(true);
  const [bestMatchDismissed, setBestMatchDismissed] = useState<number | null>(null);
  const prevHelperMode = useRef(false);

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
    { query: { enabled: !!myLocation, queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: 10 }) } }
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
  const openRequests = safeRequests.filter(r => r.status === "open");
  const emergencyRequests = openRequests.filter(r => r.urgency === "emergency");
  const displayHelpers = safeHelpers.filter(h => h.id !== currentUser?.id);

  // Dispatch Intelligence — Best Match card
  const bestMatch = helperModeActive ? pickBestMatch(openRequests) : null;
  const showBestMatch = bestMatch && bestMatch.id !== bestMatchDismissed;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      <TopBar />

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

      {/* Map fallback */}
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-0 gap-3 px-6 pt-20 pb-28">
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
        {displayHelpers.map(h => (
          <Marker key={h.id} longitude={h.lng} latitude={h.lat} anchor="center">
            <HelperMarker helper={h} />
          </Marker>
        ))}

        {/* Open request markers with emergency pulse rings */}
        {openRequests.map(r => (
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
<<<<<<< HEAD
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

        {/* Request density heatmap — Phase 10E */}
        {showDensity && requestDensityGeoJSON.features.length > 0 && (
          <Source id="request-density" type="geojson" data={requestDensityGeoJSON}>
            <Layer
              id="request-density-layer"
              type="heatmap"
              paint={{
                "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 3],
                "heatmap-color": [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0,   "rgba(0,0,0,0)",
                  0.2, "rgba(255,60,0,0.25)",
                  0.5, "rgba(255,100,0,0.55)",
                  0.8, "rgba(255,180,0,0.8)",
                  1.0, "rgba(255,255,100,1)"
                ],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 15, 40],
                "heatmap-opacity": 0.68,
              }}
            />
          </Source>
        )}

        {/* Request clusters — shown when zoom < 13, individual markers at zoom >= 13 */}
        <Source
          id="request-clusters"
          type="geojson"
          data={requestClusterGeoJSON}
          cluster={true}
          clusterMaxZoom={12}
          clusterRadius={50}
        >
          {/* Cluster circle */}
          <Layer
            id="request-cluster-circle"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "step", ["get", "point_count"],
                "#FF3C00", 5,
                "#f97316", 15,
                "#eab308"
              ],
              "circle-radius": ["step", ["get", "point_count"], 18, 5, 24, 15, 32],
              "circle-opacity": 0.88,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
              "circle-stroke-opacity": 0.3,
            }}
          />
          {/* Cluster count label */}
          <Layer
            id="request-cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": "{point_count_abbreviated}",
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 13,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
          {/* Unclustered point — small dot (individual markers render on top at high zoom) */}
          <Layer
            id="request-unclustered"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": [
                "match", ["get", "urgency"],
                "emergency", "#ef4444",
                "high",      "#f97316",
                "medium",    "#FF3C00",
                "#6366f1"
              ],
              "circle-radius": 0,
              "circle-opacity": 0,
            }}
          />
        </Source>


                {/* Request density legend */}
        {showDensity && (
          <div className="absolute bottom-48 left-4 z-10 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 pointer-events-none">
            <div className="text-[9px] text-white/60 uppercase tracking-wider mb-1.5">Request Density</div>
            <div className="flex items-center gap-0.5">
              {["rgba(255,60,0,0.4)", "rgba(255,100,0,0.65)", "rgba(255,180,0,0.85)", "rgba(255,255,100,1)"].map((c, i) => (
                <div key={i} className="w-5 h-2 rounded-sm" style={{ background: c }} />
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-white/50 mt-0.5">
              <span>Low</span><span>High</span>
            </div>
          </div>
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

        {/* Helper service radius ring — visual circle on map showing helper's normal working area.
            Non-emergency requests outside this ring show dashed marker + outside-area badges.
            DESIGN: Local-First Dispatch per CLAUDE.md — helpers should finish nearby work
            before accepting long-distance trips. The ring makes that boundary visible.
            Emergency requests always bypass this — urgency overrides distance everywhere. */}
        {helperModeActive && myLocation && (
          <Source
            id="helper-radius"
            type="geojson"
            data={{
              type: "FeatureCollection" as const,
              features: [{
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [myLocation.lng, myLocation.lat] },
                properties: {},
              }],
            }}
          >
            {/* Mapbox circle-radius in pixels scales with zoom. Formula:
                radius_meters * (256 * 2^zoom) / (2 * PI * 6378137 * cos(lat_rad))
                Simplified to a CSS-level graduated stop list for the two zoom boundaries. */}
            <Layer
              id="helper-radius-fill"
              type="circle"
              paint={{
                "circle-radius": {
                  stops: [
                    [8,  Math.round(serviceRadiusMiles * 1609.34 / 152.874)],
                    [10, Math.round(serviceRadiusMiles * 1609.34 / 38.219)],
                    [12, Math.round(serviceRadiusMiles * 1609.34 / 9.555)],
                    [14, Math.round(serviceRadiusMiles * 1609.34 / 2.389)],
                    [16, Math.round(serviceRadiusMiles * 1609.34 / 0.597)],
                  ],
                  base: 2,
                } as unknown as number,
                "circle-color": "rgba(99,102,241,0.06)",
                "circle-stroke-color": "rgba(99,102,241,0.5)",
                "circle-stroke-width": 1.5,
                "circle-pitch-alignment": "map" as const,
                "circle-stroke-opacity": 0.8,
              }}
            />
          </Source>
        )}

=======
        <OrientationToggle mode={orientMode} onToggle={() => setOrientMode(orientMode === "heading-up" ? "north-up" : "heading-up")} />
>>>>>>> ea36d2ac (feat(map): audit + enhance — filters, clustering, peek sheet, urgency colors, style toggle, stale WS banner)
      </Map>

      {/* Dispatch Intelligence — Best Match card */}
<<<<<<< HEAD
      {showBestMatch && webGLSupported && !mapError && (
        <BestMatchCard
=======
      {showBestMatch && !mapError && (
        <DispatchIntelligenceCard
>>>>>>> ea36d2ac (feat(map): audit + enhance — filters, clustering, peek sheet, urgency colors, style toggle, stale WS banner)
          bestMatch={bestMatch}
          onAccept={handleClaim}
          onDismiss={() => setBestMatchDismissed(bestMatch.id)}
          isClaiming={claimMutation.isPending}
        />
      )}

      {/* Helper mode bottom sheet */}
      {helperModeActive && openRequests.length > 0 && !mapError && !showBestMatch && (
        <div className="pb-20">
          <BottomSheet requests={openRequests} onClaim={handleClaim} isClaiming={claimMutation.isPending} />
        </div>
      )}

      {helperModeActive && openRequests.length === 0 && (
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

