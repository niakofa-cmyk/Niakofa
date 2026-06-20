import type { HelpRequest } from "@workspace/api-client-react";
import { AlertTriangle, Heart, DollarSign, Gift, Zap } from "lucide-react";
import { useState } from "react";

interface RequestMarkerProps {
  request: HelpRequest;
  skillMatch?: boolean;
}

export function RequestMarker({ request, skillMatch = false }: RequestMarkerProps) {
  const [tapped, setTapped] = useState(false);

  const getColors = () => {
    if (skillMatch) {
      return {
        fill: "fill-emerald-400",
        pulse: "bg-emerald-400",
        glow: "shadow-[0_0_22px_rgba(52,211,153,0.85)]",
      };
    }
    switch (request.urgency) {
      case "emergency": return { fill: "fill-destructive", pulse: "bg-destructive", glow: "shadow-[0_0_20px_rgba(255,50,50,0.8)]" };
      case "high":      return { fill: "fill-orange-500",  pulse: "bg-orange-500",  glow: "shadow-[0_0_15px_rgba(255,165,0,0.6)]" };
      case "medium":    return { fill: "fill-yellow-500",  pulse: "bg-yellow-500",  glow: "" };
      default:          return { fill: "fill-primary",     pulse: "bg-primary",     glow: "" };
    }
  };

  const getPaymentIcon = () => {
    switch (request.payment_type) {
      case "immediate": return <DollarSign className="w-2.5 h-2.5 text-green-400" />;
      case "goodwill":  return <Gift className="w-2.5 h-2.5 text-purple-400" />;
      default:          return <Heart className="w-2.5 h-2.5 text-primary" />;
    }
  };

  const { fill, pulse, glow } = getColors();
  const isEmergency = request.urgency === "emergency";
  const markerSize = isEmergency ? 40 : skillMatch ? 36 : 32;

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => setTapped(p => !p)}
      onMouseEnter={() => setTapped(true)}
      onMouseLeave={() => setTapped(false)}
    >
      {/* Skill-match outer glow ring */}
      {skillMatch && !isEmergency && (
        <div className="absolute -inset-2 rounded-full border-2 border-emerald-400/60 animate-pulse" />
      )}

      {isEmergency && (
        <>
          <div className={`absolute -inset-5 ${pulse} rounded-full opacity-20 animate-ping`} />
          <div className={`absolute -inset-3 ${pulse} rounded-full opacity-10 animate-ping`} style={{ animationDelay: "0.3s" }} />
        </>
      )}
      {!isEmergency && request.urgency === "high" && (
        <div className={`absolute -inset-3 ${pulse} rounded-full opacity-15 animate-ping`} />
      )}
      {skillMatch && !isEmergency && (
        <div className="absolute -inset-4 bg-emerald-400 rounded-full opacity-10 animate-ping" style={{ animationDuration: "2.5s" }} />
      )}

      <div className="relative">
        <svg
          width={markerSize}
          height={markerSize}
          viewBox="0 0 24 24"
          className={`drop-shadow-lg ${fill} ${glow} transition-transform`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>

        {isEmergency ? (
          <div className="absolute top-[6px] left-1/2 -translate-x-1/2 text-background">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        ) : skillMatch ? (
          <div className="absolute top-[5px] left-1/2 -translate-x-1/2 text-background">
            <Zap className="w-3 h-3" />
          </div>
        ) : (
          <div className="absolute top-[5px] left-1/2 -translate-x-1/2">
            {getPaymentIcon()}
          </div>
        )}
      </div>

      {/* Skill match badge */}
      {skillMatch && (
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-400 rounded-full border-2 border-background flex items-center justify-center shadow-md z-10">
          <Zap className="w-2 h-2 text-background" />
        </div>
      )}

      {tapped && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-50 w-max max-w-[180px]">
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg px-2.5 py-1.5 shadow-xl">
            <div className="text-xs font-bold truncate">{request.title}</div>
            <div className="text-[10px] text-muted-foreground truncate">{request.requester_name}</div>
            {skillMatch && (
              <div className="flex items-center gap-1 mt-1 text-emerald-400">
                <Zap className="w-2.5 h-2.5" />
                <span className="text-[10px] font-black uppercase tracking-wide">Matches your skills</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
