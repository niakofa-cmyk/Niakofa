/**
 * useBirdNavigation.ts
 *
 * Wires live GPS / map SDK data into the SankofaBird prop interface.
 *
 * Usage — drop into any map component and spread onto <SankofaBirdSvg />:
 *
 *   const birdProps = useBirdNavigation({
 *     heading:                gps.heading,
 *     speed:                  gps.speed,
 *     mapBearing:             map.getBearing(),
 *     mapZoom:                map.getZoom(),
 *     navigating:             route.isActive,
 *     upcomingTurnDirection:  route.nextTurnDirection,
 *     isHelping:              !!activeHelpRequest,
 *     skyTier,
 *   });
 *   return <SankofaBirdSvg {...birdProps} />;
 *
 * If your SDK gives step bearings instead of a named turn direction, use the
 * computeUpcomingTurn() helper exported below.
 *
 * If you have lat/lng coordinates, pass userLat/userLng/destinationLat/destinationLng
 * and the hook will auto-compute the `approaching` flag (within approachRadiusM, default 50 m).
 *
 * Battery-saver auto-activates on:
 *   • Battery level < 20 % and not charging  (Battery Status API, best-effort)
 *   • Page backgrounded during navigation     (Page Visibility API)
 * Pass batterySaver={true} to force it (low-data mode, accessibility pref).
 */

import { useEffect, useState } from "react";
import type { SankofaBirdProps } from "@/components/SankofaBirdSvg";

// ── Input shape ───────────────────────────────────────────────────────────────

/** Raw navigation data accepted by useBirdNavigation. */
export interface NavInput {
  // ── GPS / motion ──────────────────────────────────────────────────────────
  /** World-frame GPS heading 0–360° (0 = north). null if compass unavailable. */
  heading: number | null;
  /** Ground speed in metres / second. null if unknown. */
  speed?: number | null;

  // ── Map camera ────────────────────────────────────────────────────────────
  /** Map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing?: number;
  /** Map zoom level 0–22. Drives bird LOD tier. Default 14 (full detail). */
  mapZoom?: number;

  // ── Navigation state ──────────────────────────────────────────────────────
  /** True while turn-by-turn routing is active. */
  navigating?: boolean;
  /**
   * Upcoming turn instruction — provide 1–2 s before the manoeuvre fires.
   * Drives the bird's anticipatory gaze (it "sees" the route before turning).
   * If your SDK gives step bearings instead, use computeUpcomingTurn() below.
   */
  upcomingTurnDirection?: "left" | "right" | null;
  /**
   * True when the user is within approachRadiusM metres of the destination.
   * If omitted and lat/lng are provided the hook computes this automatically.
   */
  approaching?: boolean;

  // ── Optional: auto-compute "approaching" from coordinates ─────────────────
  userLat?: number;
  userLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  /** Approach detection radius in metres. Default 50. */
  approachRadiusM?: number;

  // ── App state ─────────────────────────────────────────────────────────────
  isHelping?: boolean;
  newNotification?: boolean;
  celebrating?: boolean;
  accepted?: boolean;
  donated?: boolean;
  nearbyUser?: boolean;
  /** Community activity level 0–1. Drives blink rate + crown alertness. */
  activityLevel?: number;
  skyTier?: "day" | "golden" | "twilight" | "night";
  /**
   * Force battery-saver mode. When omitted the hook auto-detects.
   * Set true to honour low-data or accessibility preferences.
   */
  batterySaver?: boolean;
  navLodOverride?: 0 | 1 | 2;
  size?: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useBirdNavigation
 *
 * Maps live navigation state to SankofaBirdProps with:
 *   • Auto battery-saver (Battery Status API + Page Visibility API)
 *   • Auto approaching detection from coordinates
 *   • All SankofaBird props assembled and ready to spread
 */
export function useBirdNavigation(input: NavInput): SankofaBirdProps {
  const {
    heading,
    speed,
    mapBearing = 0,
    mapZoom = 14,
    navigating = false,
    upcomingTurnDirection = null,
    approaching: approachingProp,
    userLat,
    userLng,
    destinationLat,
    destinationLng,
    approachRadiusM = 50,
    isHelping = false,
    newNotification = false,
    celebrating = false,
    accepted = false,
    donated = false,
    nearbyUser = false,
    activityLevel = 0,
    skyTier,
    batterySaver: batterySaverProp,
    navLodOverride,
    size = 40,
  } = input;

  // ── Auto battery-saver detection ────────────────────────────────────────────
  // Protects older iPhones during long navigation sessions. Activates when:
  //   1. Device battery level < 20% and not charging (Battery Status API)
  //   2. Page is backgrounded (user switched apps mid-navigation)
  const [autoBatterySaver, setAutoBatterySaver] = useState(false);

  useEffect(() => {
    // Skip auto-detection when caller explicitly controls this flag
    if (batterySaverProp !== undefined) return;

    // Page Visibility: background → battery saver on immediately.
    // Restores only when battery levels permit (handled below).
    const onVisibilityChange = () => {
      if (document.hidden) setAutoBatterySaver(true);
      // Coming back to foreground: let battery state decide
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Battery Status API — best-effort; not available in Safari (returns undefined).
    let batteryCleanup: (() => void) | undefined;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (typeof nav.getBattery === "function") {
      nav.getBattery().then((bat: BatteryManager) => {
        const check = () => {
          const low = bat.level < 0.20 && !bat.charging;
          setAutoBatterySaver(low || document.hidden);
        };
        check();
        bat.addEventListener("levelchange", check);
        bat.addEventListener("chargingchange", check);
        batteryCleanup = () => {
          bat.removeEventListener("levelchange", check);
          bat.removeEventListener("chargingchange", check);
        };
      }).catch(() => { /* Battery API unavailable — fall back to visibility only */ });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      batteryCleanup?.();
    };
  }, [batterySaverProp]);

  const effectiveBatterySaver = batterySaverProp ?? autoBatterySaver;

  // ── Auto-compute "approaching" from coordinates ─────────────────────────────
  const approaching = approachingProp ?? (() => {
    if (
      userLat == null || userLng == null ||
      destinationLat == null || destinationLng == null
    ) return false;
    return haversineDistanceM(userLat, userLng, destinationLat, destinationLng) <= approachRadiusM;
  })();

  // ── Assemble SankofaBirdProps ───────────────────────────────────────────────
  return {
    heading,
    mapBearing,
    speed: speed ?? 0,
    navigating,
    upcomingTurnDirection,
    approaching,
    isHelping,
    newNotification,
    celebrating,
    accepted,
    donated,
    nearbyUser,
    activityLevel,
    skyTier,
    mapZoom,
    batterySaver: effectiveBatterySaver,
    navLodOverride,
    size,
  };
}

// ── Utilities exported for nav-SDK integration ────────────────────────────────

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

/**
 * computeUpcomingTurn
 *
 * Derive a turn direction from sequential route step bearings.
 * Use when your nav SDK exposes step headings but not a named direction.
 *
 * @param currentBearing  Bearing of the current route leg (degrees 0–360)
 * @param nextBearing     Bearing of the upcoming route leg (degrees 0–360)
 * @param thresholdDeg    Min angular delta to consider a real turn (default 15°).
 *                        Straight-ish roads (< threshold) return null.
 *
 * @example
 * // Mapbox step object
 * const nextTurn = computeUpcomingTurn(
 *   currentStep.maneuver.bearing_before,
 *   nextStep.maneuver.bearing_after,
 * );
 * // Google Maps step
 * const nextTurn = computeUpcomingTurn(
 *   currentStep.start_location.heading,
 *   nextStep.start_location.heading,
 * );
 */
export function computeUpcomingTurn(
  currentBearing: number,
  nextBearing: number,
  thresholdDeg = 15,
): "left" | "right" | null {
  const delta = ((nextBearing - currentBearing + 540) % 360) - 180;
  if (Math.abs(delta) < thresholdDeg) return null;
  return delta < 0 ? "left" : "right";
}

/**
 * haversineDistanceM
 *
 * Great-circle distance in metres between two WGS84 coordinates.
 * Accurate to within ~0.5 % for distances < 10 km — sufficient for the
 * default 50 m approaching threshold.
 */
export function haversineDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius metres
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
