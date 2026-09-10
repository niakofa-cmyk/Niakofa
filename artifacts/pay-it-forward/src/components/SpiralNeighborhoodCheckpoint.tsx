import { CheckCircle2, MapPin, RefreshCw } from "lucide-react";

export type SpiralLocationContext = {
  ok?: boolean;
  city_key?: string;
  status: "ready" | "location_ready" | "blocked";
  city_display: string;
  neighborhood_hint: string | null;
  circle_id: number | null;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  neighborhood_geofence_status?: "inside" | "outside" | "no_geometry" | "invalid_geometry";
  neighborhood_geometry_status?: "unconfigured" | "pending_review" | "scheduled" | "verified" | "invalid";
};

type SpiralNeighborhoodCheckpointProps = {
  context: SpiralLocationContext | null;
  checking: boolean;
  onRefresh: () => void;
  onOpenLocalSpiral: () => void;
  onOpenMap?: () => void;
};

export function SpiralNeighborhoodCheckpoint({
  context,
  checking,
  onRefresh,
  onOpenLocalSpiral,
  onOpenMap,
}: SpiralNeighborhoodCheckpointProps) {
  const geometryVerified = context?.neighborhood_geometry_status === "verified";
  const insideReviewedBoundary = context?.neighborhood_geofence_status === "inside" && geometryVerified;
  const verified =
    context?.status === "ready" &&
    context.circle_id != null &&
    context.neighborhood_name != null &&
    insideReviewedBoundary;
  const awaitingReview =
    context?.status === "location_ready" ||
    context?.neighborhood_geometry_status === "pending_review" ||
    context?.neighborhood_geofence_status === "no_geometry";
  const outsideNeighborhood = context?.neighborhood_geofence_status === "outside";
  const invalidGeometry = context?.neighborhood_geofence_status === "invalid_geometry" || context?.neighborhood_geometry_status === "invalid";
  const mapLocationUnavailable = !context && !checking;

  const tone = verified
    ? "verified"
    : awaitingReview
      ? "pending"
      : outsideNeighborhood || invalidGeometry
        ? "attention"
        : "neutral";

  const heading = checking
    ? "Verifying your Map Locator area…"
    : verified
      ? `${context.neighborhood_emoji ?? "📍"} You are in ${context.neighborhood_name}`
        : mapLocationUnavailable
          ? "Map Locator isn't connected yet"
      : outsideNeighborhood
        ? `Map Locator matched ${context?.city_display ?? "your city"}`
        : context
          ? `Map Locator matched ${context.city_display}`
          : "Map Locator isn't connected yet";

  const description = checking
    ? "Checking your fresh Map Locator fix against reviewed neighborhood geometry."
    : verified
      ? "Your neighborhood Spiral is first in the list. Map Locator is used for local ordering and hosting eligibility; your coordinates are not exposed."
        : mapLocationUnavailable
          ? "Turn on Location in the Map so we can match your neighborhood. Joining Spirals never requires location."
      : outsideNeighborhood
        ? "You are in the verified city, but your Map Locator position is outside the matched neighborhood boundary. The neighborhood hint remains informational."
        : invalidGeometry
          ? "The available neighborhood geometry cannot be used for Map Locator verification right now. Niakofa will not guess your neighborhood."
          : awaitingReview
            ? "No active Spiral for this location yet. An admin must Promote → Host Signal for this neighborhood."
            : "Allow location access, then refresh Map Locator. Niakofa uses a fresh, accurate fix to verify your local Spiral without exposing your coordinates.";

  return (
    <section
      data-testid="spiral-map-neighborhood-checkpoint"
      data-checkpoint-state={tone}
      aria-live="polite"
      className={`rounded-2xl border p-4 ${
        tone === "verified"
          ? "border-emerald-300/30 bg-emerald-300/[0.08]"
          : tone === "pending"
            ? "border-amber-300/25 bg-amber-300/[0.06]"
            : tone === "attention"
              ? "border-orange-300/25 bg-orange-300/[0.06]"
              : "border-border bg-card/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
            tone === "verified"
              ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-300"
              : tone === "pending"
                ? "border-amber-300/30 bg-amber-300/10 text-amber-300"
                : tone === "attention"
                  ? "border-orange-300/30 bg-orange-300/10 text-orange-300"
                  : "border-border bg-background text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          {checking ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : tone === "verified" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[10px] font-black uppercase tracking-[0.18em] ${
              tone === "verified"
                ? "text-emerald-300"
                : tone === "pending"
                  ? "text-amber-300"
                  : tone === "attention"
                    ? "text-orange-300"
                    : "text-muted-foreground"
            }`}
          >
            {checking
              ? "Host signal · checking Map Locator"
              : verified
                ? "Host signal · green Map Locator neighborhood checkpoint"
                : awaitingReview
                  ? "Map Locator · neighborhood checkpoint pending"
                  : outsideNeighborhood
                    ? "Map Locator · outside this neighborhood"
                    : invalidGeometry
                      ? "Map Locator · neighborhood verification unavailable"
                : mapLocationUnavailable
                  ? "Map Locator · neighborhood matching paused"
                  : "Map Locator neighborhood checkpoint"}
          </p>
          <h2 className="mt-1 text-sm font-black">{heading}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          aria-label={checking ? "Checking your Map Locator" : "Refresh Map Locator neighborhood verification"}
          className="shrink-0 rounded-lg border border-current/25 px-2.5 py-1.5 text-[10px] font-black transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "Checking…" : "Refresh Map Locator"}
        </button>
      </div>
      {mapLocationUnavailable && onOpenMap && (
        <button
          type="button"
          onClick={onOpenMap}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-black text-primary transition-colors hover:bg-primary/20"
        >
          <MapPin className="h-3 w-3" aria-hidden="true" />
          Open Map Locator
        </button>
      )}
      {verified && (
        <button
          type="button"
          onClick={onOpenLocalSpiral}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-[10px] font-black text-emerald-200 transition-colors hover:bg-emerald-300/20"
        >
          <MapPin className="h-3 w-3" aria-hidden="true" />
          Open {context.neighborhood_name} Spiral
        </button>
      )}
    </section>
  );
}
