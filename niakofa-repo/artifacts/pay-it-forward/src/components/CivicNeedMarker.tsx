import { memo, useCallback } from "react";
import { useLocation } from "wouter";
import { Building2 } from "lucide-react";
import type { CivicNeedNearby } from "@workspace/api-client-react";

interface CivicNeedMarkerProps {
  need: CivicNeedNearby;
}

// Civic-need pin — distinct from HelperMarker (round avatar) and
// RequestMarker (urgency-colored teardrop): a rounded-square accent-colored
// badge with a building glyph, so all three pin families are tellable apart
// at a glance without reading color alone (colorblind-safe shape difference,
// same principle RequestMarker already uses for urgency).
function CivicNeedMarkerImpl({ need }: CivicNeedMarkerProps) {
  const [, setLocation] = useLocation();

  const handleActivate = useCallback(() => {
    setLocation(`/civic-needs?need=${need.id}`);
  }, [need.id, setLocation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  }, [handleActivate]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Civic need: ${need.title}${need.distance_miles != null ? `, ${need.distance_miles.toFixed(1)} miles away` : ""}`}
      className="relative flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
      style={{ width: 40, height: 40, touchAction: "manipulation" }}
      onClick={(e) => { e.stopPropagation(); handleActivate(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-8 h-8 rounded-xl bg-primary/20 border-2 border-primary flex items-center justify-center shadow-md">
        <Building2 className="w-4 h-4 text-primary" />
      </div>
    </div>
  );
}

export const CivicNeedMarker = memo(CivicNeedMarkerImpl, (prev, next) =>
  prev.need.id === next.need.id &&
  prev.need.lat === next.need.lat &&
  prev.need.lng === next.need.lng &&
  prev.need.status === next.need.status
);
