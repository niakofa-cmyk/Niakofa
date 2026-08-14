import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, Info, Package, Sparkles, X } from "lucide-react";

export interface LegacySatchelItem {
  id: string;
  label: string;
  icon: ReactNode;
  source: string;
  outcome: string;
  description: string;
}

interface LegacySatchelProps {
  items: readonly LegacySatchelItem[];
  placedArtifacts: readonly string[];
  discoveredLandmarks: readonly string[];
  worldVersion: number;
  onClose: () => void;
}

const INVENTORY_ART =
  "/legacy-rpg-assets/inventory/Inventory_background.png";
const INVENTORY_BAR =
  "/legacy-rpg-assets/inventory/Inventory_Bar.png";
const INVENTORY_SLOT =
  "/legacy-rpg-assets/inventory/Inventory_Slot.png";
const INVENTORY_SELECT =
  "/legacy-rpg-assets/inventory/Inventory_Select.png";

/**
 * The Satchel is a projection of the canonical demo state, not a second
 * inventory system. An artifact becomes "secured" only when the existing
 * Family Vault placement mutation says it has been preserved.
 */
export function LegacySatchel({
  items,
  placedArtifacts,
  discoveredLandmarks,
  worldVersion,
  onClose,
}: LegacySatchelProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [showReferenceNote, setShowReferenceNote] = useState(false);
  const placed = new Set(placedArtifacts);
  const discovered = new Set(discoveredLandmarks);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const securedCount = items.filter((item) => placed.has(item.id)).length;

  return (
    <section
      aria-labelledby="legacy-satchel-title"
      className="fixed inset-x-3 bottom-[4.75rem] z-30 mx-auto max-w-lg overflow-hidden rounded-2xl border border-amber-300/35 bg-[#160b06]/[.98] shadow-[0_18px_55px_rgba(0,0,0,.65)]"
      style={{ backgroundImage: `url(${INVENTORY_ART})`, backgroundSize: "cover" }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-amber-300/20 bg-[#241106]/90 px-3 py-2"
        style={{ backgroundImage: `url(${INVENTORY_BAR})`, backgroundSize: "100% 100%" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Package className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="legacy-satchel-title" className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
              Legacy Satchel
            </h2>
            <p className="text-[9px] text-amber-100/60">
              Evidence secured · {securedCount}/{items.length} · World v{worldVersion}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-black/20 text-amber-200 hover:bg-amber-200/10"
          aria-label="Close Legacy Satchel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[1fr_1.35fr]">
        <div
          className="grid grid-cols-4 gap-1.5"
          role="list"
          aria-label="Family evidence inventory"
        >
          {items.map((item) => {
            const isPlaced = placed.has(item.id);
            const isSelected = selected?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                onClick={() => setSelectedId(item.id)}
                aria-label={`${item.label}${isPlaced ? ", preserved" : ", not yet preserved"}`}
                aria-pressed={isSelected}
                className={`relative flex aspect-square min-h-14 items-center justify-center rounded-lg border text-amber-100 transition-all ${
                  isSelected
                    ? "border-emerald-300/80 bg-emerald-950/40 ring-1 ring-emerald-300/60"
                    : isPlaced
                      ? "border-amber-300/40 bg-amber-950/40"
                      : "border-amber-700/25 bg-black/20 opacity-70"
                }`}
                style={{ backgroundImage: `url(${INVENTORY_SLOT})`, backgroundSize: "100% 100%" }}
              >
                {isSelected && (
                  <img
                    src={INVENTORY_SELECT}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
                    draggable={false}
                  />
                )}
                <span className="relative z-[1] text-lg" aria-hidden="true">{item.icon}</span>
                {isPlaced && (
                  <CheckCircle2
                    className="absolute bottom-1 right-1 z-[2] h-3 w-3 text-emerald-300"
                    aria-label="Preserved"
                  />
                )}
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="rounded-xl border border-amber-200/15 bg-black/25 p-3">
            <div className="flex items-start gap-2">
              <span className="text-xl" aria-hidden="true">{selected.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">
                  {placed.has(selected.id) ? "Preserved evidence" : "Unplaced evidence"}
                </p>
                <h3 className="mt-0.5 text-sm font-black text-amber-100">{selected.label}</h3>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-amber-100/70">{selected.description}</p>
            <div className="mt-3 grid gap-1.5 text-[9px]">
              <p className="flex items-start gap-1.5 text-amber-200/70">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                <span><strong className="text-amber-200">Source:</strong> {selected.source}</span>
              </p>
              <p className="flex items-start gap-1.5 text-emerald-200/75">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
                <span><strong className="text-emerald-200">World link:</strong> {selected.outcome}</span>
              </p>
              {discovered.has(selected.id) && (
                <p role="status" className="mt-1 rounded-md border border-emerald-300/20 bg-emerald-950/30 px-2 py-1.5 text-emerald-200">
                  Inspected on the playable map. This memory is part of your shared world.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="flex items-center justify-center rounded-xl border border-amber-200/10 p-4 text-center text-[10px] text-amber-100/55">
            Preserve an artifact to add evidence to the satchel.
          </p>
        )}
      </div>
      <div className="border-t border-amber-300/15 bg-black/20 px-3 py-2">
        <button
          type="button"
          onClick={() => setShowReferenceNote((open) => !open)}
          className="flex w-full items-center justify-between gap-2 text-left text-[9px] font-bold uppercase tracking-wide text-amber-200/60 hover:text-amber-100"
          aria-expanded={showReferenceNote}
        >
          <span className="flex items-center gap-1.5">
            <Info className="h-3 w-3 text-amber-300" aria-hidden="true" />
            About the visual archive
          </span>
          <span aria-hidden="true">{showReferenceNote ? "−" : "+"}</span>
        </button>
        {showReferenceNote && (
          <p
            role="note"
            className="mt-2 max-w-prose text-[9px] leading-relaxed text-amber-100/55"
          >
            Character layers and inventory textures are curated presentation
            references from the Legacy asset archive. Family Vault evidence supplies the facts; these stylized sprites never represent a verified likeness.
            Licensing review is required before commercial release.
          </p>
        )}
      </div>
    </section>
  );
}