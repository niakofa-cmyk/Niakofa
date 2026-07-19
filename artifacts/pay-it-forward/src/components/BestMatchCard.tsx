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

import { useState } from "react";
import type { HelpRequest } from "@workspace/api-client-react";
import { Zap, MapPin, Clock, X, ChevronRight, ChevronUp, AlertTriangle } from "lucide-react";
import { Z_CARD } from "@/lib/zLayers";

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
  // Collapsed badge by default — a new match used to always pop open as a
  // full card sitting permanently over the map/sheet. Now it starts as a
  // small tap-to-expand chip; a fresh bestMatch.id resets it back to that
  // collapsed state via the key prop map.tsx already passes per-request
  // (see map.tsx's <BestMatchCard key={bestMatch.id} .../>).
  const [expanded, setExpanded] = useState(false);

  const isOutsideArea =
    bestMatch.urgency !== "emergency" &&
    (bestMatch.distance_miles ?? 0) > serviceRadiusMiles;

  const catEmoji =
    CATEGORY_EMOJI[bestMatch.category ?? "other"] ?? "💙";
  const urgencyLabel =
    URGENCY_LABEL[bestMatch.urgency ?? "low"] ?? "🟢 Low";

  // Z_CARD (30) — above BottomSheet's Z_SHEET (20). BestMatchCard and
  // BottomSheet used to be equal-z-index siblings with the card mounted
  // first in the JSX; at equal z-index later DOM siblings paint on top, so
  // the moment a helper drags the sheet open the sheet fully buried the
  // Best Match prompt — still in the DOM and clickable, just invisible
  // underneath, which is worse than not being there. Z_CARD keeps it above
  // the sheet in every state instead.
  //
  // right-16 (not right-3) leaves clearance for MapControlsPanel's
  // right-edge orientation/recenter stack, which sits at Z_CONTROLS (40,
  // above this card) — without the extra margin the card's text would run
  // underneath those buttons instead of stopping short of them.
  if (!expanded) {
    // Collapsed badge — a permanently-open card competed with the map/sheet
    // for attention on every load; this starts small and only grows into
    // the full card on an explicit tap, same footprint class as the map's
    // other floating chips (settings button, stats pill).
    return (
      <div className="absolute bottom-44 left-3 right-16 flex justify-start" style={{ zIndex: Z_CARD }}>
        <button
          onClick={() => setExpanded(true)}
          aria-label={`Best match for you: ${bestMatch.title} — tap to expand`}
          aria-expanded={false}
          style={{ touchAction: "manipulation" }}
          className={`flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-full border shadow-lg backdrop-blur-md active:scale-95 transition-all max-w-full ${
            bestMatch.urgency === "emergency"
              ? "bg-destructive/15 border-destructive/50"
              : "bg-card/95 border-primary/40"
          }`}
        >
          <Zap className={`w-3.5 h-3.5 shrink-0 ${bestMatch.urgency === "emergency" ? "text-destructive" : "text-primary"}`} />
          <span className={`text-[11px] font-black uppercase tracking-wider truncate ${bestMatch.urgency === "emergency" ? "text-destructive" : "text-primary"}`}>
            Best Match
          </span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[9rem]">{bestMatch.title}</span>
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-44 left-3 right-16" style={{ zIndex: Z_CARD }}>
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
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setExpanded(false)}
              className="p-1 rounded-full hover:bg-muted/50 transition-colors"
              aria-label="Collapse to badge"
            >
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
            </button>
            <button
              onClick={onDismiss}
              className="p-1 rounded-full hover:bg-muted/50 transition-colors"
              aria-label="Dismiss best match"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
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
