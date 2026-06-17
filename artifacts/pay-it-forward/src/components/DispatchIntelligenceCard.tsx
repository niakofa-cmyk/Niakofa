import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Zap, MapPin, Clock, AlertTriangle, ChevronRight, X } from "lucide-react";
import type { HelpRequest } from "@workspace/api-client-react";
import { Button } from "./ui/button";

interface DispatchIntelligenceCardProps {
  bestMatch: HelpRequest | null;
  onAccept: (request: HelpRequest) => void;
  onDismiss: () => void;
  isClaiming: boolean;
}

export function DispatchIntelligenceCard({
  bestMatch,
  onAccept,
  onDismiss,
  isClaiming,
}: DispatchIntelligenceCardProps) {
  const [, setLocation] = useLocation();
  if (!bestMatch) return null;

  const isEmergency = bestMatch.urgency === "emergency";

  return (
    <AnimatePresence>
      <motion.div
        key={bestMatch.id}
        initial={{ x: 120, opacity: 0, scale: 0.9 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 120, opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", damping: 22, stiffness: 200 }}
        className={`absolute bottom-28 right-4 z-20 w-72 rounded-2xl border shadow-2xl overflow-hidden ${
          isEmergency
            ? "bg-destructive/10 border-destructive/50 shadow-[0_0_30px_rgba(255,50,50,0.2)]"
            : "bg-card/95 border-primary/40 shadow-[0_0_30px_rgba(0,212,255,0.15)]"
        } backdrop-blur-md`}
      >
        <div className={`px-4 py-2 flex items-center justify-between ${
          isEmergency ? "bg-destructive/20" : "bg-primary/15"
        }`}>
          <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
            isEmergency ? "text-destructive" : "text-primary"
          }`}>
            <Zap className="w-3 h-3" />
            {isEmergency ? "⚡ Emergency Match" : "🎯 Best Match Nearby"}
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isEmergency && (
            <div className="flex items-center gap-2 text-destructive text-xs font-bold animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              Immediate help needed
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
              {bestMatch.requester_avatar ? (
                <img src={bestMatch.requester_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-black text-muted-foreground">
                  {(bestMatch.requester_name ?? "U")[0]}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate">{bestMatch.title}</div>
              <div className="text-xs text-muted-foreground truncate">{bestMatch.requester_name}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {bestMatch.distance_miles != null && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-primary" />
                <span className="font-bold text-foreground">{bestMatch.distance_miles.toFixed(1)} mi</span>
              </span>
            )}
            {bestMatch.estimated_duration_min != null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-yellow-400" />
                <span className="font-bold text-foreground">{bestMatch.estimated_duration_min} min</span>
              </span>
            )}
            {bestMatch.payment_type === "immediate" && bestMatch.pay_it_forward_amount && (
              <span className="text-green-400 font-black">${bestMatch.pay_it_forward_amount}</span>
            )}
          </div>

          <Button
            className={`w-full h-10 font-black text-xs uppercase tracking-wider ${
              isEmergency ? "bg-destructive hover:bg-destructive/90 text-white" : ""
            }`}
            variant={isEmergency ? "destructive" : "default"}
            onClick={() => onAccept(bestMatch)}
            disabled={isClaiming}
            className="active:scale-[0.97]"
          >
            {isEmergency ? "🚨 Respond Now" : "Accept Request"}
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
