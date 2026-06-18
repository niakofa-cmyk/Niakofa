import type { HelperLocation } from "@workspace/api-client-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";

interface ExtendedHelperLocation extends HelperLocation {
  eta_minutes?: number | null;
  heading?: number | null;
}

export function HelperMarker({ helper }: { helper: ExtendedHelperLocation }) {
  const h = helper as ExtendedHelperLocation;
  const [tapped, setTapped] = useState(false);
  const [, setLocation] = useLocation();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Short tap → navigate to helper profile
  // Long press (300ms+) → show tooltip (mobile-friendly for inspecting stats before navigating)
  const handlePointerDown = () => {
    pressTimer.current = setTimeout(() => {
      setTapped(true);
    }, 300);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (!tapped) {
      e.stopPropagation();
      setLocation(`/helper/${helper.id}`);
    }
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setTapped(false);
  };

  return (
    <div
      className="relative flex items-center justify-center w-10 h-10 cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onMouseEnter={() => setTapped(true)}
      onMouseLeave={() => setTapped(false)}
    >
      {/* Pulse ring */}
      <div className="absolute w-full h-full bg-primary/20 rounded-full border border-primary/40 animate-pulse" />

      {/* Heading arrow — SVG triangle */}
      {h.heading != null && (
        <svg
          width="10" height="10"
          viewBox="0 0 10 10"
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
          <img src={helper.avatar_url} alt={helper.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
            {helper.name?.[0] ?? "?"}
          </div>
        )}
      </div>

      {/* Online dot */}
      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background z-10" />

      {/* Tooltip — hover or long-press shows stats; tap navigates to profile */}
      {tapped && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-50 w-max max-w-[160px]">
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-2xl">
            <div className="text-xs font-bold truncate">{helper.name}</div>
            {helper.trust_score != null && (
              <div className="text-[10px] text-muted-foreground">{helper.trust_score}% trust · {helper.help_count} helps</div>
            )}
            {h.eta_minutes != null && (
              <div className="text-[10px] text-primary font-bold mt-0.5">~{h.eta_minutes} min away</div>
            )}
            {h.distance_miles != null && (
              <div className="text-[10px] text-muted-foreground">{h.distance_miles.toFixed(1)} mi</div>
            )}
            <div className="text-[10px] text-primary/70 mt-1 font-semibold">Tap to view profile →</div>
          </div>
          {/* Tooltip caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
        </div>
      )}
    </div>
  );
}
