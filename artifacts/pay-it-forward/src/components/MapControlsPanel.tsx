import { useEffect } from "react";
import {
  LocateFixed, Layers, Car, MapPinPlus, Plus, Minus, Sparkles,
} from "lucide-react";
import { useAnimationPreference, useOsReducedMotion } from "@/hooks/useAnimationPreference";
import { useAppContext } from "@/lib/AppContext";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { OrientationToggle } from "@/components/OrientationToggle";
import type { OrientationMode } from "@/hooks/useMapOrientation";
import { Z_CONTROLS } from "@/lib/zLayers";

/**
 * MapControlsPanel — the map screen's floating chrome:
 *
 *   • A vertical stack of round icon buttons, bottom-RIGHT — orientation
 *     (heading-up/north-up, icon-only), recenter-on-me, and optional +/−
 *     zoom buttons for users who prefer tapping over pinch gestures.
 *
 *   • A settings Drawer (filters + layers + legend) opened externally via
 *     AppContext.mapSettingsOpen. The Sankofa bird menu in BottomNav is the
 *     sole trigger — there is no left-corner settings button. This keeps the
 *     entire left side of the map free for the bird button that owns it.
 *
 * Renders at Z_CONTROLS, above BestMatchCard (Z_CARD) and BottomSheet
 * (Z_SHEET). All filter/layer/orientation/zoom state still lives in map.tsx
 * — this remains a controlled presentational component.
 *
 * Deliberately NOT folded in here: the helper "I'm Available" toggle
 * (lives in TopBar) and Nia quick-access (NiaFab/NiaDrawer own their
 * dormant/active system — see niakofa-niafab-hooks memory).
 */

export type MapLayerToggles = {
  showTraffic: boolean;
  onToggleTraffic: () => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
};

export type MapFilterState = {
  categoryFilter: string | null;
  onCategoryFilterChange: (v: string | null) => void;
  urgencyFilter: string | null;
  onUrgencyFilterChange: (v: string | null) => void;
  helperLanguageFilter: string | null;
  onHelperLanguageFilterChange: (v: string | null) => void;
  availableCategories: string[];
};

const HELPER_LANGUAGES = [
  "English", "Spanish", "Vietnamese", "Arabic", "Somali", "Swahili", "French",
  "Mandarin", "Hindi", "Urdu", "Tagalog", "Portuguese", "Amharic", "Korean",
  "Japanese", "Russian",
];

// Shared bottom offset for both the map-settings button and the right-edge
// stack — tuned to visually match BottomNav's notification bell, which sits
// at `-top-4` relative to the nav element (perched just above the bar,
// slightly overlapping its top edge) rather than fully clear of it.
const PERCH_BOTTOM = "calc(3rem + env(safe-area-inset-bottom, 0px))";

interface MapControlsPanelProps {
  helperModeActive: boolean;
  /** "community" (default "helper") swaps the settings sheet's contents:
   *  no urgency section (civic needs/resources don't have one), the
   *  category list is whatever the caller passes in `filters.availableCategories`
   *  (need/resource categories instead of request categories), and the
   *  legend swaps to the three community pin families instead of urgency
   *  colors. Right-edge orientation/recenter stack and the settings-button
   *  position are unchanged either way. */
  mode?: "helper" | "community";
  orientMode: OrientationMode;
  onToggleOrientation: () => void;
  onRecenter: () => void;
  recenterEnabled: boolean;
  isOffCenter: boolean;
  layers: MapLayerToggles;
  filters: MapFilterState;
  showFiltersSheet: boolean;
  onFiltersSheetChange: (open: boolean) => void;
  showLayersSheet: boolean;
  onLayersSheetChange: (open: boolean) => void;
  /** Requester-only primary action — posts a request pinned to the current
   *  map center. Omit (or leave undefined) to hide the pill, e.g. while
   *  helper mode is active. */
  onRequestHere?: () => void;
  /** True while the helper-mode BottomSheet is expanded to its 55vh state.
   *  That state's card list runs directly underneath both floating groups
   *  below (their Z_CONTROLS sits above the sheet's Z_SHEET so they'd
   *  otherwise float on top of the request cards, covering claim buttons
   *  along the right edge and the settings button on the left). Receding
   *  them here — rather than lowering their z-index below the sheet, which
   *  would just bury them under its opaque background instead — keeps them
   *  reachable the instant the sheet collapses again. */
  controlsRecede?: boolean;
  /** Count of open emergency requests that exist in the unfiltered set but
   *  are excluded from the map by the active category/urgency filter. A
   *  filtered-out emergency pin is otherwise a silent gap — the stats pill
   *  still counts it, but nothing tells the helper an active filter is the
   *  reason they can't see it. Surfaced as a nudge in the settings sheet
   *  and a stronger (destructive, pulsing) badge on the trigger button. */
  hiddenEmergencyCount?: number;
  /** Zoom in one level — classic +/- buttons for users who can't pinch-zoom */
  onZoomIn?: () => void;
  /** Zoom out one level */
  onZoomOut?: () => void;
}

export function MapControlsPanel({
  helperModeActive,
  mode = "helper",
  orientMode,
  onToggleOrientation,
  onRecenter,
  recenterEnabled,
  isOffCenter,
  layers,
  filters,
  showFiltersSheet,
  onFiltersSheetChange,
  showLayersSheet,
  onLayersSheetChange,
  onRequestHere,
  controlsRecede = false,
  hiddenEmergencyCount = 0,
  onZoomIn,
  onZoomOut,
}: MapControlsPanelProps) {
  const { mapSettingsOpen, setMapSettingsOpen } = useAppContext();
  const { categoryFilter, onCategoryFilterChange, urgencyFilter, onUrgencyFilterChange,
    helperLanguageFilter, onHelperLanguageFilterChange, availableCategories } = filters;
  const { showTraffic, onToggleTraffic, showHeatmap, onToggleHeatmap } = layers;
  const isCommunity = mode === "community";
  const filtersActive = !!(categoryFilter || helperLanguageFilter || (!isCommunity && urgencyFilter));
  const hasHiddenEmergency = !isCommunity && hiddenEmergencyCount > 0;

  // Animation preference — surfaced here so iOS users with OS Reduce Motion on
  // can override without navigating Profile → Accessibility.
  const { animEnabled, toggleAnim } = useAnimationPreference();
  const osReducedMotion = useOsReducedMotion();

  // showSettingsSheet is fully driven by map.tsx's two local booleans so the
  // existing auto-collapse-on-pan (movestart handler in map.tsx) continues to
  // work without needing to know about AppContext.
  const showSettingsSheet = showFiltersSheet || showLayersSheet;
  const setShowSettingsSheet = (open: boolean) => {
    onFiltersSheetChange(open);
    onLayersSheetChange(open);
  };

  // mapSettingsOpen is a ONE-SHOT trigger from BottomNav's bird panel. Consume
  // it immediately — open the sheet then reset the flag — so it doesn't keep
  // the Drawer open after map.tsx clears its own booleans (e.g. on map pan).
  useEffect(() => {
    if (mapSettingsOpen) {
      onFiltersSheetChange(true);
      onLayersSheetChange(true);
      setMapSettingsOpen(false); // consume the signal; state is now in map.tsx
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSettingsOpen]);

  // Auto-close the sheet on unmount (route change / mode flip) so the
  // overlay never lingers with no way to dismiss it.
  useEffect(() => {
    return () => {
      onFiltersSheetChange(false);
      onLayersSheetChange(false);
      setMapSettingsOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Requester-only primary action — centered pill, floats above both
          corner groups since it no longer has a shared strip to sit next to. */}
      {!helperModeActive && onRequestHere && (
        <div
          className="absolute left-4 right-4 flex justify-center"
          style={{ bottom: "calc(6.5rem + env(safe-area-inset-bottom, 0px))", zIndex: Z_CONTROLS }}
        >
          <button
            onClick={onRequestHere}
            style={{ touchAction: "manipulation" }}
            className="flex items-center gap-1.5 bg-card/90 backdrop-blur-md border border-primary/40 text-primary px-4 py-2 rounded-full shadow-lg active:scale-95 transition-transform text-xs font-black"
          >
            <MapPinPlus className="w-3.5 h-3.5" />
            Request Help Here
          </button>
        </div>
      )}

      {/* Orientation / recenter / zoom — right-edge vertical stack.
          Orientation is icon-only (no text label) so it reads as one visual
          family with recenter and zoom buttons. Same recede treatment as the
          settings button. Groups:
            • orientation + recenter (navigation controls) — gap-2.5
            • zoom pill (separate concern) — separated by gap-3.5 from above
          Each button is w-12 h-12 to match the settings button on the left. */}
      <div
        className={`absolute right-3 flex flex-col gap-2.5 transition-all duration-200 ${
          controlsRecede ? "opacity-0 translate-x-16 pointer-events-none" : "opacity-100 translate-x-0"
        }`}
        style={{ bottom: PERCH_BOTTOM, zIndex: Z_CONTROLS }}
        aria-hidden={controlsRecede}
      >
        {/* Navigation group: orientation lock + recenter */}
        <div className="flex flex-col gap-2.5">
          <OrientationToggle mode={orientMode} onToggle={onToggleOrientation} iconOnly />

          <button
            onClick={onRecenter}
            disabled={!recenterEnabled}
            tabIndex={controlsRecede ? -1 : 0}
            style={{ touchAction: "manipulation" }}
            className={`w-12 h-12 flex items-center justify-center rounded-full shadow-lg transition-all shrink-0 ${
              !recenterEnabled
                ? "bg-card/60 text-muted-foreground/40 cursor-not-allowed border border-border/40"
                : isOffCenter
                ? "bg-primary text-background border border-primary/60 shadow-[0_0_12px_rgba(0,212,255,0.3)] active:scale-95"
                : "bg-card/95 text-muted-foreground border border-border backdrop-blur-md active:scale-95"
            }`}
            aria-label="Recenter on my location"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        </div>

        {/* Zoom group: +/- pill — classic tap zoom for users who prefer it
            over pinch gestures, and for accessibility. Separated from the
            navigation group above so the two concerns are visually distinct.
            Only rendered when handlers are wired. */}
        {(onZoomIn || onZoomOut) && (
          <div className="flex flex-col mt-1 rounded-2xl overflow-hidden shadow-lg border border-border/80 backdrop-blur-md">
            <button
              onClick={onZoomIn}
              tabIndex={controlsRecede ? -1 : 0}
              style={{ touchAction: "manipulation" }}
              className="w-12 h-12 flex items-center justify-center bg-card/95 text-foreground active:bg-muted/80 transition-colors border-b border-border/80"
              aria-label="Zoom in"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={onZoomOut}
              tabIndex={controlsRecede ? -1 : 0}
              style={{ touchAction: "manipulation" }}
              className="w-12 h-12 flex items-center justify-center bg-card/95 text-foreground active:bg-muted/80 transition-colors"
              aria-label="Zoom out"
            >
              <Minus className="w-[18px] h-[18px]" />
            </button>
          </div>
        )}
      </div>

      {/* Map settings sheet — merges the old separate Filters and Layers
          Drawers into one, since there's now a single trigger button. */}
      {/* shouldScaleBackground={false} — vaul's default (true) tries to scale
          the page background element when the drawer opens, which glitches on
          a full-screen map canvas (no wrapper element to scale). Disabling it
          prevents the visual jitter that caused "Map Settings not opening". */}
      <Drawer open={showSettingsSheet} onOpenChange={setShowSettingsSheet} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle>Map settings</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 p-4 pt-2 overflow-y-auto">
            {/* Emergency-hidden-by-filter nudge — a category/urgency filter
                can silently drop an emergency pin off the map; this is the
                one place a helper can both learn why and undo it in one
                tap, right above the filter controls that caused it.
                Helper-mode only — civic needs/resources have no urgency. */}
            {hasHiddenEmergency && (
              <div className="flex items-center justify-between gap-2 bg-destructive/10 border border-destructive/40 rounded-lg px-2.5 py-2">
                <span className="text-[11px] font-bold text-destructive leading-tight">
                  ⚠️ {hiddenEmergencyCount} emergency request{hiddenEmergencyCount !== 1 ? "s" : ""} hidden by your filters
                </span>
                <button
                  className="text-[10px] font-black uppercase text-destructive underline shrink-0"
                  onClick={() => { onCategoryFilterChange(null); onUrgencyFilterChange(null); }}
                >
                  Clear
                </button>
              </div>
            )}
            {!isCommunity && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Urgency</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${!urgencyFilter ? "bg-primary/20 text-primary font-black" : "bg-muted/50 hover:bg-muted text-foreground"}`}
                    onClick={() => onUrgencyFilterChange(null)}
                  >All</button>
                  {["emergency", "high", "medium", "low"].map(u => (
                    <button
                      key={u}
                      className={`text-xs px-2.5 py-1.5 rounded-lg capitalize transition-colors ${urgencyFilter === u ? "bg-primary/20 text-primary font-black" : "bg-muted/50 hover:bg-muted text-foreground"}`}
                      onClick={() => onUrgencyFilterChange(u)}
                    >{u}</button>
                  ))}
                </div>
              </div>
            )}
            {availableCategories.length > 0 && (
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Category</p>
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  <button
                    className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${!categoryFilter ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                    onClick={() => onCategoryFilterChange(null)}
                  >All categories</button>
                  {availableCategories.map(cat => (
                    <button
                      key={cat}
                      className={`text-left text-xs px-2 py-1.5 rounded-lg capitalize transition-colors ${categoryFilter === cat ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                      onClick={() => onCategoryFilterChange(cat)}
                    >{cat.replace(/_/g, " ")}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Diaspora/Brazil hubs lean heavily on language matching —
                kept prominent in the sheet rather than a separate fixed
                picker, per the doc's "prioritize language filter" note. */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Show me — Helper language</p>
              <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                <button
                  className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${!helperLanguageFilter ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                  onClick={() => onHelperLanguageFilterChange(null)}
                >All helpers</button>
                {HELPER_LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${helperLanguageFilter === lang ? "bg-primary/20 text-primary font-black" : "hover:bg-muted text-foreground"}`}
                    onClick={() => onHelperLanguageFilterChange(lang)}
                  >{lang}</button>
                ))}
              </div>
            </div>
            {filtersActive && (
              <button
                className="text-left text-[10px] px-2 py-1 rounded-lg text-destructive font-bold hover:bg-destructive/10"
                onClick={() => { onCategoryFilterChange(null); if (!isCommunity) onUrgencyFilterChange(null); onHelperLanguageFilterChange(null); }}
              >Clear filters</button>
            )}

            <div className="border-t border-border pt-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Layers</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={onToggleTraffic}
                  aria-pressed={showTraffic}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold"><Car className="w-3.5 h-3.5" />Traffic</span>
                  <span className={`w-8 h-4.5 rounded-full relative transition-colors ${showTraffic ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${showTraffic ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                </button>
                <button
                  onClick={onToggleHeatmap}
                  aria-pressed={showHeatmap}
                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold"><Layers className="w-3.5 h-3.5" />Demand heatmap</span>
                  <span className={`w-8 h-4.5 rounded-full relative transition-colors ${showHeatmap ? "bg-yellow-400" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${showHeatmap ? "translate-x-4" : "translate-x-0.5"}`} />
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-2 pb-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Legend</p>
              {isCommunity ? (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white shrink-0" /> Helper online</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded shrink-0 bg-primary/60 border border-primary" /> Civic need</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 shrink-0 bg-emerald-500/40 border border-emerald-500" /> Resource / help center</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" /> Emergency</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" /> High urgency</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" /> Medium urgency</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" /> Low urgency</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white shrink-0" /> Helper online</div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-muted-foreground/50 shrink-0" /> Outside your area</div>
                </div>
              )}
            </div>

            {/* Accessibility — bird animation override, mirrors Profile → Accessibility.
                Surfaced here so iOS users with OS Reduce Motion on can enable the
                bird's flight effects without leaving the map to dig through Profile. */}
            <div className="border-t border-border pt-3 pb-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Accessibility</p>
              <button
                onClick={toggleAnim}
                aria-pressed={animEnabled}
                aria-label={animEnabled ? "Disable bird flight animations" : "Enable bird flight animations (overrides OS Reduce Motion)"}
                className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-muted active:bg-muted transition-colors"
                style={{ touchAction: "manipulation" }}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  Bird animations
                  {osReducedMotion && !animEnabled && (
                    <span className="text-[9px] font-normal text-amber-500 shrink-0">OS reduced</span>
                  )}
                </span>
                {/* Custom toggle pill — matches the Traffic / Heatmap style above */}
                <span className={`w-8 shrink-0 rounded-full relative transition-colors ${animEnabled ? "bg-primary" : "bg-muted-foreground/30"}`} style={{ height: "1.125rem" }}>
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${animEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
              </button>
              <p className="text-[10px] text-muted-foreground px-2 pb-0.5 leading-snug">
                {animEnabled
                  ? "Full animations on — tap to follow OS setting"
                  : osReducedMotion
                    ? "OS Reduce Motion is on — tap to override and show flight effects"
                    : "Tap to enable; only takes effect when OS Reduce Motion is on"}
              </p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
