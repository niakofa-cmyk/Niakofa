import { useEffect } from "react";
import {
  LocateFixed, Layers, Car, SlidersHorizontal, MapPinPlus, Plus, Minus,
} from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { OrientationToggle } from "@/components/OrientationToggle";
import type { OrientationMode } from "@/hooks/useMapOrientation";
import { Z_CONTROLS } from "@/lib/zLayers";

/**
 * MapControlsPanel — the map screen's floating chrome, split into two
 * fixed groups instead of one shared icon strip:
 *
 *   1. A single "Map settings" round button, bottom-LEFT — deliberately
 *      styled and positioned to mirror BottomNav's notification bell (round,
 *      card-colored, perched just above the bottom nav bar), but on the
 *      opposite side of the screen from it. Tapping it opens one Drawer
 *      sheet holding everything that used to be two separate Filters/Layers
 *      buttons: urgency/category/helper-language filters, traffic/heatmap
 *      toggles, and the map legend. A small dot badges the button when any
 *      filter or non-default layer is active, since the sheet's contents
 *      aren't visible at a glance anymore.
 *
 *   2. A vertical stack of round icon buttons, bottom-RIGHT — orientation
 *      (heading-up/north-up, icon-only, no text label), recenter-on-me, and
 *      explicit zoom in/out. This is the classic "map app" right-edge
 *      control cluster (compass + locate + zoom), restored after an earlier
 *      pass folded everything into one shared row.
 *
 * Both groups render at Z_CONTROLS so they stay reachable above the
 * BestMatchCard (Z_CARD) and BottomSheet (Z_SHEET) regardless of what either
 * is doing, and both are bottom-offset to clear BottomNav (fixed, Z_NAV,
 * opaque) the same way the original single strip was tuned to.
 *
 * All actual state (filters, layers, orientation, recenter, zoom) still
 * lives in map.tsx — this remains a controlled, presentational component.
 *
 * Deliberately NOT folded in here: the helper "I'm Available" toggle
 * (already lives in TopBar — see niakofa-helpermode-persist memory) and Nia
 * quick-access (NiaFab/NiaDrawer own their own dormant/active system — see
 * niakofa-niafab-hooks memory).
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
  orientMode: OrientationMode;
  onToggleOrientation: () => void;
  onRecenter: () => void;
  recenterEnabled: boolean;
  isOffCenter: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
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
}

export function MapControlsPanel({
  helperModeActive,
  orientMode,
  onToggleOrientation,
  onRecenter,
  recenterEnabled,
  isOffCenter,
  onZoomIn,
  onZoomOut,
  layers,
  filters,
  showFiltersSheet,
  onFiltersSheetChange,
  showLayersSheet,
  onLayersSheetChange,
  onRequestHere,
  controlsRecede = false,
}: MapControlsPanelProps) {
  const { categoryFilter, onCategoryFilterChange, urgencyFilter, onUrgencyFilterChange,
    helperLanguageFilter, onHelperLanguageFilterChange, availableCategories } = filters;
  const { showTraffic, onToggleTraffic, showHeatmap, onToggleHeatmap } = layers;
  const filtersActive = !!(categoryFilter || urgencyFilter || helperLanguageFilter);
  const layersActive = showHeatmap || !showTraffic;
  const settingsActive = filtersActive || layersActive;

  // A single Drawer now backs both the "Map settings" button below — the
  // two sheets used to open independently; they're merged into one so the
  // one consolidated button has one sheet to open. Either setter opens the
  // same visual sheet; map.tsx's own two booleans stay independent state
  // but are driven together here since there's only one trigger now.
  const showSettingsSheet = showFiltersSheet || showLayersSheet;
  const setShowSettingsSheet = (open: boolean) => {
    onFiltersSheetChange(open);
    onLayersSheetChange(open);
  };

  // Auto-close the sheet when the user leaves the panel entirely (e.g.
  // helper mode flips, or the map screen itself unmounts) — avoids leaving
  // a Drawer's overlay lingering with no way for the new render tree to
  // know it should be closed.
  useEffect(() => {
    return () => {
      onFiltersSheetChange(false);
      onLayersSheetChange(false);
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

      {/* Map settings — single round button, bottom-left, mirroring
          BottomNav's notification bell (round, card-colored, perched above
          the nav bar) but on the opposite side of the screen. Recedes
          (fades + slides off-screen, inert) while the BottomSheet is
          expanded so it doesn't float over the request list beneath it. */}
      <div
        className={`absolute left-3 transition-all duration-200 ${
          controlsRecede ? "opacity-0 -translate-x-16 pointer-events-none" : "opacity-100 translate-x-0"
        }`}
        style={{ bottom: PERCH_BOTTOM, zIndex: Z_CONTROLS }}
        aria-hidden={controlsRecede}
      >
        <button
          onClick={() => setShowSettingsSheet(!showSettingsSheet)}
          style={{ touchAction: "manipulation" }}
          aria-label="Map settings — filters and layers"
          aria-expanded={showSettingsSheet}
          tabIndex={controlsRecede ? -1 : 0}
          className={`relative w-12 h-12 flex items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-95 ${
            settingsActive
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card border-border text-foreground"
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          {settingsActive && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border border-background" />
          )}
        </button>
      </div>

      {/* Orientation / recenter / zoom — right-edge vertical stack, the
          classic map-app control cluster. Orientation is icon-only (no text
          label) so it reads as one visual family with recenter and zoom
          instead of standing out as a pill. Same recede treatment as the
          settings button, and for the same reason: this stack grew from
          one shallow row to four stacked buttons, so an expanded BottomSheet
          (55vh) now runs underneath most of its height, not just its tip. */}
      <div
        className={`absolute right-3 flex flex-col gap-2 transition-all duration-200 ${
          controlsRecede ? "opacity-0 translate-x-16 pointer-events-none" : "opacity-100 translate-x-0"
        }`}
        style={{ bottom: PERCH_BOTTOM, zIndex: Z_CONTROLS }}
        aria-hidden={controlsRecede}
      >
        <OrientationToggle mode={orientMode} onToggle={onToggleOrientation} iconOnly />

        <button
          onClick={onRecenter}
          disabled={!recenterEnabled}
          tabIndex={controlsRecede ? -1 : 0}
          style={{ touchAction: "manipulation" }}
          className={`w-11 h-11 flex items-center justify-center rounded-full shadow-lg transition-transform shrink-0 ${
            !recenterEnabled
              ? "bg-card/60 text-muted-foreground/50 cursor-not-allowed"
              : isOffCenter
              ? "bg-primary text-background active:scale-95"
              : "bg-card/90 text-muted-foreground border border-border active:scale-95"
          }`}
          aria-label="Recenter on my location"
        >
          <LocateFixed className="w-5 h-5" />
        </button>

        <button
          onClick={onZoomIn}
          tabIndex={controlsRecede ? -1 : 0}
          style={{ touchAction: "manipulation" }}
          aria-label="Zoom in"
          className="w-11 h-11 flex items-center justify-center rounded-full shadow-lg border border-border bg-card/90 text-foreground active:scale-95 transition-transform shrink-0"
        >
          <Plus className="w-5 h-5" />
        </button>

        <button
          onClick={onZoomOut}
          tabIndex={controlsRecede ? -1 : 0}
          style={{ touchAction: "manipulation" }}
          aria-label="Zoom out"
          className="w-11 h-11 flex items-center justify-center rounded-full shadow-lg border border-border bg-card/90 text-foreground active:scale-95 transition-transform shrink-0"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>


      {/* Map settings sheet — merges the old separate Filters and Layers
          Drawers into one, since there's now a single trigger button. */}
      <Drawer open={showSettingsSheet} onOpenChange={setShowSettingsSheet}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="pb-0">
            <DrawerTitle>Map settings</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 p-4 pt-2 overflow-y-auto">
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
                onClick={() => { onCategoryFilterChange(null); onUrgencyFilterChange(null); onHelperLanguageFilterChange(null); }}
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
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0" /> Emergency</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" /> High urgency</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" /> Medium urgency</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" /> Low urgency</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white shrink-0" /> Helper online</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-muted-foreground/50 shrink-0" /> Outside your area</div>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
