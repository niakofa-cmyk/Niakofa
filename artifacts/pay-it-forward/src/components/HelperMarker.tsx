import type { HelperLocation } from "@workspace/api-client-react";

interface ExtendedHelperLocation extends HelperLocation {
  eta_minutes?: number | null;
  heading?: number | null;
}

export function HelperMarker({ helper }: { helper: ExtendedHelperLocation }) {
  const h = helper as ExtendedHelperLocation;
  return (
    <div className="relative flex items-center justify-center w-10 h-10 group cursor-pointer">
      <div className="absolute w-full h-full bg-primary/20 rounded-full border border-primary/40 backdrop-blur-sm animate-pulse" />
      
      {/* Heading arrow */}
      {h.heading != null && (
        <div
          className="absolute w-0 h-0 border-l-[4px] border-r-[4px] border-b-[8px] border-l-transparent border-r-transparent border-b-primary opacity-80"
          style={{
            transform: `rotate(${h.heading}deg) translateY(-18px)`,
            transformOrigin: "center 18px",
          }}
        />
      )}

      <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-background shadow-md z-10">
        {helper.avatar_url ? (
          <img src={helper.avatar_url} alt={helper.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
            {helper.name[0]}
          </div>
        )}
      </div>

      {/* Online dot */}
      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background z-10" />

      {/* Hover tooltip with ETA */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-max">
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-xl">
          <div className="text-xs font-bold">{helper.name}</div>
          {helper.trust_score != null && (
            <div className="text-[10px] text-muted-foreground">{helper.trust_score}% trust · {helper.help_count} helps</div>
          )}
          {h.eta_minutes != null && (
            <div className="text-[10px] text-primary font-bold mt-0.5">~{h.eta_minutes} min away</div>
          )}
          {h.distance_miles != null && (
            <div className="text-[10px] text-muted-foreground">{h.distance_miles.toFixed(1)} mi</div>
          )}
        </div>
      </div>
    </div>
  );
}
