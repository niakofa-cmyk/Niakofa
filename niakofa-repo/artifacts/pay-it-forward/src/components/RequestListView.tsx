import { useState, useMemo } from "react";
import type { HelpRequest } from "@workspace/api-client-react";
import { RequestCard } from "./RequestCard";
import { ArrowDownWideNarrow, MapPin, AlertTriangle, DollarSign } from "lucide-react";

// Accessibility-first alternative to the pin map: some users find precise
// map-pin-tapping hard (small touch targets, motor impairment, screen
// readers that can't meaningfully describe a canvas map). This is the same
// open-requests data, laid out as a plain scrollable, sortable list — every
// row is a normal focusable/readable DOM element, nothing is conveyed only
// through pin color or position.

type SortKey = "closest" | "urgent" | "highest_paying";

const SORT_OPTIONS: { key: SortKey; label: string; icon: typeof MapPin }[] = [
  { key: "closest", label: "Closest", icon: MapPin },
  { key: "urgent", label: "Most urgent", icon: AlertTriangle },
  { key: "highest_paying", label: "Highest paying", icon: DollarSign },
];

const URGENCY_RANK: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };

function payValue(r: HelpRequest): number {
  if (r.payment_type === "immediate" && r.pay_it_forward_amount != null) return r.pay_it_forward_amount;
  if (r.payment_type === "pay_it_forward" && r.pledge_amount != null) return r.pledge_amount;
  return 0;
}

interface RequestListViewProps {
  requests: HelpRequest[];
  onClaim: (request: HelpRequest) => void;
  isClaiming: boolean;
  serviceRadiusMiles?: number;
  helperModeActive?: boolean;
}

export function RequestListView({
  requests, onClaim, isClaiming, serviceRadiusMiles = 10, helperModeActive = false,
}: RequestListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>(helperModeActive ? "closest" : "urgent");

  const sorted = useMemo(() => {
    const list = [...requests];
    switch (sortKey) {
      case "closest":
        return list.sort((a, b) => (a.distance_miles ?? 99) - (b.distance_miles ?? 99));
      case "highest_paying":
        return list.sort((a, b) => payValue(b) - payValue(a));
      case "urgent":
      default:
        return list.sort((a, b) => {
          const diff = (URGENCY_RANK[a.urgency ?? "low"] ?? 3) - (URGENCY_RANK[b.urgency ?? "low"] ?? 3);
          return diff !== 0 ? diff : (a.distance_miles ?? 99) - (b.distance_miles ?? 99);
        });
    }
  }, [requests, sortKey]);

  return (
    <div className="absolute inset-0 top-0 z-10 bg-background overflow-y-auto pt-24 pb-24 px-4" role="region" aria-label="Open requests, list view">
      {/* Sort control — a real <fieldset>/radiogroup, not another map overlay,
          so it's fully reachable by keyboard and announced correctly. */}
      <div className="sticky top-0 -mx-4 px-4 pb-3 pt-1 bg-background/95 backdrop-blur-sm z-10 mb-2" role="radiogroup" aria-label="Sort requests by">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          <ArrowDownWideNarrow className="w-3 h-3" />
          Sort by
        </div>
        <div className="flex gap-2">
          {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="radio"
              aria-checked={sortKey === key}
              onClick={() => setSortKey(key)}
              style={{ touchAction: "manipulation" }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                sortKey === key
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-card border-border text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {sorted.length} open request{sorted.length !== 1 ? "s" : ""}, sorted by {SORT_OPTIONS.find(o => o.key === sortKey)?.label.toLowerCase()}.
      </div>

      {/* Same hint the WebGL-fallback list already shows — Accept is now
          gated behind Helper Mode in RequestCard itself (it used to be live
          for anyone who reached this list), so browsing requesters see why
          the button is disabled instead of a silently inert control. */}
      {!helperModeActive && sorted.length > 0 && (
        <p className="text-center text-xs text-muted-foreground mb-3">
          Switch to Helper Mode in the top bar to claim requests.
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
          <MapPin className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No open requests match right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              onClaim={onClaim}
              isClaiming={isClaiming}
              serviceRadiusMiles={serviceRadiusMiles}
              helperModeActive={helperModeActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
