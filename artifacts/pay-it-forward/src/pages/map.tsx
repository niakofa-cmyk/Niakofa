import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import { MapPin, Wifi, WifiOff, Users, Activity, AlertTriangle, Navigation2, Layers, X, Siren, Zap, Locate } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsIsConnected } from "@/lib/wsClient";
import { useTerrain } from "@/hooks/useTerrain";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";


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
  // Legacy specialties
  truck_owner:          ["transportation", "delivery_run", "stock_shelves", "errands"],
  medical_background:   ["medical", "emergency"],
  bilingual:            ["groceries", "errands", "medical", "other"],
  licensed_electrician: ["home_repair"],
  licensed_plumber:     ["home_repair"],
  carpenter:            ["home_repair", "event_setup"],
  tech_support:         ["tech_support"],
  // New helper application skills
  plumbing:             ["home_repair"],
  electrical:           ["home_repair"],
  carpentry:            ["home_repair", "event_setup"],
  painting:             ["home_repair"],
  yard_work:            ["home_repair", "other", "local_farm"],
  heavy_lifting:        ["home_repair", "delivery_run", "event_setup"],
  drives_truck:         ["transportation", "delivery_run", "stock_shelves", "errands"],
  cdl_driver:           ["transportation", "delivery_run"],
  grocery_shopping:     ["groceries"],
  cooking:              ["other"],
  childcare:            ["other"],
  elder_care:           ["medical", "other"],
  medical_support:      ["medical", "emergency"],
  tutoring:             ["other"],
  translation:          ["other", "medical", "errands"],
  pet_care:             ["other"],
  food_delivery:        ["groceries", "delivery_run", "local_farm"],
  food_handler:         ["errands", "event_setup", "local_farm", "food_pantry"],
  event_setup:          ["event_setup"],
  emergency_first_aid:  ["emergency", "medical"],
};

const CATEGORY_WEIGHT: Record<string, number> = {
  emergency: 30, medical: 20, home_repair: 5, groceries: 3,
  transportation: 3, errands: 2, stock_shelves: 2, event_setup: 2,
  delivery_run: 2, tech_support: 2, food_pantry: 3, local_farm: 2, other: 0,
};

function pickBestMatch(
  requests: HelpRequest[],
  helperSpecialties?: string[] | null,
  serviceRadiusMiles: number = 10
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

    // Local-first bonus (+12) — non-emergency requests within the helper's
    // own service radius are prioritized over ones outside it, so a helper
    // gets routed to nearby work before being offered a long trip. This is
    // a scoring bias, not a hard filter: a distant emergency still wins on
    // urgency alone (100 base vs. a local low-priority request's 5+12=17).
    const localA = (a.urgency !== "emergency" && (a.distance_miles ?? 99) <= serviceRadiusMiles) ? 12 : 0;
    const localB = (b.urgency !== "emergency" && (b.distance_miles ?? 99) <= serviceRadiusMiles) ? 12 : 0;

    const scoreA = uA + ageBoostA + catA + skillA + localA;
    const scoreB = uB + ageBoostB + catB + skillB + localB;
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
  /** BUG-033: region from the crisis API response (e.g. "Tarrant County").
   * Optional — falls back to a generic label if not set by the server. */
  region?: string;
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
  const [showDensity, setShowDensity] = useState(false);
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string | null>(null);
  const prevHelperMode = useRef(false);
  const [crisis, setCrisis] = useState<CrisisState | null>(null);
  const [crisisDismissed, setCrisisDismissed] = useState(false);
  // Local-first dispatch: service_radius_miles is the helper's normal working
  // area (drives map radius + visual styling); max_travel_miles is the
  // absolute outer limit (drives map radius when in helper mode, and is
  // enforced server-side at claim time). Non-helper-mode browsing (a
  // requester just looking at the community map) is intentionally
  // unaffected by either — those are helper-specific operational settings,
  // not something that should narrow what a requester can see.
  const [helperRadiusSettings, setHelperRadiusSettings] = useState<{ service_radius_miles: number; max_travel_miles: number } | null>(null);
  const [farClaimConfirm, setFarClaimConfirm] = useState<HelpRequest | null>(null);

  useEffect(() => {
    if (!currentUser?.id) { setHelperRadiusSettings(null); return; }
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const token = localStorage.getItem("niakofa_token") ?? "";
    fetch(`${base}/api/users/${currentUser.id}/settings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setHelperRadiusSettings({
            service_radius_miles: data.service_radius_miles ?? 10,
            max_travel_miles: data.max_travel_miles ?? 15,
          });
        }
      })
      .catch(() => {});
  }, [currentUser?.id]);

  const NON_HELPER_MAP_RADIUS = 10;
  const serviceRadiusMiles = helperRadiusSettings?.service_radius_miles ?? 10;
  const maxTravelMiles = helperRadiusSettings?.max_travel_miles ?? 15;
  // Only widen/narrow the map's request radius when actually in helper mode —
  // a requester browsing the community map gets the flat default regardless
  // of what their (possibly never-touched) helper settings say.
  const mapRadiusMiles = helperModeActive ? maxTravelMiles : NON_HELPER_MAP_RADIUS;

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const token = localStorage.getItem("niakofa_token") ?? "";
    // BUG-M03: include auth header so authenticated users get personalised crisis state
    fetch(`${base}/api/crisis/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(async (data: CrisisState) => {
        if (!data.active) return;
        // Fetch verified regional resources and merge — regional contacts take
        // precedence over anything the admin typed into the crisis status payload.
        try {
          const loc = (window as unknown as { __niakofaRegion?: string }).__niakofaRegion ?? currentUser?.city ?? undefined;
          const qs = loc ? `?region=${encodeURIComponent(loc)}` : "";
          const rr = await fetch(`${base}/api/crisis/resources${qs}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (rr.ok) {
            const rd = await rr.json() as { region?: string; verified: boolean; resources: CrisisState["resources"] };
            setCrisis({
              ...data,
              region: rd.region ?? data.region,
              resources: rd.resources && rd.resources.length > 0 ? rd.resources : (data.resources ?? []),
            });
            return;
          }
        } catch { /* fall through to plain crisis state */ }
        setCrisis(data);
      })
      .catch(() => {});
  }, []);

  const onMapError = useCallback((e: unknown) => {
    const msg = (e as { error?: { message?: string } })?.error?.message ?? "Map failed to load";
    setMapError(msg);
  }, []);

  const { data: requests = [] } = useGetNearbyRequests(
    { lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: mapRadiusMiles },
    { query: { enabled: !!myLocation, queryKey: getGetNearbyRequestsQueryKey({ lat: myLocation?.lat || 0, lng: myLocation?.lng || 0, radius_miles: mapRadiusMiles }) } }
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
      // BUG-014: crisis_update is now in the WsEventType union — the cast is removed.
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

  // BUG-5-M02: React 19 strict mode double-invokes effects (mount → cleanup → remount).
  // react-map-gl creates a Mapbox GL WebGL context on each mount. Without this guard,
  // the fake strict-mode unmount leaves the GL context alive (react-map-gl's internal
  // cleanup is async) and the second remount's effects try to operate on the first
  // (about-to-be-destroyed) GL context, causing "Cannot read properties of null" or
  // "WebGL context lost" errors. Nulling our ref synchronously on unmount ensures every
  // downstream useEffect and hook (useTerrain, flyTo, etc.) sees null and bails early
  // rather than touching a dead context. react-map-gl itself handles map.remove().
  useEffect(() => {
    return () => {
      (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = null;
    };
  }, []);

  // Main map screen stays locked to north-up always — heading-up rotation
  // and auto-follow are reserved for the active-navigation screen, matching
  // how Uber/DoorDash only auto-rotate/follow during a live trip, not while
  // idly browsing the map.
  const handleRecenter = useCallback(() => {
    if (myLocation && mapRef.current) {
      mapRef.current.flyTo({ center: [myLocation.lng, myLocation.lat], zoom: 14, duration: 800 });
    }
  }, [myLocation]);
  const submitClaim = useCallback((request: HelpRequest) => {
    if (!currentUser) return;
    claimMutation.mutate(
      { id: request.id, data: { helper_id: currentUser.id } },
      {
        onSuccess: (claimed) => {
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          if ((claimed as HelpRequest)?.outside_usual_area) {
            toast({ title: "Thanks for going the extra mile 💙", description: "This one's outside your usual area." });
          }
          setLocation(`/request/${request.id}`);
        },
        onError: (err) => {
          const raw = (err as { message?: string })?.message;
          const friendly = raw?.replace(/^HTTP \d+ [^:]+:\s*/, "");
          toast({
            title: "Couldn't claim this request",
            description: friendly || "It may have just been claimed by someone else.",
            variant: "destructive",
          });
        },
      }
    );
  }, [currentUser, claimMutation, queryClient, setLocation]);

  const handleClaim = useCallback((request: HelpRequest) => {
    if (!currentUser) return;
    // Local-first dispatch: nudge toward confirming before traveling outside
    // the usual service area, rather than silently claiming. True emergencies
    // skip this — urgency overrides personal radius preference everywhere
    // else in this codebase too (see lib/matching.ts), and the server itself
    // never blocks emergency claims regardless of distance.
    const isFar = helperModeActive && request.urgency !== "emergency" && (request.distance_miles ?? 0) > serviceRadiusMiles;
    if (isFar) {
      setFarClaimConfirm(request);
      return;
    }
    submitClaim(request);
  }, [currentUser, helperModeActive, serviceRadiusMiles, submitClaim]);

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

  // Request density GeoJSON — all open requests as weighted points (Phase 10E)
  const requestDensityGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: allOpenRequests
      .filter(r => typeof r.lat === "number" && typeof r.lng === "number" && isFinite(r.lat) && isFinite(r.lng))
      .map(r => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: {
          weight: r.urgency === "emergency" ? 1.0 : r.urgency === "high" ? 0.7 : r.urgency === "medium" ? 0.4 : 0.2,
        },
      })),
  }), [allOpenRequests]);

  // Cluster GeoJSON — same points, used by Mapbox cluster source
  const requestClusterGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: allOpenRequests
      .filter(r => typeof r.lat === "number" && typeof r.lng === "number" && isFinite(r.lat) && isFinite(r.lng))
      .map(r => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: { id: r.id, urgency: r.urgency ?? "low", category: r.category ?? "other" },
      })),
  }), [allOpenRequests]);

    // Request density GeoJSON — all open requests as weighted points (Phase 10E)
  // Compute which categories the current helper's skills cover
  const helperSkillCategories = useMemo(() => {
    // BUG-025: Two separate skill columns exist — helper_skills (new helper-application field)
    // and specialties (legacy). The dual-lookup `helper_skills ?? specialties ?? []` keeps
    // both working until a DB migration consolidates them. TODO: migrate specialties data
    // into helper_skills and remove the specialties column once clients have migrated.
    const u = currentUser as unknown as { helper_skills?: string[] | null; specialties?: string[] | null };
    const skills = (u?.helper_skills ?? u?.specialties ?? []).map(s => s.toLowerCase().replace(/\s+/g, "_"));
    const matchedCategories = new Set<string>();
    for (const [skill, cats] of Object.entries(SKILL_CATEGORY_MAP)) {
      if (skills.includes(skill)) cats.forEach(c => matchedCategories.add(c));
    }
    return matchedCategories;
  }, [currentUser]);

  // Returns true when a request's category matches at least one of this helper's skills
  const isSkillMatch = useCallback((request: HelpRequest) => {
    if (!helperModeActive) return false;
    if (helperSkillCategories.size === 0) return false;
    return helperSkillCategories.has(request.category ?? "other");
  }, [helperModeActive, helperSkillCategories]);

  const skillMatchCount = useMemo(() => openRequests.filter(isSkillMatch).length, [openRequests, isSkillMatch]);

  // Dispatch Intelligence — Best Match card
  const helperSkills = (currentUser as unknown as { helper_skills?: string[] | null; specialties?: string[] | null })?.helper_skills
    ?? (currentUser as unknown as { specialties?: string[] | null })?.specialties;
  const bestMatch = helperModeActive ? pickBestMatch(openRequests, helperSkills, serviceRadiusMiles) : null;
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
                {/* BUG-033: Use region from the crisis payload if provided; fall back to
                    "Your Community" rather than a hardcoded county name */}
                Community Emergency Alert{crisis.region ? ` · ${crisis.region}` : ""}
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
          {helperModeActive && skillMatchCount > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/50 px-2.5 py-1.5 rounded-full shadow-lg">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-400">{skillMatchCount} skill match{skillMatchCount !== 1 ? "es" : ""}</span>
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

      {/* BUG-015: Location prompt — shown when GPS hasn't resolved and no saved location.
          The map renders in the background at zoom-2 (world view) so WebGL stays warm.
          Once AppContext resolves GPS or IP-geolocation, myLocation becomes non-null
          and the map's useEffect flyTo re-centers automatically. */}
      {!myLocation && webGLSupported && !mapError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-xl px-5 py-4 flex flex-col items-center gap-2 max-w-xs w-[90%]">
          <MapPin className="w-6 h-6 text-primary" />
          <p className="text-sm font-bold text-center">Locating you…</p>
          <p className="text-xs text-muted-foreground text-center">Allow location access so the map can center on your neighborhood.</p>
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
          // BUG-015: When myLocation is null (new user, no GPS yet, no saved
          // location), the map used to silently center on hardcoded Fort Worth
          // coordinates (-97.33, 32.75), confusing users in other cities.
          // Fix: use 0,0 as a neutral fallback; the location prompt overlay
          // below instructs the user to enable location access. Once GPS or
          // the AppContext IP-geolocation fallback resolves, the map flyTo
          // in the useEffect (line ~287) re-centers automatically.
          longitude: myLocation?.lng ?? 0,
          latitude: myLocation?.lat ?? 0,
          zoom: myLocation ? 13.5 : 2,
          pitch: myLocation ? 45 : 0,
          bearing: 0,
        }}
        ref={(ref) => {
          // BUG-5-M02: Also null out on unmount (ref === null) so the cleanup
          // effect above and react-map-gl's own teardown don't race each other.
          (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = ref ? ref.getMap() : null;
        }}
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

        {/* Open request markers — skill-matched ones render in emerald with a ⚡ badge */}
        {openRequests
          .filter(r => typeof r.lat === "number" && typeof r.lng === "number" && isFinite(r.lat) && isFinite(r.lng))
          .map(r => (
            <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor="bottom">
              <RequestMarker request={r} skillMatch={isSkillMatch(r)} outsideServiceArea={helperModeActive && (r.distance_miles ?? 0) > serviceRadiusMiles} />
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

      </Map>
      )}

      {/* Re-center button — manual recenter only; main map stays north-up
          and user-controlled, unlike the active-navigation screen. */}
      {myLocation && !mapError && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-44 right-4 z-30 w-11 h-11 bg-card/90 backdrop-blur-md border border-border rounded-full shadow-lg flex items-center justify-center hover:bg-card transition-colors"
          aria-label="Re-center map on my location"
        >
          <Locate className="w-4 h-4 text-primary" />
        </button>
      )}

      {/* Neighborhood filter chips — appear when requests have neighborhood data */}
      {/* BUG-022: Removed helperModeActive gate — requesters also benefit from neighborhood filtering */}
      {availableNeighborhoods.length > 0 && (
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

      {/* Request density toggle button — Phase 10E */}
      {webGLSupported && !mapError && (
        <button
          onClick={() => setShowDensity(v => !v)}
          title={showDensity ? "Hide request density" : "Show request density heatmap"}
          aria-label={showDensity ? "Hide request density" : "Show request density heatmap"}
          aria-pressed={showDensity}
          className={`absolute bottom-40 right-4 z-10 w-11 h-11 rounded-xl border flex items-center justify-center shadow-lg transition-all ${
            showDensity
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          <Activity className="w-4 h-4" />
        </button>
      )}

            {/* Request density toggle button — Phase 10E */}
      {webGLSupported && !mapError && (
        <button
          onClick={() => setShowDensity(v => !v)}
          title={showDensity ? "Hide request density" : "Show request density heatmap"}
          aria-label={showDensity ? "Hide request density" : "Show request density heatmap"}
          aria-pressed={showDensity}
          className={`absolute bottom-40 right-4 z-10 w-11 h-11 rounded-xl border flex items-center justify-center shadow-lg transition-all ${
            showDensity
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          <Activity className="w-4 h-4" />
        </button>
      )}

            {/* Heatmap toggle button */}
      {webGLSupported && !mapError && (
        <button
          onClick={() => setShowHeatmap(v => !v)}
          title={showHeatmap ? "Hide helper heatmap" : "Show helper availability heatmap"}
          aria-label={showHeatmap ? "Hide helper heatmap" : "Show helper availability heatmap"}
          aria-pressed={showHeatmap}
          className={`absolute bottom-28 right-4 z-10 w-11 h-11 rounded-xl border flex items-center justify-center shadow-lg transition-all ${
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
          <BottomSheet requests={openRequests} onClaim={handleClaim} isClaiming={claimMutation.isPending} dismissedId={bestMatchDismissed} />
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

      <AlertDialog open={!!farClaimConfirm} onOpenChange={(open) => { if (!open) setFarClaimConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This one's outside your usual area</AlertDialogTitle>
            <AlertDialogDescription>
              {farClaimConfirm
                ? `"${farClaimConfirm.title}" is about ${(farClaimConfirm.distance_miles ?? 0).toFixed(1)} miles away — beyond your ${serviceRadiusMiles}-mile service radius. You can still help; just confirming since it's a longer trip than usual.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFarClaimConfirm(null)}>Never mind</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (farClaimConfirm) submitClaim(farClaimConfirm);
                setFarClaimConfirm(null);
              }}
            >
              I'll help anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
