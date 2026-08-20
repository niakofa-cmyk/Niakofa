import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { detectVoiceLocale, pickBestVoice, detectUnits, detectMapLanguage } from "@/lib/locale-utils";
import { useGetRequest, useGetRequests, useGetRoute, useCompleteRequest, useMarkEnRoute, useMarkArrived, useGetUserSettings, getGetRequestQueryKey, getGetRequestsQueryKey, getGetRouteQueryKey, getGetUserSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, DollarSign, Star, Navigation2, Clock, AlertTriangle, Share2, CheckCircle2, Car, PersonStanding, Bike, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import { InAppChat } from "@/components/InAppChat";
import { TipModal } from "@/components/TipModal";
import { RatingModal } from "@/components/RatingModal";
import { SafetyPanel } from "@/components/SafetyPanel";
import { getToken } from "@/lib/auth";
import { TurnArrowHUD } from "@/components/TurnArrowHUD";
import { OrientationToggle } from "@/components/OrientationToggle";
import { useWebSocket } from "@/lib/useWebSocket";
import { useFusedHeading } from "@/hooks/useFusedHeading";
import { usePositionHeading } from "@/hooks/usePositionHeading";
import { useHeadingWithHold } from "@/hooks/useHeadingWithHold";
import { useMapOrientation } from "@/hooks/useMapOrientation";
import { useTerrain } from "@/hooks/useTerrain";
import { useTweenedPosition } from "@/hooks/useTweenedPosition";
import { usePulse } from "@/hooks/usePulse";
import { SpiritAnimalAvatar } from "@/components/SpiritAnimal/SpiritAnimalAvatar";
import { useSolarTier } from "@/hooks/useTimeOfDay";
import { useBatterySaver } from "@/hooks/useBatterySaver";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";
import { haversineMeters, isNearbyUser } from "@/lib/geo-utils";
import { newOperationKey } from "@/lib/retryableMutation";

const ARRIVAL_THRESHOLD_METERS = 80;
const OFF_ROUTE_THRESHOLD_METERS = 150;
const SAFETY_TIMER_SECONDS = 1200;
// Reroute cooldown: 15 s — short enough to catch a missed turn quickly but
// avoids spamming Mapbox API if GPS jitters briefly off the polyline.
const OFF_ROUTE_COOLDOWN_MS = 15_000;

// Resolved once at module scope — avoids re-reading the env object on every
// render and provides a single place for the missing-token guard below.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// distanceMeters is now haversineMeters from geo-utils — single source of truth
// shared with map.tsx so any precision change propagates to both pages.


function parseEtaSeconds(etaText: string): number {
  const minMatch = etaText.match(/(\d+)\s*min/i);
  const hrMatch = etaText.match(/(\d+)\s*hr/i);
  let s = 0;
  if (hrMatch) s += parseInt(hrMatch[1]) * 3600;
  if (minMatch) s += parseInt(minMatch[1]) * 60;
  return s || 0;
}

function ptToSegDist(
  lat: number, lng: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 111320;
  const cosLat = Math.cos(lat * (Math.PI / 180));
  const dy = (lat2 - lat1) * R;
  const dx = (lng2 - lng1) * R * cosLat;
  const py = (lat - lat1) * R;
  const px = (lng - lng1) * R * cosLat;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq)) : 0;
  const rx = px - t * dx;
  const ry = py - t * dy;
  return Math.sqrt(rx * rx + ry * ry);
}

function distToRoute(
  lat: number, lng: number,
  geometry: { type: string; coordinates: number[][] } | null,
): number {
  if (!geometry?.coordinates?.length) return 0;
  let min = Infinity;
  const coords = geometry.coordinates;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const d = ptToSegDist(lat, lng, lat1, lng1, lat2, lng2);
    if (d < min) min = d;
  }
  return min;
}

function computeCurrentStep(
  lat: number, lng: number,
  steps: { distance_meters: number }[],
  destLat: number, destLng: number,
): number {
  const totalDistToDest = haversineMeters(lat, lng, destLat, destLng);
  let cumulative = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    cumulative += steps[i].distance_meters;
    if (cumulative >= totalDistToDest) {
      return Math.max(0, i);
    }
  }
  return 0;
}

export default function ActiveRequestScreen() {
  const [, params] = useRoute("/request/:id");
  const [, setLocation] = useLocation();
  const { currentUser, myLocation } = useAppContext();
  const { data: userSettings } = useGetUserSettings(
    currentUser?.id ?? 0,
    { query: { queryKey: getGetUserSettingsQueryKey(currentUser?.id ?? 0), enabled: !!currentUser?.id } },
  );
  // Solar sky tier — four-way lighting (day / golden / twilight / night) from
  // real-time NOAA sun position. Feeds SankofaBird skyTier prop for photorealistic
  // plumage shading that matches the actual sky the user is looking at.
  const skyTier = useSolarTier(myLocation?.lat ?? null, myLocation?.lng ?? null);

  // Battery saver: auto-enabled when Battery API reports ≤ 15 % or device has < 4 GB RAM.
  const batterySaverActive = useBatterySaver();

  // Activity level: live open-request count → bird alertness on both screens.
  // Formula: √(openCount / 10), capped at 1.0.
  // 0 requests → 0.0 (quiet), 10 → 1.0 (peak), 4 → ~0.63 (busy).
  // Refetched every 30 s for responsive bird activity (was 60 s).
  const { data: openRequestsData } = useGetRequests(
    { status: "open" },
    { query: { queryKey: getGetRequestsQueryKey({ status: "open" }), staleTime: 30_000, refetchInterval: 30_000 } }
  );
  const openRequestCount = Array.isArray(openRequestsData) ? openRequestsData.length : 0;
  const requestActivityLevel = Math.min(1, Math.sqrt(openRequestCount / 10));
  const queryClient = useQueryClient();
  const requestId = parseInt(params?.id || "0", 10);
  const operationKeys = useRef<Record<string, string>>({});
  const operationKey = useCallback((name: string) => {
    operationKeys.current[name] ??= newOperationKey(name, requestId);
    return operationKeys.current[name];
  }, [requestId]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [autoArrived, setAutoArrived] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [etaCountdown, setEtaCountdown] = useState(0);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [safetyAlertShown, setSafetyAlertShown] = useState(false);
  const [_shareVisible, setShareVisible] = useState(false);
  const [routingProfile, setRoutingProfile] = useState<"driving" | "walking" | "cycling">("driving");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const mapRef = useRef<MapRef>(null);
  const [showTip, setShowTip] = useState(false);
  const [_tipShown, _setTipShown] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelReasonPicker, setShowCancelReasonPicker] = useState(false);
  const hasEtaCountdown = etaCountdown > 0;
  const currentUserId = currentUser?.id;

  // ── SankofaBird micro-reactions ────────────────────────────────────────
  // celebrating:      bird glows teal + feather shimmer when request is completed
  // accepted:         hop + wing stretch when helper arrives at destination
  // donated:          golden sparkle + egg glow on pledge payment / contribution
  // newNotification:  head-tilt + wing flick on a new nearby help request
  const [birdCelebrating, setBirdCelebrating] = useState(false);
  const [birdAccepted, setBirdAccepted] = useState(false);
  const [birdDonated, setBirdDonated] = useState(false);
  const [birdNewNotification, setBirdNewNotification] = useState(false);
  // Approaching: true when NavigationOverlay reports < 50 m to destination —
  // triggers the bird's cinematic deceleration (slower flap, descent bob,
  // egg pulse) as described in the vision doc's anticipatory behavior section.
  const [birdApproaching, setBirdApproaching] = useState(false);

  // ── usePulse: rising-edge debounce for micro-reactions ──────────────────
  // Prevents CSS animation stutter when props rapidly cycle true/false due to
  // GPS re-renders, WS reconnects, or batched state updates.
  const pulseCelebrating  = usePulse(birdCelebrating,    2000);
  const pulseAccepted     = usePulse(birdAccepted,        1500);
  const pulseDonated      = usePulse(birdDonated,         2800);
  const pulseNotification = usePulse(birdNewNotification, 2000);

  // ── SankofaBird LOD — track map zoom to drive detail level ─────────────
  // Default 15 (street-level full detail) since this screen always starts
  // zoomed in at zoom 15 (pitchZoom view). Updated via onZoom to keep LOD
  // accurate if the user pinch-zooms out during navigation.
  const [navMapZoom, setNavMapZoom] = useState(15);

  const enRouteRef = useRef(false);
  const offRouteCooldownRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const lastSpokenStepRef = useRef<number>(-1);
  // Guard: suppress easeTo GPS-follow while fitBounds is animating the route
  // overview (1 200 ms). Without this, every tweenedPosition update (RAF, ~16 ms)
  // calls easeTo and fights the fitBounds animation, causing visible camera jitter.
  const isFittingBoundsRef = useRef(false);
  const fittingBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cleanup fittingBoundsTimerRef on unmount to prevent setState-on-unmounted-component.
  useEffect(() => {
    return () => {
      if (fittingBoundsTimerRef.current) clearTimeout(fittingBoundsTimerRef.current);
    };
  }, []);

  // ── Directional map UX ─────────────────────────────────────────────────
  // rawMapRef holds the mapboxgl.Map instance, resolved only after mount
  // via the onLoad callback — never at render time (where it would be null).
  const rawMapRef = useRef<mapboxgl.Map | null>(null);
  const syncRawMap = useCallback(() => {
    rawMapRef.current = mapRef.current?.getMap?.() ?? null;
  }, []);

  // Fused heading: blends the magnetometer compass with GPS course-over-
  // ground (myLocation.heading/.speed from AppContext). GPS course dominates
  // once moving at walking pace or faster — critical here since helpers are
  // usually driving/walking to the request. See useFusedHeading.ts and
  // .agents/memory/niakofa-heading-fusion-fix.md for the full rationale;
  // this page previously used the raw useDeviceHeading hook directly, which
  // inherited the vehicle-compass-unreliability problem useFusedHeading exists
  // to solve.
  const fusedHeading = useFusedHeading({
    gpsHeading: myLocation?.heading ?? null,
    gpsSpeed: myLocation?.speed ?? null,
  });
  // Third-tier fallback (see usePositionHeading.ts): derives a heading from
  // consecutive GPS fixes alone, so the bird still turns toward its direction
  // of travel when both the compass and coords.heading are unavailable —
  // which is common on this screen since helpers are often on foot at a
  // walking pace the GPS chipset can't derive a confident course at.
  const positionHeading = usePositionHeading(myLocation?.lat, myLocation?.lng);
  // Hold the last known-good heading 12 s through GPS/compass dropout gaps so
  // the bird doesn't snap back to its default left-facing pose mid-navigation.
  const rawHeading = fusedHeading ?? myLocation?.heading ?? positionHeading ?? null;
  const heldHeading = useHeadingWithHold(rawHeading);
  const { mode, setMode, applyHeading } = useMapOrientation(rawMapRef);
  useTerrain(rawMapRef);

  // Smooth GPS glide — interpolates between position fixes (1-3 s apart) so
  // the SankofaBird marker flies to each new GPS coordinate rather than snapping.
  const tweenedPosition = useTweenedPosition(myLocation ?? null, 800);

  useEffect(() => {
    if (fusedHeading != null) applyHeading(fusedHeading);
  }, [fusedHeading, applyHeading]);

  // ── Data ───────────────────────────────────────────────────────────────

  const { data: request, isLoading: requestLoading } = useGetRequest(requestId, {
    query: { enabled: !!requestId, queryKey: getGetRequestQueryKey(requestId) }
  });

  // Declared early (before any effect references them) to avoid a
  // temporal-dead-zone crash. Guarded with ?. since `request` can
  // still be undefined here on first render, before data loads.
  const isArrived = request?.status === "arrived" || autoArrived;
  const isCompleted = request?.status === "completed";
  // isHelper drives role-split UI: navigation/voice for helpers,
  // "tracking your helper" status card for requesters.
  const isHelper = !!currentUser && !!request && request.helper_id === currentUser.id;

  // nearbyUser: wing-salute when helper is within ~200m of the requester.
  // Doc: "If two users are meeting to complete a request, the birds could
  //       briefly circle each other before settling." We approximate with a
  //       wing-salute once the helper is very close to the destination.
  // Placed after isArrived/isCompleted/request to avoid temporal-dead-zone.
  // isNearbyUser uses NEARBY_USER_METERS (200 m) from geo-utils — same constant
  // as map.tsx so both pages trigger the wing-salute at the same proximity.
  const birdNearbyUser = !isArrived && !isCompleted && myLocation != null && request != null
    && isNearbyUser(myLocation.lat, myLocation.lng, request.lat, request.lng);

  const routeParams = useMemo(() => ({
    // Use ?? (null coalescing) not || so that lat/lng = 0 (equatorial cities
    // like Kampala UG at 0.3°N, Libreville GA at 0.4°N) are treated as valid
    // coordinates rather than being replaced with a fallback of 0,0 (Gulf of Guinea).
    start_lat: myLocation?.lat ?? 0,
    start_lng: myLocation?.lng ?? 0,
    end_lat: request?.lat ?? 0,
    end_lng: request?.lng ?? 0,
    profile: routingProfile,
    // Locale-aware navigation: voice instructions and distance units match the
    // user's locale automatically. Helpers in Lagos get km + Mapbox Hausa TTS;
    // helpers in London get miles + English voice.
    lang: detectMapLanguage(),
    units: detectUnits(),
  }), [myLocation?.lat, myLocation?.lng, request?.lat, request?.lng, routingProfile]);
  const { data: routeData } = useGetRoute(routeParams, {
    query: {
      enabled: !!myLocation && !!request,
      refetchInterval: isOffRoute ? 2000 : 15000,
      queryKey: getGetRouteQueryKey(routeParams),
    }
  });

  const completeMutation = useCompleteRequest({
    request: { headers: { "Idempotency-Key": operationKey("complete") } },
  });
  const enRouteMutation = useMarkEnRoute({
    request: { headers: { "Idempotency-Key": operationKey("en-route") } },
  });
  const arrivedMutation = useMarkArrived({
    request: { headers: { "Idempotency-Key": operationKey("arrived") } },
  });

  // Trip timer
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Safety timer — role-aware copy
  useEffect(() => {
    if (autoArrived || safetyAlertShown) return;
    if (elapsedSeconds >= SAFETY_TIMER_SECONDS) {
      setSafetyAlertShown(true);
      if (isHelper) {
        toast({
          title: "⏱️ Still on your way?",
          description: "You've been en route for 20 minutes. Everything okay? Complete the request or use SOS if needed.",
        });
      } else {
        toast({
          title: "⏱️ Your helper has been on the way for 20 min",
          description: "Everything okay? If your helper hasn't arrived or gone silent, tap SOS for immediate support.",
          variant: "destructive",
        });
      }
    }
  }, [elapsedSeconds, autoArrived, safetyAlertShown, isHelper]);

  // ETA countdown
  useEffect(() => {
    if (routeData?.eta_text) setEtaCountdown(parseEtaSeconds(routeData.eta_text));
  }, [routeData?.eta_text]);
  useEffect(() => {
    if (!hasEtaCountdown) return;
    const id = setInterval(() => setEtaCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [hasEtaCountdown]);

  // Mark en_route once
  useEffect(() => {
    if (request?.status === "claimed" && currentUser && !enRouteRef.current && !enRouteMutation.isPending) {
      enRouteRef.current = true;
      enRouteMutation.mutate({ id: requestId, data: { helper_id: currentUser.id } });
    }
  }, [request?.status, currentUser, enRouteMutation, requestId]);

  // Auto-detect arrival
  useEffect(() => {
    if (!myLocation || !request || autoArrived) return;
    if (request.status === "completed" || request.status === "arrived") return;
    const dist = haversineMeters(myLocation.lat, myLocation.lng, request.lat, request.lng);
    if (dist <= ARRIVAL_THRESHOLD_METERS && currentUser) {
      setAutoArrived(true);
      arrivedMutation.mutate(
        { id: requestId, data: { helper_id: currentUser.id } },
        {
          onSuccess: () => {
            toast({ title: "📍 You've arrived!", description: "Complete the request when you're done helping." });
            queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
          }
        }
      );
    }
  }, [myLocation, request, autoArrived, currentUser, arrivedMutation, queryClient, requestId, operationKey]);

  // Off-route detection
  useEffect(() => {
    if (!myLocation || !routeData?.geometry || autoArrived) return;
    if (offRouteCooldownRef.current) return;

    const geom = routeData.geometry as { type: string; coordinates: number[][] };
    const dist = distToRoute(myLocation.lat, myLocation.lng, geom);

    if (dist > OFF_ROUTE_THRESHOLD_METERS) {
      setIsOffRoute(true);
      offRouteCooldownRef.current = true;
      toast({
        title: "🔄 Off route — recalculating…",
        description: "You've deviated from the route. Fetching updated directions.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(routeParams) });
      setTimeout(() => {
        offRouteCooldownRef.current = false;
        setIsOffRoute(false);
      }, OFF_ROUTE_COOLDOWN_MS);
    } else {
      setIsOffRoute(false);
    }
  }, [myLocation, routeData, autoArrived, queryClient, routeParams]);

  // Step advancement
  useEffect(() => {
    if (!routeData?.steps || !myLocation || !request) return;
    const newStep = computeCurrentStep(
      myLocation.lat, myLocation.lng,
      routeData.steps,
      request.lat, request.lng,
    );
    setCurrentStepIndex(newStep);
  }, [myLocation, routeData, request]);

  // Turn-by-turn voice guidance via Web Speech API.
  // voiceEnabled is a user-controlled toggle; guards all TTS calls.
  // Voice selection: locale-aware — picks a voice matching the user's browser locale,
  // so a Swahili or French user hears instructions in their language (when the
  // browser supports it) rather than always receiving en-US TTS.
  const speakInstruction = useCallback((text: string) => {
    if (!voiceEnabled || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;   // Slightly faster — more natural for nav
    utt.pitch = 1.0;
    utt.volume = 1.0;
    const locale = detectVoiceLocale();
    const preferred = pickBestVoice(locale);
    if (preferred) utt.voice = preferred;
    utt.lang = locale;
    window.speechSynthesis.speak(utt);
  }, [voiceEnabled]);

  // Voice guidance — helpers only. Requesters aren't driving; TTS on their
  // phone for a trip they're not taking is confusing and potentially alarming.
  // Use voice_announcement (richer Mapbox phrasing) when available, else fall
  // back to the shorter instruction string.
  useEffect(() => {
    if (!isHelper || isArrived || !routeData?.steps) return;
    const step = routeData.steps[currentStepIndex] as typeof routeData.steps[number] & { voice_announcement?: string };
    if (!step?.instruction) return;
    if (lastSpokenStepRef.current === currentStepIndex) return;
    lastSpokenStepRef.current = currentStepIndex;
    speakInstruction(step.voice_announcement ?? step.instruction);
  }, [currentStepIndex, routeData, isArrived, isHelper, speakInstruction]);

  // Announce arrival — helpers only
  useEffect(() => {
    if (isHelper && isArrived) speakInstruction("You have arrived at your destination.");
  }, [isArrived, isHelper, speakInstruction]);

  // Trigger "accepted" micro-reaction on arrival (one-shot, 1.5 s)
  useEffect(() => {
    if (!isArrived) return;
    setBirdAccepted(true);
    const t = setTimeout(() => setBirdAccepted(false), 1500);
    return () => clearTimeout(t);
  }, [isArrived]);

  // Trigger "celebrating" micro-reaction on completion (one-shot, 2 s)
  useEffect(() => {
    if (!isCompleted) return;
    setBirdCelebrating(true);
    const t = setTimeout(() => setBirdCelebrating(false), 2000);
    return () => clearTimeout(t);
  }, [isCompleted]);

  // Announce off-route — helpers only
  useEffect(() => {
    if (isHelper && isOffRoute) speakInstruction("Off route. Recalculating.");
  }, [isOffRoute, isHelper, speakInstruction]);

  // Auto-zoom to route — marks isFittingBoundsRef for 1 400 ms so the
  // concurrent GPS-follow easeTo (below) doesn't fight this animation.
  useEffect(() => {
    if (!routeData?.geometry || !mapRef.current) return;
    const coords = (routeData.geometry as { coordinates: number[][] }).coordinates;
    if (coords.length < 2) return;
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    isFittingBoundsRef.current = true;
    if (fittingBoundsTimerRef.current) clearTimeout(fittingBoundsTimerRef.current);
    fittingBoundsTimerRef.current = setTimeout(() => {
      isFittingBoundsRef.current = false;
    }, 1400); // 200 ms grace past fitBounds duration (1 200 ms)
    mapRef.current.fitBounds(bounds, { padding: 80, duration: 1200, pitch: 55, maxZoom: 17 });
  }, [routeData?.geometry]);

  // Re-center on user — follows tweenedPosition so the camera glides with
  // the bird. Skipped while fitBounds is animating the route overview to
  // prevent competing animations from causing visible camera jitter.
  useEffect(() => {
    const pos = tweenedPosition ?? myLocation;
    if (!pos || !mapRef.current || isArrived || autoArrived) return;
    if (isFittingBoundsRef.current) return; // wait for route overview to finish
    mapRef.current.easeTo({
      center: [pos.lng, pos.lat],
      duration: 600,
      zoom: 16,
    });
  }, [tweenedPosition, myLocation, isArrived, autoArrived]);

  // Passive safety check-in
  useEffect(() => {
    if (!currentUserId || isArrived || isCompleted) return;
    const id = setInterval(async () => {
      try {
        await fetch(`/api/verification/safety-checkin/${currentUserId}`, { method: "POST", headers: authHeaders() });
      } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [currentUserId, isArrived, isCompleted]);

  // WebSocket updates
  useWebSocket(useCallback((event) => {
    if (event.type === "request_updated") {
      const req = event.payload as { id: number };
      if (req.id === requestId) {
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
      }
    } else if (event.type === "pledge_paid" || event.type === "payment_completed") {
      // Micro-reaction: golden sparkle + egg glow when a pledge is repaid or a
      // community-pool contribution completes. Distinct from the teal celebrating
      // reaction used for request completion.
      setBirdDonated(true);
      setTimeout(() => setBirdDonated(false), 2800);
    } else if (event.type === "REQUEST_CREATED" || event.type === "new_request") {
      // Micro-reaction: head-tilt + wing flick when a new help request appears
      // nearby while the helper is already en route to another one.
      setBirdNewNotification(true);
      setTimeout(() => setBirdNewNotification(false), 2000);
    }
  }, [requestId, queryClient]));

  const handleComplete = () => {
    if (!currentUser || !request) return;
    completeMutation.mutate(
      { id: requestId, data: { helper_id: currentUser.id } },
        {
        onSuccess: () => {
          const earned = request.payment_type === "immediate" && request.pay_it_forward_amount
            ? `+$${request.pay_it_forward_amount.toFixed(2)} added to your wallet`
            : request.payment_type === "goodwill" ? "+1 goodwill point earned" : "Thank you for helping!";
          toast({ title: "🎉 Request Completed!", description: earned });
          queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
          queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
          // Show rating modal before navigating away
          setTimeout(() => setShowRating(true), 900);
        },
        onError: () => toast({ title: "Failed to complete", variant: "destructive" })
     }
    );
  };

  const CANCEL_REASON_OPTIONS: { value: "traffic" | "safety" | "request_changed" | "other"; label: string }[] = [
    { value: "traffic", label: "Stuck in traffic / running too late" },
    { value: "safety", label: "Safety concern" },
    { value: "request_changed", label: "The task or address changed" },
    { value: "other", label: "Other" },
  ];

  const handleCancel = async (reason?: "traffic" | "safety" | "request_changed" | "other") => {
    if (!currentUser || !request) return;
    const isHelper = request.helper_id === currentUser.id;
    if (!isHelper) {
      if (!window.confirm("Withdraw your request? This cannot be undone.")) return;
    }
    setShowCancelReasonPicker(false);
    setCancelLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/requests/${requestId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: isHelper ? JSON.stringify({ reason }) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to cancel");
      }
      const data = await res.json().catch(() => ({})) as { message?: string };
      queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
      queryClient.invalidateQueries({ queryKey: getGetRequestsQueryKey() });
      toast({
        title: isHelper ? "Claim cancelled" : "Request withdrawn",
        description: data.message,
      });
      setLocation("/");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to cancel", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/request/${requestId}`;
    if (navigator.share) {
      await navigator.share({
        title: `Help request: ${request?.title ?? ""}`,
        text: `I'm on my way to help. Track my trip here.`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      toast({ title: "Trip link copied!", description: "Share this link so others can track your progress." });
    }
    setShareVisible(false);
  };

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (requestLoading || !myLocation) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          {requestLoading ? "Loading request…" : "Finding your location…"}
        </p>
        {/* myLocation is populated by GPS or IP fallback (AppContext).
            This state resolves in ≤5 s even without GPS hardware. */}
      </div>
    );
  }

  if (!request) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
      Request not found
    </div>
  );

  const currentStep = routeData?.steps?.[currentStepIndex] ?? null;
  const earnAmount = request.payment_type === "immediate" && request.pay_it_forward_amount
    ? request.pay_it_forward_amount : null;

  // ── Anticipatory turn direction for the SankofaBird ──────────────────────
  // The bird glances toward the upcoming maneuver BEFORE the instruction fires —
  // the "anticipatory intelligence" the doc describes: "Bird glances toward
  // destination before turning, adjusts wings for a crosswind."
  //
  // Distance gate (key fix): only activate when the CURRENT step is short
  // (< 400 m remaining), meaning we're nearly at the maneuver point. Without
  // the gate, the bird would glance toward a turn that's 5 miles away — the
  // original `distanceToNextTurn` variable computed distance to the *destination*
  // (wrong) and was unused. We approximate remaining distance within the current
  // step as currentStep.distance_meters (the full step length), which is
  // conservative: it makes the bird glance slightly early rather than late,
  // which is the right direction for an "anticipatory" behavior.
  type RouteStep = NonNullable<typeof routeData>["steps"][number] & { maneuver_direction?: string | null };
  const upcomingStep = routeData?.steps?.[currentStepIndex + 1] as RouteStep | undefined;
  const upcomingTurnDirection: "left" | "right" | null = (() => {
    // Only glance when the current step is < 400 m — approaching the maneuver
    if (!currentStep || currentStep.distance_meters > 400) return null;
    const dir = upcomingStep?.maneuver_direction ?? null;
    if (!dir) return null;
    if (dir.includes("left"))  return "left";
    if (dir.includes("right")) return "right";
    return null;
  })();

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      {/* Back button */}
      <div className="absolute top-4 left-4 z-30">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full bg-card/80 backdrop-blur-sm border border-border">
          <ChevronLeft className="w-6 h-6" />
        </Button>
      </div>

      {/* Driver HUD — top right */}
      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
        className="absolute top-4 right-4 z-30 flex flex-col gap-2 items-end"
      >
        <div className={`flex items-center gap-1.5 backdrop-blur-md border px-3 py-1.5 rounded-full shadow-lg transition-colors ${
          elapsedSeconds >= SAFETY_TIMER_SECONDS
            ? "bg-yellow-500/20 border-yellow-500/40"
            : "bg-card/90 border-border"
        }`}>
          <Clock className={`w-3 h-3 ${elapsedSeconds >= SAFETY_TIMER_SECONDS ? "text-yellow-400" : "text-primary"}`} />
          <span className={`text-xs font-black font-mono ${elapsedSeconds >= SAFETY_TIMER_SECONDS ? "text-yellow-400" : "text-primary"}`}>
            {fmtTime(elapsedSeconds)}
          </span>
        </div>

        {etaCountdown > 0 && !isArrived && (
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg">
            <Navigation2 className="w-3 h-3 text-yellow-400" />
            <span className="text-xs font-black text-yellow-400">
              {etaCountdown <= 60 ? `${etaCountdown}s` : `${Math.ceil(etaCountdown / 60)} min`}
            </span>
          </div>
        )}

        {isOffRoute && (
          <div className="flex items-center gap-1.5 bg-orange-500/20 backdrop-blur-md border border-orange-500/40 px-3 py-1.5 rounded-full shadow-lg animate-pulse">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-black text-orange-400">Rerouting</span>
          </div>
        )}

        {earnAmount && (
          <div className="flex items-center gap-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/40 px-3 py-1.5 rounded-full shadow-lg">
            <DollarSign className="w-3 h-3 text-green-400" />
            <span className="text-xs font-black text-green-400">+${earnAmount.toFixed(2)}</span>
          </div>
        )}
        {request.payment_type === "goodwill" && (
          <div className="flex items-center gap-1.5 bg-purple-500/20 backdrop-blur-md border border-purple-500/40 px-3 py-1.5 rounded-full shadow-lg">
            <Star className="w-3 h-3 text-purple-400" />
            <span className="text-xs font-black text-purple-400">Goodwill</span>
          </div>
        )}

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg hover:border-primary/50 transition-colors"
          title="Share trip"
        >
          <Share2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-black text-muted-foreground">Share</span>
        </button>
      </motion.div>

      {/* Navigation step overlay — helpers only. Requesters get a status card below.
          speakEnabled={false}: request-active.tsx owns all TTS via speakInstruction()
          (voice_announcement from Mapbox, locale-aware voice selection). Letting
          NavigationOverlay also call speech synthesis would announce every step twice. */}
      {isHelper && routeData && !isArrived && (
        <NavigationOverlay
          route={{
            geometry: routeData.geometry as { coordinates: number[][] },
            steps: (routeData.steps ?? []).map(s => ({
              ...s,
              maneuver_type: s.maneuver_type ?? null,
              maneuver_direction: s.maneuver_direction ?? null,
            })),
            distance_meters: routeData.distance_meters ?? 0,
            duration_seconds: routeData.duration_seconds ?? 0,
            eta_text: routeData.eta_text ?? "",
            distance_text: routeData.distance_text ?? "",
            profile: routingProfile,
          }}
          destination={{
            lat: request.lat,
            lng: request.lng,
            name: request.requester_name ?? undefined,
          }}
          onClose={() => setLocation("/")}
          onReroute={() => {
            queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(routeParams) });
          }}
          onArrived={() => {
            // NavigationOverlay independently confirmed arrival — trigger
            // the bird's celebrating animation and let the parent know.
            setBirdCelebrating(true);
            setTimeout(() => setBirdCelebrating(false), 2500);
            setBirdApproaching(false);
          }}
          onDistanceUpdate={(distMeters) => {
            // Hysteresis band: enter approaching at ≤50 m, exit only when >60 m.
            // Without this, GPS jitter right at the 50 m boundary toggles the
            // approach animation on and off on every position fix — the bird
            // would flicker between normal and deceleration flight.
            // 10 m hysteresis is wide enough to absorb typical phone GPS noise
            // (~3–8 m horizontal accuracy) while still clearing promptly once
            // the user moves away from the destination area.
            setBirdApproaching(prev => {
              if (!prev && distMeters <= 50) return true;
              if (prev && distMeters > 60) return false;
              return prev;
            });
          }}
          speakEnabled={false}
          speedMph={myLocation?.speed != null ? Math.round(myLocation.speed * 2.237) : null}
          deviceHeading={fusedHeading ?? myLocation?.heading ?? null}
        />
      )}

      {/* Requester tracking card — shown instead of navigation UI */}
      {!isHelper && !isArrived && !isCompleted && (
        <div className="absolute top-16 left-4 right-4 z-20">
          <div className="rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl shadow-xl px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
              Your Helper is On the Way
            </p>
            <p className="text-sm font-semibold text-foreground">
              {request.helper_name ?? "Your helper"}
              {routeData?.eta_text ? (
                <span className="text-muted-foreground font-normal"> · arriving in ~{routeData.eta_text}</span>
              ) : null}
            </p>
            {routeData?.distance_text && (
              <p className="text-xs text-muted-foreground mt-0.5">{routeData.distance_text} away</p>
            )}
          </div>
        </div>
      )}

      {/* Turn arrow HUD — helpers only, hidden on arrival */}
      {isHelper && !isArrived && currentStep && (
        <div className="absolute bottom-[22rem] left-4 right-4 z-30">
          <TurnArrowHUD
            maneuverType={currentStep.maneuver_type ?? null}
            maneuverDirection={currentStep.maneuver_direction ?? null}
            distanceMeters={currentStep.distance_meters ?? 0}
            instruction={currentStep.instruction ?? ""}
            speedMph={myLocation?.speed != null ? Math.round(myLocation.speed * 2.237) : null}
            deviceHeading={fusedHeading}
          />
        </div>
      )}

      {/* Orientation toggle — helpers only (requesters don't navigate) */}
      {isHelper && !isArrived && (
        <OrientationToggle
          mode={mode}
          onToggle={() => setMode(mode === "north-up" ? "heading-up" : "north-up")}
        />
      )}

      {/* Voice guidance toggle — helpers only, sits above the TurnArrowHUD,
          anchored to top-right so it never overlaps the card at the bottom */}
      {isHelper && !isArrived && (
        <button
          onClick={() => {
            setVoiceEnabled(v => !v);
            if (voiceEnabled) window.speechSynthesis?.cancel();
          }}
          style={{ touchAction: "manipulation" }}
          aria-label={voiceEnabled ? "Mute voice guidance" : "Enable voice guidance"}
          className={`absolute top-[4.5rem] right-4 z-30 w-10 h-10 rounded-full flex items-center justify-center border shadow-lg transition-all active:scale-90 backdrop-blur-sm ${
            voiceEnabled
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/90 border-border text-muted-foreground"
          }`}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      )}

      {/* Mapbox — only mounted when token is present.
          Without this guard, an empty token causes Mapbox to fire
          401 auth requests, log noise to the console, and potentially
          crash the navigation screen entirely. */}
      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-3 px-6 z-10">
          <ErrorBoundary fallback={<div className="w-10 h-10 rounded-full bg-primary/20" />}>
            <SpiritAnimalAvatar
              species={userSettings?.spirit_animal}
              heading={heldHeading} mapBearing={0} speed={0} navigating={false} size={56}
              celebrating={false} newNotification={false} accepted={false}
              donated={false} nearbyUser={false} mapZoom={14} upcomingTurnDirection={null}
              isHelping={false} batterySaver={batterySaverActive} skyTier={skyTier} activityLevel={requestActivityLevel}
              navLodOverride={elapsedSeconds >= 1800 ? 2 : elapsedSeconds >= 600 ? 1 : 0}
            />
          </ErrorBoundary>
          <p className="text-base font-bold text-center">Navigation unavailable</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Add <code className="bg-muted px-1 py-0.5 rounded text-xs">VITE_MAPBOX_TOKEN</code> in Replit Secrets to enable the navigation map.
          </p>
        </div>
      )}
      {MAPBOX_TOKEN && (
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: myLocation.lng,
          latitude: myLocation.lat,
          zoom: 15,
          pitch: 55,
          bearing: 0,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        attributionControl={false}
        ref={mapRef}
        onLoad={syncRawMap}
        onZoom={e => setNavMapZoom(e.viewState.zoom)}
      >
        <Marker
          longitude={(tweenedPosition ?? myLocation).lng}
          latitude={(tweenedPosition ?? myLocation).lat}
          anchor="center"
        >
          {/* ErrorBoundary: a CSS/SVG crash in SankofaBird shows a teal dot
              instead of unmounting the entire navigation screen. */}
          <ErrorBoundary fallback={<div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(0,212,255,0.9)]" />}>
            <SpiritAnimalAvatar
              species={userSettings?.spirit_animal}
              heading={heldHeading}
              mapBearing={mode === "heading-up" ? (fusedHeading ?? 0) : 0}
              speed={myLocation.speed ?? 0}
              navigating={isHelper && !isCompleted && !isArrived}
              size={40}
              celebrating={pulseCelebrating}
              accepted={pulseAccepted}
              donated={pulseDonated}
              newNotification={pulseNotification}
              nearbyUser={birdNearbyUser}
              upcomingTurnDirection={upcomingTurnDirection}
              mapZoom={navMapZoom}
              approaching={birdApproaching}
              isHelping={isHelper && !isCompleted && !isArrived}
              batterySaver={batterySaverActive}
              skyTier={skyTier}
              activityLevel={requestActivityLevel}
              navLodOverride={elapsedSeconds >= 1800 ? 2 : elapsedSeconds >= 600 ? 1 : 0}
            />
          </ErrorBoundary>
        </Marker>

        <Marker longitude={request.lng} latitude={request.lat} anchor="bottom">
          <div className="relative">
            <svg width="44" height="44" viewBox="0 0 24 24" className={`drop-shadow-[0_0_12px_rgba(0,212,255,0.7)] ${isArrived ? "fill-green-500" : "fill-primary"}`}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {isArrived && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
        </Marker>

        {/* Real-time traffic layer from Mapbox */}
        <Source id="mapbox-traffic" type="vector" url="mapbox://mapbox.mapbox-traffic-v1">
          <Layer
            id="traffic-flow"
            type="line"
            source-layer="traffic"
            paint={{
              "line-color": [
                "match",
                ["get", "congestion"],
                "low",    "#4ade80",
                "moderate", "#facc15",
                "heavy",  "#f97316",
                "severe", "#ef4444",
                "#94a3b8",
              ],
              "line-width": 3,
              "line-opacity": 0.65,
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>

        {routeData?.geometry && (
          <Source id="route" type="geojson" data={routeData.geometry as unknown as GeoJSON.FeatureCollection}>
            <Layer
              id="route-casing"
              type="line"
              paint={{ "line-color": "#000", "line-width": 10, "line-opacity": 0.4 }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-color": isArrived ? "#22c55e" : isOffRoute ? "#f97316" : "hsl(190, 100%, 50%)",
                "line-width": 6,
                "line-opacity": 0.92,
              }}
              layout={{ "line-cap": "round", "line-join": "round" }}
            />
          </Source>
        )}
      </Map>
      )}

      {/* Bottom action card */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-card border-t border-border rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] p-5 pb-safe">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border shrink-0">
            {request.requester_avatar ? (
              <img src={request.requester_avatar} alt="Requester" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{request.requester_name?.[0] || "U"}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate">{request.title}</h2>
            <p className="text-muted-foreground text-sm">{request.requester_name}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Status</div>
            <div className={`text-xs font-black uppercase ${isArrived ? "text-green-500" : isOffRoute ? "text-orange-400" : "text-primary"}`}>
              {isArrived ? "Arrived" : isOffRoute ? "Rerouting" : request.status.replace("_", " ")}
            </div>
          </div>
        </div>

        {routeData?.steps && routeData.steps.length > 0 && !isArrived && (
          <div className="mb-3">
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(routeData.steps.length, 10) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    i <= currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
              <span>Step {currentStepIndex + 1} of {routeData.steps.length}</span>
              <span>{routeData.distance_text}</span>
            </div>
          </div>
        )}

        {/* Routing profile selector — driving / walking / cycling */}
        {!isArrived && !isCompleted && (
          <div className="flex gap-2 mb-3">
            {(["driving", "walking", "cycling"] as const).map((p) => {
              const Icon = p === "driving" ? Car : p === "walking" ? PersonStanding : Bike;
              const label = p === "driving" ? "Drive" : p === "walking" ? "Walk" : "Bike";
              const active = routingProfile === p;
              return (
                <button
                  key={p}
                  onClick={() => {
                    if (routingProfile !== p) {
                      setRoutingProfile(p);
                      queryClient.invalidateQueries({ queryKey: getGetRouteQueryKey(routeParams) });
                    }
                  }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border transition-all text-xs font-black ${
                    active
                      ? "bg-primary/15 border-primary text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <Button
          className={`w-full h-12 text-base font-black uppercase tracking-widest gap-2 ${
            isCompleted ? "bg-muted text-muted-foreground" : isArrived ? "bg-green-500 hover:bg-green-600 text-white" : ""
          }`}
          onClick={handleComplete}
          disabled={completeMutation.isPending || isCompleted}
        >
          {completeMutation.isPending ? "Processing..." : isCompleted ? "✓ Completed" : isArrived ? "✓ Mark Complete" : "I'm Here — Complete"}
        </Button>

        {request.payment_type === "immediate" && earnAmount && (
          <p className="text-center text-xs text-green-400 font-bold mt-2">
            💰 +${earnAmount.toFixed(2)} will be added to your wallet on completion
          </p>
        )}

        {/* Tip button — shown to requester once request is completed */}
        {isCompleted && !isHelper && request.helper_id && request.helper_name && (
          <button
            onClick={() => setShowTip(true)}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-sm font-black active:scale-[0.97] transition-all"
          >
            💛 Send a Tip to {request.helper_name}
          </button>
        )}
        {request.payment_type === "pay_it_forward" && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            💙 Pay It Forward — your help sustains the community
          </p>
        )}
        {request.payment_type === "goodwill" && (
          <p className="text-center text-xs text-purple-400 mt-2">
            ✨ Goodwill mission — +1 community goodwill point
          </p>
        )}

        {/* Cancel / Withdraw button — only visible when request is not terminal */}
        {!isCompleted && !["cancelled"].includes(request.status) && currentUser && (
          <button
            onClick={() => {
              if (request.helper_id === currentUser.id) setShowCancelReasonPicker(true);
              else handleCancel();
            }}
            disabled={cancelLoading}
            className="w-full mt-2 text-sm text-muted-foreground hover:text-destructive transition-colors py-2 flex items-center justify-center gap-1"
            aria-label={request.helper_id === currentUser.id ? "Cancel claim" : "Withdraw request"}
          >
            {cancelLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Cancelling…
              </span>
            ) : (
              request.helper_id === currentUser.id
                ? "Cancel Claim"
                : request.requester_id === currentUser.id
                ? "Withdraw Request"
                : null
            )}
          </button>
        )}

        {/* Helper cancel-reason picker — a reason lets us tell a genuine drop
            (counts against the helper) apart from a requester-side change
            (doesn't). See requests.ts POST /:id/cancel for the forgiveness rule. */}
        {showCancelReasonPicker && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setShowCancelReasonPicker(false)}>
            <div
              className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm space-y-2"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-black text-sm uppercase tracking-wider mb-1">Why are you cancelling?</h3>
              <p className="text-xs text-muted-foreground mb-2">This helps us keep your record fair — it won't be shown to the requester.</p>
              {CANCEL_REASON_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleCancel(opt.value)}
                  disabled={cancelLoading}
                  className="w-full text-left text-sm bg-muted/40 hover:bg-muted/70 rounded-xl px-3 py-2.5 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setShowCancelReasonPicker(false)}
                className="w-full text-center text-xs text-muted-foreground py-2"
              >
                Never mind
              </button>
            </div>
          </div>
        )}

        {/* Safety Panel — live tracing + SOS for in-person sessions */}
        {currentUser && !isCompleted && (
          <div className="mt-3">
            <SafetyPanel
              requestId={requestId}
              userId={currentUser.id}
              elapsedSeconds={elapsedSeconds}
              isArrived={isArrived}
              isCompleted={isCompleted}
              role={isHelper ? "helper" : "requester"}
            />
          </div>
        )}

        {currentUser && (
          <div className="mt-4">
            <InAppChat
              requestId={requestId}
              currentUserId={currentUser.id}
              currentUserName={currentUser.name ?? "You"}
              remoteUserName={
                request.helper_id === currentUser.id
                  ? request.requester_name ?? "Requester"
                  : request.helper_name ?? "Helper"
              }
              wsUrl={`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`}
              authToken={getToken() ?? ""}
            />
          </div>
        )}

        {/* ── Help Chain visibility ── */}
        {request.payment_type === "pay_it_forward" && !isCompleted && (
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🔗</span>
              <span className="text-xs font-black text-primary uppercase tracking-wider">Help Chain</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This is a pay-it-forward task. When {isHelper ? "you complete it" : "this task completes"}, the community pool pays the helper immediately — and {isHelper ? "the requester" : "you"} will pay it forward when able. That's how help chains grow.
            </p>
            {isHelper && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-background/60 rounded-xl p-2.5 text-center">
                  <div className="text-lg">⚡</div>
                  <div className="text-[10px] font-black mt-0.5">Instant Pay</div>
                  <div className="text-[9px] text-muted-foreground">Pool pays you on completion</div>
                </div>
                <div className="bg-background/60 rounded-xl p-2.5 text-center">
                  <div className="text-lg">💙</div>
                  <div className="text-[10px] font-black mt-0.5">+5 Trust</div>
                  <div className="text-[9px] text-muted-foreground">PIF boost when fully repaid</div>
                </div>
              </div>
            )}
            {!isHelper && request.requester_id === currentUser?.id && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  Repay whenever you're ready — no deadline pressure. Every dollar replenishes the pool for the next neighbor.
                </div>
                {/* Pay What You Can quick prompts */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pay what you can now</div>
                  <div className="flex gap-1.5">
                    {[2, 5, 10].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setLocation(`/wallet?requestId=${requestId}&amount=${amt}`)}
                        className="flex-1 py-2 text-xs font-black rounded-xl border bg-primary/10 border-primary/30 text-primary text-center transition-all active:scale-95 hover:border-primary/60"
                      >
                        ${amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLocation(`/wallet?requestId=${requestId}`)}
                      className="flex-1 py-2 text-xs font-black rounded-xl border bg-muted/80 border-border text-muted-foreground text-center transition-all active:scale-95 hover:border-primary/40"
                    >
                      Other
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showTip && request.helper_name && request.helper_id && (
        <TipModal
          requestId={requestId}
          helperName={request.helper_name}
          onClose={() => setShowTip(false)}
        />
      )}

      <AnimatePresence>
        {showRating && currentUser && (
          <RatingModal
            requestId={requestId}
            role={request.helper_id === currentUser.id ? "helper" : "requester"}
            helperName={request.helper_name}
            requesterName={request.requester_name}
            onClose={() => {
              setShowRating(false);
              setLocation("/");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

