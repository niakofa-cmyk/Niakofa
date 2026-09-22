/**
 * CommunityTopPanel — slide-down panel accessed via the TopBar hamburger menu
 * in Community (requester) map mode.
 *
 * Previously this data lived in a bottom sheet (CommunityBottomSheet) that
 * competed with the map controls and was hard to reach one-handed. Now it
 * slides down from the top when the TopBar menu icon is tapped, keeping the
 * bottom of the map completely free for navigation controls.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { X, HeartHandshake, Building2, Landmark, Clock, List, Map as MapIcon } from "lucide-react";
import type { HelperLocation, CivicNeedNearby, CivicResourceNearby } from "@workspace/api-client-react";
import { Z_SHEET } from "@/lib/zLayers";

interface CommunityTopPanelProps {
  open: boolean;
  onClose: () => void;
  helpers: HelperLocation[];
  needs: CivicNeedNearby[];
  resources: CivicResourceNearby[];
  onSelectResource: (r: CivicResourceNearby) => void;
  /** List/map view toggle — lives here instead of a second TopBar icon so
   *  community map mode has exactly one hamburger-style button. Optional so
   *  callers that don't need the toggle (none today, but keeps the panel
   *  reusable) don't have to pass it. */
  viewMode?: "map" | "list";
  onToggleView?: () => void;
}

export function CommunityTopPanel({
  open, onClose, helpers, needs, resources, onSelectResource, viewMode, onToggleView,
}: CommunityTopPanelProps) {
  const [, setLocation] = useLocation();

  const totalCount = helpers.length + needs.length + resources.length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            style={{ zIndex: Z_SHEET - 1 }}
            onClick={onClose}
          />

          {/* Slide-down panel */}
          <motion.div
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ zIndex: Z_SHEET }}
            className="absolute top-0 left-0 right-0 bg-card border-b border-border rounded-b-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] max-h-[70vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-border/60 shrink-0">
              <div>
                <h2 className="font-black text-[15px]">Helpers &amp; Civic Needs</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{totalCount} nearby</p>
              </div>
              <div className="flex items-center gap-2">
                {onToggleView && (
                  <button
                    onClick={onToggleView}
                    aria-label={viewMode === "list" ? "Switch to map view" : "Switch to accessible list view"}
                    aria-pressed={viewMode === "list"}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform text-[11px] font-bold"
                  >
                    {viewMode === "list" ? <MapIcon className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                    {viewMode === "list" ? "Map" : "List"}
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close panel"
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Scrollable rows */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {totalCount === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">Nothing nearby right now.</p>
              ) : (
                <>
                  {helpers.map(h => {
                    const hx = h as HelperLocation & { distance_miles?: number; languages?: string[]; skills?: string[] };
                    return (
                      <button
                        key={`h-${hx.id}`}
                        onClick={() => { setLocation(`/helper/${hx.id}`); onClose(); }}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
                      >
                        <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                          <HeartHandshake className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{hx.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[hx.skills?.[0], hx.languages?.[0]].filter(Boolean).join(", ") || "Helper"}
                            {hx.distance_miles != null ? ` · ${hx.distance_miles.toFixed(1)} mi` : " · nearby"}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 shrink-0 bg-emerald-500/10 px-2 py-0.5 rounded-full">Online</span>
                      </button>
                    );
                  })}

                  {needs.map(n => (
                    <button
                      key={`n-${n.id}`}
                      onClick={() => { setLocation(`/civic-needs?need=${n.id}`); onClose(); }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate capitalize">
                          {n.category.replace(/_/g, " ")} · {n.distance_miles.toFixed(1)} mi
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">Civic</span>
                    </button>
                  ))}

                  {resources.map(r => (
                    <button
                      key={`r-${r.id}`}
                      onClick={() => { onSelectResource(r); onClose(); }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="w-9 h-9 rotate-45 bg-emerald-500/10 border-2 border-emerald-500/50 flex items-center justify-center shrink-0">
                        <Landmark className="w-3.5 h-3.5 text-emerald-400 -rotate-45" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{r.org_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          {r.open_status === "open" ? "Open now" : r.open_status === "closed" ? "Closed" : "Hours unknown"}
                          {r.distance_miles != null && ` · ${r.distance_miles.toFixed(1)} mi`}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
