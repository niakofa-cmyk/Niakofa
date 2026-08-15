/**
 * LegacyWorldMap — Overview map showing all 12 accessible world regions.
 *
 * Shows a geographic overview of the Niakofa Legacy world with:
 * - All regions accessible in the current phase
 * - Era labels and atmospheric coloring
 * - Portal/connection indicators
 * - Click to navigate to a region
 */

import { X, MapPin, Clock, Lock } from "lucide-react";
import type { RegionId } from "@/lib/legacy-world-regions";
import {
  WORLD_REGION_REGISTRY,
  getAccessibleRegions,
} from "@/lib/legacy-world-regions";

// ── Era colors ────────────────────────────────────────────────────────────────

const ERA_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "present-day":  { bg: "#1a2a08", border: "#6aaa30", text: "#8ccc50" },
  "1890s":        { bg: "#2a1508", border: "#c8741a", text: "#e89040" },
  "1900s":        { bg: "#251208", border: "#b86010", text: "#d87a30" },
  "1910s":        { bg: "#201008", border: "#a85010", text: "#c86a28" },
  "1920s":        { bg: "#1c0e08", border: "#984010", text: "#b85820" },
  "1940s":        { bg: "#181020", border: "#7060a0", text: "#9080c0" },
  "diaspora":     { bg: "#14101c", border: "#6050a0", text: "#8070b8" },
  "regenerated":  { bg: "#082818", border: "#30c870", text: "#50e890" },
};

// ── Region position on the overview map ──────────────────────────────────────
// A 4×3 grid layout, row × column (0-indexed)

const REGION_GRID_POSITION: Record<RegionId, { gridRow: number; gridCol: number }> = {
  "village-common-baobab":     { gridRow: 0, gridCol: 0 },
  "mensah-compound-1890":      { gridRow: 0, gridCol: 1 },
  "mensah-warehouse":          { gridRow: 0, gridCol: 2 },
  "colonial-office":           { gridRow: 0, gridCol: 3 },
  "elder-nana-compound":       { gridRow: 1, gridCol: 0 },
  "mensah-compound-present":   { gridRow: 1, gridCol: 1 },
  "cape-coast-market":         { gridRow: 1, gridCol: 2 },
  "mission-school":            { gridRow: 1, gridCol: 3 },
  "river-fishing":             { gridRow: 2, gridCol: 0 },
  "cocoa-farm-east":           { gridRow: 2, gridCol: 1 },
  "diaspora-town":             { gridRow: 2, gridCol: 2 },
  "regenerated-world":         { gridRow: 2, gridCol: 3 },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface LegacyWorldMapProps {
  currentPhase: string;
  currentRegionId: RegionId;
  onNavigate: (regionId: RegionId) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LegacyWorldMap({
  currentPhase,
  currentRegionId,
  onNavigate,
  onClose,
}: LegacyWorldMapProps) {
  const accessibleRegions = getAccessibleRegions(currentPhase);
  const accessibleIds = new Set(accessibleRegions.map(r => r.id));
  const allRegions = Object.values(WORLD_REGION_REGISTRY);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="World Map"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative m-3 mt-12 flex flex-col rounded-3xl border border-amber-800/40 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #130a04 0%, #0a0604 100%)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.8)",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-900/30">
          <MapPin className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">World Map</p>
            <p className="text-[9px] text-amber-700">
              {accessibleRegions.length} of {allRegions.length} regions accessible
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full h-7 w-7 flex items-center justify-center border border-amber-800/40 bg-amber-950/50 text-amber-600 hover:text-amber-300 transition-colors"
            aria-label="Close map"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Map grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Phase context */}
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-900/30 bg-amber-950/30 px-3 py-2">
            <Clock className="h-3 w-3 text-amber-600" aria-hidden="true" />
            <p className="text-[9px] text-amber-600">
              <span className="font-black text-amber-500">Current region:</span>{" "}
              {WORLD_REGION_REGISTRY[currentRegionId]?.name ?? currentRegionId}
            </p>
          </div>

          {/* 3 rows × 4 columns grid */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(3, auto)" }}
          >
            {allRegions.map(region => {
              const pos = REGION_GRID_POSITION[region.id];
              const eraStyle = ERA_COLORS[region.era] ?? ERA_COLORS["present-day"];
              const isAccessible = accessibleIds.has(region.id);
              const isCurrent = region.id === currentRegionId;
              const isPortal = region.id.includes("1890") || region.id === "regenerated-world" || region.id === "diaspora-town";

              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => isAccessible && onNavigate(region.id)}
                  disabled={!isAccessible}
                  style={{
                    gridRow: pos.gridRow + 1,
                    gridColumn: pos.gridCol + 1,
                    borderColor: isCurrent ? eraStyle.border : isAccessible ? `${eraStyle.border}60` : "#2a1a0880",
                    background: isCurrent
                      ? `${eraStyle.bg}dd`
                      : isAccessible
                      ? `${eraStyle.bg}88`
                      : "#0a060444",
                  }}
                  className={[
                    "relative rounded-xl border p-2.5 text-left transition-all",
                    isAccessible
                      ? "hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      : "cursor-not-allowed opacity-40",
                    isCurrent ? "ring-1 ring-amber-400/40" : "",
                  ].join(" ")}
                  aria-label={`${region.name}${!isAccessible ? " (locked)" : ""}`}
                >
                  {/* Current indicator */}
                  {isCurrent && (
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-amber-950"
                      style={{ background: eraStyle.border }}
                      aria-label="Current location"
                    />
                  )}

                  {/* Lock icon */}
                  {!isAccessible && (
                    <Lock
                      className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-amber-900"
                      aria-hidden="true"
                    />
                  )}

                  {/* Portal indicator */}
                  {isPortal && isAccessible && (
                    <span className="absolute top-1 right-1 text-[8px]" aria-hidden="true">🌀</span>
                  )}

                  {/* Name */}
                  <p
                    className="text-[9px] font-black leading-tight mb-0.5"
                    style={{ color: isAccessible ? eraStyle.text : "#4a3020" }}
                  >
                    {region.name}
                  </p>

                  {/* Subtitle */}
                  <p className="text-[7px] leading-tight" style={{ color: isAccessible ? `${eraStyle.text}80` : "#2a1a10" }}>
                    {region.subtitle}
                  </p>

                  {/* Era badge */}
                  <div
                    className="mt-1.5 inline-flex items-center rounded-full px-1.5 py-0.5"
                    style={{
                      background: `${eraStyle.border}18`,
                      border: `1px solid ${eraStyle.border}30`,
                    }}
                  >
                    <span className="text-[6px] font-black uppercase tracking-wider" style={{ color: `${eraStyle.text}90` }}>
                      {region.era}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(ERA_COLORS).slice(0, 5).map(([era, colors]) => (
              <div key={era} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: colors.border }} aria-hidden="true" />
                <span className="text-[7px] text-amber-800">{era}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
