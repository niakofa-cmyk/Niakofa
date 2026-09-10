import { CheckCircle2 } from "lucide-react";

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
  code?: string;
  error?: string;
};

interface SpiralHostSignalProps {
  circleId?: number;
  base?: string;
  spiralCityDisplay: string;
  spiralNeighborhood?: string | null;
  externalSignal?: HostSignalPayload;
  compact?: boolean;
  onSignalChange?: (signal: HostSignalPayload) => void;
}

/**
 * Host Signal is now a simple product-state indicator.
 *
 * GPS, Map Locator, reverse geocoding, and neighborhood geofencing are not
 * dependencies of Spiral hosting. The selected Spiral itself is the host
 * destination; media readiness is checked by the host modal separately.
 */
export function SpiralHostSignal({
  spiralCityDisplay,
  spiralNeighborhood,
  externalSignal,
  compact = false,
  onSignalChange,
}: SpiralHostSignalProps) {
  const signal: HostSignalPayload = externalSignal ?? {
    can_host: true,
    allowed: true,
    code: "CURATED_SPIRAL_HOSTING",
    host_signal: {
      status: "ready",
      message: `You can host the ${spiralNeighborhood ? `${spiralNeighborhood} ` : ""}Spiral in ${spiralCityDisplay}.`,
    },
  };

  // Keep existing callback contracts alive for callers while never initiating
  // a location lookup or publishing a location signal.
  if (externalSignal) onSignalChange?.(signal);

  const ready = signal.can_host === true || signal.allowed === true || signal.host_signal?.status === "ready";
  const message = signal.host_signal?.message ?? signal.error ?? `Ready to host in ${spiralCityDisplay}.`;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full ${ready ? "text-emerald-400" : "text-muted-foreground"}`}
        role="status"
        aria-label={ready ? "Ready to host Spiral" : "Spiral host unavailable"}
        title={message}
      >
        <CheckCircle2 className="h-5 w-5" />
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-100 px-3 py-3" role="status" aria-live="polite">
      <p className="text-[10px] font-black uppercase tracking-wider opacity-80">Host signal · ready</p>
      <p className="mt-1 text-xs leading-relaxed">{message}</p>
      <p className="mt-2 text-[10px] opacity-60">Choose a curated neighborhood or city-wide Spiral. No GPS or Map Locator is required.</p>
    </div>
  );
}
