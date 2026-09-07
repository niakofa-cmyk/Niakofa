import { ArrowRight, HeartHandshake, MapPin, Mic, Radio, Sparkles, Users } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { useEffect, useMemo, useState } from "react";

type Hub = {
  member_count?: number;
  story_count?: number;
  open_requests?: number;
  activity?: { active_helpers?: number; requests_fulfilled?: number; pool_balance?: number } | null;
};
type Presence = {
  generated_at?: string;
  freshness_window_seconds?: number;
  current_user?: {
    location_fresh?: boolean;
    location_updated_at?: string | null;
    location_age_seconds?: number | null;
    current_hub?: { hub_id: number; hub_name: string; distance_km: number } | null;
    current_neighborhood?: { neighborhood_id: string; name: string; live_user_count: number; gps_verified: boolean } | null;
  };
  hubs?: Array<{ hub_id: number; live_user_count?: number }>;
  neighborhoods?: Array<{ neighborhood_id: string; name: string; live_user_count?: number; gps_verified?: boolean }>;
  totals?: { members?: number; live?: number; stories?: number; active_helpers?: number; open_requests?: number; requests_fulfilled?: number; pool_balance?: number; active_neighborhoods?: number };
};
type PulseProps = { navigate?: (href: string) => void };

const ITEMS = [
  { key: "members", label: "Members", icon: Users, href: "/community", tone: "text-amber-300 bg-amber-300/10 border-amber-300/20" },
  { key: "live", label: "Live", icon: Radio, href: "/diaspora/heritage/globe", tone: "text-teal-300 bg-teal-300/10 border-teal-300/20" },
  { key: "neighborhood", label: "Neighborhoods", icon: MapPin, href: "/community", tone: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20" },
  { key: "helping", label: "Helping", icon: HeartHandshake, href: "/helper-dashboard", tone: "text-sky-300 bg-sky-300/10 border-sky-300/20" },
  { key: "stories", label: "Stories", icon: Mic, href: "/diaspora/family?intent=oral-history", tone: "text-rose-300 bg-rose-300/10 border-rose-300/20" },
  { key: "spirals", label: "Spirals", icon: Sparkles, href: "/audio-spirals", tone: "text-violet-300 bg-violet-300/10 border-violet-300/20" },
] as const;

export function GlobalVillagePulse({ navigate }: PulseProps) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [presence, setPresence] = useState<Presence | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/griot/village-pulse", { headers: authHeaders() });
        if (!cancelled && response.ok) {
          const data = await response.json() as Presence & { hubs?: Hub[] };
          setPresence(data);
          setHubs(Array.isArray(data.hubs) ? data.hubs : []);
        }
      } catch {
        // Keep the village surface useful if a live stream is temporarily unavailable.
      }
    }
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const metrics = useMemo(() => {
    if (presence?.totals) {
      return {
        members: Number(presence.totals.members ?? 0),
        live: Number(presence.totals.live ?? 0),
        neighborhoods: Number(presence.totals.active_neighborhoods ?? 0),
        activeHelpers: Number(presence.totals.active_helpers ?? 0),
        openRequests: Number(presence.totals.open_requests ?? 0),
        fulfilled: Number(presence.totals.requests_fulfilled ?? 0),
        poolBalance: Number(presence.totals.pool_balance ?? 0),
        stories: Number(presence.totals.stories ?? 0),
      };
    }
    return {
      members: hubs.reduce((sum, hub) => sum + Number(hub.member_count ?? 0), 0),
      live: (presence?.hubs ?? []).reduce((sum, hub) => sum + Number(hub.live_user_count ?? 0), 0),
      neighborhoods: (presence?.neighborhoods ?? []).filter((n) => n.gps_verified === true && Number(n.live_user_count ?? 0) > 0).length,
      activeHelpers: hubs.reduce((sum, hub) => sum + Number(hub.activity?.active_helpers ?? 0), 0),
      openRequests: hubs.reduce((sum, hub) => sum + Number(hub.open_requests ?? 0), 0),
      fulfilled: hubs.reduce((sum, hub) => sum + Number(hub.activity?.requests_fulfilled ?? 0), 0),
      poolBalance: hubs.reduce((sum, hub) => sum + Number(hub.activity?.pool_balance ?? 0), 0),
      stories: hubs.reduce((sum, hub) => sum + Number(hub.story_count ?? 0), 0),
    };
  }, [hubs, presence]);

  const helpingDetail = `${metrics.openRequests.toLocaleString()} open · ${metrics.fulfilled.toLocaleString()} fulfilled · $${metrics.poolBalance.toFixed(2)} pool`;
  const currentNeighborhood = presence?.current_user?.current_neighborhood;
  const locationFresh = presence?.current_user?.location_fresh === true;

  return (
    <section aria-label="Global Village pulse" className={`${diasporaTheme.radiusHero} border border-teal-300/15 bg-white/[0.025] p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-300/75">The Global Village</p>
          <h2 className="mt-1 text-lg font-black text-white">Alive from member to Spiral.</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/40">GPS verifies the neighborhood layer privately; aggregate activity connects Members → Live → Neighborhoods → Helping → Stories → Spirals.</p>
        </div>
        <span className="hidden rounded-full border border-teal-300/20 bg-teal-300/5 px-2.5 py-1 text-[10px] font-semibold text-teal-200 sm:inline-flex">Live pulse</span>
      </div>

      {currentNeighborhood && locationFresh && (
        <button type="button" onClick={() => navigate?.(`/audio-spirals?neighborhood=${encodeURIComponent(currentNeighborhood.neighborhood_id)}`)} className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2.5 text-left transition hover:bg-emerald-300/[0.1]">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-200"><MapPin className="h-3.5 w-3.5" />You are in {currentNeighborhood.name}</span>
            <span className="mt-0.5 block text-[10px] text-white/40">GPS-verified neighborhood · {currentNeighborhood.live_user_count.toLocaleString()} live here</span>
          </span>
          <span className="shrink-0 text-[10px] font-bold text-emerald-200">Open local Spiral →</span>
        </button>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ITEMS.map((item, index) => {
          const Icon = item.icon;
          const value = item.key === "members" ? metrics.members : item.key === "live" ? metrics.live : item.key === "neighborhood" ? metrics.neighborhoods : item.key === "helping" ? metrics.activeHelpers : item.key === "stories" ? metrics.stories : null;
          const detail = item.key === "helping" ? helpingDetail : item.key === "neighborhood" ? "GPS-verified & currently live" : item.key === "spirals" ? "Explore local first" : undefined;
          const content = (
            <>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4 w-4" /></span>
              <span className="mt-2 block text-xs font-bold text-white">{item.label}</span>
              <span className="mt-0.5 block text-[10px] text-white/40">{value == null ? "Explore" : value.toLocaleString()}</span>
              {detail && <span className="mt-1 block text-[9px] leading-tight text-white/25">{detail}</span>}
              {index < ITEMS.length - 1 && <span aria-hidden="true" className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-white/20 lg:block">›</span>}
            </>
          );
          return navigate ? (
            <button key={item.key} type="button" onClick={() => navigate(item.href)} className={`group relative rounded-2xl border border-white/10 bg-black/10 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.055] ${diasporaTheme.focus}`}>{content}<ArrowRight className="absolute right-2.5 top-2.5 h-3 w-3 text-white/15 transition group-hover:text-white/50" /></button>
          ) : (
            <a key={item.key} href={item.href} className={`group relative rounded-2xl border border-white/10 bg-black/10 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.055] ${diasporaTheme.focus}`}>{content}<ArrowRight className="absolute right-2.5 top-2.5 h-3 w-3 text-white/15 transition group-hover:text-white/50" /></a>
          );
        })}
      </div>
    </section>
  );
}
