import type { HelpRequest } from "@workspace/api-client-react";
import { AlertTriangle, Heart, DollarSign, Gift, ArrowUpRight, Circle, TriangleAlert } from "lucide-react";
import { memo, useState } from "react";
import { useLocation } from "wouter";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

interface RequestMarkerProps {
  request: HelpRequest;
  /**
   * Whether the request is outside the helper's normal service radius.
   * When true (and not an emergency) a dashed ring is drawn around the pin
   * to signal "reachable but outside your usual area."
   * Computed in map.tsx from the helper's radiusMiles vs haversine distance.
   */
  outsideServiceArea?: boolean;
  /**
   * Skill/category match indicator (reserved for future Local-First Dispatch).
   * Not yet wired — helper category preferences are not yet returned by the
   * user-settings API.  Prop is accepted but currently unused so the UI
   * remains correct when it is eventually wired.
   */
  skillMatch?: boolean;
  /**
   * Called whenever this pin is tapped/hovered — lets the parent map screen
   * link the tap to the matching card in the BottomSheet (scroll it into
   * view + highlight) instead of the pin being a dead end at high zoom.
   */
  onSelect?: (id: number) => void;
  /** True when this is the currently-linked/highlighted request (e.g. its
   * card is open in the BottomSheet) — draws an extra glow ring. */
  isHighlighted?: boolean;
}

function getColors(urgency: string | undefined) {
  switch (urgency) {
    case 'emergency': return { fill: 'fill-destructive', pulse: 'bg-destructive', glow: 'shadow-[0_0_20px_rgba(255,50,50,0.8)]' };
    case 'high': return { fill: 'fill-orange-500', pulse: 'bg-orange-500', glow: 'shadow-[0_0_15px_rgba(255,165,0,0.6)]' };
    case 'medium': return { fill: 'fill-yellow-500', pulse: 'bg-yellow-500', glow: '' };
    default: return { fill: 'fill-primary', pulse: 'bg-primary', glow: '' };
  }
}

function getPaymentIcon(paymentType: string) {
  switch (paymentType) {
    case 'immediate': return <DollarSign className="w-2.5 h-2.5 text-green-400" />;
    case 'goodwill': return <Gift className="w-2.5 h-2.5 text-purple-400" />;
    default: return <Heart className="w-2.5 h-2.5 text-primary" />;
  }
}

/**
 * Colorblind-safe urgency badge — a small shape in the bottom-right corner
 * of the pin that duplicates the urgency signal via SHAPE, not just color,
 * so red/green or red/yellow confusion doesn't erase the distinction
 * between "high" and "medium"/"low". Emergency already gets its own
 * triangle-in-pin glyph up top, so this badge only needs to cover the
 * other three tiers.
 */
function UrgencyShapeBadge({ urgency }: { urgency: string | undefined }) {
  if (urgency === 'emergency') return null;
  if (urgency === 'high') {
    return (
      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background border border-orange-500 flex items-center justify-center" aria-hidden="true">
        <TriangleAlert className="w-2 h-2 text-orange-500" />
      </div>
    );
  }
  if (urgency === 'medium') {
    return (
      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background border border-yellow-500 flex items-center justify-center" aria-hidden="true">
        <Circle className="w-1.5 h-1.5 fill-yellow-500 text-yellow-500" />
      </div>
    );
  }
  return null; // low — no extra badge, matches "quietest" tier
}

function RequestMarkerImpl({ request, outsideServiceArea, skillMatch: _skillMatch, onSelect, isHighlighted }: RequestMarkerProps) {
  const [tapped, setTapped] = useState(false);
  const [, setLocation] = useLocation();
  const suppressed = useIsAnimationSuppressed();
  const { fill, pulse, glow } = getColors(request.urgency);
  const isEmergency = request.urgency === 'emergency';

  const handleTap = () => {
    setTapped(p => !p);
    onSelect?.(request.id);
  };

  return (
    <div
      // 44px minimum touch target (WCAG 2.5.5) — the visual pin stays its
      // original 32/40px size; this invisible padded box just makes the
      // tap-catching area big enough for a thumb without shrinking anything
      // on screen. flex centers the visual glyph inside the bigger hit box.
      className="relative flex items-center justify-center cursor-pointer"
      style={{ width: 44, height: 44, touchAction: "manipulation" }}
      role="button"
      tabIndex={0}
      aria-label={`${request.urgency ?? "low"} priority request: ${request.title}, requested by ${request.requester_name ?? "a neighbor"}`}
      onClick={handleTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTap(); } }}
      onMouseEnter={() => setTapped(true)}
      onMouseLeave={() => setTapped(false)}
    >
      {/* Outside service area — dashed ring indicator per CLAUDE.md Local-First Dispatch */}
      {outsideServiceArea && !isEmergency && (
        <div className="absolute inset-2 rounded-full border-2 border-dashed border-muted-foreground/40 pointer-events-none" />
      )}
      {isHighlighted && (
        // animate-pulse suppressed when Reduce Motion is on — ring stays visible, just static
        <div className={`absolute inset-0 rounded-full border-2 border-primary pointer-events-none${suppressed ? "" : " animate-pulse"}`} />
      )}
      {isEmergency && (
        // Emergency urgency rings: when suppressed, show as static rings so the
        // visual urgency signal is preserved even without animation.
        suppressed ? (
          <>
            <div className={`absolute inset-1 ${pulse} rounded-full opacity-15`} />
            <div className={`absolute inset-3 ${pulse} rounded-full opacity-10`} />
          </>
        ) : (
          <>
            <div className={`absolute inset-1 ${pulse} rounded-full opacity-20 animate-ping`} />
            <div className={`absolute inset-3 ${pulse} rounded-full opacity-10 animate-ping`} style={{ animationDelay: '0.3s' }} />
          </>
        )
      )}
      {!isEmergency && request.urgency === 'high' && (
        // High-urgency halo — suppressed to static when Reduce Motion is on
        <div className={`absolute inset-3 ${pulse} rounded-full opacity-15${suppressed ? "" : " animate-ping"}`} />
      )}

      <div className="relative">
        <svg
          width={isEmergency ? 40 : 32}
          height={isEmergency ? 40 : 32}
          viewBox="0 0 24 24"
          className={`drop-shadow-lg ${fill} ${glow} transition-transform group-hover:scale-110`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>

        {isEmergency ? (
          <div className="absolute top-[6px] left-1/2 -translate-x-1/2 text-background">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        ) : (
          <div className="absolute top-[5px] left-1/2 -translate-x-1/2">
            {getPaymentIcon(request.payment_type)}
          </div>
        )}

        <UrgencyShapeBadge urgency={request.urgency} />
      </div>

      {tapped && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-max max-w-[180px]">
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg px-2.5 py-1.5 shadow-xl flex flex-col gap-1">
          <div className="text-xs font-bold truncate">{request.title}</div>
          <div className="text-[10px] text-muted-foreground truncate">{request.requester_name}</div>
          {/* "Dead end" fix — every pin now leads somewhere, even outside
              helper mode where there's no BottomSheet card to link to. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLocation(`/request/${request.id}/view`); }}
            className="flex items-center justify-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-md px-2 py-1 mt-0.5"
          >
            View details <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>}
    </div>
  );
}

// Memoized — request markers otherwise re-render on every WS tick even when
// nothing about this specific request changed (helper_location events fire
// far more often than request state changes). Compare only the fields that
// actually affect this marker's render output.
export const RequestMarker = memo(RequestMarkerImpl, (prev, next) => {
  return (
    prev.request.id === next.request.id &&
    prev.request.lat === next.request.lat &&
    prev.request.lng === next.request.lng &&
    prev.request.urgency === next.request.urgency &&
    prev.request.status === next.request.status &&
    prev.request.payment_type === next.request.payment_type &&
    prev.request.title === next.request.title &&
    prev.request.requester_name === next.request.requester_name &&
    prev.outsideServiceArea === next.outsideServiceArea &&
    prev.isHighlighted === next.isHighlighted
  );
});
