/**
 * BoundaryImportsReviewSection — Admin console for staged municipal GIS imports.
 *
 * Pipeline (server-enforced; UI cannot bypass):
 *   GIS → neighborhood_boundary_imports → structural valid → PostGIS report
 *   → admin review → geometry_verified → promote → city_neighborhoods → Host Signal
 *
 * Generated hints remain ineligible for geometry_verified / promote.
 *
 * City Authority Summary (above the table) is an aggregate only — it never
 * bypasses the per-neighborhood Promote → Host Signal gate.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Map as MapIcon, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export interface BoundaryImportRow {
  id: number;
  city_key: string;
  city_display: string;
  source_kind: string;
  authority_level: string;
  source_publisher: string;
  source_url: string;
  source_dataset: string;
  source_feature_id: string;
  source_version: string | null;
  source_retrieved_at: string;
  name: string;
  neighborhood_id: string;
  center_lat: number | null;
  center_lng: number | null;
  geometry_valid: boolean;
  geometry_verified: boolean;
  reviewed: boolean;
  review_note: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Minimal shape from GET /admin/city-neighborhoods for GPS-active counts. */
interface CityNeighborhoodRow {
  id: number;
  city_key: string;
  city_display: string;
  neighborhood_id: string;
  name: string;
  geometry_verified: boolean;
  source_kind: string;
  authority_level: string;
  verified: boolean;
}

type CityFilter = "all" | "fort_worth" | "kansas_city_missouri";
type StatusFilter = "all" | "needs_review" | "ready_to_promote" | "verified" | "invalid";

interface CityAuthoritySummary {
  city_key: string;
  city_display: string;
  total: number;
  reviewed: number;
  geometryVerified: number;
  gpsActive: number;
  awaitingReview: number;
}

type CityStats = {
  city_display: string;
  total: number;
  reviewed: number;
  geometryVerified: number;
  awaitingReview: number;
};

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getToken() ?? ""}`, "Content-Type": "application/json" };
}

function isGenerated(row: { source_kind: string; authority_level: string }): boolean {
  return row.source_kind === "generated_hint" || row.authority_level === "generated";
}

export function BoundaryImportsReviewSection() {
  const [rows, setRows] = useState<BoundaryImportRow[]>([]);
  const [productionNeighborhoods, setProductionNeighborhoods] = useState<CityNeighborhoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<CityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("needs_review");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = cityFilter === "all" ? "" : `?city_key=${encodeURIComponent(cityFilter)}`;
      const headers = { Authorization: `Bearer ${getToken() ?? ""}` };

      const [importsRes, neighborhoodsRes] = await Promise.all([
        fetch(`${BASE}/api/admin/neighborhood-boundary-imports${qs}`, { headers }),
        fetch(`${BASE}/api/admin/city-neighborhoods`, { headers }),
      ]);

      if (!importsRes.ok) {
        const body = (await importsRes.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error ?? `Error ${importsRes.status}`);
        return;
      }

      const data = (await importsRes.json()) as BoundaryImportRow[];
      setRows(Array.isArray(data) ? data : []);

      if (neighborhoodsRes.ok) {
        const nData = (await neighborhoodsRes.json()) as CityNeighborhoodRow[];
        setProductionNeighborhoods(Array.isArray(nData) ? nData : []);
      } else {
        // Non-fatal: summary GPS Active column will show 0 if this fails
        setProductionNeighborhoods([]);
      }
    } catch {
      setLoadError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }, [cityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const health = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.geometry_valid).length;
    const invalid = rows.filter((r) => !r.geometry_valid).length;
    const reviewed = rows.filter((r) => r.reviewed).length;
    const verified = rows.filter((r) => r.geometry_verified).length;
    const ready = rows.filter((r) => r.reviewed && r.geometry_valid && r.geometry_verified).length;
    const needsReview = rows.filter((r) => r.geometry_valid && !r.reviewed).length;
    return { total, valid, invalid, reviewed, verified, ready, needsReview };
  }, [rows]);

  /**
   * Per-city authority aggregate. GPS Active comes from production
   * city_neighborhoods that are geometry_verified and not generated.
   * Cities remain containers — this summary never activates GPS.
   */
  const cityAuthoritySummary = useMemo((): CityAuthoritySummary[] => {
    const byKey: Record<string, CityStats> = {};

    for (const r of rows) {
      if (isGenerated(r)) continue; // exclude pure generated hints from authority summary
      const cur = byKey[r.city_key] ?? {
        city_display: r.city_display,
        total: 0,
        reviewed: 0,
        geometryVerified: 0,
        awaitingReview: 0,
      };
      cur.total += 1;
      if (r.reviewed) cur.reviewed += 1;
      if (r.geometry_verified) cur.geometryVerified += 1;
      if (r.geometry_valid && !r.reviewed) cur.awaitingReview += 1;
      byKey[r.city_key] = cur;
    }

    const gpsByCity: Record<string, number> = {};
    for (const n of productionNeighborhoods) {
      if (isGenerated(n)) continue;
      if (!n.geometry_verified) continue;
      gpsByCity[n.city_key] = (gpsByCity[n.city_key] ?? 0) + 1;
    }

    // Ensure known operational cities appear even with zero staged rows
    const preferredOrder = ["fort_worth", "kansas_city_missouri"];
    for (const key of preferredOrder) {
      if (!byKey[key] && gpsByCity[key] !== undefined) {
        const sample = productionNeighborhoods.find((n) => n.city_key === key);
        byKey[key] = {
          city_display: sample?.city_display ?? key,
          total: 0,
          reviewed: 0,
          geometryVerified: 0,
          awaitingReview: 0,
        };
      }
    }

    const list: CityAuthoritySummary[] = Object.entries(byKey).map(([city_key, stats]) => ({
      city_key,
      city_display: stats.city_display,
      total: stats.total,
      reviewed: stats.reviewed,
      geometryVerified: stats.geometryVerified,
      gpsActive: gpsByCity[city_key] ?? 0,
      awaitingReview: stats.awaitingReview,
    }));

    list.sort((a, b) => {
      const ai = preferredOrder.indexOf(a.city_key);
      const bi = preferredOrder.indexOf(b.city_key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.city_display.localeCompare(b.city_display);
    });

    return list;
  }, [rows, productionNeighborhoods]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "needs_review") return r.geometry_valid && !r.reviewed;
      if (statusFilter === "ready_to_promote") return r.reviewed && r.geometry_valid && r.geometry_verified;
      if (statusFilter === "verified") return r.geometry_verified;
      if (statusFilter === "invalid") return !r.geometry_valid;
      return true;
    });
  }, [rows, statusFilter]);

  const review = async (row: BoundaryImportRow, opts: { reviewed: boolean; geometry_verified?: boolean }) => {
    setProcessingId(row.id);
    try {
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${row.id}/review`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          reviewed: opts.reviewed,
          geometry_verified: opts.geometry_verified ?? false,
          review_note: noteDraft[row.id]?.trim() || row.review_note || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as BoundaryImportRow & { error?: string };
      if (!res.ok) {
        toast({ title: "Review failed", description: data.error ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...data } : r)));
      toast({
        title: opts.geometry_verified
          ? "Geometry verified"
          : opts.reviewed
            ? "Marked reviewed"
            : "Review cleared",
      });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const promote = async (row: BoundaryImportRow) => {
    if (
      !window.confirm(
        `Promote “${row.name}” to GPS-eligible city_neighborhoods?\n\nThis enables Host Signal green checkpoint for this boundary.`,
      )
    ) {
      return;
    }
    setProcessingId(row.id);
    try {
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${row.id}/promote`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; promoted?: boolean };
      if (!res.ok) {
        toast({ title: "Promote blocked", description: data.error ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }
      toast({ title: "Promoted", description: `${row.name} is now GPS-eligible (Host Signal).` });
      await load();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Boundary Imports (GIS)</span>
          {health.needsReview > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
              {health.needsReview} need review
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Staged municipal GIS polygons stay GPS-ineligible until you review, verify geometry, and explicitly promote.
        Generated name hints cannot become Host Signal boundaries. Cities are containers only — never a blanket GPS switch.
      </p>

      {/* City Authority Summary — aggregate status only; Promote remains the sole activation control */}
      {cityAuthoritySummary.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            City Authority Summary
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[32rem]">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border/60">
                  <th className="py-1.5 pr-3 font-bold">City</th>
                  <th className="py-1.5 px-2 font-bold text-right tabular-nums">Total</th>
                  <th className="py-1.5 px-2 font-bold text-right tabular-nums">Reviewed</th>
                  <th className="py-1.5 px-2 font-bold text-right tabular-nums">Geometry Verified</th>
                  <th className="py-1.5 px-2 font-bold text-right tabular-nums text-green-500">GPS Active</th>
                  <th className="py-1.5 pl-2 font-bold text-right tabular-nums">Awaiting Review</th>
                </tr>
              </thead>
              <tbody>
                {cityAuthoritySummary.map((c) => (
                  <tr key={c.city_key} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-3 font-semibold">{c.city_display}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{c.total}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{c.reviewed}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{c.geometryVerified}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-black text-green-500">{c.gpsActive}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-yellow-500">{c.awaitingReview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            GPS Active counts production neighborhoods that are geometry-verified and authoritative.
            Only <span className="font-semibold text-foreground">Promote → Host Signal</span> activates a neighborhood.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Staged</div>
          <div className="font-black tabular-nums text-base">{health.total}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Structurally valid</div>
          <div className="font-black tabular-nums text-base text-green-500">{health.valid}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Invalid / skip</div>
          <div className="font-black tabular-nums text-base text-destructive">{health.invalid}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <div className="text-muted-foreground">Ready to promote</div>
          <div className="font-black tabular-nums text-base text-primary">{health.ready}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "fort_worth", "kansas_city_missouri"] as CityFilter[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCityFilter(c)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              cityFilter === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {c === "all" ? "All cities" : c === "fort_worth" ? "Fort Worth" : "Kansas City, MO"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["needs_review", "Needs review"],
            ["ready_to_promote", "Ready to promote"],
            ["verified", "Verified"],
            ["invalid", "Invalid"],
            ["all", "All rows"],
          ] as [StatusFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              statusFilter === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center">
          <AlertCircle className="w-4 h-4" />
          {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No boundary imports match this filter.</p>
      ) : (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {filtered.map((row) => {
            const busy = processingId === row.id;
            const canVerify = row.geometry_valid && row.reviewed && !row.geometry_verified;
            const canPromote = row.geometry_valid && row.reviewed && row.geometry_verified;
            return (
              <div key={row.id} className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate flex items-center gap-1.5">
                      <MapIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {row.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {row.city_display} · {row.source_publisher}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 truncate">
                      {row.source_dataset} · feature {row.source_feature_id}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                        row.geometry_valid
                          ? "bg-green-500/10 text-green-500 border-green-500/30"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                      }`}
                    >
                      {row.geometry_valid ? "struct valid" : "invalid"}
                    </span>
                    {row.geometry_verified && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30">
                        verified
                      </span>
                    )}
                    {row.reviewed && !row.geometry_verified && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">
                        reviewed
                      </span>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Review note (optional)"
                  value={noteDraft[row.id] ?? row.review_note ?? ""}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                  className="w-full text-xs rounded-lg border border-border bg-card px-2.5 py-1.5"
                />

                <div className="flex flex-wrap gap-1.5">
                  {!row.reviewed && row.geometry_valid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(row, { reviewed: true, geometry_verified: false })}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  )}
                  {canVerify && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(row, { reviewed: true, geometry_verified: true })}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      Verify geometry
                    </button>
                  )}
                  {canPromote && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void promote(row)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-green-500/40 bg-green-500/10 text-green-500 hover:bg-green-500/20 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      Promote → Host Signal
                    </button>
                  )}
                  {row.reviewed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(row, { reviewed: false, geometry_verified: false })}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Unreview
                    </button>
                  )}
                </div>
                {row.authority_level === "generated" || row.source_kind === "generated_hint" ? (
                  <div className="text-[10px] text-yellow-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Generated hint — cannot verify or promote to GPS boundary
                  </div>
                ) : null}
                {canPromote ? (
                  <div className="text-[10px] text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Reviewed + verified — safe to promote
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
