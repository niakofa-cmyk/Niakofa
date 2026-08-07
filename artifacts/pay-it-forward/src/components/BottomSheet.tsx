import { useEffect, useRef, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import type { HelpRequest } from "@workspace/api-client-react";
import { ChevronUp } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { RequestCard } from "./RequestCard";
import { Z_SHEET } from "@/lib/zLayers";

// Collapsed state leaves just the handle + header row peeking above the map
// controls beneath it (the map-settings button and the right-edge
// orientation/recenter/zoom stack, both at Z_CONTROLS so they stay reachable
// no matter what this sheet or the Best Match card are doing). Expanded
// reaches the previous always-on 55vh behavior. Height is fixed (not
// max-h) so the collapsed/expanded translateY math is predictable.
const COLLAPSED_PEEK_PX = 96;
const COLLAPSED_Y = `calc(100% - ${COLLAPSED_PEEK_PX}px)`;
const DRAG_THRESHOLD_PX = 40;
const DRAG_VELOCITY = 300;

interface BottomSheetProps {
  requests: HelpRequest[];
  onClaim: (request: HelpRequest) => void;
  isClaiming: boolean;
  /** Helper's normal service radius in miles — requests beyond this show an outside-area badge */
  serviceRadiusMiles?: number;
  /** Whether the map is in helper mode — only show outside-area badge in helper mode */
  helperModeActive?: boolean;
  /**
   * A request whose map pin was just tapped — the sheet auto-expands and
   * scrolls that card into view with a highlight ring, so a pin tap at high
   * zoom is never a dead end even though this sheet defaults to collapsed.
   */
  highlightedRequestId?: number | null;
  /** Notified whenever the sheet's collapsed/expanded state changes (including
   *  on mount), so the parent map screen can recede the floating map-settings
   *  button and right-edge orientation/recenter/zoom stack while the sheet's
   *  55vh expanded state would otherwise sit underneath them — see map.tsx's
   *  controlsRecede handling for why this is needed now that those controls
   *  are a 4-button vertical stack instead of one shallow row. */
  onExpandedChange?: (expanded: boolean) => void;
}

export function BottomSheet({
  requests, onClaim, isClaiming, serviceRadiusMiles = 10,
  helperModeActive = false, highlightedRequestId = null, onExpandedChange,
}: BottomSheetProps) {
  const sorted = [...requests].sort((a, b) => {
    const urgencyOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    const urgencyDiff = (urgencyOrder[a.urgency ?? 'low'] ?? 3) - (urgencyOrder[b.urgency ?? 'low'] ?? 3);
    if (urgencyDiff !== 0) return urgencyDiff;
    return (a.distance_miles ?? 99) - (b.distance_miles ?? 99);
  });

  // Default COLLAPSED: a helper coming online should see the map (and its
  // Filters/Layers/Recenter controls) first, with the request count peeking
  // above them — not a full-height list covering the whole screen. Exception:
  // start expanded if an emergency is already in the list on mount, and
  // auto-expand if a new emergency arrives later while collapsed — emergency
  // requests bypass everything else consistently elsewhere in this app
  // (distance checks, notification preferences), so the sheet shouldn't be
  // the one place that pattern breaks.
  const [expanded, setExpanded] = useState(() => sorted.some(r => r.urgency === "emergency"));
  const dragControls = useDragControls();
  const emergencyIds = sorted.filter(r => r.urgency === "emergency").map(r => r.id).join(",");
  const seenEmergencyIdsRef = useRef(emergencyIds);
  useEffect(() => {
    if (emergencyIds && emergencyIds !== seenEmergencyIdsRef.current) setExpanded(true);
    seenEmergencyIdsRef.current = emergencyIds;
  }, [emergencyIds]);

  // Pin-to-card linking — tapping a request marker on the map auto-expands
  // this sheet (if collapsed) and scrolls that card into view.
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (highlightedRequestId == null) return;
    setExpanded(true);
    // Wait a frame for the expand animation/layout to settle before scrolling.
    const t = setTimeout(() => {
      cardRefs.current.get(highlightedRequestId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [highlightedRequestId]);

  const toggleExpanded = () => setExpanded(v => !v);

  useEffect(() => { onExpandedChange?.(expanded); }, [expanded, onExpandedChange]);

  const handleClaim = (request: HelpRequest) => {
    haptic("success");
    onClaim(request);
  };

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={(_, info) => {
        if (info.offset.y < -DRAG_THRESHOLD_PX || info.velocity.y < -DRAG_VELOCITY) setExpanded(true);
        else if (info.offset.y > DRAG_THRESHOLD_PX || info.velocity.y > DRAG_VELOCITY) setExpanded(false);
      }}
      initial={{ y: COLLAPSED_Y }}
      animate={{ y: expanded ? 0 : COLLAPSED_Y }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{ zIndex: Z_SHEET }}
      className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col h-[55vh]"
    >
      <div
        onPointerDown={(e) => dragControls.start(e)}
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse nearby requests" : "Expand nearby requests"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } }}
        style={{ touchAction: "none" }}
        className="flex justify-center p-3 cursor-grab active:cursor-grabbing shrink-0"
      >
        <div className="w-12 h-1.5 rounded-full bg-border" />
      </div>

      <div
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } }}
        className="px-4 pb-1 shrink-0 flex items-center justify-between cursor-pointer"
      >
        <h3 className="text-lg font-bold">Nearby Requests</h3>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold"
            aria-live="polite"
          >
            {sorted.length} open
          </span>
          <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </div>

      <div
        aria-hidden={!expanded}
        style={{ pointerEvents: expanded ? "auto" : "none" }}
        className="overflow-y-auto pb-safe px-4 pb-4 flex flex-col gap-3 mt-2"
      >
        {sorted.map(request => (
          <RequestCard
            key={request.id}
            cardRef={(el) => { if (el) cardRefs.current.set(request.id, el); else cardRefs.current.delete(request.id); }}
            request={request}
            onClaim={handleClaim}
            isClaiming={isClaiming}
            serviceRadiusMiles={serviceRadiusMiles}
            helperModeActive={helperModeActive}
            isHighlighted={highlightedRequestId === request.id}
          />
        ))}
      </div>
    </motion.div>
  );
}
