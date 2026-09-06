import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";
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
}

/**
 * A deliberate, on-demand GPS check. It never runs on page load and it never
 * decides eligibility in the browser: the API remains the source of truth.
 */
export function SpiralHostSignal({
  circleId,
  base,
  spiralCityDisplay,
  spiralNeighborhood,
  externalSignal,
}: SpiralHostSignalProps) {
  const [signal, setSignal] = useState<HostSignalPayload | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setSignal(null);
  }, [circleId]);

  const checkLocation = async () => {
    setChecking(true);
    try {
      const location = await getFreshCircleStartLocation();
      const response = await fetch(`${base}/api/audio-circles/${circleId}/location-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(location),
      });
      const data = (await response.json().catch(() => ({}))) as HostSignalPayload;
      setSignal({
        ...data,
        can_host: response.ok && (data.can_host ?? data.allowed ?? false),
        allowed: response.ok && (data.allowed ?? data.can_host ?? false),
      });
    } catch (error) {
      const message =
        error instanceof CircleStartLocationError
          ? error.message
          : "We couldn't verify your location. Check your connection and try again.";
      setSignal({
        can_host: false,
        allowed: false,
        code: error instanceof CircleStartLocationError ? error.code : "GPS_CHECK_FAILED",
        error: message,
        host_signal: { status: "blocked", message },
      });
    } finally {
      setChecking(false);
    }
  };

  const displayedSignal = signal ?? externalSignal ?? null;
  const ready =
    displayedSignal?.can_host === true ||
    displayedSignal?.allowed === true ||
    displayedSignal?.host_signal?.status === "ready";
  const message =
    displayedSignal?.host_signal?.message ||
    displayedSignal?.error ||
    (ready ? "GPS verified for hosting." : null);

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
              ? "Checking your fresh GPS signal…"
              : message ??
                `Check whether you can host the ${spiralNeighborhood ? `${spiralNeighborhood} ` : ""}Spiral in ${spiralCityDisplay}.`}
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
          onClick={checkLocation}
          disabled={checking}
          className="shrink-0 rounded-lg border border-current/30 px-2.5 py-1.5 text-[10px] font-black transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "Checking…" : displayedSignal ? "Refresh GPS" : "Check GPS"}
        </button>
      </div>
      <p className="mt-2 text-[10px] opacity-60">
        Joining never requires GPS. Only starting a Spiral does.
      </p>
    </div>
  );
}