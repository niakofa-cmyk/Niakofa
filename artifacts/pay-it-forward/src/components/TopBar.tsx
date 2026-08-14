import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/lib/AppContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { subscribeToPush } from "@/lib/push";
import { ShieldAlert, X, Phone, Heart, MapPin, MessageSquare, Search, List, Map as MapIcon, Building2, Menu } from "lucide-react";
import { NiaOrb } from "@/components/NiaDrawer";
import { Z_TOPBAR, Z_MODAL } from "@/lib/zLayers";

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
    href: (() => {
      try {
        const place = localStorage.getItem("niakofa_last_place");
        if (place) {
          const p = JSON.parse(place) as { city?: string; county?: string; state?: string };
          const loc = [p.city ?? p.county, p.state].filter(Boolean).join("+").replace(/\s+/g, "+");
          if (loc) return `https://maps.google.com/maps?q=emergency+shelter+${loc}`;
        }
      } catch {}
      return "https://maps.google.com/maps?q=emergency+shelter+near+me";
    })(),
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
  const { currentUser, myLocation, userPlace } = useAppContext();
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
          city: userPlace?.city ?? null,
          county: userPlace?.county ?? null,
          state: userPlace?.state ?? null,
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
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            style={{ zIndex: Z_MODAL }}
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 200 }}
            style={{ zIndex: Z_MODAL }}
            className="fixed inset-0 flex items-end sm:items-center justify-center p-4 sm:p-6"
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

interface TopBarProps {
  onNiaClick?: () => void;
  /** Map-only: expandable forward address search. Omit on pages without it. */
  onSearchToggle?: () => void;
  searchActive?: boolean;
  /** Map-only: toggle between the pin map and the accessible sortable list. */
  viewMode?: "map" | "list";
  onToggleView?: () => void;
  /** Community (non-helper) map mode swaps the left SOS button for a Civic
   *  Portal icon. The center shows the Nia orb (dormant) rather than a
   *  "Search this area" pill — that pill was confusing since search is
   *  already on the right side. Omit (default false) to keep the standard
   *  SOS + Nia-orb/helper-toggle row. */
  communityMapMode?: boolean;
  onCivicPortalClick?: () => void;
  /** Community panel — hamburger icon appears on right when provided. Tap
   *  opens the helpers + civic needs slide-down panel (moved from the bottom
   *  sheet to the top so it doesn't crowd map navigation controls). */
  onCommunityPanel?: () => void;
  communityPanelOpen?: boolean;
}

export function TopBar({
  onNiaClick, onSearchToggle, searchActive, viewMode, onToggleView,
  communityMapMode = false, onCivicPortalClick,
  onCommunityPanel, communityPanelOpen = false,
}: TopBarProps = {}) {
  const { helperModeActive, setHelperModeActive, currentUser, niaEnabled } = useAppContext();
  const [, setLocation] = useLocation();
  const [sosOpen, setSosOpen] = useState(false);
  // Dormant tooltip — shown for 3 seconds when user taps the orb while Nia is off.
  const [dormantTooltip, setDormantTooltip] = useState(false);
  const dormantTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressed = useIsAnimationSuppressed();

  useEffect(() => {
    if (helperModeActive && currentUser) {
      subscribeToPush(currentUser.id).catch(() => {});
    }
  }, [helperModeActive, currentUser]);

  // Clear tooltip timer on unmount
  useEffect(() => {
    return () => { if (dormantTimerRef.current) clearTimeout(dormantTimerRef.current); };
  }, []);

  function handleNiaOrbTap() {
    if (niaEnabled === true) {
      // Active — open the drawer via the global bridge NiaGlobal registered.
      window.openNia?.();
      onNiaClick?.();
    } else {
      // Dormant — show a self-dismissing tooltip, do nothing else.
      setDormantTooltip(true);
      if (dormantTimerRef.current) clearTimeout(dormantTimerRef.current);
      dormantTimerRef.current = setTimeout(() => setDormantTooltip(false), 3000);
    }
  }

  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-background/90 to-transparent pt-safe pointer-events-none"
        style={{ zIndex: Z_TOPBAR }}
      >
        <div className="flex items-center justify-between pointer-events-auto">
          {communityMapMode && !helperModeActive ? (
            <button
              onClick={onCivicPortalClick}
              aria-label="Civic portal — browse county needs"
              style={{ touchAction: "manipulation" }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 active:scale-95 transition-all shadow-lg"
            >
              <Building2 className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <button
              onClick={() => setSosOpen(true)}
              aria-label="SOS — emergency safety options"
              title="SOS"
              style={{ touchAction: "manipulation" }}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/15 border border-destructive/40 text-destructive active:bg-destructive/25 active:scale-95 transition-all shadow-lg"
            >
              <ShieldAlert className="w-[18px] h-[18px]" />
            </button>
          )}

          {/* Center slot: helper toggle (helper mode) or Nia orb everywhere
              else. Community map mode used to show a "Search this area" pill
              here — that was removed because the address search icon on the
              right already covers that action, and the pill confused users
              into thinking it was the only way to search. */}
          {helperModeActive ? (
            <div
              className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-full backdrop-blur-md border bg-green-500/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
              title="Helper Online"
            >
              <Label htmlFor="helper-mode" className="cursor-pointer select-none" aria-label="Helper Online — you're visible to nearby requesters">
                <span className={`w-2 h-2 rounded-full bg-green-400 block${suppressed ? "" : " animate-pulse"}`} aria-hidden="true" />
              </Label>
              <Switch
                id="helper-mode"
                checked={helperModeActive}
                onCheckedChange={setHelperModeActive}
                className="data-[state=checked]:bg-green-500"
                aria-label="Toggle helper online status"
              />
            </div>
          ) : (
            // Nia orb — branches on kill-switch state from AppContext.
            // niaEnabled=true  → active pulsing orb, tap opens drawer.
            // niaEnabled=false → dormant (desaturated, no pulse), tap shows tooltip.
            // niaEnabled=null  → still loading, render dormant as a safe default.
            <div className="relative">
              <button
                onClick={handleNiaOrbTap}
                aria-label={niaEnabled === true ? "Open Nia — your community AI assistant" : "Nia is resting"}
                style={{ background: "none", border: "none", cursor: niaEnabled === true ? "pointer" : "default", padding: 0 }}
              >
                <NiaOrb size={46} pulse={niaEnabled === true} dormant={niaEnabled !== true} />
              </button>
              {/* Self-dismissing dormant tooltip */}
              <AnimatePresence>
                {dormantTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-semibold bg-card border border-border shadow-lg text-muted-foreground pointer-events-none z-50"
                  >
                    🌙 Nia is resting — an admin will wake her soon
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Right-side group — profile avatar, plus map-only search/list
              toggles when the caller (map.tsx) opts in, plus the community
              hamburger menu when communityMapMode is active (opens the
              helpers + civic needs panel that was previously at the bottom). */}
          <div className="flex items-center gap-2">
            {communityMapMode && !helperModeActive && onCommunityPanel && (
              <button
                onClick={onCommunityPanel}
                aria-label="Helpers and civic needs"
                aria-expanded={communityPanelOpen}
                style={{ touchAction: "manipulation" }}
                className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-sm active:scale-95 transition-all shadow-lg ${
                  communityPanelOpen
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card/80 border-border text-foreground"
                }`}
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            {/* List/map view toggle — hidden here in community map mode
                because its icon (three horizontal lines) reads as a second
                hamburger sitting right next to the community panel button.
                There must be exactly one hamburger-style icon per map mode,
                so in community mode this action moves inside the panel
                itself (see CommunityTopPanel's header toggle). Helper mode
                has no community hamburger, so it keeps its own button here. */}
            {onToggleView && !(communityMapMode && !helperModeActive) && (
              <button
                onClick={onToggleView}
                aria-label={viewMode === "list" ? "Switch to map view" : "Switch to accessible list view"}
                aria-pressed={viewMode === "list"}
                style={{ touchAction: "manipulation" }}
                className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-sm active:scale-95 transition-all shadow-lg ${
                  viewMode === "list"
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card/80 border-border text-foreground"
                }`}
              >
                {viewMode === "list" ? <MapIcon className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            )}
            {onSearchToggle && (
              <button
                onClick={onSearchToggle}
                aria-label="Search for an address"
                aria-pressed={searchActive}
                aria-expanded={searchActive}
                style={{ touchAction: "manipulation" }}
                className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-sm active:scale-95 transition-all shadow-lg ${
                  searchActive
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card/80 border-border text-foreground"
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
            )}
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
      </div>

      <SOSModal open={sosOpen} onClose={() => setSosOpen(false)} />
    </>
  );
}
