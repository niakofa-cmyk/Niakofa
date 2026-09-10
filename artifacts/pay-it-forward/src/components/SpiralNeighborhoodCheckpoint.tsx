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
  const invalidGeometry =
    context?.neighborhood_geofence_status === "invalid_geometry" ||
    context?.neighborhood_geometry_status === "invalid";
  const missingMapLocation = !checking && context == null;

  const tone = verified
    ? "verified"
    : missingMapLocation
      ? "neutral"
      : awaitingReview
        ? "pending"
        : outsideNeighborhood || invalidGeometry
          ? "attention"
          : "neutral";

  const heading = checking
    ? "Checking Map Locator…"
    : verified
      ? `${context.neighborhood_emoji ?? "\ud83d\udccd"} Your Neighborhood \u00b7 ${context.neighborhood_name}`
      : missingMapLocation
        ? "Location needed"
        : outsideNeighborhood
          ? `Map GPS verified in ${context?.city_display ?? "your city"}`
          : context
            ? `Map GPS verified in ${context.city_display}`
            : "Location needed";

  const description = checking
    ? "Matching your shared Map Locator fix against reviewed neighborhood geometry."
    : verified
      ? "Your Neighborhood Spiral is first in the list. Host Signal Green is active for this boundary. Joining never requires location."
      : missingMapLocation
        ? "Turn on Location in the Map so Niakofa can identify your neighborhood Spiral. Spirals use the same Map Locator the rest of the app already uses."
        : outsideNeighborhood
          ? "You are in the verified city, but outside the matched neighborhood boundary. The neighborhood hint remains informational."
          : invalidGeometry
            ? "The available neighborhood geometry cannot be used for GPS verification right now. Niakofa will not guess your neighborhood."
            : awaitingReview
              ? "Your city is known from Map Locator, but Host Signal Green needs a promoted, geometry-verified neighborhood boundary."
              : "Open the Map and enable Location. Spirals reuse that fix for neighborhood ordering and hosting eligibility.";

  return (
    <section
      data-testid="spiral-gps-neighborhood-checkpoint"
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
              ? "Host signal \u00b7 checking Map Locator"
              : verified
                ? "Host signal \u00b7 green GPS neighborhood checkpoint"
                : missingMapLocation
                  ? "Map Locator \u00b7 location needed"
                  : awaitingReview
                    ? "Map Locator \u00b7 neighborhood checkpoint pending"
                    : outsideNeighborhood
                      ? "Map Locator \u00b7 outside this neighborhood"
                      : invalidGeometry
                        ? "Map Locator \u00b7 neighborhood verification unavailable"
                        : "Map Locator neighborhood checkpoint"}
          </p>
          <h2 className="mt-1 text-sm font-black">{heading}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          aria-label={checking ? "Checking Map Locator" : "Refresh Map Locator neighborhood verification"}
          className="shrink-0 rounded-lg border border-current/25 px-2.5 py-1.5 text-[10px] font-black transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "Checking\u2026" : "Refresh"}
        </button>
      </div>
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
      {missingMapLocation && onOpenMap && (
        <button
          type="button"
          onClick={onOpenMap}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-black text-foreground transition-colors hover:bg-muted"
        >
          <MapPin className="h-3 w-3" aria-hidden="true" />
          Go to Map
        </button>
      )}
    </section>
  );
}
