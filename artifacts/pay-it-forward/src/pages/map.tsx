import { useState, useCallback, useRef, useEffect } from "react";
import type mapboxgl from "mapbox-gl";
import { useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { getIpLocation, detectMapLanguage, localizeMapLabels } from "@/lib/locale-utils";
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
import { BestMatchCard } from "@/components/BestMatchCard";
import { MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle, Navigation2, Car } from "lucide-react";
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
  const [showTraffic, setShowTraffic] = useState(true);
  const prevHelperMode = useRef(false);

  // IP-based fallback location when GPS is unavailable.
  // Covers global users (Africa, diaspora hubs, rural areas) where the old
  // Fort Worth hardcoded default was useless.
  const [ipFallback, setIpFallback] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => {
    if (myLocation) return; // GPS available — no need for IP
    getIpLocation().then(loc => {
      if (!loc) return;
      const fb = { lat: loc.lat, lng: loc.lng, zoom: loc.zoom ?? 11 };
      setIpFallback(fb);
      // initialViewState is only read at mount time, so if the async IP lookup
      // resolves after the map has already rendered at (0,0), we must also
      // explicitly move the camera. mapRef may not be set yet if the map hasn't
      // mounted — the check guards against that.
      if (mapRef.current && !myLocation) {
        mapRef.current.jumpTo({ center: [fb.lng, fb.lat], zoom: fb.zoom });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Apply localized map labels after map loads — runs once, safe to omit stable deps
  const handleMapLoad = useCallback(() => {
    const lang = detectMapLanguage();
    if (lang !== "en" && mapRef.current) {
      localizeMapLabels(mapRef.current, lang);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

        {/* Real-time traffic layer — same data source as the navigation view */}
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

        {/* Traffic toggle — bottom-left of map */}
        <button
          onClick={() => setShowTraffic(t => !t)}
          style={{ touchAction: "manipulation" }}
          className={`absolute bottom-24 left-4 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black backdrop-blur-sm transition-all active:scale-95 ${
            showTraffic
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/80 border-border text-muted-foreground"
          }`}
        >
          <Car className="w-3 h-3" />
          <span>Traffic</span>
        </button>

        <OrientationToggle mode={orientMode} onToggle={() => setOrientMode(orientMode === "heading-up" ? "north-up" : "heading-up")} />
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
