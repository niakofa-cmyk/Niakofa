import { Clock3, Navigation2, Route } from "lucide-react";
import type { RequestRouteSummary } from "./RequestInteractionTypes";

export function NavigationContext({
  route,
  status,
  role,
  currentStep,
}: {
  route?: RequestRouteSummary | null;
  status: string;
  role: "helper" | "requester";
  currentStep?: { instruction?: string | null; distance_meters?: number | null } | null;
}) {
  const active = status === "claimed" || status === "en_route";
  const label = status === "arrived" ? "At the meeting point" : active ? (role === "helper" ? "On your way" : "Helper is on the way") : "Route context";
  return (
    <section className="rounded-2xl border border-border bg-background/45 p-3" data-testid="card-navigation-context">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="truncate text-xs font-black">{label}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary">
          {role === "helper" ? "Navigation" : "Live route"}
        </span>
      </div>
      {currentStep?.instruction && active && (
        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed">{currentStep.instruction}</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-muted/40 px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">ETA</p>
          <p className="mt-1 flex items-center gap-1 font-black"><Clock3 className="h-3 w-3 text-primary" /> {route?.eta_text || "Updating…"}</p>
        </div>
        <div className="rounded-xl bg-muted/40 px-2.5 py-2">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Distance</p>
          <p className="mt-1 flex items-center gap-1 font-black"><Navigation2 className="h-3 w-3 text-primary" /> {route?.distance_text || "Updating…"}</p>
        </div>
      </div>
    </section>
  );
}