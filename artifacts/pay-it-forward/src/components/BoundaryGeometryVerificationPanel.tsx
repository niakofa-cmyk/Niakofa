import { useMemo } from "react";
import { ExternalLink, Map as MapIcon, ShieldCheck } from "lucide-react";
import type { BoundaryImportRow } from "./BoundaryImportsReviewWorkflow";

/** Extract GeoJSON Polygon/MultiPolygon rings without mutating the source geometry. */
function extractRings(value: unknown): number[][][] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: string; coordinates?: unknown; geometry?: unknown };
  if (geo.type === "Feature" && geo.geometry) return extractRings(geo.geometry);
  if (geo.type === "FeatureCollection" && Array.isArray((geo as { features?: unknown }).features)) {
    return (geo as { features: unknown[] }).features.flatMap(extractRings);
  }
  if (geo.type === "Polygon" && Array.isArray(geo.coordinates)) {
    return (geo.coordinates as unknown[]).filter(Array.isArray).filter((ring) => Array.isArray(ring) && ring.length >= 3) as number[][][];
  }
  if (geo.type === "MultiPolygon" && Array.isArray(geo.coordinates)) {
    return (geo.coordinates as unknown[]).flatMap((polygon) => {
      if (!Array.isArray(polygon)) return [];
      return (polygon as unknown[]).filter(Array.isArray).filter((ring) => Array.isArray(ring) && ring.length >= 3) as number[][][];
    });
  }
  return [];
}

function isVertex(point: unknown): point is [number, number] {
  return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function BoundaryGeometryVerificationPanel({
  row,
  onVerify,
  onClose,
  busy = false,
}: {
  row: BoundaryImportRow;
  onVerify: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const rings = useMemo(() => extractRings(row.polygon_geojson), [row.polygon_geojson]);
  const allPoints = rings.flatMap((ring) => ring.filter(isVertex));
  const bounds = useMemo(() => {
    if (allPoints.length === 0) return null;
    const lngs = allPoints.map(([lng]) => lng);
    const lats = allPoints.map(([, lat]) => lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const lngSpan = Math.max(maxLng - minLng, 0.001);
    const latSpan = Math.max(maxLat - minLat, 0.001);
    return { minLng, minLat, lngSpan, latSpan };
  }, [allPoints]);

  const paths = useMemo(() => {
    if (!bounds) return [];
    return rings.map((ring) => ring.filter(isVertex).map(([lng, lat], index) => {
      const x = ((lng - bounds.minLng) / bounds.lngSpan) * 100;
      const y = 100 - ((lat - bounds.minLat) / bounds.latSpan) * 100;
      return `${index === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    }).join(" ") + " Z");
  }, [rings, bounds]);

  const hasPolygon = paths.length > 0;
  const canVerify = row.geometry_valid && row.reviewed && !row.geometry_verified && row.source_kind !== "generated_hint" && row.authority_level !== "generated" && hasPolygon;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={`geometry-title-${row.id}`}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider" id={`geometry-title-${row.id}`}>
              <MapIcon className="w-4 h-4 text-primary" /> Verify authoritative geometry
            </div>
            <div className="text-lg font-black mt-1">{row.name}</div>
            <div className="text-xs text-muted-foreground">{row.city_display} · {row.source_publisher}</div>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted">Close</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background/50 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Provenance</div>
              <div className="text-xs font-semibold">{row.source_dataset}</div>
              <div className="text-[11px] text-muted-foreground">Feature: {row.source_feature_id}</div>
              <div className="text-[11px] text-muted-foreground">Version: {row.source_version ?? "not supplied"}</div>
              <a href={row.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                Open authoritative source <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Geometry facts</div>
              <div className="text-xs">GeoJSON: <span className="font-semibold">{row.polygon_geojson ? "present" : "missing"}</span></div>
              <div className="text-xs">Shape: <span className="font-semibold">{row.polygon_geojson && typeof row.polygon_geojson === "object" ? String((row.polygon_geojson as { type?: unknown }).type ?? "unknown") : "none"}</span></div>
              <div className="text-xs">Geometry validation: <span className="font-semibold">{row.geometry_valid ? "valid" : "invalid"}</span></div>
              <div className="text-[11px] text-muted-foreground">Retrieved: {new Date(row.source_retrieved_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-border overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-widest">Boundary preview</div>
              <span className="text-[10px] text-muted-foreground">Original imported coordinates · not regenerated</span>
            </div>
            {hasPolygon && bounds ? (
              <div className="p-4">
                <svg viewBox="0 0 100 100" className="w-full h-[min(55vh,28rem)] rounded-xl border border-border bg-muted/20" role="img" aria-label={`Imported boundary preview for ${row.name}`}>
                  {paths.map((path, index) => <path key={`${row.id}-${index}`} d={path} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />)}
                </svg>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-destructive">No renderable Polygon/MultiPolygon is present. Geometry verification is blocked.</div>
            )}
          </div>

          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-3 text-xs leading-relaxed">
            <div className="font-black uppercase tracking-wider text-yellow-500 mb-1">Verification means visual confirmation</div>
            Confirm that the imported boundary matches the authoritative source, covers the intended neighborhood, and has no obvious displacement, truncation, or malformed shape. This action does not edit the polygon.
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="text-xs font-bold px-3 py-2 rounded-lg border border-border hover:bg-muted">Cancel</button>
            <button type="button" disabled={!canVerify || busy} onClick={onVerify} className="text-xs font-black px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> {busy ? "Verifying…" : "Confirm Geometry Verified"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
