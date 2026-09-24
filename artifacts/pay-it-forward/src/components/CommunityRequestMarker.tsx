import type { HelpRequest } from "@workspace/api-client-react";
import { AlertTriangle, HeartHandshake, MapPin } from "lucide-react";

interface CommunityRequestMarkerProps {
  request: HelpRequest;
  onSelect: (request: HelpRequest) => void;
}

const URGENCY_STYLES: Record<string, { pin: string; halo: string }> = {
  emergency: {
    pin: "bg-destructive border-destructive-foreground/70 shadow-[0_0_18px_rgba(239,68,68,0.65)]",
    halo: "bg-destructive/20 animate-ping",
  },
  high: {
    pin: "bg-orange-500 border-orange-200/80 shadow-[0_0_14px_rgba(249,115,22,0.5)]",
    halo: "bg-orange-500/15",
  },
  medium: {
    pin: "bg-yellow-500 border-yellow-100/80 shadow-[0_0_12px_rgba(234,179,8,0.4)]",
    halo: "bg-yellow-500/10",
  },
  low: {
    pin: "bg-primary border-primary-foreground/70 shadow-[0_0_12px_rgba(34,211,238,0.35)]",
    halo: "bg-primary/10",
  },
};

/**
 * Community-mode request pin. It deliberately only selects a privacy-safe
 * nearby request; it never exposes exact coordinates or performs a claim.
 * The detail sheet hands off to the canonical role-aware request route.
 */
export function CommunityRequestMarker({ request, onSelect }: CommunityRequestMarkerProps) {
  const urgency = request.urgency ?? "low";
  const styles = URGENCY_STYLES[urgency] ?? URGENCY_STYLES.low;
  const isEmergency = urgency === "emergency";

  return (
    <button
      type="button"
      className="relative flex h-11 w-11 items-center justify-center cursor-pointer"
      style={{ touchAction: "manipulation" }}
      aria-label={`${urgency} priority neighbor request: ${request.title}`}
      title={request.title}
      onClick={() => onSelect(request)}
    >
      <span className={`absolute inset-1.5 rounded-full ${styles.halo}`} aria-hidden="true" />
      <span className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 ${styles.pin}`} aria-hidden="true">
        {isEmergency ? (
          <AlertTriangle className="h-4 w-4 text-background" />
        ) : (
          <HeartHandshake className="h-4 w-4 text-background" />
        )}
      </span>
      <MapPin className="absolute inset-0 m-auto h-11 w-11 text-transparent" aria-hidden="true" />
    </button>
  );
}