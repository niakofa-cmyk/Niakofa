import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/lib/AppContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { subscribeToPush } from "@/lib/push";
import { ShieldAlert, X, Phone, AlertTriangle, Heart, MapPin, MessageSquare } from "lucide-react";

const EMERGENCY_RESOURCES = [
  {
    id: "911",
    label: "Call 911",
    sub: "Police, Fire, Medical Emergency",
    href: "tel:911",
    color: "bg-destructive/20 border-destructive/40 hover:border-destructive text-destructive",
    Icon: Phone,
  },
  {
    id: "crisis",
    label: "Crisis Text Line",
    sub: "Text HOME to 741741 — free, 24/7",
    href: "sms:741741?body=HOME",
    color: "bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/60 text-yellow-400",
    Icon: MessageSquare,
  },
  {
    id: "shelter",
    label: "Find Nearest Shelter",
    sub: "Safe Haven FW · Presbyterian Night Shelter",
    href: "https://maps.google.com/maps?q=emergency+shelter+fort+worth+tx",
    target: "_blank",
    color: "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/60 text-orange-400",
    Icon: MapPin,
  },
  {
    id: "support", href: "mailto:safety@niakofa.community?subject=Safety%20Report", target: "_blank",
    label: "Community Support",
    sub: "Report unsafe behavior to moderators",
    color: "bg-primary/10 border-primary/30 hover:border-primary/60 text-primary",
    Icon: Heart,
  },
];

function SOSModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { currentUser, myLocation } = useAppContext();
  const cancelledRef = useRef(false);

  const handleEmergency = async () => {
    cancelledRef.current = false;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    await new Promise(resolve => setTimeout(resolve, 3200));
    clearInterval(interval);

    if (cancelledRef.current) return;

    setPressed(true);

    // Fire real SOS API
    try {
      await fetch("/api/verification/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser?.id,
          lat: myLocation?.lat,
          lng: myLocation?.lng,
          message: "SOS activated from Niakofa app",
        }),
      });
    } catch {}

    setTimeout(() => {
      setPressed(false);
      onClose();
    }, 3000);
  };

  const cancelSOS = () => {
    cancelledRef.current = true;
    setCountdown(0);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[70] backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 200 }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-card border border-destructive/50 rounded-3xl w-full max-w-sm shadow-[0_0_60px_rgba(255,50,50,0.3)] overflow-hidden">
              <div className="bg-destructive/20 px-5 py-4 flex items-center justify-between border-b border-destructive/30">
                <div className="flex items-center gap-2 text-destructive font-black">
                  <ShieldAlert className="w-5 h-5" />
                  Trust &amp; Safety
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                {pressed ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-6"
                  >
                    <div className="text-5xl mb-3">🆘</div>
                    <div className="font-black text-lg text-destructive">Alert Sent</div>
                    <div className="text-sm text-muted-foreground mt-1">Emergency services and nearby helpers notified</div>
                  </motion.div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      If you feel unsafe during a help exchange, use these options immediately.
                    </p>

                    {/* SOS primary button */}
                    <button
                      onClick={handleEmergency}
                      className="w-full bg-destructive text-white font-black h-14 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-[0_0_20px_rgba(255,50,50,0.4)] active:scale-95 relative overflow-hidden"
                    >
                      <ShieldAlert className="w-5 h-5" />
                      {countdown > 0 ? `Sending in ${countdown}… tap to cancel` : "SOS — Alert Emergency Services"}
                    </button>
                    {countdown > 0 && (
                      <button
                        onClick={cancelSOS}
                        className="w-full text-sm text-muted-foreground py-2 active:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    )}

                    {/* Resource buttons */}
                    <div className="space-y-2.5">
                      {EMERGENCY_RESOURCES.map(r => {
                        const Tag = r.href ? "a" : "button";
                        return (
                          <Tag
                            key={r.id}
                            {...(r.href ? { href: r.href, target: r.target ?? "_self", rel: "noopener noreferrer" } : {})}
                            className={`w-full border font-bold h-auto py-3 px-4 rounded-2xl flex items-center gap-3 transition-all text-left ${r.color}`}
                          >
                            <r.Icon className="w-4 h-4 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-black leading-tight">{r.label}</div>
                              <div className="text-[10px] opacity-70 mt-0.5 font-normal">{r.sub}</div>
                            </div>
                          </Tag>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      Your location is shared with safety moderators when SOS is activated.
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function TopBar() {
  const { helperModeActive, setHelperModeActive, currentUser } = useAppContext();
  const [, setLocation] = useLocation();
  const [sosOpen, setSosOpen] = useState(false);

  useEffect(() => {
    if (helperModeActive && currentUser) {
      subscribeToPush(currentUser.id).catch(() => {});
    }
  }, [helperModeActive, currentUser]);

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-background/90 to-transparent pt-safe pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <button
            onClick={() => setSosOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full bg-destructive/15 border border-destructive/40 text-destructive active:bg-destructive/25 active:scale-95 transition-all shadow-lg"
          >
            <ShieldAlert className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-wider">SOS</span>
          </button>

          {(() => {
            const helperStatus = (currentUser as any)?.helper_status as string | null | undefined;
            const isApproved = helperStatus === "approved";
            const isPending = helperStatus === "pending";
            if (isPending) {
              return (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/30 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-yellow-400">Under Review</span>
                </div>
              );
            }
            if (!isApproved) return null;
            return (
              <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all ${
                helperModeActive
                  ? "bg-green-500/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                  : "bg-card/90 border-border"
              }`}>
                <Label htmlFor="helper-mode" className="text-sm font-black tracking-widest uppercase cursor-pointer select-none">
                  {helperModeActive ? (
                    <span className="text-green-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Helper Online
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Go Online</span>
                  )}
                </Label>
                <Switch
                  id="helper-mode"
                  checked={helperModeActive}
                  onCheckedChange={setHelperModeActive}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>
            );
          })()}

          {/* Profile avatar */}
          <button
            onClick={() => setLocation("/profile")}
            className="w-9 h-9 rounded-full overflow-hidden border-2 border-border bg-card/80 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-all shadow-lg"
          >
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-black text-foreground">
                {currentUser?.name?.[0] ?? "?"}
              </span>
            )}
          </button>
        </div>
      </div>

      <SOSModal open={sosOpen} onClose={() => setSosOpen(false)} />
    </>
  );
}
