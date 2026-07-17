import { useEffect, useRef, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { useLocation } from "wouter";
import type { HelpRequest } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { MapPin, Clock, ShieldAlert, HeartPulse, ShoppingBag, Car, Hammer, MoreHorizontal, AlertTriangle, Heart, DollarSign, Gift, ShieldCheck, ChevronUp } from "lucide-react";
import { isSensitiveCategory } from "@workspace/trust-tiers";

// Collapsed state leaves just the handle + header row peeking above the map
// controls beneath it (the Filters/Layers row at bottom-32 and the
// Orientation/Recenter row at bottom-48) instead of covering them. Expanded
// is the previous always-on 55vh behavior. Height is fixed (not max-h) so
// the collapsed/expanded translateY math is predictable.
const COLLAPSED_PEEK_PX = 96;
const COLLAPSED_Y = `calc(100% - ${COLLAPSED_PEEK_PX}px)`;
const DRAG_THRESHOLD_PX = 40;
const DRAG_VELOCITY = 300;

interface BottomSheetProps {
  requests: HelpRequest[];
  onClaim: (request: HelpRequest) => void;
  isClaiming: boolean;
  /** ID of a request that was just dismissed as best-match — used to avoid re-highlighting it */
  dismissedId?: number | null;
  /** Helper's normal service radius in miles — requests beyond this show an outside-area badge */
  serviceRadiusMiles?: number;
  /** Whether the map is in helper mode — only show outside-area badge in helper mode */
  helperModeActive?: boolean;
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'groceries': return <ShoppingBag className="w-4 h-4" />;
    case 'medical': return <HeartPulse className="w-4 h-4" />;
    case 'transportation': return <Car className="w-4 h-4" />;
    case 'home_repair': return <Hammer className="w-4 h-4" />;
    case 'emergency': return <ShieldAlert className="w-4 h-4" />;
    default: return <MoreHorizontal className="w-4 h-4" />;
  }
}

function getUrgencyColor(urgency: string | undefined) {
  switch (urgency) {
    case 'emergency': return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    default: return 'text-primary bg-primary/10 border-primary/20';
  }
}

function PaymentBadge({ type }: { type: string }) {
  switch (type) {
    case 'immediate':
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
          <DollarSign className="w-3 h-3" /> Paid
        </span>
      );
    case 'goodwill':
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full">
          <Gift className="w-3 h-3" /> Goodwill
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
          <Heart className="w-3 h-3" /> Niakofa
        </span>
      );
  }
}

export function BottomSheet({ requests, onClaim, isClaiming, dismissedId: _dismissedId, serviceRadiusMiles = 10, helperModeActive = false }: BottomSheetProps) {
  const [, setLocation] = useLocation();
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

  const toggleExpanded = () => setExpanded(v => !v);

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
      className="absolute bottom-16 left-0 right-0 z-20 bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col h-[55vh]"
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
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold">{sorted.length} open</span>
          <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </div>

      <div
        aria-hidden={!expanded}
        style={{ pointerEvents: expanded ? "auto" : "none" }}
        className="overflow-y-auto pb-safe px-4 pb-4 flex flex-col gap-3 mt-2"
      >
        {sorted.map(request => (
          <div
            key={request.id}
            className={`p-4 rounded-2xl border bg-background/50 backdrop-blur-sm transition-colors ${
              request.urgency === 'emergency'
                ? 'border-destructive shadow-[0_0_20px_rgba(255,50,50,0.15)]'
                : 'border-border hover:border-primary/40'
            }`}
          >
            {request.urgency === 'emergency' && (
              <div className="flex items-center gap-2 text-destructive text-xs font-bold uppercase tracking-wider mb-3 bg-destructive/10 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                Emergency — Immediate Help Needed
              </div>
            )}

            {/* Outside-area badge — shown when this request is beyond the helper's service radius */}
            {helperModeActive && request.urgency !== "emergency" && (request.distance_miles ?? 0) > serviceRadiusMiles && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-muted/60 border border-dashed border-muted-foreground/30 px-2.5 py-1 rounded-lg mb-3">
                <span>📍</span>
                <span>Outside your usual area · {((request.distance_miles ?? 0) - serviceRadiusMiles).toFixed(1)} mi farther than normal</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {request.requester_avatar ? (
                    <img src={request.requester_avatar} alt={request.requester_name || "User"} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-muted-foreground">{(request.requester_name || "U")[0]}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold truncate">{request.requester_name}</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {request.distance_miles != null && (
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {request.distance_miles.toFixed(1)} mi</span>
                    )}
                    {request.estimated_duration_min != null && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {request.estimated_duration_min} min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 shrink-0 ${getUrgencyColor(request.urgency)}`}>
                {request.urgency === 'emergency' && <AlertTriangle className="w-3 h-3" />}
                {request.urgency || 'low'}
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-muted-foreground shrink-0">{getCategoryIcon(request.category)}</div>
                <h5 className="font-semibold text-sm">{request.title}</h5>
              </div>
              {isSensitiveCategory(request.category) && (
                <div className="flex items-center gap-1.5 mt-1.5 mb-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  Verified Helper + ID required to claim
                </div>
              )}
              {request.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 pl-6">{request.description}</p>
              )}
            </div>

            <div className="flex items-center justify-between mb-3">
              <PaymentBadge type={request.payment_type} />
              <div className="flex flex-col items-end gap-0.5">
                {request.payment_type === 'immediate' && request.pay_it_forward_amount != null && (
                  <span className="text-sm font-bold text-green-400">${request.pay_it_forward_amount.toFixed(2)}</span>
                )}
                {request.payment_type === 'pay_it_forward' && request.pledge_amount != null && (
                  <span className="text-xs text-muted-foreground">Pledges ${request.pledge_amount.toFixed(2)}</span>
                )}
                {/* Projected earnings line — visible to helpers so they know
                    what this job is worth before committing. For immediate jobs
                    this is the offered amount; for PIF jobs we show the community
                    pool's guaranteed minimum based on estimated hours (if any). */}
                {helperModeActive && (
                  <span className="text-[10px] text-primary/80 font-bold">
                    {(() => {
                      // estimated_hours lives in the DB schema (migration 0032) but isn't
                      // always surfaced by every API shape — cast defensively.
                      const estHours = (request as HelpRequest & { estimated_hours?: number | null }).estimated_hours;
                      if (request.payment_type === 'immediate' && request.pay_it_forward_amount != null) {
                        return `Est. earnings: ${request.pay_it_forward_amount.toFixed(2)}`;
                      }
                      if (estHours != null && estHours > 0) {
                        return `~${estHours}h · est. ${(estHours * 15).toFixed(2)}+ guaranteed`;
                      }
                      return "Goodwill + pool guarantee";
                    })()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-12 px-4 shrink-0"
                onClick={() => setLocation(`/request/${request.id}/view`)}
              >
                Details
              </Button>
              <Button
                className={`flex-1 font-bold uppercase tracking-wider h-12 ${request.urgency === 'emergency' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}`}
                variant={request.urgency === 'emergency' ? 'destructive' : 'default'}
                onClick={() => onClaim(request)}
                disabled={isClaiming}
              >
                {request.urgency === 'emergency' ? '🚨 Help Now' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
