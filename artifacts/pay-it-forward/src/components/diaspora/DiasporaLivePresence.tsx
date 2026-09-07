import { useCallback, useEffect, useMemo, useState } from "react";
import { LocateFixed, RefreshCw, Users } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

type HubPresence = { hub_id: number; hub_name: string; live_user_count: number; last_location_at: string | null };
type NeighborhoodPresence = { neighborhood_id: string; name: string; emoji: string; live_user_count: number; gps_verified: boolean };
type PresenceResponse = {
  generated_at: string;
  freshness_window_seconds: number;
  current_user: { location_fresh: boolean; location_updated_at: string | null; location_age_seconds: number | null; current_hub: { hub_id: number; hub_name: string; distance_km: number } | null };
  hubs: HubPresence[];
  neighborhoods?: NeighborhoodPresence[];
};
function relative(value: string | null) {
  if (!value) return "never";
  const age = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  return `${Math.floor(age / 3600)}h ago`;
}
export function DiasporaLivePresence({ hubId, compact = false }: { hubId?: number | null; compact?: boolean }) {
  const { currentUser } = useAppContext();
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const response = await fetch("/api/griot/live-presence", { headers: authHeaders() });
      if (!response.ok) throw new Error("presence");
      setData((await response.json()) as PresenceResponse);
    } catch {
      // Presence is additive; browsing continues if the presence service is unavailable.
    } finally { setLoading(false); }
  }, [currentUser]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);
  const selected = useMemo(() => hubId == null ? null : data?.hubs.find((hub) => hub.hub_id === hubId) ?? null, [data, hubId]);
  const current = data?.current_user;
  const currentHubCount = current?.current_hub ? data?.hubs.find((h) => h.hub_id === current.current_hub?.hub_id)?.live_user_count ?? null : null;
  const count = selected?.live_user_count ?? (hubId == null ? currentHubCount : null);
  const visibleNeighborhoods = (data?.neighborhoods ?? []).filter((n) => n.live_user_count > 0).slice(0, 6);
  async function refreshGps() {
    if (!currentUser || !navigator.geolocation) { toast({ title: "GPS is unavailable on this device", variant: "destructive" }); return; }
    setRefreshingLocation(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(`/api/users/${currentUser.id}/location`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude, heading: position.coords.heading, speed: position.coords.speed }) });
        if (!response.ok) throw new Error("location");
        await load();
      } catch { toast({ title: "Couldn't sync your GPS location", variant: "destructive" }); }
      finally { setRefreshingLocation(false); }
    }, () => { setRefreshingLocation(false); toast({ title: "Location permission is required", description: "You can still browse Diaspora experiences without sharing GPS.", variant: "destructive" }); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
  }
  return (
    <section className={compact ? "rounded-2xl border border-teal-300/15 bg-teal-300/[0.045] p-3" : "rounded-3xl border border-teal-300/15 bg-teal-300/[0.045] p-5"}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-300/10"><LocateFixed className="h-4 w-4 text-teal-300" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300/70">Live Diaspora Presence</p>
          <p className="mt-1 text-sm font-bold text-white">{current?.location_fresh ? (current.current_hub?.hub_name ?? "No verified hub yet") : "Location needs a fresh GPS sync"}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">{current?.location_fresh ? `Server-synced ${relative(current.location_updated_at)}. Raw coordinates are never displayed.` : "Only recently server-synced GPS contributes to live counts."}</p>
        </div>
        <button onClick={() => void refreshGps()} disabled={refreshingLocation} className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10" title="Refresh GPS"><RefreshCw className={`h-4 w-4 ${refreshingLocation ? "animate-spin" : ""}`} /></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="rounded-xl bg-white/5 px-3 py-2"><Users className="mr-1 inline h-3.5 w-3.5 text-teal-300" /><b className="text-white">{loading ? "…" : count ?? 0}</b><span className="ml-1 text-[11px] text-white/40">live users</span></div>
        {current?.current_hub && <div className="rounded-xl bg-white/5 px-3 py-2 text-[11px] text-white/50">~{current.current_hub.distance_km} km from hub center</div>}
      </div>
      {visibleNeighborhoods.length > 0 && <div className="mt-3 border-t border-white/5 pt-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Verified neighborhood presence</p><div className="mt-2 flex flex-wrap gap-2">{visibleNeighborhoods.map((n) => <span key={n.neighborhood_id} className="rounded-xl bg-white/5 px-2.5 py-1.5 text-[11px] text-white/60">{n.emoji} {n.name}: <b className="text-white">{n.live_user_count}</b></span>)}</div></div>}
    </section>
  );
}
