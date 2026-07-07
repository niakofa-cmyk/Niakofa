import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type mapboxgl from "mapbox-gl";
import { useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { getIpLocation, detectMapLanguage, localizeMapLabels } from "@/lib/locale-utils";
import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute, useGetUserSettings,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey,
  getGetUserSettingsQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest, HelperLocation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/TopBar";
import { BottomSheet } from "@/components/BottomSheet";
import { RequestMarker } from "@/components/RequestMarker";
import { HelperMarker } from "@/components/HelperMarker";
import { BestMatchCard } from "@/components/BestMatchCard";
import {
  MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle,
  Navigation2, Car, LocateFixed, Plus, Minus, Layers, Compass,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import { useFusedHeading } from "@/hooks/useFusedHeading";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { OrientationToggle } from "@/components/OrientationToggle";

// Cluster zoom threshold — below this zoom, request markers are grouped into
// cluster bubbles. Above it, individual React Marker components take over,
// giving the full-rich pin UX (icons, tooltips, claim buttons).
const CLUSTER_MAX_ZOOM = 12;

/** Haversine distance in miles — used for outsideServiceArea computation. */
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const [showTraffic, setShowTraffic] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  // mapZoom drives the cluster / individual-marker toggle
  const [mapZoom, setMapZoom] = useState(() => myLocation ? 13.5 : 2);
  // isOffCenter turns true when the user pans away from their location
  const [isOffCenter, setIsOffCenter] = useState(false);
  const prevHelperMode = useRef(false);

  // Stable refs for location values so moveend closure never goes stale
  const myLocationRef = useRef(myLocation);
  const ipFallbackRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => { myLocationRef.current = myLocation; }, [myLocation]);

  // Track whether the first GPS fix has been received and auto-recentered
  const hadInitialGps = useRef(!!myLocation);
  const hasAutoRecenteredOnGps = useRef(false);

  // IP-based fallback location when GPS is unavailable.
  const [ipFallback, setIpFallback] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => {
    if (myLocation) return; // GPS available — no need for IP
    getIpLocation().then(loc => {
      if (!loc) return;
      const fb = { lat: loc.lat, lng: loc.lng, zoom: loc.zoom ?? 11 };
      setIpFallback(fb);
      ipFallbackRef.current = fb;
      if (mapRef.current && !myLocationRef.current) {
        mapRef.current.jumpTo({ center: [fb.lng, fb.lat], zoom: fb.zoom });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-recenter once when the first GPS fix arrives after an IP-fallback start
  useEffect(() => {
    if (!myLocation || hadInitialGps.current || hasAutoRecenteredOnGps.current) return;
    hasAutoRecenteredOnGps.current = true;
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [myLocation.lng, myLocation.lat], zoom: 13.5, speed: 1.2 });
    }
    setIsOffCenter(false);
  }, [myLocation]);

  const onMapError = useCallback((e: unknown) => {
    const msg = (e as { error?: { message?: string } })?.error?.message ?? "Map failed to load";
    setMapError(msg);
  }, []);

  // ── Helper's own travel radius drives what the map fetches ────────────────
  // Previously hardcoded to 10 miles regardless of what the user configured
  // in Settings. The backend's claim-time check (requests.ts) enforces the
  // helper's real max_travel_miles (falling back to 15 if unset) — so a
  // helper who set a 5-mile radius could still see, and get Best-Match-carded
  // toward, requests up to 10 miles out, only to hit a distance rejection at
  // claim time. Reading the same setting here keeps the map and the backend
  // enforcement boundary in sync. Requester (non-helper) browsing uses
  // service_radius_miles instead, since max_travel_miles is a helper-only concept.
  const { data: userSettings } = useGetUserSettings(
    currentUser?.id ?? 0,
    { query: { queryKey: getGetUserSettingsQueryKey(currentUser?.id ?? 0), enabled: !!currentUser?.id } }
  );
  // 15 mirrors the backend's own fallback when max_travel_miles is unset
  // (see requests.ts claim-time check) — keep these two numbers in sync.
  const DEFAULT_RADIUS_MILES = 15;
  const radiusMiles = helperModeActive
    ? (userSettings?.max_travel_miles ?? userSettings?.service_radius_miles ?? DEFAULT_RADIUS_MILES)
    : (userSettings?.service_radius_miles ?? DEFAULT_RADIUS_MILES);

  const { data: requests = [], isSuccess: requestsLoaded } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles }) } }
  );
  const { data: helpers = [], isSuccess: helpersLoaded } = useGetOnlineHelpers(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!myLocation, queryKey: getGetOnlineHelpersQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: radiusMiles }) } }
  );
  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000 }
  });

  const [liveHelpers, setLiveHelpers] = useState<HelperLocation[]>([]);
  const [liveRequests, setLiveRequests] = useState<HelpRequest[]>([]);
  const initHelpers = useRef(false);
  const initRequests = useRef(false);

  // BUG FIX: both branches below used to require `.length > 0`, which meant
  // they were identical and a genuinely empty server response (e.g. every
  // open request nearby just got claimed/completed) could never clear
  // liveHelpers/liveRequests — the map kept showing stale markers forever.
  // Gate on `isSuccess` instead of array length so we can tell "query hasn't
  // resolved yet" (data defaults to []) apart from "query resolved with zero
  // results" (also []) — only the latter should sync an empty list into state.
  useEffect(() => {
    if (!helpersLoaded) return;
    setLiveHelpers(helpers as HelperLocation[]);
    initHelpers.current = true;
  }, [helpers, helpersLoaded]);
  useEffect(() => {
    if (!requestsLoaded) return;
    setLiveRequests(requests as HelpRequest[]);
    initRequests.current = true;
  }, [requests, requestsLoaded]);

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
      // Missed WS events during a disconnect (however brief) are gone for
      // good — deltas like REQUEST_CREATED/REQUEST_COMPLETED that fired while
      // we were offline never replay. A full resync on every reconnect is
      // the only way to guarantee the map reflects reality after any gap.
      const loc = myLocationRef.current;
      if (loc) {
        queryClient.invalidateQueries({
          queryKey: getGetNearbyRequestsQueryKey({ lat: loc.lat, lng: loc.lng, radius_miles: radiusMiles }),
        });
        queryClient.invalidateQueries({
          queryKey: getGetOnlineHelpersQueryKey({ lat: loc.lat, lng: loc.lng, radius_miles: radiusMiles }),
        });
      }
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
      // Backend broadcasts { id, name, lat, lng } — add/refresh the helper's
      // dot immediately so the map reflects the real online set without waiting
      // for the next GET /helpers/online poll.
      const newHelper = event.payload as HelperLocation;
      if (newHelper?.id != null && newHelper.lat != null && newHelper.lng != null) {
        setLiveHelpers(prev => {
          if (prev.find(h => h.id === newHelper.id)) {
            return prev.map(h => h.id === newHelper.id ? { ...h, ...newHelper } : h);
          }
          return [...prev, newHelper];
        });
      }
    } else if (event.type === "helper_offline") {
      const loc = event.payload as { id: number };
      setLiveHelpers(prev => prev.filter(h => h.id !== loc.id));
    }
  }, [currentUser?.id, queryClient, radiusMiles]));

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
  // Fused heading: blends the magnetometer compass with GPS course-over-
  // ground (myLocation.heading/.speed, already computed in AppContext).
  // GPS course dominates the blend once moving at walking pace or faster —
  // it's what stays rock-stable in a car, where the compass alone is
  // wrecked by the vehicle's metal body. See useFusedHeading.ts for the
  // full rationale.
  const fusedHeading = useFusedHeading({
    gpsHeading: myLocation?.heading ?? null,
    gpsSpeed: myLocation?.speed ?? null,
  });
  const {
    mode: orientMode,
    setMode: setOrientMode,
    applyHeading,
    followPaused,
    resumeFollow,
  } = useMapOrientation(mapRef);

  // Recenter the map on the user's current location (GPS first, then IP fallback).
  const recenterOnMe = useCallback(() => {
    const loc = myLocationRef.current ?? ipFallbackRef.current;
    if (!loc || !mapRef.current) return;
    const zoom = "zoom" in loc ? loc.zoom : 13.5;
    mapRef.current.flyTo({
      center: [loc.lng, loc.lat],
      zoom: Math.max(mapRef.current.getZoom(), zoom),
      speed: 1.4,
    });
    setIsOffCenter(false);
  }, []);

  // Track whether the camera has drifted away from the user's location.
  // Uses the raw Mapbox event (fired once per pan gesture) to avoid the
  // overhead of comparing coordinates on every move frame.
  const handleMapLoad = useCallback(() => {
    const lang = detectMapLanguage();
    if (lang !== "en" && mapRef.current) {
      localizeMapLabels(mapRef.current, lang);
    }

    mapRef.current?.on("moveend", () => {
      const map = mapRef.current;
      const loc = myLocationRef.current ?? ipFallbackRef.current;
      if (!map || !loc) return;
      const center = map.getCenter();
      const dist = Math.hypot(center.lng - loc.lng, center.lat - loc.lat);
      // ~0.002 degrees ≈ 200 m — small enough to ignore rounding noise
      setIsOffCenter(dist > 0.002);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fusedHeading !== null) applyHeading(fusedHeading); }, [fusedHeading, applyHeading]);

  const handleClaim = useCallback((request: HelpRequest) => {
    if (!currentUser) return;
    claimMutation.mutate(
      { id: request.id, data: { helper_id: currentUser.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          setLocation(`/request/${request.id}`);
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; data?: { error?: string; sensitive_category?: string } | null };
          const isSensitiveBlock = apiErr.status === 403 && apiErr.data?.sensitive_category;
          toast({
            title: isSensitiveBlock
              ? "🛡️ Verified Helper Required"
              : "Failed to claim request",
            description: apiErr.data?.error ?? "Please try again.",
            variant: "destructive",
          });
        },
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

  // GeoJSON feature collection for request markers — drives both the cluster
  // source (low zoom) and the demand heatmap layer. Re-computed only when the
  // open-requests list changes (not on every render).
  const requestsGeoJSON = useMemo((): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: openRequests.map(r => ({
      type: "Feature",
      properties: {
        id: r.id,
        urgency: r.urgency ?? "low",
        is_emergency: r.urgency === "emergency",
      },
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    })),
  }), [openRequests]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show individual React Markers only when Mapbox's cluster has already broken
  // the points into individual features (i.e. zoom > CLUSTER_MAX_ZOOM).
  const showIndividualMarkers = mapZoom > CLUSTER_MAX_ZOOM;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      {/* TopBar overlays the map — must be absolute so map fills full 100dvh */}
      <div className="absolute inset-x-0 top-0 z-20">
        <TopBar />
      </div>

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

      {/* Map fallback — shown when token missing OR WebGL unavailable */}
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-0 gap-3 px-6 pt-20 pb-28">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          {mapError.toLowerCase().includes("token") || mapError.toLowerCase().includes("not supplied") || !import.meta.env.VITE_MAPBOX_TOKEN ? (
            <>
              <p className="text-base font-bold text-center">Map token not configured</p>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                An admin needs to add <code className="bg-muted px-1 py-0.5 rounded text-xs">VITE_MAPBOX_TOKEN</code> in Replit Secrets → then restart the web workflow. Get a free token at <a href="https://account.mapbox.com" target="_blank" rel="noreferrer" className="text-primary underline">account.mapbox.com</a>.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-bold text-center">Map needs WebGL</p>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Open in Chrome or Firefox for the full live map. Requests listed below.
              </p>
            </>
          )}
          <div className="w-full max-w-sm space-y-2 mt-2">
            {openRequests.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  if (!helperModeActive) return;
                  if (!currentUser) { setLocation("/login"); return; }
                  handleClaim(r);
                }}
                className={`w-full text-left border rounded-xl p-3 transition-colors ${
                  r.urgency === "emergency"
                    ? "bg-destructive/10 border-destructive/40 hover:border-destructive"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                <div className="font-semibold text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span className="capitalize">{r.category.replace(/_/g, " ")}</span>
                  {(r.category === "childcare" || r.category === "senior_care" || r.category === "medical") && (
                    <span className="text-amber-400">🛡️</span>
                  )}
                  <span>·</span>
                  <span>{r.requester_name}</span>
                </div>
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
          longitude: myLocation?.lng ?? ipFallback?.lng ?? 0,
          latitude: myLocation?.lat ?? ipFallback?.lat ?? 0,
          zoom: myLocation ? 13.5 : ipFallback ? ipFallback.zoom : 2,
          pitch: 45,
          bearing: 0,
        }}
        onLoad={handleMapLoad}
        onZoom={e => setMapZoom(e.viewState.zoom)}
        ref={(ref) => { if (ref) (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = ref.getMap(); }}
      >
        {/* ── My location dot with accuracy ring ──────────────────────────── */}
        {myLocation && (
          <Marker longitude={myLocation.lng} latitude={myLocation.lat} anchor="center">
            <div className="relative flex items-center justify-center w-8 h-8">
              <div className="absolute w-8 h-8 bg-primary rounded-full opacity-15 animate-ping" style={{ animationDuration: "2s" }} />
              <div className="absolute w-5 h-5 bg-primary rounded-full opacity-25 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
              <div className="w-3 h-3 bg-primary rounded-full shadow-[0_0_12px_rgba(0,212,255,0.9)] border-2 border-background" />
            </div>
          </Marker>
        )}

        {/* ── Real-time traffic layer ──────────────────────────────────────── */}
        {showTraffic && (
          <Source id="mapbox-traffic" type="vector" url="mapbox://mapbox.mapbox-traffic-v1">
            <Layer
              id="traffic-flow"
              type="line"
              source-layer="traffic"
              paint={{
                "line-color": [
                  "match", ["get", "congestion"],
                  "low",      "#4ade80",
                  "moderate", "#facc15",
                  "heavy",    "#f97316",
                  "severe",   "#ef4444",
                  "#94a3b8",
                ],
                "line-width": 2.5,
                "line-opacity": 0.55,
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}

        {/* ── Demand heatmap (admin / helper insight) ──────────────────────── */}
        {showHeatmap && openRequests.length > 0 && (
          <Source id="heatmap-source" type="geojson" data={requestsGeoJSON}>
            <Layer
              id="demand-heatmap"
              type="heatmap"
              paint={{
                // Weight emergency requests 3× higher in the heatmap
                "heatmap-weight": [
                  "case", ["==", ["get", "urgency"], "emergency"], 3,
                  ["case", ["==", ["get", "urgency"], "high"], 2, 1],
                ],
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 2.5],
                "heatmap-color": [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0,   "rgba(0,212,255,0)",
                  0.2, "rgba(0,212,255,0.25)",
                  0.5, "rgba(100,200,255,0.5)",
                  0.8, "rgba(255,220,0,0.7)",
                  1,   "rgba(255,80,0,0.85)",
                ],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 14, 50],
                "heatmap-opacity": 0.75,
              }}
            />
          </Source>
        )}

        {/* ── Request clusters (low zoom) ──────────────────────────────────── */}
        {/* Cluster source — at zoom ≤ CLUSTER_MAX_ZOOM Mapbox groups nearby  */}
        {/* request pins into colored bubble clusters. At higher zoom the       */}
        {/* cluster breaks apart and individual React Markers take over.         */}
        {openRequests.length > 0 && (
          <Source
            id="requests-cluster"
            type="geojson"
            data={requestsGeoJSON}
            cluster={true}
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            clusterRadius={55}
          >
            {/* Cluster bubble — color steps from green → yellow → red */}
            <Layer
              id="request-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "step", ["get", "point_count"],
                  "#4ade80",   /* 1–4   → green  */
                  5,  "#facc15", /* 5–14  → yellow */
                  15, "#ef4444", /* 15+   → red    */
                ],
                "circle-radius": [
                  "step", ["get", "point_count"],
                  22,   /* 1–4   → 22 px */
                  5,  32, /* 5–14  → 32 px */
                  15, 44, /* 15+   → 44 px */
                ],
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "rgba(0,0,0,0.5)",
                "circle-opacity": 0.88,
              }}
            />
            {/* Cluster count label */}
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-size": 13,
                "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
              }}
              paint={{ "text-color": "#000" }}
            />
            {/* Unclustered single points — rendered when a request has no
                neighbor within the cluster radius (typically isolated open
                requests in quiet areas or when user first loads without GPS).
                Without this layer these points are invisible below zoom 12
                because the React <Marker> pins only mount above CLUSTER_MAX_ZOOM. */}
            <Layer
              id="unclustered-point"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": [
                  "case",
                  ["==", ["get", "urgency"], "emergency"], "#ef4444",
                  ["==", ["get", "urgency"], "high"],      "#f97316",
                  ["==", ["get", "urgency"], "medium"],    "#eab308",
                  "#22d3ee",
                ],
                "circle-radius": 10,
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#fff",
                "circle-opacity": 0.92,
              }}
            />
          </Source>
        )}

        {/* ── Online helpers — animated dots ──────────────────────────────── */}
        {displayHelpers.map(h => (
          <Marker key={h.id} longitude={h.lng} latitude={h.lat} anchor="center">
            <HelperMarker helper={h} />
          </Marker>
        ))}

        {/* ── Individual request markers (high zoom only) ─────────────────── */}
        {/* Only rendered when the cluster source has broken up, preventing    */}
        {/* duplicate pins — cluster at ≤ 12, React Markers at > 12.           */}
        {showIndividualMarkers && openRequests.map(r => (
          <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor="bottom">
            <RequestMarker
              request={r}
              outsideServiceArea={
                helperModeActive &&
                myLocation != null &&
                haversineDistanceMiles(myLocation.lat, myLocation.lng, r.lat, r.lng) > radiusMiles
              }
            />
          </Marker>
        ))}

        {/* ── Live route line ──────────────────────────────────────────────── */}
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

        {/* ── Map control buttons ──────────────────────────────────────────── */}
        {/* Traffic toggle */}
        <button
          onClick={() => setShowTraffic(t => !t)}
          style={{ touchAction: "manipulation" }}
          aria-label="Toggle traffic layer"
          aria-pressed={showTraffic}
          className={`absolute bottom-24 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showTraffic
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Car className="w-3 h-3" />
          <span>Traffic</span>
        </button>

        {/* Demand heatmap toggle — helps helpers see where demand is densest */}
        <button
          onClick={() => setShowHeatmap(h => !h)}
          style={{ touchAction: "manipulation" }}
          aria-label="Toggle demand heatmap"
          aria-pressed={showHeatmap}
          className={`absolute bottom-24 left-24 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showHeatmap
              ? "bg-yellow-400/20 border-yellow-400/50 text-yellow-400"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Heat</span>
        </button>

        {/* Zoom controls — right edge */}
        <div className="absolute bottom-28 right-4 z-10 flex flex-col gap-1.5">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            style={{ touchAction: "manipulation" }}
            className="w-10 h-10 flex items-center justify-center bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-md text-foreground active:scale-95 transition-transform"
            aria-label="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            style={{ touchAction: "manipulation" }}
            className="w-10 h-10 flex items-center justify-center bg-card/90 backdrop-blur-sm border border-border rounded-full shadow-md text-foreground active:scale-95 transition-transform"
            aria-label="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Recenter on me — only shown when the user has panned away */}
        {isOffCenter && (myLocation ?? ipFallback) && (
          <button
            onClick={recenterOnMe}
            style={{ touchAction: "manipulation" }}
            className="absolute bottom-44 right-4 z-10 w-11 h-11 flex items-center justify-center bg-primary text-background rounded-full shadow-lg active:scale-95 transition-transform animate-bounce"
            aria-label="Recenter on my location"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        )}

        <OrientationToggle mode={orientMode} onToggle={() => setOrientMode(orientMode === "heading-up" ? "north-up" : "heading-up")} />

        {/* Shown only after the user manually rotates the map while in    */}
        {/* Heading Up mode — auto-follow pauses instead of fighting their  */}
        {/* fingers on the next compass tick. Tap to hand control back to   */}
        {/* the compass/GPS, matching the Google Maps / Waze pattern.       */}
        {orientMode === "heading-up" && followPaused && (
          <button
            onClick={resumeFollow}
            style={{ touchAction: "manipulation" }}
            className="absolute bottom-[322px] left-4 z-30 flex items-center gap-1.5 bg-primary text-background rounded-full px-3 py-1.5 shadow-lg active:scale-95 transition-transform"
          >
            <Compass className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-widest">Resume Compass</span>
          </button>
        )}
      </Map>

      {/* Best Match card — helper-mode only, shows top open request nearby */}
      {showBestMatch && !mapError && (
        <BestMatchCard
          bestMatch={bestMatch}
          onAccept={handleClaim}
          onDismiss={() => setBestMatchDismissed(bestMatch.id)}
          isClaiming={claimMutation.isPending}
        />
      )}

      {/* Helper mode bottom sheet */}
      {helperModeActive && openRequests.length > 0 && !mapError && !showBestMatch && (
        <BottomSheet requests={openRequests} onClaim={handleClaim} isClaiming={claimMutation.isPending} />
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
