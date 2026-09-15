import { useMemo, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowRight, BookHeart, ChevronDown, CircleDot, Globe2, MapPin, MessageCircle, Users, WalletCards, X } from "lucide-react";
import { useLocation } from "wouter";
import { diasporaTheme } from "@/lib/diaspora/theme";

type Hub = {
  id: number;
  name: string;
  display_name?: string | null;
  region: string;
  lat: number;
  lng: number;
  tag: string;
  hub_scope?: string | null;
  country_code?: string | null;
  subdivision_code?: string | null;
  story_count: number;
  member_count: number;
  live_user_count: number;
  neighborhood_count: number;
  spiral_count: number;
  open_requests: number;
  reserved_balance?: string | number | null;
  is_crisis: boolean;
  crisis_message: string | null;
  local_hubs?: { hub_id: number; name: string; member_count: number; story_count: number }[] | null;
};

interface Props { hubs: Hub[]; loading?: boolean; }
const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

function hubLabel(hub: Hub) { return hub.display_name?.trim() || hub.name; }
function hubKind(hub: Hub) {
  if (hub.hub_scope === "home" || hub.tag === "home") return "Home hub";
  if (hub.hub_scope === "us_state" || hub.country_code === "US" || /^us(?:-|_|$)/i.test(hub.tag)) return "U.S. state hub";
  return "Country hub";
}
function matchesQuery(hub: Hub, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const searchable = [
    hubLabel(hub),
    hub.name,
    hub.region,
    hub.tag,
    hub.country_code ?? "",
    hub.subdivision_code ?? "",
    hubKind(hub),
    ...(hub.local_hubs ?? []).map((local) => local.name),
  ];
  return searchable.some((value) => value.toLowerCase().includes(q));
}

export function DiasporaGlobeFirst({ hubs, loading = false }: Props) {
  const [, navigate] = useLocation();
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [query, setQuery] = useState("");
  const filteredHubs = useMemo(() => hubs.filter((hub) => matchesQuery(hub, query)), [hubs, query]);
  const openHub = (hub: Hub) => { setSelectedHub(hub); setQuery(""); };

  return (
    <section className={`${diasporaTheme.radiusHero} relative h-[calc(100vh-5.5rem)] min-h-[620px] overflow-hidden border border-teal-300/20 bg-[#071312] ${diasporaTheme.shadow}`}>
      {loading && <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#071312]/70 backdrop-blur-sm"><div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-white/70">Loading Diaspora Hubs…</div></div>}
      {token ? <Map initialViewState={{ longitude: -20, latitude: 18, zoom: 1.25 }} projection="globe" mapStyle="mapbox://styles/mapbox/dark-v11" mapboxAccessToken={token} attributionControl={false}>
        {filteredHubs.map((hub) => <Marker key={hub.id} longitude={hub.lng} latitude={hub.lat} anchor="center"><button onClick={() => openHub(hub)} aria-label={`Open ${hubLabel(hub)} Hub`} title={hubLabel(hub)} className={`relative h-10 w-10 rounded-full border-2 shadow-lg transition-transform hover:scale-110 ${hub.is_crisis ? "border-rose-300 bg-rose-300/30" : hub.hub_scope === "home" || hub.tag === "home" ? "border-amber-300 bg-amber-300/30" : "border-teal-300 bg-teal-300/25"}`}><span className="absolute inset-1 rounded-full border border-white/30 animate-pulse" /></button></Marker>)}
      </Map> : <div className="absolute inset-0 flex items-center justify-center p-8 text-center"><div><Globe2 className="mx-auto h-12 w-12 text-teal-200/20" /><p className="mt-3 text-sm font-semibold text-white/60">Interactive globe unavailable</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-white/35">Add the Mapbox public token to enable the live globe. Hub discovery remains available through search.</p></div></div>}

      <div className="absolute left-3 right-3 top-3 z-20 sm:left-5 sm:right-auto sm:top-5 sm:w-[430px]">
        <div className="rounded-2xl border border-white/10 bg-[#071312]/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-300/10"><Globe2 className="h-4 w-4 text-teal-300" /></span>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.24em] text-teal-300/75">Niakofa Diaspora</p><h1 className="mt-0.5 text-lg font-black text-white sm:text-xl">Find your Diaspora Hub</h1><p className="mt-1 text-xs leading-relaxed text-white/45">Countries worldwide. Individual states within the United States.</p></div>
            <button onClick={() => navigate("/diaspora/heritage/globe")} aria-label="Open full globe" className={`rounded-xl border border-white/10 p-2 text-white/45 hover:bg-white/5 hover:text-white ${diasporaTheme.focus}`}><ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="relative mt-4">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Brazil, Ghana, Texas…" aria-label="Find a Diaspora Hub" className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-9 pr-9 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-300/40" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear hub search" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"><X className="h-4 w-4" /></button>}
          {query && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-64 overflow-auto rounded-2xl border border-white/10 bg-[#0a1918] p-2 shadow-2xl">{filteredHubs.length === 0 ? <p className="p-3 text-xs text-white/40">No Diaspora Hub matches that search.</p> : filteredHubs.slice(0, 12).map((hub) => <button key={hub.id} onClick={() => openHub(hub)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-300/30 bg-teal-300/10"><MapPin className="h-3.5 w-3.5 text-teal-300" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{hubLabel(hub)}</span><span className="block text-[11px] text-white/40">{hubKind(hub)} · {hub.region}{hub.local_hubs && hub.local_hubs.length > 1 ? ` · ${hub.local_hubs.length} local hubs` : ""}</span></span><ArrowRight className="h-3.5 w-3.5 text-white/20" /></button>)}</div>}
          </div>
          <p className="mt-2 text-[10px] text-white/30">{filteredHubs.length} Hubs available · Select a marker or search result</p>
        </div>
      </div>

      {selectedHub && <aside className="absolute bottom-3 left-3 right-3 z-20 max-h-[55%] overflow-auto rounded-2xl border border-white/10 bg-[#0a1918]/95 p-4 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-5 sm:max-h-[calc(100%-2.5rem)] sm:w-[390px] sm:p-5" aria-label={`${hubLabel(selectedHub)} Hub details`}>
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300"><CircleDot className="h-3 w-3" /> {hubKind(selectedHub)}</span>{selectedHub.is_crisis && <span className="rounded-full bg-rose-300/10 px-2 py-1 text-[10px] font-bold text-rose-200">Crisis</span>}</div><h3 className="mt-1 truncate text-xl font-black text-white">{hubLabel(selectedHub)}</h3><p className="mt-1 text-xs text-white/40">{selectedHub.region}</p></div><button onClick={() => setSelectedHub(null)} aria-label="Close Hub details" className={`rounded-xl p-2 text-white/40 hover:bg-white/5 hover:text-white ${diasporaTheme.focus}`}><X className="h-4 w-4" /></button></div>
        {selectedHub.crisis_message && <p className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-xs leading-relaxed text-rose-100/70">{selectedHub.crisis_message}</p>}
        <p className="mt-4 text-xs leading-relaxed text-white/50">{selectedHub.member_count} members · {selectedHub.story_count} stories · {selectedHub.spiral_count} Spirals · {selectedHub.open_requests} open needs</p>
        <div className="mt-4 grid grid-cols-3 gap-2"><HubAction icon={Users} label="Community" onClick={() => navigate(`/community?hubId=${selectedHub.id}`)} /><HubAction icon={MessageCircle} label="Message hub" onClick={() => navigate(`/community?hubId=${selectedHub.id}&intent=connect`)} /><HubAction icon={CircleDot} label="Spirals" onClick={() => navigate(`/audio-circles?hubId=${selectedHub.id}`)} /></div>
        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.025]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-bold text-white/55"><span>More from {hubLabel(selectedHub)}</span><ChevronDown className="h-3.5 w-3.5" /></summary>
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3"><HubAction icon={BookHeart} label="Stories" onClick={() => navigate(`/diaspora/heritage/globe?hubId=${selectedHub.id}`)} /><HubAction icon={WalletCards} label="Pool" onClick={() => navigate(`/community?hubId=${selectedHub.id}&tab=pool`)} /></div>
          {selectedHub.local_hubs && selectedHub.local_hubs.length > 1 && <div className="border-t border-white/10 px-3 py-3"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Local communities</p><p className="mt-1 text-[11px] leading-relaxed text-white/50">{selectedHub.local_hubs.map((local) => local.name).join(" · ")}</p></div>}
        </details>
      </aside>}
    </section>
  );
}

function HubAction({ icon: Icon, label, onClick }: { icon: typeof Users; label: string; onClick: () => void }) { return <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-[11px] font-bold text-white/65 hover:bg-white/[0.06] hover:text-white ${diasporaTheme.focus}`}><Icon className="h-3.5 w-3.5 text-teal-300" />{label}</button>; }
export type DiasporaGlobeHub = Hub;
