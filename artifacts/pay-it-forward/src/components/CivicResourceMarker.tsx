import { memo, useCallback } from "react";
import { Landmark } from "lucide-react";
import type { CivicResourceNearby } from "@workspace/api-client-react";

interface CivicResourceMarkerProps {
  resource: CivicResourceNearby;
  onSelect: (resource: CivicResourceNearby) => void;
}

// Resource pin — third distinct pin family (round avatar = helper,
// rounded-square = civic need, this diamond = resource/help center).
// Color reflects open/closed status rather than urgency, since that's the
// one thing a requester actually needs to know before travelling there.
function CivicResourceMarkerImpl({ resource, onSelect }: CivicResourceMarkerProps) {
  const handleActivate = useCallback(() => onSelect(resource), [resource, onSelect]);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  }, [handleActivate]);

  const colorClass =
    resource.open_status === "open" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" :
    resource.open_status === "closed" ? "bg-muted border-muted-foreground/40 text-muted-foreground" :
    "bg-amber-500/15 border-amber-500/60 text-amber-400";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${resource.org_name}, ${resource.open_status}${resource.distance_miles != null ? `, ${resource.distance_miles.toFixed(1)} miles away` : ""}`}
      className="relative flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ width: 40, height: 40, touchAction: "manipulation" }}
      onClick={(e) => { e.stopPropagation(); handleActivate(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`w-8 h-8 rotate-45 border-2 flex items-center justify-center shadow-md ${colorClass}`}
      >
        <Landmark className="w-3.5 h-3.5 -rotate-45" />
      </div>
    </div>
  );
}

export const CivicResourceMarker = memo(CivicResourceMarkerImpl, (prev, next) =>
  prev.resource.id === next.resource.id &&
  prev.resource.lat === next.resource.lat &&
  prev.resource.lng === next.resource.lng &&
  prev.resource.open_status === next.resource.open_status
);
