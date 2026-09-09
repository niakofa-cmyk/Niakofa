import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Map as MapIcon, RefreshCw, ShieldCheck, ShieldOff, Upload } from "lucide-react";
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
  geometry_effective_at?: string | null;
}

type CityFilter = "all" | "fort_worth" | "kansas_city_missouri";
type StatusFilter = "needs_review" | "reviewed" | "ready_to_promote" | "active" | "invalid" | "all";

type CityAuthoritySummary = {
  city_key: string;
  city_display: string;
  total: number;
  reviewed: number;
  geometryVerified: number;
  gpsActive: number;
  awaitingReview: number;
  readyToPromote: number;
};

type CityStats = Omit<CityAuthoritySummary, "city_key" | "city_display" | "gpsActive">;

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getToken() ?? ""}`, "Content-Type": "application/json" };
}

function isGenerated(row: { source_kind: string; authority_level: string }): boolean {
  return row.source_kind === "generated_hint" || row.authority_level === "generated";
}

function isGpsActive(row: CityNeighborhoodRow): boolean {
  if (isGenerated(row) || row.verified !== true || row.geometry_verified !== true) return false;
  if (row.geometry_effective_at && new Date(row.geometry_effective_at).getTime() > Date.now()) return false;
  return true;
}

export function getBoundaryStage(row: Pick<BoundaryImportRow, "geometry_valid" | "reviewed" | "geometry_verified" | "source_kind" | "authority_level">): "invalid" | "needs_review" | "reviewed" | "ready_to_promote" {
  if (!row.geometry_valid) return "invalid";
  if (!row.reviewed) return "needs_review";
  if (!row.geometry_verified) return "reviewed";
  if (isGenerated(row)) return "reviewed";
  return "ready_to_promote";
}

export function isBoundaryReadyToPromote(row: BoundaryImportRow): boolean {
  return getBoundaryStage(row) === "ready_to_promote";
}

export function isBoundaryActive(row: BoundaryImportRow, productionNeighborhoods: CityNeighborhoodRow[]): boolean {
  return productionNeighborhoods.some((n) => n.city_key === row.city_key && n.neighborhood_id === row.neighborhood_id && isGpsActive(n));
}

export function BoundaryImportsReviewWorkflow() {
  const [rows, setRows] = useState<BoundaryImportRow[]>([]);
  const [productionNeighborhoods, setProductionNeighborhoods] = useState<CityNeighborhoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<CityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("needs_review");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({});
  const [lastAction, setLastAction] = useState<string | null>(null);

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
        throw new Error(body.error ?? `Error ${importsRes.status}`);
      }
      const data = (await importsRes.json()) as BoundaryImportRow[];
      setRows(Array.isArray(data) ? data : []);
      if (neighborhoodsRes.ok) {
        const nData = (await neighborhoodsRes.json()) as CityNeighborhoodRow[];
        setProductionNeighborhoods(Array.isArray(nData) ? nData : []);
      } else {
        setProductionNeighborhoods([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not reach server");
    } finally {
      setLoading(false);
    }
  }, [cityFilter]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const counts = { needs_review: 0, reviewed: 0, ready_to_promote: 0, active: 0, invalid: 0 };
    for (const row of rows) {
      const stage = getBoundaryStage(row);
      if (stage === "needs_review") counts.needs_review += 1;
      if (stage === "reviewed") counts.reviewed += 1;
      if (stage === "ready_to_promote") counts.ready_to_promote += 1;
      if (stage === "invalid") counts.invalid += 1;
      if (isBoundaryActive(row, productionNeighborhoods)) counts.active += 1;
    }
    return counts;
  }, [rows, productionNeighborhoods]);

  const cityAuthoritySummary = useMemo((): CityAuthoritySummary[] => {
    const byKey: Record<string, CityStats & { city_display: string }> = {};
    for (const r of rows) {
      if (isGenerated(r)) continue;
      const cur = byKey[r.city_key] ?? { city_display: r.city_display, total: 0, reviewed: 0, geometryVerified: 0, awaitingReview: 0, readyToPromote: 0 };
      cur.total += 1;
      if (r.reviewed) cur.reviewed += 1;
      if (r.geometry_verified) cur.geometryVerified += 1;
      if (r.geometry_valid && !r.reviewed) cur.awaitingReview += 1;
      if (isBoundaryReadyToPromote(r)) cur.readyToPromote += 1;
      byKey[r.city_key] = cur;
    }
    const gpsByCity: Record<string, number> = {};
    for (const n of productionNeighborhoods) {
      if (isGpsActive(n)) gpsByCity[n.city_key] = (gpsByCity[n.city_key] ?? 0) + 1;
    }
    const preferredOrder = ["fort_worth", "kansas_city_missouri"];
    for (const key of preferredOrder) {
      if (!byKey[key] && gpsByCity[key] !== undefined) {
        const sample = productionNeighborhoods.find((n) => n.city_key === key);
        byKey[key] = { city_display: sample?.city_display ?? key, total: 0, reviewed: 0, geometryVerified: 0, awaitingReview: 0, readyToPromote: 0 };
      }
    }
    return Object.entries(byKey).map(([city_key, stats]) => ({
      city_key,
      city_display: stats.city_display,
      total: stats.total,
      reviewed: stats.reviewed,
      geometryVerified: stats.geometryVerified,
      gpsActive: gpsByCity[city_key] ?? 0,
      awaitingReview: stats.awaitingReview,
      readyToPromote: stats.readyToPromote,
    })).sort((a, b) => {
      const ai = preferredOrder.indexOf(a.city_key); const bi = preferredOrder.indexOf(b.city_key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.city_display.localeCompare(b.city_display);
    });
  }, [rows, productionNeighborhoods]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (statusFilter === "needs_review") return getBoundaryStage(row) === "needs_review";
    if (statusFilter === "reviewed") return getBoundaryStage(row) === "reviewed";
    if (statusFilter === "ready_to_promote") return isBoundaryReadyToPromote(row);
    if (statusFilter === "active") return isBoundaryActive(row, productionNeighborhoods);
    if (statusFilter === "invalid") return getBoundaryStage(row) === "invalid";
    return true;
  }), [rows, statusFilter, productionNeighborhoods]);

  const review = async (row: BoundaryImportRow, opts: { reviewed: boolean; geometry_verified?: boolean }) => {
    setProcessingId(row.id);
    try {
      const payload: { reviewed: boolean; review_note: string | null; geometry_verified?: boolean } = {
        reviewed: opts.reviewed,
        review_note: noteDraft[row.id]?.trim() || row.review_note || null,
      };
      if (opts.geometry_verified !== undefined) payload.geometry_verified = opts.geometry_verified;
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${row.id}/review`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as BoundaryImportRow & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...data } : r));
      if (opts.geometry_verified) {
        setStatusFilter("ready_to_promote");
        setLastAction(`${row.name} is verified and now appears in Ready to promote.`);
        toast({ title: "Geometry verified", description: `${row.name} moved to Ready to promote.` });
      } else if (opts.reviewed) {
        setStatusFilter("reviewed");
        setLastAction(`${row.name} was reviewed and remains visible in the Reviewed queue.`);
        toast({ title: "Marked reviewed", description: `${row.name} moved to Reviewed.` });
      } else {
        setStatusFilter("needs_review");
        setLastAction(`${row.name} returned to Needs review.`);
        toast({ title: "Review cleared", description: `${row.name} returned to Needs review.` });
      }
    } catch (error) {
      toast({ title: "Review failed", description: error instanceof Error ? error.message : "Network error", variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const promote = async (row: BoundaryImportRow) => {
    if (!window.confirm(`Promote “${row.name}” to GPS-eligible city_neighborhoods?\n\nThis enables the Host Signal green checkpoint for this authoritative boundary.`)) return;
    setProcessingId(row.id);
    try {
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${row.id}/promote`, { method: "POST", headers: authHeaders() });
      const data = (await res.json().catch(() => ({}))) as { error?: string; promoted?: boolean };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatusFilter("active");
      setLastAction(`${row.name} was promoted. It is now GPS-active when its effective date is current.`);
      toast({ title: "Promoted", description: `${row.name} is now GPS-eligible (Host Signal).` });
      await load();
    } catch (error) {
      toast({ title: "Promote blocked", description: error instanceof Error ? error.message : "Network error", variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const demote = async (n: CityNeighborhoodRow) => {
    if (!window.confirm(`Revoke Host Signal for “${n.name}”?\n\nThis clears verified + geometry_verified so the boundary is no longer GPS-active. Staged GIS imports are unchanged.`)) return;
    setProcessingId(n.id);
    try {
      const res = await fetch(`${BASE}/api/admin/city-neighborhoods/${n.id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ verified: false, geometry_verified: false }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ title: "Host Signal revoked", description: `${n.name} is no longer GPS-active.` });
      setStatusFilter("active");
      await load();
    } catch (error) {
      toast({ title: "Revoke blocked", description: error instanceof Error ? error.message : "Network error", variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const stageButtons: Array<[StatusFilter, string, number]> = [
    ["needs_review", "Needs review", counts.needs_review],
    ["reviewed", "Reviewed", counts.reviewed],
    ["ready_to_promote", "Ready to promote", counts.ready_to_promote],
    ["active", "GPS Active", counts.active],
    ["invalid", "Invalid", counts.invalid],
    ["all", "All rows", rows.length],
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Boundary Imports (GIS)</span>
          {counts.needs_review > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{counts.needs_review} need review</span>}
        </div>
        <button type="button" onClick={() => void load()} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted" title="Refresh" aria-label="Refresh boundary imports"><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reviewer workflow</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          {["Needs review", "Reviewed", "Geometry verified", "Ready to promote", "GPS Active"].map((label, index, list) => (
            <div key={label} className="flex items-center gap-1.5"><span className="rounded-lg border border-border bg-card px-2 py-1">{label}</span>{index < list.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}</div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">Rows no longer vanish without explanation. After each action, the console follows the row into its next workflow queue and tells you where it moved.</p>
      </div>

      {lastAction && <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-xs text-green-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{lastAction}</div>}
      {cityAuthoritySummary.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">City Authority Summary</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[38rem]">
              <thead><tr className="text-muted-foreground text-left border-b border-border/60"><th className="py-1.5 pr-3 font-bold">City</th><th className="py-1.5 px-2 font-bold text-right">Total</th><th className="py-1.5 px-2 font-bold text-right">Reviewed</th><th className="py-1.5 px-2 font-bold text-right">Geometry Verified</th><th className="py-1.5 px-2 font-bold text-right">Ready</th><th className="py-1.5 px-2 font-bold text-right text-green-500">GPS Active</th><th className="py-1.5 pl-2 font-bold text-right">Awaiting Review</th></tr></thead>
              <tbody>{cityAuthoritySummary.map((c) => <tr key={c.city_key} className="border-b border-border/40 last:border-0"><td className="py-1.5 pr-3 font-semibold">{c.city_display}</td><td className="py-1.5 px-2 text-right tabular-nums">{c.total}</td><td className="py-1.5 px-2 text-right tabular-nums">{c.reviewed}</td><td className="py-1.5 px-2 text-right tabular-nums">{c.geometryVerified}</td><td className="py-1.5 px-2 text-right tabular-nums text-primary font-black">{c.readyToPromote}</td><td className="py-1.5 px-2 text-right tabular-nums text-green-500 font-black">{c.gpsActive}</td><td className="py-1.5 pl-2 text-right tabular-nums text-yellow-500">{c.awaitingReview}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">GPS Active requires authoritative provenance plus both <span className="font-semibold text-foreground">verified</span> and <span className="font-semibold text-foreground">geometry_verified</span>. Future-effective boundaries are not counted as active. Only <span className="font-semibold text-foreground">Promote → Host Signal</span> activates a neighborhood.</p>
          {productionNeighborhoods.filter(isGpsActive).length > 0 && <div className="space-y-1.5 pt-1 border-t border-border/50"><div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">GPS-active production boundaries</div>{productionNeighborhoods.filter(isGpsActive).map((n) => { const busy = processingId === n.id; return <div key={n.id} className="flex items-center justify-between gap-2 text-[11px] rounded-lg border border-green-500/20 bg-green-500/5 px-2.5 py-1.5"><span className="font-semibold truncate">{n.name}<span className="text-muted-foreground font-normal"> · {n.city_display}</span></span><button type="button" disabled={busy} onClick={() => void demote(n)} className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 flex items-center gap-1" title="Revoke Host Signal eligibility"><ShieldOff className="w-3 h-3" />Revoke</button></div>; })}</div>}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
        {[['Staged', rows.length], ['Needs review', counts.needs_review], ['Reviewed', counts.reviewed], ['Ready', counts.ready_to_promote], ['GPS Active', counts.active], ['Invalid', counts.invalid]].map(([label, value]) => <button key={label} type="button" onClick={() => setStatusFilter(label === 'Staged' ? 'all' : label === 'Needs review' ? 'needs_review' : label === 'Reviewed' ? 'reviewed' : label === 'Ready' ? 'ready_to_promote' : label === 'GPS Active' ? 'active' : 'invalid')} className={`rounded-lg border px-2.5 py-2 text-left ${statusFilter === (label === 'Staged' ? 'all' : label === 'Needs review' ? 'needs_review' : label === 'Reviewed' ? 'reviewed' : label === 'Ready' ? 'ready_to_promote' : label === 'GPS Active' ? 'active' : 'invalid') ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted'}`}><div className="text-muted-foreground">{label}</div><div className="font-black tabular-nums text-base">{value}</div></button>)}</div>

      <div className="flex flex-wrap gap-2">{(["all", "fort_worth", "kansas_city_missouri"] as CityFilter[]).map((c) => <button key={c} type="button" onClick={() => setCityFilter(c)} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${cityFilter === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{c === "all" ? "All cities" : c === "fort_worth" ? "Fort Worth" : "Kansas City, MO"}</button>)}</div>
      <div className="flex flex-wrap gap-2">{stageButtons.map(([key, label, count]) => <button key={key} type="button" onClick={() => setStatusFilter(key)} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${statusFilter === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label} <span className="tabular-nums opacity-70">({count})</span></button>)}</div>

      {loading ? <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div> : loadError ? <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}</div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center space-y-2"><div className="text-sm font-bold">{rows.length === 0 ? "No staged GIS imports" : "No boundaries in this queue"}</div><p className="text-xs text-muted-foreground">{rows.length === 0 ? <>Run the authoritative neighborhood boundary ingest for <span className="font-semibold text-foreground">Fort Worth</span> and <span className="font-semibold text-foreground">Kansas City, MO</span>. Imports remain staged and GPS-ineligible until an administrator completes Review → Geometry Verify → Promote.</> : <>This is a workflow state, not a deletion. Try <span className="font-semibold text-foreground">All rows</span> or the next stage above.</>}</p></div> : <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">{filtered.map((row) => {
        const busy = processingId === row.id;
        const stage = getBoundaryStage(row);
        const canVerify = row.geometry_valid && row.reviewed && !row.geometry_verified && !isGenerated(row);
        const canPromote = isBoundaryReadyToPromote(row);
        const active = isBoundaryActive(row, productionNeighborhoods);
        return <div key={row.id} className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-bold text-sm truncate flex items-center gap-1.5"><MapIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />{row.name}</div><div className="text-[11px] text-muted-foreground mt-0.5">{row.city_display} · {row.source_publisher}</div><div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 truncate">{row.source_dataset} · feature {row.source_feature_id}</div></div><div className="flex flex-col items-end gap-1 shrink-0"><span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${stage === 'invalid' ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-green-500/10 text-green-500 border-green-500/30'}`}>{stage === 'needs_review' ? 'needs review' : stage === 'reviewed' ? 'reviewed' : stage === 'ready_to_promote' ? 'ready' : 'invalid'}</span>{active && <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-green-500/10 text-green-500 border-green-500/30">GPS active</span>}</div></div>
          <input type="text" aria-label={`Review note for ${row.name}`} placeholder="Review note (optional)" value={noteDraft[row.id] ?? row.review_note ?? ""} onChange={(e) => setNoteDraft((d) => ({ ...d, [row.id]: e.target.value }))} className="w-full text-xs rounded-lg border border-border bg-card px-2.5 py-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {!row.reviewed && row.geometry_valid && !isGenerated(row) && <button type="button" disabled={busy} onClick={() => void review(row, { reviewed: true })} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-50">Mark reviewed</button>}
            {canVerify && <button type="button" disabled={busy} onClick={() => void review(row, { reviewed: true, geometry_verified: true })} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50">Verify geometry</button>}
            {canPromote && !active && <button type="button" disabled={busy} onClick={() => void promote(row)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-green-500/40 bg-green-500/10 text-green-500 hover:bg-green-500/20 disabled:opacity-50 flex items-center gap-1"><Upload className="w-3 h-3" />Promote → Host Signal</button>}
            {row.reviewed && !active && <button type="button" disabled={busy} onClick={() => void review(row, { reviewed: false, geometry_verified: false })} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">Unreview</button>}
          </div>
          {isGenerated(row) && <div className="text-[10px] text-yellow-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Generated hint — cannot verify or promote to GPS boundary</div>}
          {stage === 'reviewed' && <div className="text-[10px] text-blue-400 flex items-center gap-1"><ChevronRight className="w-3 h-3" />Reviewed. Next gate: Verify geometry.</div>}
          {canPromote && !active && <div className="text-[10px] text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Reviewed + geometry verified — ready for explicit promotion.</div>}
          {active && <div className="text-[10px] text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Promoted and GPS-active. Host Signal may use this authoritative boundary.</div>}
        </div>;
      })}</div>}
    </div>
  );
}
