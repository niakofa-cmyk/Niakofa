import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type mapboxgl from "mapbox-gl";
import { useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { getIpLocation, detectMapLanguage, localizeMapLabels } from "@/lib/locale-utils";
import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute, useGetUserSettings, useGetRequest,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRequestQueryKey, getGetRouteQueryKey,
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
  Navigation2, Car, LocateFixed, Plus, Layers, Compass, SlidersHorizontal,
  Search, X as XIcon, Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import { useFusedHeading } from "@/hooks/useFusedHeading";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { OrientationToggle } from "@/components/OrientationToggle";
import { LastUpdated } from "@/components/LastUpdated";
import { RequestListView } from "@/components/RequestListView";
import { haptic } from "@/lib/haptics";

// Module-level: resolved once at import time, not on every render.
// Detecting a missing token here (rather than inside the component) means
// the error is caught before MapScreen mounts and before Mapbox fires any
// async failures, preventing spurious billing noise on misconfigured deploys.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Read once at module scope — deviceMemory can't change mid-session, so
// there's no reason to recompute this on every render the way a useState/
// plain-const-in-component would.
const IS_LOW_END_DEVICE =
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory != null &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4;

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
  const { currentUser, helperModeActive, myLocation, activeRequestId } = useAppContext();
  const queryClient = useQueryClient();
  // MAPBOX_TOKEN is resolved at module level (see top of file) so this check
  // never re-evaluates on re-renders. useState lazy initializer reads it once.
  const [mapError, setMapError] = useState<string | null>(() =>
    !MAPBOX_TOKEN ? "Mapbox token not supplied" : null
  );
  const [wsConnected, setWsConnected] = useState(() => wsIsConnected());
  const [statsVisible, setStatsVisible] = useState(true);
  const [bestMatchDismissed, setBestMatchDismissed] = useState<number | null>(null);
  const [showTraffic, setShowTraffic] = useState(() => !IS_LOW_END_DEVICE);
  const [showHeatmap, setShowHeatmap] = useState(false);
  // Request id whose map pin was just tapped — links the pin to its card in
  // the BottomSheet instead of the pin being a dead end at high zoom.
  const [highlightedRequestId, setHighlightedRequestId] = useState<number | null>(null);
  // "Job in progress" banner dismissal — per-request, so returning to a
  // still-active job after dismissing shows the reminder again if a NEW job
  // becomes active, but not if they already acknowledged this one.
  const [activeJobBannerDismissed, setActiveJobBannerDismissed] = useState<number | null>(null);
  // Diaspora helper matching: filter online helpers by language/heritage
  const [helperLanguageFilter, setHelperLanguageFilter] = useState<string | null>(null);
  // Category/urgency filters for the requests shown on the map — narrows
  // both the pins and the helper-mode bottom sheet without touching the
  // underlying fetch (filtering happens client-side on the already-loaded set).
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  // Consolidated control row — previously 4 separately-positioned buttons
  // (Traffic, Heat, Language, Category/Urgency) each at a hardcoded pixel
  // offset (left-4/left-24/left-44/left-[188px]), 2 of which opened their
  // own popups that could overlap. Now there are exactly two triggers:
  // "Filters" (who/what to show — category, urgency, language) and "Layers"
  // (how to show the map — traffic, heatmap), each opening one bottom sheet.
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [showLayersSheet, setShowLayersSheet] = useState(false);
  // "Search this area" — when the user pans away from their own location,
  // they can opt to re-query using the map's current center instead of
  // their GPS/IP location, so browsing a different neighborhood actually
  // shows that neighborhood's requests instead of always the user's own.
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);

  // ── Forward address search — expandable from the TopBar. Distinct from
  // the reverse-geocoding above (map center → county name): this lets a
  // user TYPE an address/place and jump straight to it, mirroring the
  // pattern already proven out on request-new.tsx.
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressSearching, setAddressSearching] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── View mode — Map (default) or List. The list is a fully accessible,
  // sortable alternative to precise pin-tapping (closest / most urgent /
  // highest paying) that needs no map or WebGL to use.
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  // ── Coverage banner — mirrors request-new.tsx's geo-matched community logic
  // so the map tells a browsing user their area isn't covered yet, the same
  // way request-new.tsx already does at posting time. No fallback to
  // communities[0] once a center exists — no match must render as "not
  // covered", never as an arbitrary pool.
  interface CommunityOption { id: number; name: string }
  const [coverageCommunities, setCoverageCommunities] = useState<CommunityOption[]>([]);
  const [coverageMatch, setCoverageMatch] = useState<CommunityOption | null>(null);
  const [coverageDetecting, setCoverageDetecting] = useState(false);
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/communities`)
      .then(r => r.ok ? r.json() : { communities: [] })
      .then((j: { communities: CommunityOption[] }) => { if (Array.isArray(j.communities)) setCoverageCommunities(j.communities); })
      .catch(() => {});
  }, []);
  // mapZoom drives the cluster / individual-marker toggle
  const [mapZoom, setMapZoom] = useState(() => myLocation ? 13.5 : 2);
  // isOffCenter turns true when the user pans away from their location
  const [isOffCenter, setIsOffCenter] = useState(false);
  const prevHelperMode = useRef(false);

  // Stable refs for location values so moveend closure never goes stale
  const myLocationRef = useRef(myLocation);
  const ipFallbackRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => { myLocationRef.current = myLocation; }, [myLocation]);
  const searchCenterRef = useRef(searchCenter);
  useEffect(() => { searchCenterRef.current = searchCenter; }, [searchCenter]);

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

  // Effective query center: the map's own "search this area" center wins over
  // the user's real GPS/IP location whenever one has been set (i.e. the user
  // explicitly panned somewhere else and asked to browse it).
  const effectiveCenter = searchCenter ?? myLocation;

  const { data: requests = [], isSuccess: requestsLoaded, dataUpdatedAt: requestsUpdatedAt, refetch: refetchRequests, isFetching: requestsFetching } = useGetNearbyRequests(
    { lat: effectiveCenter?.lat || 0, lng: effectiveCenter?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!effectiveCenter, queryKey: getGetNearbyRequestsQueryKey({ lat: effectiveCenter?.lat || 0, lng: effectiveCenter?.lng || 0, radius_miles: radiusMiles }) } }
  );
  const { data: helpers = [], isSuccess: helpersLoaded, refetch: refetchHelpers } = useGetOnlineHelpers(
    { lat: effectiveCenter?.lat || 0, lng: effectiveCenter?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!effectiveCenter, queryKey: getGetOnlineHelpersQueryKey({ lat: effectiveCenter?.lat || 0, lng: effectiveCenter?.lng || 0, radius_miles: radiusMiles }) } }
  );
  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000 }
  });

  // Reverse-geocode the effective center → match county, same approach as
  // request-new.tsx's pin-matching logic. Debounced implicitly by only
  // re-running when the rounded center actually moves.
  useEffect(() => {
    if (!effectiveCenter || coverageCommunities.length === 0) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return;
    setCoverageDetecting(true);
    const { lat, lng } = effectiveCenter;
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=district,place&limit=1&access_token=${token}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { features?: { text: string; context?: { text: string }[] }[] } | null) => {
        if (!data?.features?.length) { setCoverageMatch(null); return; }
        const feature = data.features[0]!;
        const candidates = [feature.text, ...(feature.context ?? []).map(c => c.text)]
          .map(s => s.toLowerCase().replace(/\s+county$/i, "").trim());
        const match = coverageCommunities.find(c => {
          const normalized = c.name.toLowerCase().replace(/\s+county$/i, "").trim();
          return candidates.some(cand => cand.includes(normalized) || normalized.includes(cand));
        }) ?? null;
        setCoverageMatch(match);
      })
      .catch(() => setCoverageMatch(null))
      .finally(() => setCoverageDetecting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCenter?.lat.toFixed(2), effectiveCenter?.lng.toFixed(2), coverageCommunities]);
  const coverageOutside = !!effectiveCenter && !coverageDetecting && !coverageMatch;

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
      const loc = searchCenterRef.current ?? myLocationRef.current;
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
          haptic("warning");
        } else {
          toast({ title: "📍 New request nearby", description: req.title });
        }
        return [req, ...prev];
      });
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
    } else if (event.type === "REQUEST_ACCEPTED" || event.type === "HELPER_MOVING" || event.type === "HELPER_ARRIVED" || event.type === "REQUEST_COMPLETED" || event.type === "REQUEST_CANCELLED" || event.type === "request_updated") {
      const req = event.payload as HelpRequest & { requester_id?: number };
      // Auto-navigate requester to tracking screen when their request gets claimed.
      // This ensures the requester doesn't stay on the idle map after a helper accepts.
      if (
        event.type === "REQUEST_ACCEPTED" &&
        req.requester_id != null &&
        currentUser?.id != null &&
        req.requester_id === currentUser.id &&
        req.id != null
      ) {
        toast({ title: "🎉 Helper found!", description: "A helper is on their way to you." });
        setLocation(`/request/${req.id}/track`);
        return;
      }
      // A highlighted pin (tapped on the map) that leaves the open set —
      // claimed by someone else, cancelled, or completed — would otherwise
      // leave highlightedRequestId pointing at nothing. Harmless (claiming
      // it yourself navigates away first) but stale, so clear it here.
      if (req.id === highlightedRequestId && req.status !== "open") {
        setHighlightedRequestId(null);
      }
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
  }, [currentUser?.id, queryClient, radiusMiles, setLocation, highlightedRequestId]));

  const activeHelper = activeHelperRoute
    ? (Array.isArray(liveHelpers) ? liveHelpers : []).find(h => h.id === activeHelperRoute.helperId)
    : null;
  const activeRequest = activeHelperRoute
    ? (Array.isArray(liveRequests) ? liveRequests : []).find(r => r.id === activeHelperRoute.requestId) ??
      (requests as HelpRequest[]).find(r => r.id === activeHelperRoute.requestId) ?? null
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

  // "Job in progress" reminder — a helper mid-job (claimed/en_route/arrived)
  // who navigates back to Nearby/browse would otherwise see no trace of
  // that job on this screen. Fetched by id since an active job is no longer
  // in the "open" nearby-requests list once claimed.
  const { data: activeJobRequest } = useGetRequest(activeRequestId ?? 0, {
    query: { enabled: activeRequestId != null, queryKey: getGetRequestQueryKey(activeRequestId ?? 0) },
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
  // Also clears any "search this area" override so subsequent fetches go back
  // to querying around the user's real location.
  const recenterOnMe = useCallback(() => {
    const loc = myLocationRef.current ?? ipFallbackRef.current;
    setSearchCenter(null);
    if (!loc || !mapRef.current) return;
    const zoom = "zoom" in loc ? loc.zoom : 13.5;
    mapRef.current.flyTo({
      center: [loc.lng, loc.lat],
      zoom: Math.max(mapRef.current.getZoom(), zoom),
      speed: 1.4,
    });
    setIsOffCenter(false);
    haptic("light");
  }, []);

  // "Search this area" — re-query requests/helpers centered on wherever the
  // map is currently panned, instead of always the user's own location.
  const searchThisArea = useCallback(() => {
    if (!mapRef.current) return;
    const center = mapRef.current.getCenter();
    setSearchCenter({ lat: center.lat, lng: center.lng });
  }, []);

  // Forward geocoding for the address search box — same debounced-suggestion
  // pattern as request-new.tsx's pickup-location search, so both address
  // boxes in the app behave identically.
  const handleAddressSearch = useCallback((value: string) => {
    setAddressSearch(value);
    if (!value.trim()) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(async () => {
      if (!MAPBOX_TOKEN) return;
      setAddressSearching(true);
      try {
        const center = myLocationRef.current ?? ipFallbackRef.current;
        const proximity = center ? `&proximity=${center.lng},${center.lat}` : "";
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?limit=5&types=address,place,neighborhood,locality${proximity}&access_token=${MAPBOX_TOKEN}`
        );
        if (!res.ok) return;
        const data = await res.json() as { features?: { place_name: string; center: [number, number] }[] };
        setAddressSuggestions(data.features ?? []);
        setShowAddressSuggestions(true);
      } catch { /* silently ignore — same fail-quiet behavior as request-new.tsx */ }
      finally { setAddressSearching(false); }
    }, 400);
  }, []);

  // Selecting a suggestion both flies the map there AND sets it as the
  // search center immediately — the user already typed an explicit place,
  // so requiring a second "Search this area" tap would be redundant.
  const handleSelectAddress = useCallback((suggestion: { place_name: string; center: [number, number] }) => {
    const [lng, lat] = suggestion.center;
    setAddressSearch(suggestion.place_name);
    setShowAddressSuggestions(false);
    setShowSearchBar(false);
    setSearchCenter({ lat, lng });
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 14, speed: 1.4 });
    }
    setIsOffCenter(false);
    haptic("light");
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
  const openRequestsAll = safeRequests.filter(r => r.status === "open");
  // emergencyRequests/stats pills always reflect the FULL open set, regardless
  // of category/urgency filtering — filters narrow what's shown on the map,
  // they shouldn't hide the fact that an emergency exists nearby.
  const emergencyRequests = openRequestsAll.filter(r => r.urgency === "emergency");
  const availableCategories = useMemo(
    () => Array.from(new Set(openRequestsAll.map(r => r.category))).sort(),
    [openRequestsAll],
  );
  const openRequests = openRequestsAll.filter(r => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (urgencyFilter && (r.urgency ?? "low") !== urgencyFilter) return false;
    return true;
  });

  // Density-aware cluster radius — a single static clusterRadius either
  // over-clumps a dense city (hiding how many distinct areas have requests)
  // or under-clumps a sparse rural area (scattering isolated dots that never
  // group at all). Instead, size the radius to how many points are actually
  // on screen: few points get a WIDER radius so they still form readable
  // clusters instead of a field of lone dots; many points get a TIGHTER
  // radius so a dense city doesn't collapse into one giant blob that hides
  // neighborhood-level structure.
  const dynamicClusterRadius = useMemo(() => {
    const n = openRequests.length;
    if (n <= 8) return 70;
    if (n <= 25) return 55;
    if (n <= 60) return 40;
    return 28;
  }, [openRequests.length]);
  // Apply diaspora language filter when active — keeps self-dot off the map
  const displayHelpers = safeHelpers
    .filter(h => h.id !== currentUser?.id)
    .filter(h => {
      if (!helperLanguageFilter) return true;
      const langs: string[] = ((h as { languages?: string[] }).languages ?? []).map((l: string) => l.toLowerCase());
      return langs.includes(helperLanguageFilter.toLowerCase());
    });

  // Dispatch Intelligence — Best Match card
  const bestMatch = helperModeActive ? pickBestMatch(openRequests) : null;
  const showBestMatch = bestMatch && bestMatch.id !== bestMatchDismissed;

  // Live ETA for the Best Match candidate — same route-fetch pattern used
  // for the active in-progress job, so the card shows a real number instead
  // of asking the helper to eyeball distance-in-miles as time.
  const routeForBestMatch = {
    start_lat: myLocation?.lat || 0,
    start_lng: myLocation?.lng || 0,
    end_lat: bestMatch?.lat || 0,
    end_lng: bestMatch?.lng || 0,
  };
  const { data: bestMatchRouteData } = useGetRoute(routeForBestMatch, {
    query: {
      enabled: !!(showBestMatch && myLocation),
      queryKey: getGetRouteQueryKey(routeForBestMatch),
    },
  });
  const bestMatchEtaMinutes = bestMatchRouteData?.duration_seconds != null
    ? Math.round(bestMatchRouteData.duration_seconds / 60)
    : null;

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

  // ── Single top-center status slot ──────────────────────────────────────
  // Previously up to FOUR different things fought for the same top/center
  // real estate at different times (coverage banner, "Search this area",
  // "Browsing this area", "Online — waiting for requests") plus a
  // "Resume Compass" button hand-tuned to bottom-[322px] to avoid whatever
  // else happened to be on screen. One slot, one priority order, one thing
  // shown at a time — the messages take turns instead of each claiming
  // their own bespoke position.
  //   1. Resume Compass — the user just manually rotated the map; that
  //      needs acknowledging before anything else.
  //   2. Search/Browsing this area — an active browsing-away state.
  //   3. Coverage banner — this area has no Community Pool yet.
  //   4. Helper-mode "waiting for requests" — lowest priority, purely idle.
  // The first three only apply once the interactive map is actually up
  // (mapError-free); the coverage banner and idle message are meaningful
  // even on the WebGL-fallback screen, so they aren't gated on mapError.
  type MapStatus =
    | { kind: "resume-compass" }
    | { kind: "search-this-area" }
    | { kind: "browsing-this-area" }
    | { kind: "active-job" }
    | { kind: "coverage-outside" }
    | { kind: "helper-waiting" }
    | null;
  // "Job in progress" reminder — sits above the coverage/idle chatter (this
  // is actionable, they have somewhere specific to be) but below the two
  // states that need immediate acknowledgment (a manual rotate, or an
  // explicit "search this area" prompt they just triggered).
  const showActiveJobBanner = activeRequestId != null && activeJobBannerDismissed !== activeRequestId;
  const mapStatus: MapStatus = !mapError && orientMode === "heading-up" && followPaused
    ? { kind: "resume-compass" }
    : !mapError && isOffCenter && !searchCenter
    ? { kind: "search-this-area" }
    : !mapError && !!searchCenter
    ? { kind: "browsing-this-area" }
    : showActiveJobBanner
    ? { kind: "active-job" }
    : coverageOutside
    ? { kind: "coverage-outside" }
    : helperModeActive && openRequests.length === 0
    ? { kind: "helper-waiting" }
    : null;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      {/* TopBar overlays the map — must be absolute so map fills full 100dvh */}
      <div className="absolute inset-x-0 top-0 z-20">
        <TopBar
          onSearchToggle={() => setShowSearchBar(v => !v)}
          searchActive={showSearchBar}
          viewMode={viewMode}
          onToggleView={() => setViewMode(v => (v === "map" ? "list" : "map"))}
        />
      </div>

      {/* Expandable address search — forward geocoding, distinct from the
          reverse-geocoding coverage check above. Sits just under the
          TopBar row; z-25 keeps it above the map's own overlays (z-10/z-20)
          but below nothing else needs to beat it while open. */}
      {showSearchBar && (
        <div className="absolute top-16 left-4 right-4 z-[25]">
          <div className="flex items-center gap-2 bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-xl">
            {addressSearching
              ? <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
              : <Search className="w-4 h-4 text-muted-foreground shrink-0" />}
            <input
              type="text"
              autoFocus
              value={addressSearch}
              onChange={e => handleAddressSearch(e.target.value)}
              onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
              placeholder="Search an address or place…"
              aria-label="Search an address or place"
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
              style={{ fontSize: "16px" }}
            />
            {addressSearch && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setAddressSearch(""); setAddressSuggestions([]); setShowAddressSuggestions(false); }}
              >
                <XIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          {showAddressSuggestions && addressSuggestions.length > 0 && (
            <div className="mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {addressSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectAddress(s)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 border-b border-border/50 last:border-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{s.place_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accessible list view — full-screen alternative to the pin map,
          same open-requests data sortable by closest / most urgent /
          highest paying. Available regardless of mapError so it also
          serves as a WebGL-free fallback for browsing open requests. */}
      {viewMode === "list" && (
        <RequestListView
          requests={openRequests}
          onClaim={handleClaim}
          isClaiming={claimMutation.isPending}
          serviceRadiusMiles={radiusMiles}
          helperModeActive={helperModeActive}
        />
      )}

      {/* Single status slot — see mapStatus computation above. Positioned
          identically regardless of which message is active, so nothing
          jumps around or competes for space; right-24 keeps clear of the
          live-stats stack anchored top-right. */}
      {mapStatus && (
        <div className="absolute top-20 left-4 right-24 z-10 flex justify-center">
          {mapStatus.kind === "resume-compass" && (
            <button
              onClick={resumeFollow}
              style={{ touchAction: "manipulation" }}
              className="flex items-center gap-1.5 bg-primary text-background rounded-full px-3 py-1.5 shadow-lg active:scale-95 transition-transform"
            >
              <Compass className="w-3 h-3" />
              <span className="text-[10px] font-black uppercase tracking-widest">Resume Compass</span>
            </button>
          )}
          {mapStatus.kind === "search-this-area" && (
            <button
              onClick={searchThisArea}
              style={{ touchAction: "manipulation" }}
              className="flex items-center gap-1.5 bg-primary text-background px-4 py-2 rounded-full shadow-lg active:scale-95 transition-transform text-xs font-black"
            >
              <MapPin className="w-3.5 h-3.5" />
              Search this area
            </button>
          )}
          {mapStatus.kind === "browsing-this-area" && (
            <button
              onClick={recenterOnMe}
              style={{ touchAction: "manipulation" }}
              className="flex items-center gap-1.5 bg-card/90 backdrop-blur-sm border border-primary/40 text-primary px-3 py-1.5 rounded-full shadow-md text-[10px] font-bold"
            >
              Browsing this area · tap to return to your location
            </button>
          )}
          {mapStatus.kind === "active-job" && (
            <button
              onClick={() => setLocation(`/request/${activeRequestId}/track`)}
              style={{ touchAction: "manipulation" }}
              className="flex items-center gap-2 bg-primary/15 backdrop-blur-md border border-primary/40 text-primary px-3 py-2 rounded-xl shadow-lg active:scale-95 transition-transform pointer-events-auto"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-[11px] font-bold leading-tight text-left">
                Job in progress{activeJobRequest ? `: ${(activeJobRequest as HelpRequest).title}` : ""} · tap to return
              </span>
              <span
                role="button"
                aria-label="Dismiss job in progress reminder"
                onClick={(e) => { e.stopPropagation(); setActiveJobBannerDismissed(activeRequestId); }}
                className="ml-1 text-primary/60 font-black px-1"
              >
                ×
              </span>
            </button>
          )}
          {mapStatus.kind === "coverage-outside" && (
            <div className="flex items-center gap-2 bg-amber-500/15 backdrop-blur-md border border-amber-500/40 px-3 py-2 rounded-xl shadow-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-semibold text-amber-400 leading-tight">
                This area doesn't have an active Community Pool yet — you can still post and connect directly with neighbors.
              </span>
            </div>
          )}
          {mapStatus.kind === "helper-waiting" && (
            <div className="flex items-center gap-2 bg-card/70 backdrop-blur-sm border border-green-500/30 px-4 py-2 rounded-full shadow-md pointer-events-none">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-green-400 whitespace-nowrap">Online — waiting for nearby requests</p>
            </div>
          )}
        </div>
      )}

      {/* Screen-reader-only live summary — the stats stack above is purely
          visual (small pills a sighted user glances at); without this, a
          screen-reader user gets no announcement when counts change. Kept
          separate from the visual stack so it isn't affected by
          statsVisible/hide-on-tap. */}
      <div className="sr-only" aria-live="polite">
        {displayHelpers.length} helper{displayHelpers.length !== 1 ? "s" : ""} online,{" "}
        {openRequests.length} open request{openRequests.length !== 1 ? "s" : ""}
        {emergencyRequests.length > 0 ? `, ${emergencyRequests.length} emergency` : ""}.
      </div>

      {/* Live stats overlay — top-right, uses real-time WS-updated counts */}
      {statsVisible && (
        <div
          className="absolute top-20 right-4 z-10 flex flex-col gap-1 cursor-pointer"
          onClick={() => setStatsVisible(false)}
          title="Tap to hide"
        >
          {/* Connection status pill */}
          <div className={`flex items-center gap-1.5 backdrop-blur-md border px-2.5 py-1.5 rounded-full shadow-lg transition-colors ${
            wsConnected
              ? "bg-green-500/10 border-green-500/30"
              : "bg-card/80 border-border"
          }`}>
            {wsConnected
              ? <Wifi className="w-3 h-3 text-green-400" />
              : <WifiOff className="w-3 h-3 text-muted-foreground" />}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${wsConnected ? "text-green-400" : "text-muted-foreground"}`}>
              {wsConnected ? "Live" : "Reconnecting"}
            </span>
          </div>
          {/* Live helper count — from real-time WS-maintained liveHelpers array */}
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
            <Users className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary tabular-nums">
              {displayHelpers.length} helper{displayHelpers.length !== 1 ? "s" : ""} online
            </span>
          </div>
          {/* Open request count — live from WS-maintained liveRequests */}
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
            <Activity className="w-3 h-3 text-yellow-400" />
            <span className="text-[10px] font-bold text-yellow-400 tabular-nums">
              {openRequests.length} open request{openRequests.length !== 1 ? "s" : ""}
            </span>
          </div>
          {emergencyRequests.length > 0 && (
            <div className="flex items-center gap-1.5 bg-destructive/20 backdrop-blur-md border border-destructive/50 px-2.5 py-1.5 rounded-full shadow-lg animate-pulse">
              <AlertTriangle className="w-3 h-3 text-destructive" />
              <span className="text-[10px] font-bold text-destructive">{emergencyRequests.length} emergency</span>
            </div>
          )}
          {activeHelperRoute && (
            <div className="flex items-center gap-1.5 bg-primary/10 backdrop-blur-md border border-primary/30 px-2.5 py-1.5 rounded-full shadow-lg">
              <Navigation2 className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-primary">En Route</span>
            </div>
          )}
          {/* Freshness indicator + manual refresh — replaces the old
              "stale after 5 minutes" one-shot button with the shared
              LastUpdated component used elsewhere (Griot Globe, hub-leader
              dashboard) so every polling screen in the app reads the same way. */}
          {requestsLoaded && (
            <div onClick={(e) => e.stopPropagation()}>
              <LastUpdated
                lastUpdated={requestsUpdatedAt > 0 ? new Date(requestsUpdatedAt) : null}
                refreshing={requestsFetching}
                onRefresh={() => { refetchRequests(); refetchHelpers(); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Map fallback — shown when token missing OR WebGL unavailable.
          We use z-10 so it layers above the (conditionally-rendered) Map div.
          When the token is missing we skip the <Map> component entirely to avoid
          Mapbox making API calls it can't complete and logging auth errors. */}
      {mapError && viewMode === "map" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-3 px-6 pt-20 pb-28">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          {!MAPBOX_TOKEN || mapError.toLowerCase().includes("token") || mapError.toLowerCase().includes("not supplied") ? (
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
          {/* Fallback request list — lets helpers claim nearby requests even
              without the map. Buttons are disabled (with tooltip) when the user
              hasn't switched into helper mode, preventing accidental taps and
              eliminating the silent-no-op from before this fix. */}
          {openRequests.length > 0 && (
            <div className="w-full max-w-sm space-y-2 mt-2">
              {!helperModeActive && (
                <p className="text-center text-xs text-muted-foreground mb-1">
                  Switch to Helper Mode in the top bar to claim requests.
                </p>
              )}
              {openRequests.map(r => {
                const canClaim = helperModeActive && !!currentUser && !claimMutation.isPending;
                return (
                  <button
                    key={r.id}
                    disabled={!canClaim}
                    onClick={() => {
                      if (!currentUser) { setLocation("/login"); return; }
                      handleClaim(r);
                    }}
                    className={`w-full text-left border rounded-xl p-3 transition-colors ${
                      r.urgency === "emergency"
                        ? "bg-destructive/10 border-destructive/40 hover:border-destructive"
                        : "bg-card border-border hover:border-primary/50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-semibold text-sm">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <span className="capitalize">{r.category.replace(/_/g, " ")}</span>
                      {(r.category === "childcare" || r.category === "senior_care" || r.category === "medical") && (
                        <span className="text-amber-400">🛡️</span>
                      )}
                      <span>·</span>
                      <span>{r.requester_name}</span>
                      {claimMutation.isPending && <span className="ml-auto text-[10px] text-muted-foreground">Claiming…</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Only mount the Mapbox GL component when a token is present.
          Without this guard, the Map constructor still fires requests to the
          Mapbox tile/style API even when they'll 401, filling the browser
          console with noise and potentially counting toward quota. */}
      {MAPBOX_TOKEN && viewMode === "map" && <Map
        mapboxAccessToken={MAPBOX_TOKEN}
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
        {/* Zoom-gated: traffic flow lines are illegible (and pure GPU cost)
            zoomed out past street level, so skip mounting the layer entirely
            below zoom 10 rather than rendering invisible geometry. */}
        {showTraffic && mapZoom >= 10 && (
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
        {/* Zoom-gated to the same range the cluster source covers — the
            heatmap is a "where's the demand at a glance" overview; once the
            user has zoomed in past CLUSTER_MAX_ZOOM they're looking at
            individual pins already, so the heatmap would just be visual
            noise stacked underneath them. */}
        {showHeatmap && openRequests.length > 0 && mapZoom <= CLUSTER_MAX_ZOOM && (
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
            clusterRadius={dynamicClusterRadius}
            clusterProperties={{
              has_emergency: ["+", ["case", ["get", "is_emergency"], 1, 0]],
            }}
          >
            {/* Cluster bubble — color steps from green → yellow → red.
                Emergency-containing clusters get a bright red stroke ring
                regardless of point_count, so a lone emergency is never
                buried in a green "quiet area" bubble. */}
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
                "circle-stroke-width": [
                  "case", [">", ["get", "has_emergency"], 0], 4, 2.5,
                ],
                "circle-stroke-color": [
                  "case", [">", ["get", "has_emergency"], 0], "#ef4444", "rgba(0,0,0,0.5)",
                ],
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
        {/* Guard: skip helpers whose lat/lng is null/undefined — this can
            happen when generated client types are stale and the API returns
            a shape the codegen didn't anticipate, preventing a Mapbox crash. */}
        {displayHelpers.filter(h => h.lat != null && h.lng != null).map(h => (
          <Marker key={h.id} longitude={h.lng!} latitude={h.lat!} anchor="center">
            <HelperMarker helper={h} />
          </Marker>
        ))}

        {/* ── Individual request markers (high zoom only) ─────────────────── */}
        {/* Only rendered when the cluster source has broken up, preventing    */}
        {/* duplicate pins — cluster at ≤ 12, React Markers at > 12.           */}
        {/* Guard: filter out requests with missing coordinates — stale codegen
            types can produce undefined lat/lng which crashes react-map-gl. */}
        {showIndividualMarkers && openRequests.filter(r => r.lat != null && r.lng != null).map(r => (
          <Marker key={r.id} longitude={r.lng!} latitude={r.lat!} anchor="bottom">
            <RequestMarker
              request={r}
              outsideServiceArea={
                helperModeActive &&
                myLocation != null &&
                haversineDistanceMiles(myLocation.lat, myLocation.lng, r.lat!, r.lng!) > radiusMiles
              }
              isHighlighted={highlightedRequestId === r.id}
              onSelect={setHighlightedRequestId}
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

        {/* ── Map control row — consolidated ─────────────────────────────────
            Previously 4 separately-positioned buttons (Traffic, Heat, Lang,
            Category/Urgency) at hardcoded pixel offsets, 2 dedicated on-screen
            zoom buttons (redundant with native pinch-to-zoom on mobile), and a
            conditionally-appearing recenter button. Now: exactly one "Filters"
            trigger (who/what to show), one "Layers" trigger (how to render the
            map), and one always-visible Recenter — a flex row that spaces
            itself, so a future addition can't silently break the layout the
            way each of these did in turn.
            z-40, one level above BestMatchCard (z-30) and BottomSheet (z-20):
            this row must ALWAYS win regardless of DOM order. Tying it at
            z-30 with BestMatchCard worked only by accident of mount order —
            the card mounts after </Map> in the same stacking context, so an
            equal z-index meant the card silently painted over this row
            whenever a best match was showing. Distinct tiers make the
            priority explicit instead of DOM-order-dependent. */}
        <div className="absolute bottom-32 left-4 right-4 z-40 flex items-center gap-2">
          <div className="relative flex-1">
            <button
              onClick={() => { setShowFiltersSheet(v => !v); setShowLayersSheet(false); }}
              style={{ touchAction: "manipulation" }}
              aria-label="Filter requests by category, urgency, or helper language"
              aria-expanded={showFiltersSheet}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full border text-xs font-bold backdrop-blur-sm transition-all active:scale-95 ${
                categoryFilter || urgencyFilter || helperLanguageFilter
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-card/90 border-border text-foreground"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{categoryFilter || urgencyFilter || helperLanguageFilter ? "Filtered" : "Filters"}</span>
            </button>
            {showFiltersSheet && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl p-3 z-20 flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Urgency</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${!urgencyFilter ? "bg-primary/20 text-primary font-black" : "bg-muted/50 hover:bg-muted text-foreground"}`}
                      onClick={() => setUrgencyFilter(null)}
                    >All</button>
                    {["emergency", "high", "medium", "low"].map(u => (
                      <button
                        key={u}
                        className={`text-xs px-2.5 py-1.5 rounded-lg capitalize transition-colors ${urgencyFilter === u ? "bg-primary/20 text-primary font-black" : "bg-muted/50 hover:bg-muted text-foreground"}`}
                        onClick={() => setUrgencyFilter(u)}
                      >{u}</button>
                    ))}
                  </div>
                </div>
                {availableCategories.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Category</p>
                    <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                      <button
                        className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${!categoryFilter ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                        onClick={() => setCategoryFilter(null)}
                      >All categories</button>
                      {availableCategories.map(cat => (
                        <button
                          key={cat}
                          className={`text-left text-xs px-2 py-1.5 rounded-lg capitalize transition-colors ${categoryFilter === cat ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                          onClick={() => setCategoryFilter(cat)}
                        >{cat.replace(/_/g, " ")}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Helper language</p>
                  <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                    <button
                      className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${!helperLanguageFilter ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                      onClick={() => setHelperLanguageFilter(null)}
                    >All helpers</button>
                    {["English","Spanish","Vietnamese","Arabic","Somali","Swahili","French","Mandarin","Hindi","Urdu","Tagalog","Portuguese","Amharic","Korean","Japanese","Russian"].map(lang => (
                      <button
                        key={lang}
                        className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${helperLanguageFilter === lang ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                        onClick={() => setHelperLanguageFilter(lang)}
                      >{lang}</button>
                    ))}
                  </div>
                </div>
                {(categoryFilter || urgencyFilter || helperLanguageFilter) && (
                  <button
                    className="text-left text-[10px] px-2 py-1 rounded-lg text-destructive font-bold hover:bg-destructive/10"
                    onClick={() => { setCategoryFilter(null); setUrgencyFilter(null); setHelperLanguageFilter(null); }}
                  >Clear filters</button>
                )}
              </div>
            )}
          </div>

          <div className="relative flex-1">
            <button
              onClick={() => { setShowLayersSheet(v => !v); setShowFiltersSheet(false); }}
              style={{ touchAction: "manipulation" }}
              aria-label="Toggle map layers"
              aria-expanded={showLayersSheet}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full border text-xs font-bold backdrop-blur-sm transition-all active:scale-95 ${
                showHeatmap || !showTraffic
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-card/90 border-border text-foreground"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Layers</span>
            </button>
            {showLayersSheet && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl p-3 z-20 flex flex-col gap-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Map layers</p>
                <button
                  onClick={() => setShowTraffic(t => !t)}
                  aria-pressed={showTraffic}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold"><Car className="w-3.5 h-3.5" />Traffic</span>
                  <span className={`w-8 h-4.5 rounded-full relative transition-colors ${showTraffic ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${showTraffic ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                </button>
                <button
                  onClick={() => setShowHeatmap(h => !h)}
                  aria-pressed={showHeatmap}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold"><Layers className="w-3.5 h-3.5" />Demand heatmap</span>
                  <span className={`w-8 h-4.5 rounded-full relative transition-colors ${showHeatmap ? "bg-yellow-400" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${showHeatmap ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                </button>

                {/* Legend — lives here rather than as its own floating
                    control so map symbology is discoverable without adding
                    another permanent on-screen element. */}
                <div className="border-t border-border pt-2 mt-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Legend</p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" /> Emergency</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" /> High urgency</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" /> Medium urgency</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" /> Low urgency</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white shrink-0" /> Helper online</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-muted-foreground/50 shrink-0" /> Outside your area</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secondary control row, one step above the Filters/Layers row —
            Orientation toggle (left) and Recenter (right). Recenter is now
            ALWAYS rendered instead of popping in/out: a control that's just
            dimmed when there's nothing to do is less disorienting than one
            that appears and disappears (mirrors the doc's guidance on the
            old conditionally-rendered recenter button). z-40 for the same
            explicit-top-tier reasons as the Filters/Layers row above — see
            that row's comment for why this isn't tied with BestMatchCard. */}
        <div className="absolute bottom-48 left-4 right-4 z-40 flex items-center justify-between">
          <OrientationToggle mode={orientMode} onToggle={() => setOrientMode(orientMode === "heading-up" ? "north-up" : "heading-up")} />
          <button
            onClick={recenterOnMe}
            disabled={!(myLocation ?? ipFallback)}
            style={{ touchAction: "manipulation" }}
            className={`w-11 h-11 flex items-center justify-center rounded-full shadow-lg transition-transform ${
              !(myLocation ?? ipFallback)
                ? "bg-card/60 text-muted-foreground/50 cursor-not-allowed"
                : isOffCenter
                ? "bg-primary text-background active:scale-95"
                : "bg-card/90 text-muted-foreground border border-border active:scale-95"
            }`}
            aria-label="Recenter on my location"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        </div>
      </Map>}

      {/* Best Match card — helper-mode only, shows top open request nearby.
          Rendered alongside the BottomSheet (no longer either/or): with the
          sheet defaulting to collapsed (96px peek) there's no real estate
          conflict, and a helper shouldn't lose their top-pick prompt just
          because the sheet also has content. */}
      {showBestMatch && !mapError && viewMode === "map" && (
        <BestMatchCard
          bestMatch={bestMatch}
          onAccept={handleClaim}
          onDismiss={() => setBestMatchDismissed(bestMatch.id)}
          isClaiming={claimMutation.isPending}
          serviceRadiusMiles={radiusMiles}
          etaMinutes={bestMatchEtaMinutes}
        />
      )}

      {/* Helper mode bottom sheet */}
      {helperModeActive && openRequests.length > 0 && !mapError && viewMode === "map" && (
        <BottomSheet
          requests={openRequests}
          onClaim={handleClaim}
          isClaiming={claimMutation.isPending}
          serviceRadiusMiles={radiusMiles}
          helperModeActive={helperModeActive}
          highlightedRequestId={highlightedRequestId}
        />
      )}

      {/* "Request Help" FAB — requester-mode only. The bottom nav no longer
          carries a dedicated New Request button (Helper Mode OFF nav is now
          Community / Map / Circles / Wallet), so the Map screen — the one
          the doc describes as "browse & request" — carries its own entry
          point instead. bottom-64 clears the Filters/Layers row (bottom-32)
          and the Orientation/Recenter row (bottom-48) beneath it. */}
      {!helperModeActive && viewMode === "map" && (
        <button
          onClick={() => setLocation("/request/new")}
          style={{ touchAction: "manipulation" }}
          className="absolute bottom-64 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-[0_4px_20px_rgba(0,212,255,0.35)] active:scale-95 transition-transform font-black text-xs uppercase tracking-wider"
          aria-label="Request help"
        >
          <Plus className="w-4 h-4" />
          Request Help
        </button>
      )}
    </div>
  );
}
