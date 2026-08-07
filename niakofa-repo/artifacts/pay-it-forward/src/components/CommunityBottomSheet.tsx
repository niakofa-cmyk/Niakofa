import { useState, useMemo } from "react";
import { motion, useDragControls } from "framer-motion";
import { useLocation } from "wouter";
import { ChevronUp, HeartHandshake, Building2, Landmark, Clock } from "lucide-react";
import type { HelperLocation, CivicNeedNearby, CivicResourceNearby } from "@workspace/api-client-react";
import { Z_SHEET } from "@/lib/zLayers";

const COLLAPSED_PEEK_PX = 96;
const COLLAPSED_Y = `calc(100% - ${COLLAPSED_PEEK_PX}px)`;
const DRAG_THRESHOLD_PX = 40;
const DRAG_VELOCITY = 300;

type Row =
  | { kind: "helper"; distance: number; helper: HelperLocation }
  | { kind: "need"; distance: number; need: CivicNeedNearby }
  | { kind: "resource"; distance: number; resource: CivicResourceNearby };

interface CommunityBottomSheetProps {
  helpers: HelperLocation[];
  needs: CivicNeedNearby[];
  resources: CivicResourceNearby[];
  onSelectResource: (resource: CivicResourceNearby) => void;
}

export function CommunityBottomSheet({ helpers, needs, resources, onSelectResource }: CommunityBottomSheetProps) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const dragControls = useDragControls();

  const rows: Row[] = useMemo(() => {
    const helperRows: Row[] = helpers.map(h => ({ kind: "helper", distance: (h as HelperLocation & { distance_miles?: number }).distance_miles ?? 99, helper: h }));
    const needRows: Row[] = needs.map(n => ({ kind: "need", distance: n.distance_miles ?? 99, need: n }));
    const resourceRows: Row[] = resources.map(r => ({ kind: "resource", distance: r.distance_miles ?? 99, resource: r }));
    return [...helperRows, ...needRows, ...resourceRows].sort((a, b) => a.distance - b.distance);
  }, [helpers, needs, resources]);

  const toggleExpanded = () => setExpanded(v => !v);

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={(_, info) => {
        if (info.offset.y < -DRAG_THRESHOLD_PX || info.velocity.y < -DRAG_VELOCITY) setExpanded(true);
        else if (info.offset.y > DRAG_THRESHOLD_PX || info.velocity.y > DRAG_VELOCITY) setExpanded(false);
      }}
      initial={{ y: COLLAPSED_Y }}
      animate={{ y: expanded ? 0 : COLLAPSED_Y }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      style={{ zIndex: Z_SHEET }}
      className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col h-[55vh]"
    >
      <div
        onPointerDown={(e) => dragControls.start(e)}
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse helpers and civic needs" : "Expand helpers and civic needs"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } }}
        style={{ touchAction: "none" }}
        className="flex justify-center p-3 cursor-grab active:cursor-grabbing shrink-0"
      >
        <div className="w-12 h-1.5 rounded-full bg-border" />
      </div>

      <div
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } }}
        className="px-4 pb-1 shrink-0 flex items-center justify-between cursor-pointer"
      >
        <h3 className="text-lg font-bold">Helpers and civic needs</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold" aria-live="polite">
            {rows.length}
          </span>
          <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </div>

      <div
        aria-hidden={!expanded}
        style={{ pointerEvents: expanded ? "auto" : "none" }}
        className="overflow-y-auto pb-safe px-4 pb-4 flex flex-col gap-2.5 mt-2"
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nothing nearby right now.</p>
        ) : (
          rows.map((row) => {
            if (row.kind === "helper") {
              const h = row.helper as HelperLocation & { distance_miles?: number; languages?: string[]; skills?: string[] };
              return (
                <button
                  key={`helper-${h.id}`}
                  onClick={() => setLocation(`/helper/${h.id}`)}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <HeartHandshake className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{h.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[h.skills?.[0], h.languages?.[0]].filter(Boolean).join(", ") || "Helper"} · {h.distance_miles != null ? `${h.distance_miles.toFixed(1)} mi` : "nearby"}
                    </p>
                  </div>
                </button>
              );
            }
            if (row.kind === "need") {
              const n = row.need;
              return (
                <button
                  key={`need-${n.id}`}
                  onClick={() => setLocation(`/civic-needs?need=${n.id}`)}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
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
                </button>
              );
            }
            const r = row.resource;
            return (
              <button
                key={`resource-${r.id}`}
                onClick={() => onSelectResource(r)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/60 text-left active:scale-[0.98] transition-transform"
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
            );
          })
        )}
      </div>
    </motion.div>
  );
}
