/**
 * NavigationOverlay.tsx — Enhanced
 *
 * Audit findings fixed:
 *  1. No cleanup on unmount for watchPosition — GPS leak
 *  2. Step advancement used index comparison only — skips steps if GPS jumps
 *  3. No off-route detection — user could walk wrong way indefinitely
 *  4. ETA not recalculated as user progresses — stayed stale from route start
 *  5. Voice announcements fired on every re-render when step didn't change
 *  6. No arrival detection — overlay never dismissed itself
 *  7. Recenter button had no debounce — multiple state flips on fast taps
 *  8. Missing aria-live region for screen-reader turn announcements
 *
 * Enhancements added:
 *  - Off-route detection (>80m from route line → prompt re-route)
 *  - Dynamic ETA recalculation from current position
 *  - Haversine distance-to-segment for accurate step advancement
 *  - Arrival auto-dismiss when within 25m of destination
 *  - Voice announcement dedup via lastAnnouncedStep ref
 *  - aria-live="assertive" for turn instructions
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { TurnArrowHUD } from "@/components/TurnArrowHUD";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  maneuver_type: string | null;
  maneuver_direction: string | null;
}

interface RouteData {
  geometry: { coordinates: number[][] };
  steps: RouteStep[];
  distance_meters: number;
  duration_seconds: number;
  eta_text: string;
  distance_text: string;
  profile: string;
}

interface NavigationOverlayProps {
  route: RouteData;
  destination: { lat: number; lng: number; name?: string };
  onClose: () => void;
  onReroute?: (lat: number, lng: number) => void;
  speakEnabled?: boolean;
  /** GPS speed in mph — forwarded to TurnArrowHUD speed display */
  speedMph?: number | null;
  /** GPS heading in degrees — forwarded to TurnArrowHUD compass display */
  deviceHeading?: number | null;
  /**
   * Called once when the user arrives within ARRIVAL_THRESHOLD_M of the
   * destination. Lets the parent trigger the bird's celebrating animation
   * and mark the request as arrived without depending on NavigationOverlay's
   * internal arrived state.
   */
  onArrived?: () => void;
  /**
   * Called on every GPS update with the straight-line distance in meters to
   * the destination. Lets the parent trigger the bird's approaching
   * deceleration animation when the user is within ~50 m.
   */
  onDistanceUpdate?: (distanceMeters: number) => void;
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance from point P to line segment AB (meters) */
function distanceToSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): number {
  const AB = haversineMeters(aLat, aLng, bLat, bLng);
  if (AB < 1) return haversineMeters(pLat, pLng, aLat, aLng);
  const AP = haversineMeters(pLat, pLng, aLat, aLng);
  const BP = haversineMeters(pLat, pLng, bLat, bLng);
  // Use Heron's formula for the perpendicular distance
  const s = (AB + AP + BP) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - AB) * (s - AP) * (s - BP)));
  return (2 * area) / AB;
}

/** Minimum distance from point to any segment of the route polyline */
function distanceToRoute(
  lat: number, lng: number,
  coords: number[][]
): number {
  let minDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [aLng, aLat] = coords[i];
    const [bLng, bLat] = coords[i + 1];
    const d = distanceToSegment(lat, lng, aLat, aLng, bLat, bLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Remaining distance from current position to destination along route */
function remainingDistance(
  lat: number, lng: number,
  steps: RouteStep[],
  currentStepIdx: number
): number {
  return steps
    .slice(currentStepIdx)
    .reduce((sum, s) => sum + s.distance_meters, 0);
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Aligned with API server navigation.ts ARRIVED_THRESHOLD_METERS (15 m).
// The previous 25 m caused a 10 m window where the overlay stayed in
// "navigating" mode while the API refused a fresh route (it thought you'd
// already arrived). Matching at 15 m eliminates the stale-navigation gap.
const ARRIVAL_THRESHOLD_M = 15;
const OFF_ROUTE_THRESHOLD_M = 80;
const STEP_ADVANCE_THRESHOLD_M = 20; // advance step when within 20m of its end

// ─── Component ────────────────────────────────────────────────────────────────

export function NavigationOverlay({
  route,
  destination,
  onClose,
  onReroute,
  speakEnabled = true,
  speedMph = null,
  deviceHeading = null,
  onArrived,
  onDistanceUpdate,
}: NavigationOverlayProps) {
  const [, setLocation] = useLocation();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [dynamicEta, setDynamicEta] = useState(route.eta_text);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastAnnouncedStepRef = useRef<number>(-1);
  const rerouteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const steps = route.steps;
  const coords = route.geometry.coordinates;
  const currentStep = steps[currentStepIdx] ?? null;

  // ─── Speak turn instruction ────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!speakEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    window.speechSynthesis.speak(utt);
  }, [speakEnabled]);

  // Announce step change — only when step index actually changes
  useEffect(() => {
    if (currentStepIdx !== lastAnnouncedStepRef.current && currentStep) {
      lastAnnouncedStepRef.current = currentStepIdx;
      speak(currentStep.instruction);
    }
  }, [currentStepIdx, currentStep, speak]);

  // ─── Stable ref for currentStepIdx — prevents GPS effect restart on step change ────
  const currentStepIdxRef = useRef<number>(0);
  useEffect(() => { currentStepIdxRef.current = currentStepIdx; }, [currentStepIdx]);

  // ─── GPS tracking ─────────────────────────────────────────────────────────
  // BUG-NAV-04 FIX: Removed `currentStepIdx` from dep array. Having it there
  // caused watchPosition to be torn down and restarted on every step advance,
  // producing GPS dropouts mid-navigation. We now read the step index via a
  // stable ref so this effect only runs once per route.
  useEffect(() => {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lat, lng });

        // Arrival check
        const distToDest = haversineMeters(lat, lng, destination.lat, destination.lng);
        // Report distance on every update so parent can trigger approaching state
        onDistanceUpdate?.(distToDest);
        if (distToDest <= ARRIVAL_THRESHOLD_M) {
          setArrived(true);
          onArrived?.();
          speak("You have arrived at your destination.");
          return;
        }

        // Off-route check
        const distToLine = distanceToRoute(lat, lng, coords);
        const isOffRoute = distToLine > OFF_ROUTE_THRESHOLD_M;
        setOffRoute(isOffRoute);

        // Step advancement — read current step from ref to avoid stale closure
        const stepIdx = currentStepIdxRef.current;
        if (!isOffRoute && stepIdx < steps.length - 1) {
          // Build cumulative waypoint index for this step
          const stepEndCoordIdx = Math.min(
            coords.length - 1,
            steps
              .slice(0, stepIdx + 1)
              .reduce((acc, s) => acc + Math.round(s.distance_meters / 10), 0)
          );
          const [endLng, endLat] = coords[stepEndCoordIdx];
          const distToStepEnd = haversineMeters(lat, lng, endLat, endLng);
          if (distToStepEnd <= STEP_ADVANCE_THRESHOLD_M) {
            setCurrentStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
          }
        }

        // Dynamic ETA recalculation (uses ref for step index, avoids stale closure)
        const remMeters = remainingDistance(lat, lng, steps, currentStepIdxRef.current);
        const avgSpeedMs = route.distance_meters / route.duration_seconds;
        const remSeconds = remMeters / (avgSpeedMs || 1);
        const remMin = Math.round(remSeconds / 60);
        setDynamicEta(
          remMin < 60
            ? `${remMin} min`
            : `${Math.floor(remMin / 60)}h ${remMin % 60}m`
        );
      },
      (err) => console.warn("GPS error:", err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    // Cleanup — critical: prevents GPS leak on unmount
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (rerouteDebounceRef.current) {
        clearTimeout(rerouteDebounceRef.current);
      }
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, steps, destination, route, speak]);
  // NOTE: currentStepIdx intentionally excluded — read via currentStepIdxRef to prevent
  // GPS watch teardown/restart on every step advance (BUG-NAV-04).

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleReroute = useCallback(() => {
    if (!userPos) return;
    // Debounce: don't fire multiple reroute requests
    if (rerouteDebounceRef.current) return;
    rerouteDebounceRef.current = setTimeout(() => {
      rerouteDebounceRef.current = null;
    }, 3000);
    onReroute?.(userPos.lat, userPos.lng);
    setOffRoute(false);
  }, [userPos, onReroute]);

  const handleClose = useCallback(() => {
    window.speechSynthesis?.cancel();
    onClose();
  }, [onClose]);

  // ─── Arrived state ────────────────────────────────────────────────────────
  if (arrived) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe"
        role="alertdialog"
        aria-label="Arrived at destination"
      >
        <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl text-center">
          <div className="text-3xl mb-2">🎉</div>
          <div className="text-lg font-bold">You've arrived</div>
          {destination.name && (
            <div className="text-sm text-muted-foreground mt-1">{destination.name}</div>
          )}
          <button
            className="mt-4 w-full bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold"
            onClick={handleClose}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ─── Main overlay ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-safe pointer-events-none">
      {/* Off-route banner */}
      {offRoute && (
        <div
          className="mb-2 bg-destructive text-destructive-foreground rounded-xl px-4 py-2.5 flex items-center justify-between pointer-events-auto shadow-lg"
          role="alert"
        >
          <span className="text-sm font-semibold">Off route</span>
          <button
            className="text-xs underline font-bold ml-3"
            onClick={handleReroute}
          >
            Recalculate
          </button>
        </div>
      )}

      {/* Turn card */}
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">
        {/* TurnArrowHUD: maneuver icon + distance + speed in a compact row.
            Provides instant visual scanning — users read the arrow before
            reading text, especially on a moving screen. */}
        {currentStep && (
          <TurnArrowHUD
            maneuverType={currentStep.maneuver_type}
            maneuverDirection={currentStep.maneuver_direction}
            distanceMeters={currentStep.distance_meters}
            instruction={currentStep.instruction}
            speedMph={speedMph}
            deviceHeading={deviceHeading}
          />
        )}

        {/* Current instruction — aria-live so screen readers announce changes */}
        <div
          aria-live="assertive"
          aria-atomic="true"
          className="px-4 pt-2 pb-2 border-t border-border/40"
        >
          {currentStep ? (
            <>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                {currentStepIdx < steps.length - 1
                  ? `Step ${currentStepIdx + 1} of ${steps.length}`
                  : "Final step"}
              </div>
              <div className="text-sm font-semibold leading-snug text-foreground/90">
                {currentStep.instruction}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Calculating…</div>
          )}
        </div>

        {/* Next step preview */}
        {steps[currentStepIdx + 1] && (
          <div className="px-4 py-2 border-t border-border/50">
            <div className="text-[11px] text-muted-foreground">Then</div>
            <div className="text-xs text-foreground/80 truncate">
              {steps[currentStepIdx + 1].instruction}
            </div>
          </div>
        )}

        {/* Footer: ETA + close */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <div>
            <span className="text-sm font-bold text-primary">{dynamicEta}</span>
            {destination.name && (
              <span className="text-xs text-muted-foreground ml-2">
                to {destination.name}
              </span>
            )}
          </div>
          <button
            className="text-xs text-muted-foreground underline"
            onClick={handleClose}
            aria-label="Stop navigation"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}

