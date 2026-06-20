import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, MapPin, Clock, DollarSign, Heart, Gift, AlertTriangle, Share2, Users, CheckCircle2, Navigation2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useGetRequest, getGetRequestQueryKey } from "@workspace/api-client-react";
import { useAppContext } from "@/lib/AppContext";
import { toast } from "@/hooks/use-toast";

const URGENCY_CONFIG = {
  emergency: { label: "Emergency", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", icon: AlertTriangle },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: AlertTriangle },
  medium: { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: Clock },
  low: { label: "Low", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", icon: Clock },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open — Needs Help", color: "text-green-400" },
  claimed: { label: "Helper Matched", color: "text-primary" },
  en_route: { label: "Helper En Route", color: "text-yellow-400" },
  arrived: { label: "Helper Arrived", color: "text-green-400" },
  completed: { label: "Completed", color: "text-muted-foreground" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function RequestDetailScreen() {
  const [, params] = useRoute("/request/:id/view");
  const [, setLocation] = useLocation();
  const { currentUser, helperModeActive } = useAppContext();
  const requestId = parseInt(params?.id || "0", 10);

  const { data: request, isLoading } = useGetRequest(requestId, {
    query: { enabled: !!requestId, queryKey: getGetRequestQueryKey(requestId), refetchInterval: 15000 }
  });

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: request?.title ?? "Help Request", url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: "Link copied!" });
    }
  };

  const handleClaim = () => {
    if (!currentUser) { setLocation("/login"); return; }
    setLocation(`/request/${requestId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-3 px-6">
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <p className="font-bold">Request not found</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Back to map</Button>
      </div>
    );
  }

  const urgency = URGENCY_CONFIG[request.urgency as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.medium;
  const status = STATUS_CONFIG[request.status] ?? { label: request.status, color: "text-muted-foreground" };
  const UrgencyIcon = urgency.icon;
  const isOpen = request.status === "open";
  const isRequester = currentUser?.id === request.requester_id;
  const isHelper = currentUser?.id === request.helper_id;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full shrink-0" aria-label="Back to map">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="font-black text-base truncate flex-1">Request Detail</span>
        <button onClick={handleShare} className="p-2 rounded-full active:bg-muted transition-colors">
          <Share2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 pt-5 pb-safe pb-8 space-y-4 max-w-lg mx-auto">
        {/* Title + urgency */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full w-fit border ${urgency.bg} ${urgency.border} mb-3`}>
            <UrgencyIcon className={`w-3.5 h-3.5 ${urgency.color}`} />
            <span className={`text-xs font-black uppercase tracking-wider ${urgency.color}`}>{urgency.label} Priority</span>
          </div>
          <h1 className="text-2xl font-black leading-tight">{request.title}</h1>
          {request.description && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{request.description}</p>
          )}
        </motion.div>

        {/* Status card */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isOpen ? "bg-green-500/10" : "bg-primary/10"
          }`}>
            {isOpen ? <Users className="w-5 h-5 text-green-400" /> : <CheckCircle2 className="w-5 h-5 text-primary" />}
          </div>
          <div>
            <div className={`font-black text-sm ${status.color}`}>{status.label}</div>
            <div className="text-xs text-muted-foreground">Posted {fmtDate(request.created_at)}</div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Category</div>
            <div className="font-black text-sm capitalize">{request.category.replace("_", " ")}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Payment</div>
            <div className="flex items-center gap-1.5">
              {request.payment_type === "immediate" && <DollarSign className="w-3.5 h-3.5 text-green-400" />}
              {request.payment_type === "pay_it_forward" && <Heart className="w-3.5 h-3.5 text-primary" />}
              {request.payment_type === "goodwill" && <Gift className="w-3.5 h-3.5 text-purple-400" />}
              <span className="font-black text-sm capitalize">
                {request.payment_type === "pay_it_forward" ? "Pay It Forward" :
                 request.payment_type === "immediate"
                   ? `$${request.pay_it_forward_amount?.toFixed(2) ?? "??"}`
                   : "Goodwill"}
              </span>
            </div>
          </div>
          {request.neighborhood && (
            <div className="bg-card border border-border rounded-2xl p-3 col-span-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Location</div>
              <div className="flex items-center gap-1.5 font-black text-sm">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                {request.neighborhood}
              </div>
            </div>
          )}
          {request.helper_name && (
            <div className="bg-card border border-border rounded-2xl p-3 col-span-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Helper</div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center text-xs font-black text-green-400">
                  {request.helper_name[0]}
                </div>
                <span className="font-black text-sm">{request.helper_name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Requester info */}
        {request.requester_name && (
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted border border-border shrink-0">
              {request.requester_avatar
                ? <img src={request.requester_avatar} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-bold text-sm">{request.requester_name[0]}</div>
              }
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Posted by</div>
              <div className="font-black text-sm">{request.requester_name}</div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2 pt-2">
          {isOpen && helperModeActive && !isRequester && (
            <Button className="w-full h-12 font-black gap-2" onClick={handleClaim}>
              <Navigation2 className="w-4 h-4" />
              Accept This Request
            </Button>
          )}
          {isRequester && isOpen && (
            <Button variant="outline" className="w-full h-12 font-black" onClick={() => setLocation(`/request/${requestId}/track`)}>
              Track Your Request
            </Button>
          )}
          {isHelper && (request.status === "en_route" || request.status === "claimed") && (
            <Button className="w-full h-12 font-black" onClick={() => setLocation(`/request/${requestId}`)}>
              Continue Navigation
            </Button>
          )}
          {!currentUser && isOpen && (
            <Button className="w-full h-12 font-black" onClick={() => setLocation("/login")}>
              Sign In to Help
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
