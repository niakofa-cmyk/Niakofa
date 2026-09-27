import { useEffect, useState } from "react";
import {
  getLocationMarkerState,
  type LocationMarkerInput,
  type LocationMarkerState,
} from "@/lib/location-marker";

/**
 * Re-evaluate stale GPS state while a user remains on a screen even when the
 * browser has stopped emitting stationary position fixes.
 */
export function useLocationMarkerState(
  location: LocationMarkerInput | null | undefined,
): LocationMarkerState {
  const [, setClock] = useState(0);

  useEffect(() => {
    if (location?.source !== "gps" || location.capturedAt == null) return;
    const timer = window.setInterval(() => setClock((value) => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [location?.source, location?.capturedAt]);

  return getLocationMarkerState(location);
}