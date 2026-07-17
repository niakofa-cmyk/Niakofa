/**
 * BestMatchCard.tsx — Helper-mode Dispatch Intelligence Best Match Card
 *
 * Shows the algorithmically ranked best open request for the current helper.
 * Lives on the map screen above the BottomSheet — appears when Dispatch Intelligence
 * finds a top match, dismissed by the helper or replaced when they accept.
 *
 * Props match what map.tsx already passes:
 *   bestMatch      — the top HelpRequest from pickBestMatch()
 *   onAccept       — handler to claim/navigate
 *   onDismiss      — mark dismissed for this session
 *   isClaiming     — shows loading state while claim mutation is pending
 *   serviceRadiusMiles — for outside-area warning label
 */

import type { HelpRequest } from "@workspace/api-client-react";
import { Zap, MapPin, Clock, X, ChevronRight, AlertTriangle } from "lucide-react";

interface BestMatchCardProps {
  bestMatch: HelpRequest;
  onAccept: (request: HelpRequest) => void;
  onDismiss: () => void;
  isClaiming?: boolean;
  serviceRadiusMiles?: number;
  /** Live driving ETA in minutes, when available (fetched via the same route API used for active jobs). */
  etaMinutes?: number | null;
}

const URGENCY_LABEL: Record<string, string> = {
  emergency: "🚨 EMERGENCY",
  high: "🔴 High",
  medium: "🟡 Medium",
  low: "🟢 Low",
};

const CATEGORY_EMOJI: Record<string, string> = {
  emergency: "🚨",
  medical: "🏥",
  home_repair: "🔧",
  groceries: "🛒",
  transportation: "🚗",
  errands: "📦",
  tech_support: "💻",
  food_pantry: "🍱",
  delivery_run: "🚚",
  event_setup: "🎪",
  local_farm: "🌾",
  other: "💙",
};

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function BestMatchCard({
  bestMatch,
  onAccept,
  onDismiss,
  isClaiming = false,
  serviceRadiusMiles = 10,
  etaMinutes = null,
}: BestMatchCardProps) {
  const isOutsideArea =
    bestMatch.urgency !== "emergency" &&
    (bestMatch.distance_miles ?? 0) > serviceRadiusMiles;

  const catEmoji =
    CATEGORY_EMOJI[bestMatch.category ?? "other"] ?? "💙";
  const urgencyLabel =
    URGENCY_LABEL[bestMatch.urgency ?? "low"] ?? "🟢 Low";

  return (
    // z-30 — above BottomSheet (z-20) so an expanded sheet can't bury this
    // card, but below the Filters/Layers/Orientation/Recenter control rows
    // (z-40), which must always win regardless of what else is on screen.
    // BestMatchCard and BottomSheet are siblings with the card mounted
    // first in the JSX; at equal z-index later DOM siblings paint on top, so
    // the moment a helper drags the sheet open (h-[55vh], well above this
    // card's bottom-44) the sheet fully buried the Best Match prompt — still
    // in the DOM and clickable, just invisible underneath, which is worse
    // than not being there. z-30 keeps it above the sheet in every state
    // without relying on DOM order to break the tie.
    <div className="absolute bottom-44 left-3 right-3 z-30">
      <div
        className={`rounded-2xl border shadow-2xl backdrop-blur-md overflow-hidden transition-all ${
          bestMatch.urgency === "emergency"
            ? "bg-destructive/10 border-destructive/50"
            : "bg-card/95 border-border"
        }`}
      >
        {/* Header label */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">
              Best Match for You
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-muted/50 transition-colors"
            aria-label="Dismiss best match"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xl" aria-hidden="true">
              {catEmoji}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold leading-snug truncate">
                {bestMatch.title}
              </h3>
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                <span
                  className={`text-[10px] font-bold ${
                    bestMatch.urgency === "emergency"
                      ? "text-destructive"
                      : bestMatch.urgency === "high"
                      ? "text-orange-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {urgencyLabel}
                </span>
                {bestMatch.distance_miles != null && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MapPin className="w-2.5 h-2.5" />
                    {bestMatch.distance_miles.toFixed(1)} mi
                  </span>
                )}
                {etaMinutes != null && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-primary">
                    <Clock className="w-2.5 h-2.5" />
                    ~{etaMinutes} min drive
                  </span>
                )}
                {bestMatch.created_at && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(bestMatch.created_at)}
                  </span>
                )}
                {isOutsideArea && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Outside zone
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Requester */}
          {bestMatch.requester_name && (
            <p className="text-[10px] text-muted-foreground mb-3 truncate">
              Requested by{" "}
              <span className="font-semibold text-foreground">
                {bestMatch.requester_name}
              </span>
            </p>
          )}

          {/* Accept button */}
          <button
            onClick={() => onAccept(bestMatch)}
            disabled={isClaiming}
            className={`w-full h-10 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              isClaiming
                ? "bg-primary/50 text-primary-foreground/70 cursor-wait"
                : bestMatch.urgency === "emergency"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
            }`}
            aria-label={`Accept ${bestMatch.title}`}
          >
            {isClaiming ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Claiming…
              </>
            ) : (
              <>
                {bestMatch.urgency === "emergency" ? "Respond Now" : "Accept This Job"}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
