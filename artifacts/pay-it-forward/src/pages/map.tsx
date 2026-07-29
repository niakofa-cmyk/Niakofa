import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { getIpLocation, detectMapLanguage, localizeMapLabels } from "@/lib/locale-utils";
import {
  useGetNearbyRequests, useGetOnlineHelpers, useClaimRequest,
  useGetRequestStats, useGetRoute, useGetUserSettings, useGetRequest,
  useGetCivicNeedsNearby, useGetCivicResourcesNearby,
  getGetNearbyRequestsQueryKey, getGetOnlineHelpersQueryKey,
  getGetRequestStatsQueryKey, getGetRequestsQueryKey, getGetRequestQueryKey, getGetRouteQueryKey,
  getGetUserSettingsQueryKey, getGetCivicNeedsNearbyQueryKey, getGetCivicResourcesNearbyQueryKey,
} from "@workspace/api-client-react";
import type { HelpRequest, HelperLocation, CivicNeedNearby, CivicResourceNearby } from "@workspace/api-client-react";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useStableCenter } from "@/hooks/useStableCenter";
import { useResilientData } from "@/hooks/useResilientData";
import { TopBar } from "@/components/TopBar";
import { BottomSheet } from "@/components/BottomSheet";
import { CommunityTopPanel } from "@/components/CommunityTopPanel";
import { CommunityListView } from "@/components/CommunityListView";
import { ResourceDetailSheet } from "@/components/ResourceDetailSheet";
import { RequestMarker } from "@/components/RequestMarker";
 import { SpiritAnimalAvatar } from "@/components/SpiritAnimal/SpiritAnimalAvatar";
import { useSolarTier } from "@/hooks/useTimeOfDay";
import { useBatterySaver } from "@/hooks/useBatterySaver";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HelperMarker } from "@/components/HelperMarker";
import { CivicNeedMarker } from "@/components/CivicNeedMarker";
import { CivicResourceMarker } from "@/components/CivicResourceMarker";
import { BestMatchCard } from "@/components/BestMatchCard";
import {
  MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle,
  Navigation2, LocateFixed, Plus, Compass,
  Search, X as XIcon, Loader2, Building2, Landmark,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import { useFusedHeading } from "@/hooks/useFusedHeading";
import { usePositionHeading } from "@/hooks/usePositionHeading";
import { useHeadingWithHold } from "@/hooks/useHeadingWithHold";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { useTweenedPosition } from "@/hooks/useTweenedPosition";
import { usePulse } from "@/hooks/usePulse";
import { OrientationToggle } from "@/components/OrientationToggle";
import { LastUpdated } from "@/components/LastUpdated";
import { RequestListView } from "@/components/RequestListView";
import { MapControlsPanel } from "@/components/MapControlsPanel";
import { MapAnimNudge } from "@/components/MapAnimNudge";
import { haptic } from "@/lib/haptics";
import { Z_CHROME, Z_TOPBAR, Z_SEARCH } from "@/lib/zLayers";
import { computeMapStatus } from "@/lib/mapStatus";
import { haversineDistanceMiles, haversineMeters, isNearbyUser } from "@/lib/geo-utils";

// Module-level: resolved once at import time, not on every render.
// Detecting a missing token here (rather than inside the component) means
// the error is caught before MapScreen mounts and before Mapbox fires any
// async failures, preventing spurious billing noise on misconfigured deploys.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Read once at module scope — deviceMemory can't change mid-session, so
// there's no reason to recompute this on every render the way a useState/
// plain-const-in-component would.
// Static low-end device check — kept for module-scope use (e.g. showTraffic init).
// The SankofaBird batterySaver prop is now driven by useBatterySaver() hook
// (defined in hooks/useBatterySaver.ts) which also reacts to live Battery API.
const IS_LOW_END_DEVICE =
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory != null &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4;

// Cluster zoom threshold — below this zoom, request markers are grouped into
// cluster bubbles. Above it, individual React Marker components take over,
// giving the full-rich pin UX (icons, tooltips, claim buttons).
const CLUSTER_MAX_ZOOM = 12;

// haversineDistanceMiles and isNearbyUser are imported from geo-utils so the
// haversine formula and NEARBY_USER_METERS threshold are defined in exactly one
// place.  request-active.tsx uses the same exports.


// Compact chip used inside the collapsed live-stats pill — icon + bare
// number, no visible label (the pill is meant to be glanced at, not read).
// `label` still lands as a native title tooltip on desktop/long-press, and
// backs an sr-only span, so a first-time helper isn't left guessing what
// each icon means with zero onboarding — without adding permanent visual
// clutter to the collapsed state.
function StatCompact({ icon, value, colorClass, pulse = false, label }: {
  icon: React.ReactNode; value: number; colorClass: string; pulse?: boolean; label: string;
}) {
  return (
    <span
      title={label}
      className={`flex items-center gap-1 text-[10px] font-bold tabular-nums ${colorClass} ${pulse ? "animate-pulse" : ""}`}
    >
      {icon}
      {value}
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Full row used inside the expanded live-stats card — icon + number + label,
// each in its own rounded pill. Shares the same icon/value pairing as
// StatCompact above so the collapsed and expanded views can't drift apart
// (e.g. one showing helpers and the other showing requests by mistake).
function StatRow({ icon, label, colorClass, bgClass, pulse = false }: {
  icon: React.ReactNode; label: string; colorClass: string; bgClass: string; pulse?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 backdrop-blur-md border px-2.5 py-1.5 rounded-full shadow-lg ${bgClass} ${pulse ? "animate-pulse" : ""}`}>
      {icon}
      <span className={`text-[10px] font-bold tabular-nums ${colorClass}`}>{label}</span>
    </div>
  );
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
  const { currentUser, helperModeActive, myLocation, activeRequestId, mapNavOpen } = useAppContext();
  const skyTier = useSolarTier(myLocation?.lat ?? null, myLocation?.lng ?? null);
  // Live battery-saver: auto-enables when Battery API ≤ 15 % or low-end device.
  const batterySaverActive = useBatterySaver({ forceOn: IS_LOW_END_DEVICE });
  const queryClient = useQueryClient();
  // MAPBOX_TOKEN is resolved at module level (see top of file) so this check
  // never re-evaluates on re-renders. useState lazy initializer reads it once.
  const [mapError, setMapError] = useState<string | null>(() =>
    !MAPBOX_TOKEN ? "Mapbox token not supplied" : null
  );
  const [wsConnected, setWsConnected] = useState(() => wsIsConnected());
  // Live-stats overlay — collapsed by default to a single compact pill
  // (connection dot + open-request count + emergency flag, the numbers a
  // helper actually glances at first). Tapping expands it into the full
  // breakdown (helper count, en-route, freshness/refresh). Previously this
  // was up to 5 separately-stacked pills shown at all times, and tapping
  // hid the whole stack with no way to bring it back short of reloading —
  // collapse/expand replaces that dead end.
  const [statsExpanded, setStatsExpanded] = useState(false);
  // First-time onboarding for the collapsed stats pill: it's icon+number
  // only by design (a glance, not a read), which means a first-time helper
  // has zero context for what each icon means. Auto-open the full breakdown
  // once per device on first visit, then let it self-collapse after a few
  // seconds — no separate tooltip UI to build/maintain, and it reuses the
  // exact same expanded card a returning user gets by tapping.
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem("niakofa_stats_pill_seen") === "1"; } catch {}
    if (seen) return;
    setStatsExpanded(true);
    const timer = setTimeout(() => setStatsExpanded(false), 4500);
    try { localStorage.setItem("niakofa_stats_pill_seen", "1"); } catch {}
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [bestMatchDismissed, setBestMatchDismissed] = useState<number | null>(null);

  // ── SankofaBird micro-reaction state ─────────────────────────────────────
  // These are triggered by WebSocket events and auto-clear after a short duration
  // so the bird reacts to live events without a persistent UI change.
  const [birdCelebrating, setBirdCelebrating] = useState(false);
  const [birdNewNotification, setBirdNewNotification] = useState(false);
  const [birdAccepted, setBirdAccepted] = useState(false);
  // Separate donation reaction — pledge paid / contribution completed.
  // Distinct from celebrating (teal shimmer): golden sparkle + egg glow.
  const [birdDonated, setBirdDonated] = useState(false);
  // Approaching: bird enters deceleration visual when helper is ≤50 m from
  // the active job request's coordinates. Mirrors the request-active page's
  // same threshold so the animation is consistent across both entry points.
  const [birdApproaching, setBirdApproaching] = useState(false);

  // ── usePulse: rising-edge debounce for micro-reactions ────────────────────
  // Prevents CSS animation stutter when the same `true` prop arrives across
  // multiple re-renders (GPS ticks, WS reconnects, React batching races).
  // Each pulse fires once per leading edge and auto-resets after its window.
  // Durations match the existing setTimeout reset values in WS handlers above.
  const pulseCelebrating    = usePulse(birdCelebrating,    3000);
  const pulseNotification   = usePulse(birdNewNotification, 2400);
  const pulseAccepted       = usePulse(birdAccepted,        1800);
  const pulseDonated        = usePulse(birdDonated,         2800);
  // Approaching uses the raw boolean (not a pulse) — it's a continuous state,
  // not an event, so we want it to stay true while the condition holds.
  // birdNearbyUser is wired below where it's declared (line ~934).

  const [showTraffic, setShowTraffic] = useState(() => !IS_LOW_END_DEVICE);
  const [showHeatmap, setShowHeatmap] = useState(false);
  // Request id whose map pin was just tapped — links the pin to its card in
  // the BottomSheet instead of the pin being a dead end at high zoom.
  const [highlightedRequestId, setHighlightedRequestId] = useState<number | null>(null);
  // Mirrors BottomSheet's own internal expanded/collapsed state — needed up
  // here so MapControlsPanel's map-settings button and right-edge stack can
  // recede while the sheet is at its 55vh expanded height (see the
  // controlsRecede prop on MapControlsPanel for why that matters now that
  // the right-edge group is a 4-button stack instead of one shallow row).
  const [sheetExpanded, setSheetExpanded] = useState(false);
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
  // Community (non-helper) mode's own category filter — need/resource
  // categories are a different domain than request categories, so this is
  // deliberately a separate piece of state rather than reusing categoryFilter.
  const [communityCategoryFilter, setCommunityCategoryFilter] = useState<string | null>(null);
  // Tap-to-detail surface for a resource pin/row — phone/hours/directions.
  const [selectedResource, setSelectedResource] = useState<CivicResourceNearby | null>(null);
  // Consolidated control row — previously 4 separately-positioned buttons
  // (Traffic, Heat, Language, Category/Urgency) each at a hardcoded pixel
  // offset (left-4/left-24/left-44/left-[188px]), 2 of which opened their
  // own popups that could overlap. Now there are exactly two triggers:
  // "Filters" (who/what to show — category, urgency, language) and "Layers"
  // (how to show the map — traffic, heatmap), each opening one bottom sheet.
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [showLayersSheet, setShowLayersSheet] = useState(false);
  // Timestamp of the last time the settings sheet was opened (ms). Used by the
  // movestart handler below to prevent a mobile race: a tap on "Map Settings"
  // in the bird menu also registers a brief map-touch → movestart event, which
  // would immediately close the sheet the tap just opened. We skip the
  // auto-collapse if the sheet was opened within the last 600 ms.
  const settingsOpenedAtRef = useRef<number>(0);
  const handleFiltersSheetChange = useCallback((open: boolean) => {
    if (open) settingsOpenedAtRef.current = Date.now();
    setShowFiltersSheet(open);
  }, []);
  const handleLayersSheetChange = useCallback((open: boolean) => {
    if (open) settingsOpenedAtRef.current = Date.now();
    setShowLayersSheet(open);
  }, []);
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
  const searchBarRef = useRef<HTMLDivElement>(null);

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
  // handleMapLoad below registers its Mapbox event listeners exactly once
  // (empty dep array — re-registering on every helperModeActive toggle would
  // stack duplicate listeners), so the long-press handler reads this ref
  // instead of closing over the boolean directly.
  const helperModeActiveRef = useRef(helperModeActive);
  useEffect(() => { helperModeActiveRef.current = helperModeActive; }, [helperModeActive]);

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

  // Data-loss fix: GPS emits a new lat/lng on nearly every render while
  // moving, so building query params/keys straight off `effectiveCenter`
  // started a brand-new (empty) cache entry on almost every tick — visible
  // as requests/helpers/civic pins "disappearing" while someone simply
  // walked or drove with the app open. `queryCenter` is a rounded + debounced
  // version used ONLY for these four queries; the map itself still renders
  // from the raw, precise `effectiveCenter`/`myLocation` directly.
  const queryCenter = useStableCenter(effectiveCenter, { precision: 3, debounceMs: 4000 });

  const requestsQuery = useGetNearbyRequests(
    { lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!queryCenter, queryKey: getGetNearbyRequestsQueryKey({ lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles }), placeholderData: keepPreviousData } }
  );
  const { isSuccess: requestsLoaded, dataUpdatedAt: requestsUpdatedAt, refetch: refetchRequests, isFetching: requestsFetching } = requestsQuery;
  // placeholderData only covers the gap between two *successful* fetches —
  // if the new fetch itself errors, React Query's `data` collapses to
  // undefined anyway. The extra last-good-value tracking in
  // useResilientData means a single dropped request never blanks out
  // the map's pins.
  const requests = useResilientData(requestsQuery, []);

  const helpersQuery = useGetOnlineHelpers(
    { lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles },
    { query: { enabled: !!queryCenter, queryKey: getGetOnlineHelpersQueryKey({ lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles }), placeholderData: keepPreviousData } }
  );
  const { isSuccess: helpersLoaded, refetch: refetchHelpers } = helpersQuery;
  const helpers = useResilientData(helpersQuery, []);

  const { data: stats } = useGetRequestStats({
    query: { queryKey: getGetRequestStatsQueryKey(), staleTime: 30000, placeholderData: keepPreviousData }
  });

  // Community (non-helper) mode's data — helpers online (already fetched
  // above), open civic needs, and civic resources/help centers. Only fetched
  // while !helperModeActive since helper mode never shows this data.
  const civicNeedsParams = { lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles };
  const civicNeedsQuery = useGetCivicNeedsNearby(civicNeedsParams, {
    query: { enabled: !!queryCenter && !helperModeActive, queryKey: getGetCivicNeedsNearbyQueryKey(civicNeedsParams), placeholderData: keepPreviousData },
  });
  const civicNeeds = useResilientData(civicNeedsQuery, []);
  const civicResourcesParams = { lat: queryCenter?.lat || 0, lng: queryCenter?.lng || 0, radius_miles: radiusMiles };
  const civicResourcesQuery = useGetCivicResourcesNearby(civicResourcesParams, {
    query: { enabled: !!queryCenter && !helperModeActive, queryKey: getGetCivicResourcesNearbyQueryKey(civicResourcesParams), placeholderData: keepPreviousData },
  });
  const civicResources = useResilientData(civicResourcesQuery, []);

  // Reverse-geocode the effective center → match county, same approach as
  // request-new.tsx's pin-matching logic. The `.toFixed(2)` rounding in the
  // dep array alone isn't a real debounce — fast panning still crosses
  // rounded-coordinate boundaries several times a second, firing a burst of
  // Mapbox geocoding requests back to back. A real 600ms debounce (reset on
  // every dep change, cleared on unmount) collapses that burst to one call
  // after panning settles.
  const coverageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!effectiveCenter || coverageCommunities.length === 0) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (!token) return;
    if (coverageDebounceRef.current) clearTimeout(coverageDebounceRef.current);
    const { lat, lng } = effectiveCenter;
    coverageDebounceRef.current = setTimeout(() => {
      setCoverageDetecting(true);
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
    }, 600);
    return () => { if (coverageDebounceRef.current) clearTimeout(coverageDebounceRef.current); };
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

  // Reset best match dismissal + auto-recenter when helper mode toggles ON.
  // When a user switches into helper mode they need to immediately see open
  // requests near them — not whatever neighborhood they were browsing. flyTo
  // mirrors the recenterOnMe speed/zoom values so it feels consistent.
  useEffect(() => {
    if (helperModeActive && !prevHelperMode.current) {
      setBestMatchDismissed(null);
      const loc = myLocationRef.current ?? ipFallbackRef.current;
      if (loc && mapRef.current) {
        mapRef.current.flyTo({
          center: [loc.lng, loc.lat],
          zoom: Math.max((mapRef.current as mapboxgl.Map).getZoom(), 13.5),
          speed: 1.4,
        });
        setIsOffCenter(false);
      }
      // Doc: "Start Navigation — the bird stretches, spreads both wings,
      // points toward destination, then begins flying."
      // Trigger 'accepted' (hop + stretch) on helper-mode activation to
      // signal the bird is ready for duty. Clears after 1.8 s (long enough
      // for the hop to complete before the takeoff animation fires).
      setBirdAccepted(true);
      setTimeout(() => setBirdAccepted(false), 1800);
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
      // Micro-reaction: bird looks up + wing flick on new nearby request
      setBirdNewNotification(true);
      setTimeout(() => setBirdNewNotification(false), 2400);
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
        // Micro-reaction: bird chirps + hops when someone accepts your request
        setBirdAccepted(true);
        setTimeout(() => setBirdAccepted(false), 1800);
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
        // Micro-reaction: bird hops + wing-stretches when helper arrives at the
        // requester's door. Doc: "approaching destination → gradually slows →
        // begins descending". On the requester's map screen this is a hop/stretch
        // moment ("they're here!"), then full celebration on completion.
        if (req.status === "arrived" &&
            req.requester_id != null &&
            currentUser?.id != null &&
            req.requester_id === currentUser.id) {
          setBirdAccepted(true);
          setTimeout(() => setBirdAccepted(false), 1800);
        }
        if (req.status === "completed" || req.status === "cancelled") {
          setActiveHelperRoute(null);
          // Micro-reaction: celebrate when a request is completed (help delivered!)
          if (req.status === "completed") {
            setBirdCelebrating(true);
            setTimeout(() => setBirdCelebrating(false), 3000);
          }
        }
        if (req.status === "open") return [req, ...filtered];
        return filtered;
      });
      queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
    } else if (event.type === "pledge_paid" || event.type === "payment_completed") {
      // Micro-reaction: donation completed — golden sparkle + egg glow.
      // Distinct from the teal "celebrating" reaction used for request completion.
      // Fires on pledge repayment and direct community-pool contributions.
      setBirdDonated(true);
      setTimeout(() => setBirdDonated(false), 2800);
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

  // Third-tier fallback: derives a heading purely from consecutive GPS fixes.
  // Fires when BOTH the compass (no permission / desktop / unsupported) AND
  // coords.heading (device at rest or chipset can't derive course) are null —
  // which is common — so the bird still turns to face its direction of
  // travel instead of freezing in its default pose. See usePositionHeading.ts.
  const positionHeading = usePositionHeading(myLocation?.lat, myLocation?.lng);

  // Holds the last known-good heading through momentary GPS/compass gaps
  // (including "compass permission never granted" and "hasn't moved 3m yet")
  // instead of collapsing to null and snapping the bird back to its default
  // identity pose. See useHeadingWithHold.ts for the full rationale — this
  // is what actually fixes "bird only ever faces left" during brief dropouts.
  const rawHeading = fusedHeading ?? myLocation?.heading ?? positionHeading ?? null;
  const heldHeading = useHeadingWithHold(rawHeading);

  // ── Smooth GPS glide — tween between position fixes instead of snapping ────
  // GPS chipsets emit new coordinates every 1-3s; without this the SankofaBird
  // marker visibly "jumps" to each new fix. The hook interpolates using
  // requestAnimationFrame (ease-out cubic) so movement looks alive.
  const tweenedPosition = useTweenedPosition(myLocation ?? null, 800);
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
    // Doc: "Locate Me — tap it, the bird flies back to your location."
    // Trigger the 'accepted' micro-reaction (hop + stretch) to signal the
    // bird has found the user's location. Clears after 1.5 s.
    setBirdAccepted(true);
    setTimeout(() => setBirdAccepted(false), 1500);
  }, []);

  // Explicit +/- zoom buttons — brought back at the map screen's request as
  // a right-edge control, same as the classic Mapbox NavigationControl, for
  // users who don't think to pinch-zoom (or can't, on a device with a stuck
  // multi-touch digitizer).
  const handleZoomIn = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.zoomIn({ duration: 200 });
    haptic("light");
  }, []);
  const handleZoomOut = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.zoomOut({ duration: 200 });
    haptic("light");
  }, []);

  // "Search this area" — re-query requests/helpers centered on wherever the
  // map is currently panned, instead of always the user's own location.
  const searchThisArea = useCallback(() => {
    if (!mapRef.current) return;
    const center = mapRef.current.getCenter();
    setSearchCenter({ lat: center.lat, lng: center.lng });
  }, []);

  // Requester's mode-specific primary action (MapControlsPanel pill + the
  // long-press gesture below): post a request pre-pinned to wherever the
  // requester is looking right now, instead of always defaulting to their
  // GPS location on request-new.tsx. Falls back to the effective center
  // (search center or GPS) if the map instance isn't ready for some reason.
  const handleRequestHere = useCallback(() => {
    const center = mapRef.current?.getCenter();
    const lat = center?.lat ?? effectiveCenter?.lat;
    const lng = center?.lng ?? effectiveCenter?.lng;
    haptic("light");
    if (lat == null || lng == null) { setLocation("/request/new"); return; }
    setLocation(`/request/new?lat=${lat}&lng=${lng}`);
  }, [effectiveCenter, setLocation]);

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
      localizeMapLabels(mapRef.current as any, lang);
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

    // Auto-collapse the Filters/Layers sheets on interaction — the doc's
    // "auto-hide non-essential UI on move/zoom" note. The icon strip itself
    // stays put (it's the thumb-reachable anchor a user expects to always
    // find in the same place); only the expanded sheet content collapses,
    // same as tapping outside it would.
    mapRef.current?.on("movestart", () => {
      // Skip auto-collapse if the sheet was opened within the last 600 ms —
      // prevents the mobile race where the tap that opens "Map Settings" also
      // fires a movestart and immediately closes the sheet.
      if (Date.now() - settingsOpenedAtRef.current < 600) return;
      setShowFiltersSheet(false);
      setShowLayersSheet(false);
    });

    // Long-press (Mapbox fires "contextmenu" for both a real right-click and
    // a touch-and-hold on mobile) → the requester's contextual "request help
    // here" gesture from the doc, pinned to exactly where the user pressed
    // rather than the current map center.
    mapRef.current?.on("contextmenu", (e: mapboxgl.MapMouseEvent) => {
      // Mapbox's canvas already sets touch-action: none, which is what
      // actually suppresses the native long-press menu on mobile — but
      // calling preventDefault() here too makes that not implicit, so a
      // future Mapbox/browser change to that default doesn't silently
      // bring back a native context menu underneath this gesture.
      e.originalEvent?.preventDefault?.();
      if (helperModeActiveRef.current) return; // helper long-press has no action here
      haptic("success");
      setLocation(`/request/new?lat=${e.lngLat.lat}&lng=${e.lngLat.lng}`);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fusedHeading !== null) applyHeading(fusedHeading); }, [fusedHeading, applyHeading]);

  // Click-outside + Escape to dismiss the address search overlay — previously
  // the toggle button or picking a suggestion were the only ways to close it,
  // which is below the bar for a search box (standard expectation elsewhere
  // in the app, e.g. every other dropdown/sheet in this file has a dismiss path).
  useEffect(() => {
    if (!showSearchBar) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setShowSearchBar(false);
        setShowAddressSuggestions(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSearchBar(false);
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showSearchBar]);

  const handleClaim = useCallback((request: HelpRequest) => {
    // Previously a silent no-op when logged out — harmless while BottomSheet
    // (the only caller) was gated to already-signed-in helpers, but
    // RequestListView is reachable by anyone in any mode, so this guard is
    // now the only thing standing between a logged-out tap and total
    // silence. Same redirect the WebGL-fallback list already used.
    if (!currentUser) { setLocation("/login"); return; }
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
  // An active category/urgency filter can silently drop an emergency pin off
  // the map — the stats pill still counts it (emergencyRequests is computed
  // from the unfiltered set above), but nothing on screen told a helper WHY
  // an emergency they can see in the stats isn't visible as a pin. Surfaced
  // as a nudge in the settings sheet (see MapControlsPanel's
  // hiddenEmergencyCount prop) rather than silently — a helper with a
  // "medical" category filter active shouldn't be the one person who
  // doesn't hear about a nearby fire.
  const hiddenEmergencyCount =
    emergencyRequests.length - openRequests.filter(r => r.urgency === "emergency").length;

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

  // ── SankofaBird activityLevel — community busyness signal (0–1) ────────────
  // Drives the bird's blink rate and crown alertness in real time.
  // Uses the visible (filtered) open request count as the activity signal:
  // 0 requests = 0.0 (quiet), 10+ requests = 1.0 (peak). The √ curve means
  // 5 requests already reads as "busy" (~0.7) rather than requiring a full 10 —
  // city-scale neighbourhoods with a handful of active requests feel alive.
  const activityLevel = useMemo(
    () => Math.min(1, Math.sqrt(openRequests.length / 10)),
    [openRequests.length],
  );
  // Apply diaspora language filter when active — keeps self-dot off the map
  const displayHelpers = safeHelpers
    .filter(h => h.id !== currentUser?.id)
    .filter(h => {
      if (!helperLanguageFilter) return true;
      const langs: string[] = ((h as { languages?: string[] }).languages ?? []).map((l: string) => l.toLowerCase());
      return langs.includes(helperLanguageFilter.toLowerCase());
    });

  // ── nearbyUser: wing-salute when another Niakofa helper is within ~200 m ──
  // Doc: "When another Niakofa user is nearby, your bird looks over →
  //       small wing salute → returns to hovering."
  //
  // The raw boolean re-computes on every helper-location update. Without a
  // debounce, a helper oscillating near the 200 m boundary causes the salute
  // to fire repeatedly in rapid succession, breaking the animation.
  // Fix: latch true immediately; only flip back false after 3 s of continuous
  // absence (≥ the salute duration: 1.4 s × 2 passes = 2.8 s).
  const nearbyUserRaw = useMemo(() => {
    if (!myLocation) return false;
    // isNearbyUser uses NEARBY_USER_METERS (200 m) from geo-utils — the same
    // constant used in request-active.tsx so both pages stay in sync.
    return displayHelpers.some(
      h => h.lat != null && h.lng != null &&
        isNearbyUser(myLocation.lat, myLocation.lng, h.lat, h.lng),
    );
  }, [myLocation?.lat, myLocation?.lng, displayHelpers]); // eslint-disable-line react-hooks/exhaustive-deps

  const [birdNearbyUser, setBirdNearbyUser] = useState(false);
  const nearbyUserOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (nearbyUserRaw) {
      // Helper just entered range — cancel any pending "turn off" and latch true
      if (nearbyUserOffTimerRef.current) {
        clearTimeout(nearbyUserOffTimerRef.current);
        nearbyUserOffTimerRef.current = null;
      }
      setBirdNearbyUser(true);
    } else {
      // Helper left range — wait 3 s before clearing so salute animation completes
      // (salute duration = 1.4 s × 2 iterations = 2.8 s, so 3 s is safe).
      if (!nearbyUserOffTimerRef.current) {
        nearbyUserOffTimerRef.current = setTimeout(() => {
          setBirdNearbyUser(false);
          nearbyUserOffTimerRef.current = null;
        }, 3000);
      }
    }
    // Cleanup: clear any pending timer on unmount to prevent setState-after-unmount.
    return () => {
      if (nearbyUserOffTimerRef.current) {
        clearTimeout(nearbyUserOffTimerRef.current);
        nearbyUserOffTimerRef.current = null;
      }
    };
  }, [nearbyUserRaw]);

  // Community mode's filtered need/resource sets and combined category list —
  // client-side filtering, same pattern as openRequests' categoryFilter.
  const communityAvailableCategories = useMemo(() => {
    const cats = new Set<string>();
    civicNeeds.forEach(n => cats.add(n.category));
    civicResources.forEach(r => { if (r.category) cats.add(r.category); });
    return Array.from(cats).sort();
  }, [civicNeeds, civicResources]);
  const communityNeeds = useMemo(
    () => communityCategoryFilter ? civicNeeds.filter(n => n.category === communityCategoryFilter) : civicNeeds,
    [civicNeeds, communityCategoryFilter],
  );
  const communityResources = useMemo(
    () => communityCategoryFilter ? civicResources.filter(r => r.category === communityCategoryFilter) : civicResources,
    [civicResources, communityCategoryFilter],
  );

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

  // ── upcomingTurnDirection: anticipatory head glance toward the next maneuver ─
  // Scans the user's OWN best-match route steps for the first non-straight turn
  // and normalises the Mapbox modifier string ("slight left", "sharp right", etc.)
  // to the "left" | "right" | null union that SankofaBird expects.
  // The bird glances in that direction before the turn instruction fires —
  // the "intelligence cue" from the vision doc: "Bird glances toward destination
  // before turning, adjusts wings for a crosswind, slows before landing."
  //
  // Distance gate (key improvement): only return non-null when the FIRST step
  // (the imminent maneuver) is within ~400 m. Without this gate the bird would
  // continuously glance at a turn that's 5+ miles away, looking broken rather
  // than intelligent. The first step's distance_meters is the best available
  // proxy for how close the upcoming maneuver is without additional GPS math.
  //
  // MUST use bestMatchRouteData (the helper's OWN route), not activeHelperRouteData
  // (a REQUESTER watching a specific helper's path) — the requester's bird has no
  // turn-by-turn context, so upcomingTurnDirection is null in requester mode.
  // Approaching: hysteresis band prevents GPS jitter from toggling the approach
  // animation on/off when the user hovers right at the 50 m boundary.
  // Enter approaching at ≤50 m; exit only when >60 m (10 m hysteresis band).
  // 10 m is wide enough to absorb typical phone GPS noise (~3–8 m CEP) while
  // still clearing promptly once the helper moves away from the destination.
  // Matches request-active.tsx for cross-page consistency.
  useEffect(() => {
    if (!helperModeActive || !myLocation || !activeJobRequest) {
      setBirdApproaching(false);
      return;
    }
    const req = activeJobRequest as HelpRequest;
    if (!req.lat || !req.lng) {
      setBirdApproaching(false);
      return;
    }
    const dist = haversineMeters(myLocation.lat, myLocation.lng, req.lat, req.lng);
    setBirdApproaching(prev => {
      if (!prev && dist <= 50) return true;
      if (prev && dist > 60) return false;
      return prev;
    });
  }, [helperModeActive, myLocation?.lat, myLocation?.lng, activeJobRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const birdUpcomingTurn = useMemo((): "left" | "right" | null => {
    if (!helperModeActive) return null;
    const steps = bestMatchRouteData?.steps;
    if (!steps?.length) return null;
    // Gate: only glance when the first (nearest) maneuver is within 400 m.
    const firstStepDistance = (steps[0] as { distance_meters?: number }).distance_meters ?? Infinity;
    if (firstStepDistance > 400) return null;
    // Use an explicit allowlist of Mapbox modifier values rather than
    // fragile substring matching — prevents false positives if Mapbox ever
    // adds a modifier that incidentally contains "left" or "right" as a
    // substring (e.g. a hypothetical "hard-left-fork" or "keep-right-onto").
    const LEFT_DIRS  = new Set(["left", "slight left", "sharp left", "uturn"]);
    const RIGHT_DIRS = new Set(["right", "slight right", "sharp right"]);
    for (const step of steps) {
      const dir = ((step as { maneuver_direction?: string }).maneuver_direction ?? "").toLowerCase().trim();
      if (LEFT_DIRS.has(dir))  return "left";
      if (RIGHT_DIRS.has(dir)) return "right";
    }
    return null;
  }, [helperModeActive, bestMatchRouteData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Single top-center status slot — priority logic lives in computeMapStatus
  // (src/lib/mapStatus.ts) as a pure function, extracted out of this
  // already-large render body so the priority order can be read (and
  // eventually tested) on its own. See that file for the full priority
  // rationale.
  const showActiveJobBanner = activeRequestId != null && activeJobBannerDismissed !== activeRequestId;
  const mapStatus = computeMapStatus({
    mapError: !!mapError,
    orientMode,
    followPaused,
    isOffCenter,
    searchCenter,
    showActiveJobBanner,
    coverageOutside,
    helperModeActive,
    openRequestsCount: openRequests.length,
  });

  // Community panel state — slide-down panel accessed via TopBar hamburger
  // in community (requester) mode, replacing the bottom sheet.
  const [communityPanelOpen, setCommunityPanelOpen] = useState(false);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      {/* TopBar overlays the map — must be absolute so map fills full 100dvh */}
      <div className="absolute inset-x-0 top-0" style={{ zIndex: Z_TOPBAR }}>
        <TopBar
          onSearchToggle={() => setShowSearchBar(v => !v)}
          searchActive={showSearchBar}
          viewMode={viewMode}
          onToggleView={() => setViewMode(v => (v === "map" ? "list" : "map"))}
          communityMapMode
          onCivicPortalClick={() => setLocation("/civic-needs")}
          onCommunityPanel={() => setCommunityPanelOpen(v => !v)}
          communityPanelOpen={communityPanelOpen}
        />
      </div>

      {/* Community top panel — helpers + civic needs in a slide-down drawer
          accessed from the TopBar hamburger, replacing the old bottom sheet
          so map navigation controls at the bottom are never obscured. */}
      {!helperModeActive && (
        <CommunityTopPanel
          open={communityPanelOpen}
          onClose={() => setCommunityPanelOpen(false)}
          helpers={displayHelpers}
          needs={communityNeeds}
          resources={communityResources}
          onSelectResource={setSelectedResource}
          viewMode={viewMode}
          onToggleView={() => setViewMode(v => (v === "map" ? "list" : "map"))}
        />
      )}

      {/* Expandable address search — forward geocoding, distinct from the
          reverse-geocoding coverage check above. Sits just under the
          TopBar row; Z_SEARCH keeps it above the map's own overlays
          (Z_CHROME/Z_TOPBAR) but below nothing else needs to beat it while open. */}
      {showSearchBar && (
        <div ref={searchBarRef} className="absolute top-16 left-4 right-4" style={{ zIndex: Z_SEARCH }}>
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
            {/* Snap back to "my location" from inside the open search bar —
                previously only the map's Recenter button underneath could
                clear searchCenter, so a searched-away location stayed
                sticky until the bar was closed and that separate control found. */}
            {searchCenter && (
              <button
                type="button"
                aria-label="Use my location"
                title="Use my location"
                onClick={() => {
                  recenterOnMe();
                  setAddressSearch("");
                  setAddressSuggestions([]);
                  setShowAddressSuggestions(false);
                  setShowSearchBar(false);
                }}
                className="shrink-0"
              >
                <LocateFixed className="w-4 h-4 text-primary" />
              </button>
            )}
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
      {viewMode === "list" && helperModeActive && (
        <RequestListView
          requests={openRequests}
          onClaim={handleClaim}
          isClaiming={claimMutation.isPending}
          serviceRadiusMiles={radiusMiles}
          helperModeActive={helperModeActive}
        />
      )}
      {viewMode === "list" && !helperModeActive && (
        <CommunityListView
          helpers={displayHelpers}
          needs={communityNeeds}
          resources={communityResources}
          onSelectResource={setSelectedResource}
        />
      )}

      {/* Merged top status band — the contextual mapStatus message and the
          live-stats pill used to be two independently-positioned elements
          sharing the same horizontal band (status left-4..right-20, stats
          right-4) — they never literally overlapped, but they were still
          two separate "status about the map" surfaces competing for the
          same real estate. Now they're two children of ONE flex row: the
          message (if any) takes the left/flex-1 side, the stats pill anchors
          the right side, both inside a single container at a single z-index —
          the same "fold into one unit" treatment BestMatchCard got. */}
      <div className="absolute top-20 left-4 right-4 flex items-start justify-between gap-2" style={{ zIndex: Z_CHROME }}>
      <div className="flex-1 min-w-0 flex justify-start">
      {mapStatus && (
        <>
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
          {/* "Search this area" pill — only shown in community/requester mode.
              In helper mode the address search icon in the TopBar is the
              search entry point; showing a second pill here caused confusion
              about which one was canonical. The underlying searchThisArea
              function still works in both modes. */}
          {mapStatus.kind === "search-this-area" && !helperModeActive && (
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
              {/* line-clamp-2 + shortened copy: the old sentence ran to 3
                  lines on an iPhone SE-width screen, sitting directly above
                  the map. Capped rather than left to wrap indefinitely. */}
              <span className="text-[11px] font-semibold text-amber-400 leading-tight line-clamp-2">
                No Community Pool here yet — you can still post and connect with neighbors directly.
              </span>
            </div>
          )}
          {mapStatus.kind === "helper-waiting" && (
            <div className="flex items-center gap-2 bg-card/70 backdrop-blur-sm border border-green-500/30 px-4 py-2 rounded-full shadow-md pointer-events-none">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-green-400 whitespace-nowrap">Online — waiting for nearby requests</p>
            </div>
          )}
        </>
      )}
      </div>

      {/* Screen-reader-only live summary — the stats pill above is purely
          visual (small numbers a sighted user glances at); without this, a
          screen-reader user gets no announcement when counts change. Kept
          separate from the visual pill so it isn't affected by its
          collapsed/expanded state. */}
      <div className="sr-only" aria-live="polite">
        {helperModeActive
          ? <>
              {displayHelpers.length} helper{displayHelpers.length !== 1 ? "s" : ""} online,{" "}
              {openRequests.length} open request{openRequests.length !== 1 ? "s" : ""}
              {emergencyRequests.length > 0 ? `, ${emergencyRequests.length} emergency` : ""}.
            </>
          : <>
              {displayHelpers.length} helper{displayHelpers.length !== 1 ? "s" : ""} online,{" "}
              {communityNeeds.length} civic need{communityNeeds.length !== 1 ? "s" : ""},{" "}
              {communityResources.length} resource{communityResources.length !== 1 ? "s" : ""} nearby.
            </>
        }
      </div>

      {/* Live stats — right side of the merged status band above. Collapsed
          to one compact pill by default (connection dot + open-request
          count + an emergency flag when relevant — the numbers that matter
          at a glance) so the map isn't fighting the pin layer underneath it
          for attention. Tap expands a small card with the full breakdown;
          tap again collapses it back. No longer independently positioned —
          it's the right-hand child of the same flex row as the status
          message, sharing one z-index and one container. */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setStatsExpanded(v => !v)}
          aria-expanded={statsExpanded}
          aria-label="Live stats"
          style={{ touchAction: "manipulation" }}
          className={`flex items-center gap-2 backdrop-blur-md border px-3 py-1.5 rounded-full shadow-lg transition-colors active:scale-95 ${
            wsConnected ? "bg-card/90 border-border" : "bg-card/80 border-amber-500/40"
          }`}
        >
          {wsConnected
            ? <Wifi className="w-3 h-3 text-green-400 shrink-0" />
            : <WifiOff className="w-3 h-3 text-amber-400 shrink-0" />}
          {helperModeActive ? (
            <>
              <StatCompact icon={<Activity className="w-3 h-3" />} value={openRequests.length} colorClass="text-yellow-400" label="Open requests nearby" />
              <StatCompact icon={<Users className="w-3 h-3" />} value={displayHelpers.length} colorClass="text-primary" label="Helpers online" />
              {emergencyRequests.length > 0 && (
                <StatCompact icon={<AlertTriangle className="w-3 h-3" />} value={emergencyRequests.length} colorClass="text-destructive" pulse label="Emergency requests" />
              )}
            </>
          ) : (
            <>
              <StatCompact icon={<Users className="w-3 h-3" />} value={displayHelpers.length} colorClass="text-emerald-400" label="Helpers online" />
              <StatCompact icon={<Building2 className="w-3 h-3" />} value={communityNeeds.length} colorClass="text-primary" label="Civic needs nearby" />
            </>
          )}
        </button>

        {statsExpanded && (
          <div className="flex flex-col gap-1 items-end">
            <div className={`flex items-center gap-1.5 backdrop-blur-md border px-2.5 py-1.5 rounded-full shadow-lg ${
              wsConnected ? "bg-green-500/10 border-green-500/30" : "bg-card/80 border-border"
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${wsConnected ? "text-green-400" : "text-muted-foreground"}`}>
                {wsConnected ? "Live" : "Reconnecting"}
              </span>
            </div>
            <StatRow
              icon={<Users className="w-3 h-3 text-primary" />}
              label={`${displayHelpers.length} helper${displayHelpers.length !== 1 ? "s" : ""} online`}
              colorClass="text-primary" bgClass="bg-card/90 border-border"
            />
            {helperModeActive ? (
              <>
                <StatRow
                  icon={<Activity className="w-3 h-3 text-yellow-400" />}
                  label={`${openRequests.length} open request${openRequests.length !== 1 ? "s" : ""}`}
                  colorClass="text-yellow-400" bgClass="bg-card/90 border-border"
                />
                {emergencyRequests.length > 0 && (
                  <StatRow
                    icon={<AlertTriangle className="w-3 h-3 text-destructive" />}
                    label={`${emergencyRequests.length} emergency`}
                    colorClass="text-destructive" bgClass="bg-destructive/20 border-destructive/50" pulse
                  />
                )}
              </>
            ) : (
              <>
                <StatRow
                  icon={<Building2 className="w-3 h-3 text-primary" />}
                  label={`${communityNeeds.length} civic need${communityNeeds.length !== 1 ? "s" : ""}`}
                  colorClass="text-primary" bgClass="bg-card/90 border-border"
                />
                <StatRow
                  icon={<Landmark className="w-3 h-3 text-emerald-400" />}
                  label={`${communityResources.length} resource${communityResources.length !== 1 ? "s" : ""}`}
                  colorClass="text-emerald-400" bgClass="bg-card/90 border-border"
                />
              </>
            )}
            {activeHelperRoute && (
              <StatRow
                icon={<Navigation2 className="w-3 h-3 text-primary" />}
                label="En Route"
                colorClass="text-primary" bgClass="bg-primary/10 border-primary/30"
              />
            )}
            {/* Freshness indicator + manual refresh — shared LastUpdated
                component used elsewhere (Griot Globe, hub-leader dashboard)
                so every polling screen in the app reads the same way. */}
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
      </div>
      </div>

      {/* Map fallback — shown when token missing OR WebGL unavailable.
          We use Z_CHROME so it layers above the (conditionally-rendered) Map div.
          When the token is missing we skip the <Map> component entirely to avoid
          Mapbox making API calls it can't complete and logging auth errors. */}
      {mapError && viewMode === "map" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-3 px-6 pt-20 pb-28" style={{ zIndex: Z_CHROME }}>
          {/* SankofaBird renders in idle state even when the map is unavailable —
              it shows the bird is alive and working, just waiting for a map canvas.
              The ErrorBoundary guards against any unexpected SVG crash here. */}
          <div className="mb-1 relative" aria-hidden="true">
            <ErrorBoundary fallback={
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
            }>
              <SpiritAnimalAvatar
                species={userSettings?.spirit_animal}
                heading={heldHeading}
                mapBearing={0}
                speed={0}
                navigating={false}
                size={64}
                celebrating={false}
                newNotification={false}
                accepted={false}
                donated={false}
                nearbyUser={false}
                mapZoom={14}
                upcomingTurnDirection={null}
                isHelping={false}
                batterySaver={batterySaverActive}
                skyTier={skyTier}
                activityLevel={activityLevel}
              />
            </ErrorBoundary>
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
                Open in Chrome or Firefox for the full live map. {helperModeActive ? "Requests" : "Helpers and civic needs"} listed below.
              </p>
            </>
          )}
          {/* Fallback list — helper mode keeps the original claimable request
              list; community mode gets the same helpers/needs/resources mix
              as the live map instead of leaking open help requests (this was
              the one place the two modes still crossed over). */}
          {helperModeActive ? (
            openRequests.length > 0 && (
              <div className="w-full max-w-sm space-y-2 mt-2">
                {openRequests.map(r => {
                  const canClaim = helperModeActive && !!currentUser && !claimMutation.isPending;
                  return (
                    <button
                      key={r.id}
                      disabled={!canClaim}
                      onClick={() => handleClaim(r)}
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
            )
          ) : (
            <div className="w-full max-w-sm flex-1 min-h-0 mt-2 overflow-hidden rounded-xl border border-border relative" style={{ height: "50vh" }}>
              <CommunityListView
                helpers={displayHelpers}
                needs={communityNeeds}
                resources={communityResources}
                onSelectResource={setSelectedResource}
              />
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
        {/* ── My location dot — SankofaBird with smooth GPS glide ─────────── */}
        {/* tweenedPosition interpolates between GPS fixes (ease-out cubic,
            ~800ms) so the bird glides rather than teleporting to each new fix.
            Micro-reactions (celebrating/newNotification/accepted) are wired to
            WebSocket events above so the bird reacts to live platform events. */}
        {(tweenedPosition ?? myLocation) && (
          <Marker
            longitude={(tweenedPosition ?? myLocation)!.lng}
            latitude={(tweenedPosition ?? myLocation)!.lat}
            anchor="center"
          >
            {/* ErrorBoundary: a CSS/SVG crash shows a teal dot fallback
                instead of unmounting the whole map screen. */}
            <ErrorBoundary fallback={<div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(0,212,255,0.9)]" />}>
              <SpiritAnimalAvatar
                species={userSettings?.spirit_animal}
                heading={
                  // locked-north: bird always faces north regardless of GPS.
                  // Doc: "Tap three times: Bird locks to North."
                  // heldHeading already encodes the full 3-tier fallback chain
                  // (compass → GPS course → GPS position-delta) plus a 12s hold
                  // through momentary gaps — so this is the single source of
                  // truth for which way the bird faces at any point in time.
                  orientMode === "locked-north" ? 0 : heldHeading
                }
                mapBearing={
                  // heading-up: map + bird rotate together; bird always points screen-up.
                  // locked-north: map north-up, heading forced 0 → bird points screen-north.
                  // north-up: map static; bird rotates on screen to show GPS direction.
                  orientMode === "heading-up" ? (fusedHeading ?? 0) : 0
                }
                speed={myLocation?.speed ?? 0}
                navigating={helperModeActive || (myLocation?.speed ?? 0) > 0.3}
                size={34}
                celebrating={pulseCelebrating}
                newNotification={pulseNotification}
                accepted={pulseAccepted}
                donated={pulseDonated}
                nearbyUser={birdNearbyUser}
                approaching={birdApproaching}
                mapZoom={mapZoom}
                upcomingTurnDirection={birdUpcomingTurn}
                isHelping={helperModeActive && !!activeRequestId}
                batterySaver={batterySaverActive}
                skyTier={skyTier}
                activityLevel={activityLevel}
              />
            </ErrorBoundary>
          </Marker>
        )}

        {/* ── Real-time traffic layer ──────────────────────────────────────── */}
        {/* Zoom-gated: traffic flow lines are illegible (and pure GPU cost)
            zoomed out past street level, so skip mounting the layer entirely
            below zoom 10 rather than rendering invisible geometry. */}
        {helperModeActive && showTraffic && mapZoom >= 10 && (
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
        {helperModeActive && showHeatmap && openRequests.length > 0 && mapZoom <= CLUSTER_MAX_ZOOM && (
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
        {helperModeActive && openRequests.length > 0 && (
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
        {helperModeActive && showIndividualMarkers && openRequests.filter(r => r.lat != null && r.lng != null).map(r => (
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

        {/* ── Community mode: civic need + resource pins ───────────────────
            Replaces the request cluster/heatmap/pin layers above (all
            gated to helperModeActive) with the two civic pin families —
            helpers online are already rendered unconditionally above this
            block since both modes want to see them. */}
        {!helperModeActive && communityNeeds.filter(n => n.lat != null && n.lng != null).map(n => (
          <Marker key={`need-${n.id}`} longitude={n.lng} latitude={n.lat} anchor="center">
            <CivicNeedMarker need={n} />
          </Marker>
        ))}
        {!helperModeActive && communityResources.filter(r => r.lat != null && r.lng != null).map(r => (
          <Marker key={`resource-${r.id}`} longitude={r.lng} latitude={r.lat} anchor="center">
            <CivicResourceMarker resource={r} onSelect={setSelectedResource} />
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

      </Map>}

      {/* ── Consolidated map controls ──────────────────────────────────────
          Single MapControlsPanel replaces what used to be two separately-
          positioned absolute rows, each with its own hand-rolled popup.
          Rendered as a sibling of <Map>, not a child of it — react-map-gl
          only needs actual map layers/markers as children; plain overlay
          chrome works identically either way and reads clearer split out. */}
      {!mapError && viewMode === "map" && (
        <MapControlsPanel
          helperModeActive={helperModeActive}
          mode={helperModeActive ? "helper" : "community"}
          orientMode={orientMode}
          onToggleOrientation={() => {
            // 3-mode cycle: north-up → heading-up → locked-north → north-up
            // Doc: "Tap once: Bird rotates. Tap twice: Map rotates with bird.
            //       Tap three times: Bird locks to North."
            const next =
              orientMode === "north-up"     ? "heading-up"   :
              orientMode === "heading-up"   ? "locked-north" : "north-up";
            setOrientMode(next);
          }}
          onRecenter={recenterOnMe}
          recenterEnabled={!!(myLocation ?? ipFallback)}
          isOffCenter={isOffCenter}
          layers={{ showTraffic, onToggleTraffic: () => setShowTraffic(t => !t), showHeatmap, onToggleHeatmap: () => setShowHeatmap(h => !h) }}
          filters={helperModeActive ? {
            categoryFilter, onCategoryFilterChange: setCategoryFilter,
            urgencyFilter, onUrgencyFilterChange: setUrgencyFilter,
            helperLanguageFilter, onHelperLanguageFilterChange: setHelperLanguageFilter,
            availableCategories,
          } : {
            categoryFilter: communityCategoryFilter, onCategoryFilterChange: setCommunityCategoryFilter,
            urgencyFilter: null, onUrgencyFilterChange: () => {},
            helperLanguageFilter, onHelperLanguageFilterChange: setHelperLanguageFilter,
            availableCategories: communityAvailableCategories,
          }}
          showFiltersSheet={showFiltersSheet}
          onFiltersSheetChange={handleFiltersSheetChange}
          showLayersSheet={showLayersSheet}
          onLayersSheetChange={handleLayersSheetChange}
          onRequestHere={!helperModeActive ? handleRequestHere : undefined}
          controlsRecede={(sheetExpanded && helperModeActive && openRequests.length > 0) || mapNavOpen}
          hiddenEmergencyCount={hiddenEmergencyCount}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      )}

      {/* One-time nudge banner — shown when OS Reduce Motion is on and user
          hasn't enabled the animation override yet. Auto-dismissed on enable
          or explicit ✕; also reachable via Map Settings → Accessibility. */}
      {!mapError && viewMode === "map" && <MapAnimNudge />}

      {/* Best Match card — helper-mode only, shows top open request nearby.
          Rendered alongside the BottomSheet (no longer either/or): with the
          sheet defaulting to collapsed (96px peek) there's no real estate
          conflict, and a helper shouldn't lose their top-pick prompt just
          because the sheet also has content. */}
      {/* !statsExpanded: worst-case top-of-screen audit — on a short viewport
          (iPhone SE-height and similar) TopBar + a merged status/stats band
          + a fully expanded stats breakdown can run tall enough to approach
          this card's bottom-44 anchor. The expanded stats detail is a brief,
          user-triggered overlay, so it takes priority and this recedes
          rather than risking an overlap; it reappears the instant stats
          collapse back to the pill. */}
      {showBestMatch && !mapError && !statsExpanded && viewMode === "map" && (
        <BestMatchCard
          key={bestMatch.id}
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
          onExpandedChange={setSheetExpanded}
        />
      )}

      {/* Community mode data is now accessed via the TopBar hamburger menu
          (CommunityTopPanel, rendered above near the TopBar). The bottom
          sheet has been removed so map navigation controls are never obscured. */}

      {/* Resource tap-to-detail sheet — shared by the map pin, bottom sheet
          row, and list-view row, all of which call setSelectedResource. */}
      <ResourceDetailSheet resource={selectedResource} onClose={() => setSelectedResource(null)} />

      {/* "Request Help" FAB — requester-mode only.
          In a *working* Map view this is superseded by MapControlsPanel's
          "Request Help Here" pill (same action, but pins the request to the
          map center instead of raw GPS) — keeping both on screen at once
          would just be two buttons for the same job, so this FAB stays
          hidden there. It still shows in List view (no map center concept)
          and in the WebGL/token fallback screen (no live map at all, so
          MapControlsPanel never mounts there either) — those are the two
          cases with no other "post a request" entry point on this screen.
          bottom offset uses calc(5.5rem + safe-area) — plain bottom-20
          (80px) sat underneath BottomNav's opaque, fixed, z-50 bar (~64px
          content + its own safe-area padding) and was invisible/untappable. */}
      {!helperModeActive && (viewMode === "list" || !!mapError) && (
        <button
          onClick={() => setLocation("/request/new")}
          style={{ touchAction: "manipulation", bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))", zIndex: Z_CHROME }}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-[0_4px_20px_rgba(0,212,255,0.35)] active:scale-95 transition-transform font-black text-xs uppercase tracking-wider"
          aria-label="Request help"
        >
          <Plus className="w-4 h-4" />
          Request Help
        </button>
      )}
    </div>
  );
}
