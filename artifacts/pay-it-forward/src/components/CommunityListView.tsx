import { useMemo } from "react";
import { useLocation } from "wouter";
import { MapPin, HeartHandshake, Building2, Landmark, Clock } from "lucide-react";
import type { HelperLocation, CivicNeedNearby, CivicResourceNearby } from "@workspace/api-client-react";

type Row =
  | { kind: "helper"; distance: number; helper: HelperLocation }
  | { kind: "need"; distance: number; need: CivicNeedNearby }
  | { kind: "resource"; distance: number; resource: CivicResourceNearby };

interface CommunityListViewProps {
  helpers: HelperLocation[];
  needs: CivicNeedNearby[];
  resources: CivicResourceNearby[];
  onSelectResource: (resource: CivicResourceNearby) => void;
}

// Accessible list-view counterpart to RequestListView.tsx, but for community
// mode's mixed helper/need/resource data. No sort picker — with only
// distance as a meaningful axis here (no urgency, no pay), a single
// closest-first order is simpler than pretending there's a choice to make.
export function CommunityListView({ helpers, needs, resources, onSelectResource }: CommunityListViewProps) {
  const [, setLocation] = useLocation();

  const rows: Row[] = useMemo(() => {
    const helperRows: Row[] = helpers.map(h => ({ kind: "helper", distance: (h as HelperLocation & { distance_miles?: number }).distance_miles ?? 99, helper: h }));
    const needRows: Row[] = needs.map(n => ({ kind: "need", distance: n.distance_miles ?? 99, need: n }));
    const resourceRows: Row[] = resources.map(r => ({ kind: "resource", distance: r.distance_miles ?? 99, resource: r }));
    return [...helperRows, ...needRows, ...resourceRows].sort((a, b) => a.distance - b.distance);
  }, [helpers, needs, resources]);

  return (
    <div className="absolute inset-0 top-0 z-10 bg-background overflow-y-auto pt-24 pb-24 px-4" role="region" aria-label="Helpers and civic needs, list view">
      <div aria-live="polite" className="sr-only">
        {rows.length} nearby helper{rows.length !== 1 ? "s" : ""}, civic need{rows.length !== 1 ? "s" : ""}, and resources.
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
          <MapPin className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nothing nearby right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {rows.map((row) => {
            if (row.kind === "helper") {
              const h = row.helper as HelperLocation & { distance_miles?: number; languages?: string[]; skills?: string[] };
              return (
                <button
                  key={`helper-${h.id}`}
                  onClick={() => setLocation(`/helper/${h.id}`)}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <HeartHandshake className="w-4.5 h-4.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[h.skills?.[0], h.languages?.[0]].filter(Boolean).join(", ") || "Helper"} · {h.distance_miles != null ? `${h.distance_miles.toFixed(1)} mi` : "nearby"}
                    </p>
                  </div>
                </button>
              );
            }
            if (row.kind === "need") {
              const n = row.need;
              return (
                <button
                  key={`need-${n.id}`}
                  onClick={() => setLocation(`/civic-needs?need=${n.id}`)}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                    <Building2 className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate capitalize">
                      {n.category.replace(/_/g, " ")} · {n.distance_miles.toFixed(1)} mi
                    </p>
                  </div>
                </button>
              );
            }
            const r = row.resource;
            return (
              <button
                key={`resource-${r.id}`}
                onClick={() => onSelectResource(r)}
                className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-10 h-10 rotate-45 bg-emerald-500/10 border-2 border-emerald-500/50 flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4 text-emerald-400 -rotate-45" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{r.org_name}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    {r.open_status === "open" ? "Open now" : r.open_status === "closed" ? "Closed" : "Hours unknown"}
                    {r.distance_miles != null && ` · ${r.distance_miles.toFixed(1)} mi`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
