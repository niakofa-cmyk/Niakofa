import type { HelpRequest } from "@workspace/api-client-react";
import { AlertTriangle, Heart, DollarSign, Gift } from "lucide-react";
import { useState } from "react";

interface RequestMarkerProps {
  request: HelpRequest;
  /** Whether the helper's skills match this request category */
  skillMatch?: boolean;
  /** Whether the request is outside the helper's normal service radius */
  outsideServiceArea?: boolean;
}

export function RequestMarker({ request, skillMatch: _skillMatch, outsideServiceArea }: RequestMarkerProps) {
  const [tapped, setTapped] = useState(false);
  const getColors = () => {
    switch (request.urgency) {
      case 'emergency': return { fill: 'fill-destructive', pulse: 'bg-destructive', glow: 'shadow-[0_0_20px_rgba(255,50,50,0.8)]' };
      case 'high': return { fill: 'fill-orange-500', pulse: 'bg-orange-500', glow: 'shadow-[0_0_15px_rgba(255,165,0,0.6)]' };
      case 'medium': return { fill: 'fill-yellow-500', pulse: 'bg-yellow-500', glow: '' };
      default: return { fill: 'fill-primary', pulse: 'bg-primary', glow: '' };
    }
  };

  const getPaymentIcon = () => {
    switch (request.payment_type) {
      case 'immediate': return <DollarSign className="w-2.5 h-2.5 text-green-400" />;
      case 'goodwill': return <Gift className="w-2.5 h-2.5 text-purple-400" />;
      default: return <Heart className="w-2.5 h-2.5 text-primary" />;
    }
  };

  const { fill, pulse, glow } = getColors();
  const isEmergency = request.urgency === 'emergency';

  return (
    <div className="relative cursor-pointer" onClick={() => setTapped(p => !p)} onMouseEnter={() => setTapped(true)} onMouseLeave={() => setTapped(false)}>
      {/* Outside service area — dashed ring indicator per CLAUDE.md Local-First Dispatch */}
      {outsideServiceArea && !isEmergency && (
        <div className="absolute -inset-2 rounded-full border-2 border-dashed border-muted-foreground/40 pointer-events-none" />
      )}
      {isEmergency && (
        <>
          <div className={`absolute -inset-5 ${pulse} rounded-full opacity-20 animate-ping`} />
          <div className={`absolute -inset-3 ${pulse} rounded-full opacity-10 animate-ping`} style={{ animationDelay: '0.3s' }} />
        </>
      )}
      {!isEmergency && request.urgency === 'high' && (
        <div className={`absolute -inset-3 ${pulse} rounded-full opacity-15 animate-ping`} />
      )}

      <div className="relative">
        <svg
          width={isEmergency ? 40 : 32}
          height={isEmergency ? 40 : 32}
          viewBox="0 0 24 24"
          className={`drop-shadow-lg ${fill} ${glow} transition-transform group-hover:scale-110`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>

        {isEmergency ? (
          <div className="absolute top-[6px] left-1/2 -translate-x-1/2 text-background">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        ) : (
          <div className="absolute top-[5px] left-1/2 -translate-x-1/2">
            {getPaymentIcon()}
          </div>
        )}
      </div>

      {tapped && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none z-50 w-max max-w-[160px]">
        <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg px-2.5 py-1.5 shadow-xl">
          <div className="text-xs font-bold truncate">{request.title}</div>
          <div className="text-[10px] text-muted-foreground truncate">{request.requester_name}</div>
        </div>
      </div>}
    </div>
  );
}
