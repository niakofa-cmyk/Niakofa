import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { getUsableMapLocation, mapLocationUnavailableMessage } from "@/lib/spiralMapLocation";
import { publishMapLocation } from "@/lib/spiralLocationStore";

export type HostSignalPayload = {
  can_host?: boolean;
  allowed?: boolean;
  host_signal?: {
    status?: string;
    message?: string;
    neighborhoodGeofenceStatus?: string | null;
  };
  neighborhood_geofence_status?: "inside" | "outside" | "no_geometry" | "invalid_geometry" | null;
  spiral_city_key?: string | null;
  spiral_city_display?: string | null;
  spiral_neighborhood?: string | null;
  resolved_city_key?: string | null;
  resolved_city_display?: string | null;
  resolved_neighborhood_hint?: string | null;
  code?: string;
  error?: string;
};

interface SpiralHostSignalProps {
  circleId: number;
  base: string;
  spiralCityDisplay: string;
  spiralNeighborhood?: string | null;
  externalSignal?: HostSignalPayload;
  compact?: boolean;
  onSignalChange?: (signal: HostSignalPayload) => void;
}

/**
 * Shared automatic Host Signal for Niakofa Spirals.
 * Consumes the same Map Locator fix used by the rest of the app.
 * Publishes that fix so host start can reuse it without a second Pinpoint path.
 */
export function SpiralHostSignal({
  circleId,
  base,
  spiralCityDisplay,
  spiralNeighborhood,
  externalSignal,
  compact = false,
  onSignalChange,
}: SpiralHostSignalProps) {
  const { myLocation } = useAppContext();
  const locationRef = useRef(myLocation);
  const checkingRef = useRef(false);
  const [signal, setSignal] = useState<HostSignalPayload | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    locationRef.current = myLocation;
    publishMapLocation(myLocation);
  }, [myLocation]);

  const publishSignal = useCallback((next: HostSignalPayload) => {
    setSignal(next);
    onSignalChange?.(next);
  }, [onSignalChange]);

  const checkLocation = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const location = getUsableMapLocation(locationRef.current, Date.now(), "host");
      if (!location) {
        const message = mapLocationUnavailableMessage();
        publishSignal({
          can_host: false,
          allowed: false,
          code: "MAP_LOCATION_UNAVAILABLE",
          error: message,
          host_signal: { status: "blocked", message },
        });
        return;
      }

      const response = await fetch(`${base}/api/audio-circles/${circleId}/location-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(location),
      });
      const data = (await response.json().catch(() => ({}))) as HostSignalPayload;
      publishSignal({
        ...data,
        can_host: response.ok && (data.can_host ?? data.allowed ?? false),
        allowed: response.ok && (data.allowed ?? data.can_host ?? false),
      });
    } catch {
      const message = "The shared Map Locator signal could not be checked. Open the Map and refresh Location.";
      publishSignal({
        can_host: false,
        allowed: false,
        code: "MAP_LOCATION_CHECK_FAILED",
        error: message,
        host_signal: { status: "blocked", message },
      });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [base, circleId, publishSignal]);

  useEffect(() => {
    setSignal(null);
    void checkLocation();
    const interval = window.setInterval(() => void checkLocation(), 45_000);
    return () => window.clearInterval(interval);
  }, [circleId, checkLocation]);

  const displayedSignal = signal ?? externalSignal ?? null;
  const ready =
    displayedSignal?.can_host === true ||
    displayedSignal?.allowed === true ||
    displayedSignal?.host_signal?.status === "ready";
  const neighborhoodBoundaryVerified =
    displayedSignal?.neighborhood_geofence_status === "inside" ||
    displayedSignal?.host_signal?.neighborhoodGeofenceStatus === "inside";
  const greenNeighborhoodCheckpoint = ready && neighborhoodBoundaryVerified;
  const message =
    displayedSignal?.host_signal?.message ||
    displayedSignal?.error ||
    (ready
      ? neighborhoodBoundaryVerified
        ? `GPS verified inside the ${spiralNeighborhood ?? "local"} neighborhood boundary.`
        : "GPS verified for city hosting."
      : null);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full ${
          greenNeighborhoodCheckpoint
            ? "text-emerald-400"
            : ready
              ? "text-amber-300"
              : "text-muted-foreground"
        }`}
        role="status"
        aria-label={
          checking
            ? "Checking GPS host eligibility"
            : greenNeighborhoodCheckpoint
              ? "Green GPS verified neighborhood host signal"
              : ready
                ? "Verified city host signal"
                : "GPS host signal not verified"
        }
        title={checking ? "Checking your Map Locator signal\u2026" : message ?? "Checking your Map Locator signal\u2026"}
      >
        {checking ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : greenNeighborhoodCheckpoint ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </span>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        greenNeighborhoodCheckpoint
          ? "border-teal-300/30 bg-teal-300/10 text-teal-100"
          : ready
            ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
            : displayedSignal
              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
              : "border-border bg-background/60 text-muted-foreground"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider opacity-80">
            {checking
              ? "Host signal \u00b7 checking Map Locator"
              : greenNeighborhoodCheckpoint
                ? "Host signal \u00b7 green GPS neighborhood checkpoint"
                : ready
                  ? "Host signal \u00b7 city verified"
                  : displayedSignal
                    ? "Host signal \u00b7 blocked"
                    : "Host eligibility"}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {checking
              ? "Checking your shared Map Locator signal\u2026"
              : message ??
                `Checking whether you can host the ${spiralNeighborhood ? `${spiralNeighborhood} ` : ""}Spiral in ${spiralCityDisplay}.`}
          </p>
          {displayedSignal?.resolved_city_display && (
            <p className="mt-1 text-[11px] opacity-75">
              GPS city: {displayedSignal.resolved_city_display}
              {displayedSignal.resolved_neighborhood_hint
                ? ` \u00b7 near ${displayedSignal.resolved_neighborhood_hint}`
                : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void checkLocation()}
          disabled={checking}
          className="shrink-0 rounded-lg border border-current/30 px-2.5 py-1.5 text-[10px] font-black transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "Checking\u2026" : "Refresh Map Location"}
        </button>
      </div>
      <p className="mt-2 text-[10px] opacity-60">
        {greenNeighborhoodCheckpoint
          ? `Your Map Locator GPS is inside the reviewed ${spiralNeighborhood ?? "neighborhood"} boundary. That neighborhood Spiral is promoted first. Joining never requires GPS.`
          : ready
            ? "Your city is verified for hosting. The green neighborhood checkpoint appears only after reviewed boundary geometry matches your shared Map Locator fix. Joining never requires GPS."
            : "A green neighborhood checkpoint requires the working Map Locator to provide a fresh GPS fix inside reviewed neighborhood geometry. Joining never requires GPS."}
      </p>
    </div>
  );
}
