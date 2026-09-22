/**
 * SafetyPanel — Live safety verification and tracing for in-person help sessions.
 *
 * Mounts during active requests (helper en-route / arrived). Provides:
 *  • Auto ping to server every 3 minutes so admins can see the session is live
 *  • SOS button that dials 911 and broadcasts an alert to the requester + admin
 *  • "I'm safe" check-in so the server knows the helper is okay
 *  • Visual safety timer that turns amber after 20 min, red after 45 min
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, ShieldAlert, ShieldCheck, Phone, AlertTriangle } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const PING_INTERVAL_MS = 3 * 60 * 1000;   // 3 minutes
const AMBER_THRESHOLD_S = 20 * 60;         // 20 min — matches safety timer
const RED_THRESHOLD_S   = 45 * 60;         // 45 min

interface SafetyPanelProps {
  requestId: number;
  userId: number;
  elapsedSeconds: number;
  /** true once the helper has physically arrived */
  isArrived: boolean;
  /** true once the request is marked complete */
  isCompleted: boolean;
  /** helper or requester — controls SOS copy */
  role: "helper" | "requester";
}

export function SafetyPanel({
  requestId,
  userId,
  elapsedSeconds,
  isArrived,
  isCompleted,
  role,
}: SafetyPanelProps) {
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [pingStatus, setPingStatus] = useState<"idle" | "ok" | "error">("idle");
  const [sosLoading, setSosLoading] = useState(false);
  const [safetyCheckedIn, setSafetyCheckedIn] = useState(false);
  const lastPingRef = useRef<number>(0);

  // ── Safety zone colour ────────────────────────────────────────────────────
  const isAmber = !isCompleted && elapsedSeconds >= AMBER_THRESHOLD_S;
  const isRed   = !isCompleted && elapsedSeconds >= RED_THRESHOLD_S;

  // ── Automatic background ping ─────────────────────────────────────────────
  const sendPing = useCallback(async (manual = false) => {
    // Debounce: skip if we pinged within the last 30 seconds (prevents double-fire)
    if (!manual && Date.now() - lastPingRef.current < 30_000) return;
    lastPingRef.current = Date.now();
    try {
      const res = await fetch(`/api/requests/${requestId}/safety-ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setLastPing(new Date());
        setPingStatus("ok");
        if (manual) {
          setSafetyCheckedIn(true);
          toast({ title: "✅ Safety check-in sent", description: "The server knows you're okay." });
        }
      } else {
        setPingStatus("error");
      }
    } catch {
      setPingStatus("error");
    }
  }, [requestId, userId]);

  // Automatic ping loop — pauses when completed or arrived+long-since-finished
  useEffect(() => {
    if (isCompleted) return;
    const id = setInterval(() => sendPing(false), PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isCompleted, sendPing]);

  // ── SOS ──────────────────────────────────────────────────────────────────
  const handleSOS = async () => {
    if (!window.confirm(
      role === "helper"
        ? "SOS: This will call 911 and alert the platform. Continue?"
        : "SOS: This will call 911 and alert the platform that you need help. Continue?"
    )) return;
    setSosLoading(true);
    try {
      await fetch(`/api/requests/${requestId}/safety-sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ user_id: userId, role }),
      });
    } catch { /* non-blocking — call still triggers */ }
    // Open native phone dialler — works on iOS + Android WebViews
    window.location.href = "tel:911";
    setSosLoading(false);
  };

  if (isCompleted) return null;

  return (
    <div
      className={`rounded-2xl border p-3 space-y-2.5 transition-colors ${
        isRed
          ? "bg-red-500/15 border-red-500/40"
          : isAmber
          ? "bg-yellow-500/10 border-yellow-500/30"
          : "bg-card border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {isRed ? (
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
        ) : isAmber ? (
          <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
        ) : (
          <Shield className="w-4 h-4 text-primary shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-black uppercase tracking-wider ${
            isRed ? "text-red-400" : isAmber ? "text-yellow-400" : "text-primary"
          }`}>
            {isRed ? "⚠ Safety Check Required" : isAmber ? "Safety Monitoring Active" : "Live Safety Tracing"}
          </p>
          {lastPing && (
            <p className="text-[10px] text-muted-foreground">
              Last check-in {lastPing.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {pingStatus === "ok" && !isAmber && (
          <ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
        )}
      </div>

      {/* Live tracing status */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isCompleted ? "bg-muted" : "bg-green-400 animate-pulse"
        }`} />
        <span>
          {isArrived
            ? "Arrived — help in progress"
            : "En route — location shared with platform"}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* I'm safe check-in */}
        <button
          onClick={() => sendPing(true)}
          disabled={safetyCheckedIn}
          style={{ touchAction: "manipulation" }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
            safetyCheckedIn
              ? "bg-green-500/20 border border-green-500/30 text-green-400"
              : isAmber || isRed
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 border border-border text-foreground hover:bg-muted"
          }`}
        >
          <ShieldCheck className="w-3 h-3" />
          {safetyCheckedIn ? "Safe ✓" : "I'm safe"}
        </button>

        {/* SOS */}
        <button
          onClick={handleSOS}
          disabled={sosLoading}
          style={{ touchAction: "manipulation" }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black bg-red-500/90 text-white hover:bg-red-500 active:scale-95 transition-all shadow-[0_0_8px_rgba(239,68,68,0.3)]"
        >
          <Phone className="w-3 h-3" />
          SOS / 911
        </button>
      </div>

      {/* Amber / red advisory text */}
      {isRed && (
        <div className="flex items-start gap-1.5 text-[10px] text-red-300 bg-red-500/10 rounded-xl p-2.5">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            {role === "helper"
              ? "You've been at this location for a long time. Complete the request or tap SOS if you need help."
              : "Your helper has been at your location for a long time. Tap SOS if you feel unsafe."}
          </span>
        </div>
      )}
      {isAmber && !isRed && (
        <p className="text-[10px] text-yellow-300/70 text-center">
          Tap "I'm safe" to confirm the session is ongoing.
        </p>
      )}
    </div>
  );
}
