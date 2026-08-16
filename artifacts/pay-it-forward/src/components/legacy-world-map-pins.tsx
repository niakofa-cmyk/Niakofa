/**
 * LegacyWorldMapPins — macro overworld map with tappable location pins.
 *
 * Architecture from WORLD_MAP_ARCHITECTURE.md:
 *   "The Living World Map (macro) — one large painted overworld image with tappable
 *   location pins, per-pin unlock state, and travel routes. This is navigation, not
 *   a playable space."
 *
 * Route lines between pins are drawn procedurally as SVG paths — so new locations
 * (a family member adds a place) can insert a new pin and re-route without
 * regenerating the whole painting.
 *
 * Pin coordinates are expressed as percentages of the background image
 * (0–1 for both x and y), keeping them resolution-independent.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { X, MapPin, Lock, CheckCircle2, ChevronRight, Compass } from "lucide-react";

export interface LegacyWorldMapPin {
  id: string;
  xPct: number; // 0–1, % of canvas width
  yPct: number; // 0–1, % of canvas height
  label: string;
  country: string;
  year: string;
  era: string;
  unlockState: "locked" | "visited" | "current";
  /** Chapter to navigate to when this pin is selected */
  chapterId?: number;
  description?: string;
}

interface LegacyWorldMapPinsProps {
  pins: LegacyWorldMapPin[];
  /** Current family ID for chapter routing */
  familyId?: number;
  onClose?: () => void;
  /** Override navigation (for use as an in-world overlay) */
  onSelectPin?: (pin: LegacyWorldMapPin) => void;
}

/** Default House of Mensah demo pins — matches the five-scene arc from ASSET_PIPELINE_ANALYSIS.md */
export const MENSAH_DEFAULT_PINS: LegacyWorldMapPin[] = [
  {
    id: "cape-coast",
    xPct: 0.22,
    yPct: 0.55,
    label: "Cape Coast",
    country: "Gold Coast (Ghana)",
    year: "1890",
    era: "1890",
    unlockState: "visited",
    description: "The Mensah family compound. Where the story begins.",
  },
  {
    id: "kumasi",
    xPct: 0.28,
    yPct: 0.42,
    label: "Kumasi",
    country: "Gold Coast (Ghana)",
    year: "1912",
    era: "1910s",
    unlockState: "visited",
    description: "Expanded trading routes. New school, more homes.",
  },
  {
    id: "accra",
    xPct: 0.30,
    yPct: 0.58,
    label: "Accra",
    country: "Gold Coast (Ghana)",
    year: "1920",
    era: "1920s",
    unlockState: "current",
    description: "The city grows. Business struggles.",
  },
  {
    id: "liverpool",
    xPct: 0.47,
    yPct: 0.22,
    label: "Liverpool",
    country: "England",
    year: "1930",
    era: "migration",
    unlockState: "locked",
    description: "The crossing. Ocean, storm, fog.",
  },
  {
    id: "new-york",
    xPct: 0.62,
    yPct: 0.30,
    label: "New York",
    country: "United States",
    year: "1932",
    era: "diaspora",
    unlockState: "locked",
    description: "A new neighborhood. A new home.",
  },
  {
    id: "chicago",
    xPct: 0.68,
    yPct: 0.28,
    label: "Chicago",
    country: "United States",
    year: "1945",
    era: "diaspora",
    unlockState: "locked",
    description: "The family reunion. Grandmother's house.",
  },
];

function PinDot({
  pin,
  onSelect,
  isSelected,
}: {
  pin: LegacyWorldMapPin;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const baseClass =
    "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200 active:scale-90";

  if (pin.unlockState === "locked") {
    return (
      <button
        onClick={onSelect}
        className={`${baseClass} flex flex-col items-center gap-0.5 group`}
        style={{ left: `${pin.xPct * 100}%`, top: `${pin.yPct * 100}%` }}
        aria-label={`${pin.label} (locked)`}
      >
        <div className="w-7 h-7 rounded-full bg-stone-800/80 border-2 border-stone-600/50 flex items-center justify-center shadow-md">
          <Lock className="w-3 h-3 text-stone-500" />
        </div>
        <span className="text-[8px] font-bold text-stone-500 uppercase tracking-wide whitespace-nowrap">
          {pin.label}
        </span>
      </button>
    );
  }

  if (pin.unlockState === "visited") {
    return (
      <button
        onClick={onSelect}
        className={`${baseClass} flex flex-col items-center gap-0.5 group`}
        style={{ left: `${pin.xPct * 100}%`, top: `${pin.yPct * 100}%` }}
        aria-label={`${pin.label} — ${pin.year}, visited`}
      >
        <div
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-lg transition-transform ${
            isSelected
              ? "border-amber-400 bg-amber-900/60 scale-125"
              : "border-emerald-400/60 bg-emerald-950/60 group-hover:scale-110"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-[8px] font-bold text-emerald-400/80 uppercase tracking-wide whitespace-nowrap">
          {pin.label}
        </span>
        <span className="text-[7px] text-stone-500">{pin.year}</span>
      </button>
    );
  }

  // current
  return (
    <button
      onClick={onSelect}
      className={`${baseClass} flex flex-col items-center gap-0.5 group`}
      style={{ left: `${pin.xPct * 100}%`, top: `${pin.yPct * 100}%` }}
      aria-label={`${pin.label} — ${pin.year}, current location`}
    >
      {/* Pulse ring */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
        <div
          className={`relative w-9 h-9 rounded-full border-2 border-amber-400 flex items-center justify-center shadow-xl shadow-amber-500/30 transition-transform ${
            isSelected ? "scale-125" : "group-hover:scale-110"
          }`}
          style={{ background: "radial-gradient(ellipse, #3D1F00 0%, #1A0E00 100%)" }}
        >
          <MapPin className="w-4 h-4 text-amber-400" />
        </div>
      </div>
      <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide whitespace-nowrap">
        {pin.label}
      </span>
      <span className="text-[7px] text-amber-600">{pin.year}</span>
    </button>
  );
}

/** Draw procedural route lines between consecutive pins as SVG paths */
function RouteLines({
  pins,
  width,
  height,
}: {
  pins: LegacyWorldMapPin[];
  width: number;
  height: number;
}) {
  const accessible = pins.filter((p) => p.unlockState !== "locked");
  if (accessible.length < 2) return null;

  // Sort by year to determine path order
  const sorted = [...accessible].sort((a, b) => parseInt(a.year) - parseInt(b.year));

  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; done: boolean }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    segments.push({
      x1: a.xPct * width,
      y1: a.yPct * height,
      x2: b.xPct * width,
      y2: b.yPct * height,
      done: a.unlockState === "visited" && b.unlockState === "visited",
    });
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(180,130,60,0.5)" />
        </marker>
      </defs>
      {segments.map((seg, i) => {
        // Bezier control point — arc gently upward for ocean crossings (x2 >> x1)
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const cx = seg.x1 + dx * 0.5;
        const cy = seg.y1 + dy * 0.5 - Math.abs(dx) * 0.2;
        const d = `M ${seg.x1} ${seg.y1} Q ${cx} ${cy} ${seg.x2} ${seg.y2}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={seg.done ? "rgba(180,130,60,0.45)" : "rgba(100,80,40,0.25)"}
            strokeWidth="1.5"
            strokeDasharray={seg.done ? "4 3" : "2 4"}
            markerEnd={seg.done ? "url(#arrow)" : undefined}
          />
        );
      })}
    </svg>
  );
}

export function LegacyWorldMapPins({
  pins,
  familyId,
  onClose,
  onSelectPin,
}: LegacyWorldMapPinsProps) {
  const [, navigate] = useLocation();
  const [selectedPin, setSelectedPin] = useState<LegacyWorldMapPin | null>(null);
  // Fixed canvas size for layout — scales via CSS
  const W = 600;
  const H = 400;

  const handlePinClick = (pin: LegacyWorldMapPin) => {
    setSelectedPin((prev) => (prev?.id === pin.id ? null : pin));
  };

  const handleEnterChapter = () => {
    if (!selectedPin) return;
    if (onSelectPin) {
      onSelectPin(selectedPin);
      return;
    }
    if (selectedPin.chapterId) {
      navigate(`/legacy/chapter/${selectedPin.chapterId}`);
    } else {
      navigate("/legacy/play");
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080806]/95 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-black text-amber-200 uppercase tracking-wider">
            Living World Map
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-stone-800/50 text-stone-500"
            aria-label="Close map"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-amber-900/20 bg-stone-900/40">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping opacity-60" />
          <span className="text-[9px] text-amber-500 uppercase tracking-wide font-bold">Current</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
          <span className="text-[9px] text-emerald-500 uppercase tracking-wide font-bold">Visited</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lock className="w-2.5 h-2.5 text-stone-600" />
          <span className="text-[9px] text-stone-600 uppercase tracking-wide font-bold">Locked</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-4 h-px bg-amber-600/50" style={{ backgroundImage: "repeating-linear-gradient(to right, rgba(180,130,60,0.5) 0, rgba(180,130,60,0.5) 4px, transparent 4px, transparent 7px)" }} />
          <span className="text-[9px] text-stone-600 uppercase tracking-wide font-bold">Path</span>
        </div>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        <div
          className="relative w-full"
          style={{ maxWidth: `${W}px`, aspectRatio: `${W}/${H}` }}
        >
          {/* Background — deep parchment world map feel */}
          <div
            className="absolute inset-0 rounded-xl overflow-hidden"
            style={{
              background:
                "radial-gradient(ellipse at 20% 55%, #1a1608 0%, #0d0c07 50%, #060604 100%)",
              border: "1px solid rgba(180,130,60,0.2)",
            }}
          >
            {/* Ocean texture suggestion */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 18px,
                  rgba(40,80,120,0.3) 18px,
                  rgba(40,80,120,0.3) 19px
                )`,
              }}
            />
            {/* Continent shape suggestion — West Africa left, Atlantic center, Americas right */}
            <svg className="absolute inset-0 w-full h-full opacity-15" viewBox="0 0 600 400" preserveAspectRatio="none">
              {/* West Africa blob */}
              <ellipse cx="150" cy="230" rx="90" ry="110" fill="#3a2e14" />
              {/* British Isles */}
              <ellipse cx="285" cy="100" rx="28" ry="38" fill="#2a2520" />
              {/* Eastern North America */}
              <ellipse cx="420" cy="180" rx="80" ry="100" fill="#2a2520" />
            </svg>
          </div>

          {/* Route lines SVG */}
          <RouteLines pins={pins} width={W} height={H} />

          {/* Pins */}
          <div className="absolute inset-0">
            {pins.map((pin) => (
              <PinDot
                key={pin.id}
                pin={pin}
                onSelect={() => handlePinClick(pin)}
                isSelected={selectedPin?.id === pin.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected pin detail card */}
      {selectedPin && (
        <div className="px-4 pb-4 animate-[slideUp_0.2s_ease-out]">
          <div
            className="rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, #1a1208 0%, #0e0d07 100%)",
              border: "1px solid rgba(180,130,60,0.3)",
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[9px] text-amber-600 uppercase tracking-widest font-bold mb-0.5">
                  {selectedPin.era} · {selectedPin.country}
                </p>
                <h3 className="text-base font-black text-amber-100">{selectedPin.label}</h3>
                <p className="text-xs text-amber-600 font-bold">{selectedPin.year}</p>
              </div>
              <div className="shrink-0">
                {selectedPin.unlockState === "current" && (
                  <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                    Here Now
                  </span>
                )}
                {selectedPin.unlockState === "visited" && (
                  <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                    Visited
                  </span>
                )}
                {selectedPin.unlockState === "locked" && (
                  <span className="text-[9px] font-black text-stone-500 bg-stone-800/60 border border-stone-700/50 rounded-full px-2 py-0.5 uppercase tracking-wider">
                    Locked
                  </span>
                )}
              </div>
            </div>
            {selectedPin.description && (
              <p className="text-xs text-stone-400 leading-relaxed mb-3">
                {selectedPin.description}
              </p>
            )}
            {selectedPin.unlockState !== "locked" && (
              <button
                onClick={handleEnterChapter}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-900 font-black rounded-xl px-4 py-2.5 text-sm transition-all active:scale-95"
              >
                Enter This Chapter <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {selectedPin.unlockState === "locked" && (
              <p className="text-xs text-stone-600 text-center italic">
                Complete earlier chapters to unlock this location.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
