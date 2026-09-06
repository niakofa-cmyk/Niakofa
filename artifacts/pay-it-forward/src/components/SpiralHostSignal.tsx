import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { CircleStartLocationError, getFreshCircleStartLocation } from "@/lib/circleStartLocation";

export type HostSignalPayload = {
  can_host?: boolean;
  allowed?: boolean;
  host_signal?: { status?: string; message?: string };
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

const LOCATION_MAX_AGE_MS = 120_000;
const LOCATION_MAX_ACCURACY_METERS = 150;

/**
 * Shared automatic host signal. It consumes the same GPS fix that powers the
 * map/helper/requester experience, only asks for a fresh one when that stream
 * is unavailable or invalid, and always sends the result to the server.
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
      const shared = locationRef.current;
      const sharedIsUsable =
        shared?.source === "gps" &&
        typeof shared.capturedAt === "number" &&
        Date.now() - shared.capturedAt <= LOCATION_MAX_AGE_MS &&
        typeof shared.accuracy === "number" &&
        shared.accuracy <= LOCATION_MAX_ACCURACY_METERS;
      const location = sharedIsUsable
        ? {
            latitude: shared.lat,
            longitude: shared.lng,
            accuracy_meters: shared.accuracy!,
            captured_at: new Date(shared.capturedAt!).toISOString(),
          }
        : await getFreshCircleStartLocation();

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
    } catch (error) {
      const message =
        error instanceof CircleStartLocationError
          ? error.message
          : "We couldn't verify your location. Retrying automatically.";
      publishSignal({
        can_host: false,
        allowed: false,
        code: error instanceof CircleStartLocationError ? error.code : "GPS_CHECK_FAILED",
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
  const message =
    displayedSignal?.host_signal?.message ||
    displayedSignal?.error ||
    (ready ? "GPS verified for hosting." : null);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full ${
          ready ? "text-emerald-400" : "text-amber-300"
        }`}
        role="status"
        aria-label={ready ? "Verified local GPS neighborhood" : "Checking local GPS neighborhood"}
        title={checking ? "Checking your GPS signal…" : message ?? "Checking your GPS signal…"}
      >
        {checking ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : ready ? (
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
        ready
          ? "border-teal-300/30 bg-teal-300/10 text-teal-100"
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
            {ready ? "Host signal · verified" : displayedSignal ? "Host signal · blocked" : "Host eligibility"}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {checking
              ? "Checking your shared GPS signal…"
              : message ??
                `Checking whether you can host the ${spiralNeighborhood ? `${spiralNeighborhood} ` : ""}Spiral in ${spiralCityDisplay}.`}
          </p>
          {displayedSignal?.resolved_city_display && (
            <p className="mt-1 text-[11px] opacity-75">
              GPS city: {displayedSignal.resolved_city_display}
              {displayedSignal.resolved_neighborhood_hint
                ? ` · near ${displayedSignal.resolved_neighborhood_hint}`
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
          {checking ? "Checking…" : "Refresh GPS"}
        </button>
      </div>
      <p className="mt-2 text-[10px] opacity-60">
        Joining never requires GPS. Only starting a Spiral does.
      </p>
    </div>
  );
}