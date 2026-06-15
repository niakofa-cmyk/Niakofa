import { motion } from "framer-motion";
import type { HelpRequest } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { MapPin, Clock, ShieldAlert, HeartPulse, ShoppingBag, Car, Hammer, MoreHorizontal, AlertTriangle, Heart, DollarSign, Gift } from "lucide-react";

interface BottomSheetProps {
  requests: HelpRequest[];
  onClaim: (request: HelpRequest) => void;
  isClaiming: boolean;
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

export function BottomSheet({ requests, onClaim, isClaiming }: BottomSheetProps) {
  const sorted = [...requests].sort((a, b) => {
    const urgencyOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    const urgencyDiff = (urgencyOrder[a.urgency ?? 'low'] ?? 3) - (urgencyOrder[b.urgency ?? 'low'] ?? 3);
    if (urgencyDiff !== 0) return urgencyDiff;
    return (a.distance_miles ?? 99) - (b.distance_miles ?? 99);
  });

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute bottom-0 left-0 right-0 z-20 bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col max-h-[65vh]"
    >
      <div className="flex justify-center p-3 cursor-grab active:cursor-grabbing shrink-0">
        <div className="w-12 h-1.5 rounded-full bg-border" />
      </div>

      <div className="px-4 pb-1 shrink-0 flex items-center justify-between">
        <h3 className="text-lg font-bold">Nearby Requests</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold">{sorted.length} open</span>
      </div>

      <div className="overflow-y-auto pb-safe px-4 pb-4 flex flex-col gap-3 mt-2">
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
              {request.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 pl-6">{request.description}</p>
              )}
            </div>

            <div className="flex items-center justify-between mb-3">
              <PaymentBadge type={request.payment_type} />
              {request.payment_type === 'immediate' && request.pay_it_forward_amount && (
                <span className="text-sm font-bold text-green-400">${request.pay_it_forward_amount}</span>
              )}
              {request.payment_type === 'pay_it_forward' && request.pledge_amount && (
                <span className="text-xs text-muted-foreground">Pledges ${request.pledge_amount}</span>
              )}
            </div>

            <Button
              className={`w-full font-bold uppercase tracking-wider h-12 ${request.urgency === 'emergency' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}`}
              variant={request.urgency === 'emergency' ? 'destructive' : 'default'}
              onClick={() => onClaim(request)}
              disabled={isClaiming}
            >
              {request.urgency === 'emergency' ? '🚨 Help Now' : 'Accept Request'}
            </Button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
