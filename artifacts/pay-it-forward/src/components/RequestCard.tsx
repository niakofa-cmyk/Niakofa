import { useState, useEffect } from "react";
import type { HelpRequest } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { MapPin, Clock, HeartPulse, ShoppingBag, Car, Hammer, ShieldAlert, MoreHorizontal, AlertTriangle, Heart, DollarSign, Gift, ShieldCheck } from "lucide-react";
import { isSensitiveCategory } from "@workspace/trust-tiers";
import { useLocation } from "wouter";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

// Extracted from BottomSheet.tsx so the exact same request card can be
// reused by any alternative view (e.g. RequestListView) instead of the two
// staying independent copies that drift apart over time.

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

export function PaymentBadge({ type }: { type: string }) {
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

interface RequestCardProps {
  request: HelpRequest;
  onClaim: (request: HelpRequest) => void;
  isClaiming: boolean;
  serviceRadiusMiles?: number;
  helperModeActive?: boolean;
  isHighlighted?: boolean;
  /** Ref callback — lets a parent list (e.g. BottomSheet) scroll a specific card into view. */
  cardRef?: (el: HTMLDivElement | null) => void;
}

export function RequestCard({
  request, onClaim, isClaiming, serviceRadiusMiles = 10,
  helperModeActive = false, isHighlighted = false, cardRef,
}: RequestCardProps) {
  const [, setLocation] = useLocation();
  const suppressed = useIsAnimationSuppressed();

  // ── Two-tap claim confirmation (non-emergency only) ──────────────────────
  // Emergency requests skip confirmation — speed matters more than accidental
  // taps. For normal urgency, the first tap switches the button to a "Confirm?"
  // state; a second tap within 4 s actually claims. Auto-resets if not confirmed.
  const isEmergency = request.urgency === "emergency";
  const [confirmPending, setConfirmPending] = useState(false);
  useEffect(() => {
    if (!confirmPending) return;
    const t = setTimeout(() => setConfirmPending(false), 4_000);
    return () => clearTimeout(t);
  }, [confirmPending]);

  const handleClaimClick = () => {
    if (isEmergency) {
      onClaim(request);
      return;
    }
    if (confirmPending) {
      setConfirmPending(false);
      onClaim(request);
    } else {
      setConfirmPending(true);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`p-4 rounded-2xl border bg-background/50 backdrop-blur-sm transition-colors ${
        request.urgency === 'emergency'
          ? 'border-destructive shadow-[0_0_20px_rgba(255,50,50,0.15)]'
          : isHighlighted
          ? 'border-primary shadow-[0_0_20px_rgba(0,212,255,0.25)]'
          : 'border-border hover:border-primary/40'
      }`}
    >
      {request.urgency === 'emergency' && (
        <div className="flex items-center gap-2 text-destructive text-xs font-bold uppercase tracking-wider mb-3 bg-destructive/10 rounded-lg px-3 py-1.5">
          <AlertTriangle className={`w-4 h-4${suppressed ? "" : " animate-pulse"}`} />
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
          className={`flex-1 font-bold uppercase tracking-wider h-12 transition-colors ${
            request.urgency === 'emergency'
              ? 'bg-destructive hover:bg-destructive/90 text-white'
              : confirmPending
              ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400'
              : ''
          }`}
          variant={request.urgency === 'emergency' ? 'destructive' : confirmPending ? 'outline' : 'default'}
          onClick={handleClaimClick}
          disabled={isClaiming || !helperModeActive}
          title={
            !helperModeActive
              ? "Switch to Helper Mode in the top bar to claim requests"
              : confirmPending
              ? "Tap again to confirm — auto-cancels in 4 s"
              : undefined
          }
        >
          {request.urgency === 'emergency'
            ? '🚨 Help Now'
            : confirmPending
            ? '✓ Confirm Accept?'
            : 'Accept'}
        </Button>
      </div>
    </div>
  );
}
