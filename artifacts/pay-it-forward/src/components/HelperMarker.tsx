import type { HelperLocation } from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useLocation } from "wouter";

interface ExtendedHelperLocation extends HelperLocation {
  eta_minutes?: number | null;
  heading?: number | null;
}

interface HelperMarkerProps {
  helper: ExtendedHelperLocation;
}

function HelperMarkerImpl({ helper }: HelperMarkerProps) {
  const h = helper as ExtendedHelperLocation;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [, setLocation] = useLocation();

  // Track whether the current pointer interaction is a long-press (tooltip)
  // vs a short tap (navigate). Separate from hover state.
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  // Safe first character that works with emoji / multi-byte strings
  const initial = h.name ? [...h.name][0] ?? "?" : "?";

  // Cleanup on unmount — prevents memory leak from dangling timers
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // --- Pointer events (touch + mouse unified) ---

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary button / first touch
    if (e.button !== 0 && e.button !== undefined) return;
    isLongPressRef.current = false;

    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setTooltipVisible(true);
    }, 320);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearPressTimer();
      if (!isLongPressRef.current) {
        // Short tap → navigate to profile
        e.stopPropagation();
        setLocation(`/helper/${helper.id}`);
      }
      // Long press already showed tooltip; leave it visible until pointer leaves
    },
    [helper.id, setLocation]
  );

  const handlePointerLeave = useCallback(() => {
    clearPressTimer();
    isLongPressRef.current = false;
    setTooltipVisible(false);
  }, []);

  // --- Mouse-only hover (desktop) ---
  // We detect desktop via hover: if pointer type is "mouse" we show tooltip on
  // hover, not requiring a long press. pointerEnter fires before mouseEnter and
  // gives us pointer type.
  const handlePointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      setTooltipVisible(true);
    }
  }, []);

  // --- Keyboard accessibility ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setLocation(`/helper/${helper.id}`);
      }
    },
    [helper.id, setLocation]
  );

  const ariaLabel = [
    `Helper ${helper.name}`,
    helper.trust_score != null ? `${helper.trust_score}% trust` : null,
    h.eta_minutes != null ? `${h.eta_minutes} minutes away` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    // 44px minimum touch target (WCAG 2.5.5) — outer box is the hit area,
    // the visual avatar/pulse-ring inside stays its original 40px size so
    // nothing looks bigger on screen, it's just easier to actually tap.
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="relative flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
      style={{ width: 44, height: 44, touchAction: "manipulation" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      {/* Pulse ring */}
      <div className="absolute w-10 h-10 bg-primary/20 rounded-full border border-primary/40 animate-pulse" />

      {/* Heading arrow — SVG triangle pointing in direction of travel */}
      {h.heading != null && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className="absolute text-primary"
          style={{
            transform: `rotate(${h.heading}deg) translateY(-22px)`,
            transformOrigin: "5px 22px",
            fill: "hsl(190 100% 50%)",
            opacity: 0.9,
          }}
        >
          <polygon points="5,0 10,10 0,10" />
        </svg>
      )}

      {/* Avatar */}
      <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-background shadow-md relative z-10">
        {helper.avatar_url ? (
          <img
            src={helper.avatar_url}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground"
            aria-hidden="true"
          >
            {initial}
          </div>
        )}
      </div>

      {/* Online dot */}
      <div
        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background z-10"
        aria-hidden="true"
      />

      {/* Tooltip — animated entrance, desktop hover or mobile long-press */}
      {tooltipVisible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-50 w-max max-w-[170px]"
          style={{
            animation: "tooltipIn 120ms ease-out both",
          }}
        >
          <style>{`
            @keyframes tooltipIn {
              from { opacity: 0; transform: translateX(-50%) scale(0.92); }
              to   { opacity: 1; transform: translateX(-50%) scale(1); }
            }
          `}</style>
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-2xl">
            <div className="text-xs font-bold truncate">{helper.name}</div>
            {helper.trust_score != null && (
              <div className="text-[10px] text-muted-foreground">
                {helper.trust_score}% trust · {helper.help_count ?? 0} helps
              </div>
            )}
            {h.eta_minutes != null && (
              <div className="text-[10px] text-primary font-bold mt-0.5">
                ~{h.eta_minutes} min away
              </div>
            )}
            {h.distance_miles != null && (
              <div className="text-[10px] text-muted-foreground">
                {h.distance_miles.toFixed(1)} mi
              </div>
            )}
            <div className="text-[10px] text-primary/70 mt-1 font-semibold">
              Tap to view profile →
            </div>
          </div>
          {/* Tooltip caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
        </div>
      )}
    </div>
  );
}

// Memoized — helper dots otherwise re-render on every WS tick (helper_location
// fires frequently for anyone moving). Only re-render when something that
// actually changes this marker's visual output changes.
export const HelperMarker = memo(HelperMarkerImpl, (prev, next) => {
  const a = prev.helper as HelperMarkerProps["helper"] & { heading?: number | null; eta_minutes?: number | null; distance_miles?: number | null };
  const b = next.helper as HelperMarkerProps["helper"] & { heading?: number | null; eta_minutes?: number | null; distance_miles?: number | null };
  return (
    a.id === b.id &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.heading === b.heading &&
    a.trust_score === b.trust_score &&
    a.eta_minutes === b.eta_minutes &&
    a.distance_miles === b.distance_miles &&
    a.avatar_url === b.avatar_url
  );
});
