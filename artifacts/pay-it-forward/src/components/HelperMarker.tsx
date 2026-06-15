import type { HelperLocation } from "@workspace/api-client-react";

export function HelperMarker({ helper }: { helper: HelperLocation }) {
  return (
    <div className="relative flex items-center justify-center w-8 h-8 group cursor-pointer">
      <div className="absolute w-full h-full bg-primary/20 rounded-full border border-primary/40 backdrop-blur-sm animate-pulse" />
      <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-background shadow-md">
        {helper.avatar_url ? (
          <img src={helper.avatar_url} alt={helper.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
            {helper.name[0]}
          </div>
        )}
      </div>
      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-max">
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg px-2 py-1 shadow-xl">
          <div className="text-xs font-bold">{helper.name}</div>
          {helper.trust_score != null && (
            <div className="text-[10px] text-muted-foreground">{helper.trust_score}% trust</div>
          )}
        </div>
      </div>
    </div>
  );
}
