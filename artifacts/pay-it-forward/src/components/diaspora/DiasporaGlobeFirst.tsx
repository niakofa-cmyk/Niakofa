import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowRight, BookHeart, CheckCircle2, ChevronDown, CircleDot, Globe2, Loader2, MapPin, MessageCircle, Send, Users, WalletCards, X } from "lucide-react";
import { useLocation } from "wouter";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { authHeaders } from "@/lib/auth";
import { parseGlobeHubQuery, resolveHubFromQuery } from "@/lib/diaspora/globeHubDeepLink";

// `/diaspora/heritage/globe` remains a compatibility route; new navigation
// uses the canonical `/diaspora` Globe doorway.
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
  hero_image_url?: string | null;
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

type MessageHub = Pick<Hub, "id" | "name" | "display_name" | "region" | "hub_scope" | "country_code" | "subdivision_code">;
type HubMessage = {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_hub_id: number;
  sender_hub_name: string;
  sender_name: string;
  body: string;
  created_at: string;
};
type MembershipStatus = "requested" | "approved" | "suspended" | "revoked" | "left";
type HubMembership = { id: number; hub_id: number; status: MembershipStatus; role: string };

function hubLabel(hub: Hub) { return hub.display_name?.trim() || hub.name; }
function flagForHub(hub: Hub): string {
  const code = hub.country_code?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return "•";
  return [...code]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}
function hubKind(hub: Hub) {
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
  const mapRef = useRef<MapRef | null>(null);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const [messageHub, setMessageHub] = useState<Hub | null>(null);
  const [membership, setMembership] = useState<HubMembership | null>(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const filteredHubs = useMemo(() => hubs.filter((hub) => matchesQuery(hub, query)), [hubs, query]);
  const focusHub = (hub: Hub) => {
    mapRef.current?.flyTo({
      center: [hub.lng, hub.lat],
      zoom: hub.hub_scope === "us_state" ? 4.2 : 3.1,
      duration: 1100,
      essential: true,
    });
  };
  const resetGlobe = () => {
    mapRef.current?.flyTo({
      center: [-20, 18],
      zoom: 1.25,
      bearing: 0,
      pitch: 0,
      duration: 900,
      essential: true,
    });
    setSelectedHub(null);
    setQuery("");
  };
  const openHub = (hub: Hub) => {
    setSelectedHub(hub);
    setQuery("");
    focusHub(hub);
  };

  useEffect(() => {
    if (deepLinkApplied || !hubs.length) return;
    const query = parseGlobeHubQuery(window.location.search);
    if (query.hubId == null && !query.hubName) {
      setDeepLinkApplied(true);
      return;
    }
    const match = resolveHubFromQuery(hubs, query);
    if (match) {
      setSelectedHub(match);
      focusHub(match);
    }
    setDeepLinkApplied(true);
  }, [hubs, deepLinkApplied]);

  useEffect(() => {
    if (!selectedHub) {
      setMembership(null);
      setMembershipError(null);
      return;
    }
    let cancelled = false;
    setMembershipError(null);
    fetch(`/api/diaspora/hub-memberships?hub_id=${selectedHub.id}`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Membership status is unavailable.");
        return response.json() as Promise<{ membership?: HubMembership | null }>;
      })
      .then((data) => {
        if (!cancelled) setMembership(data.membership ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setMembershipError(reason instanceof Error ? reason.message : "Membership status is unavailable.");
      });
    return () => { cancelled = true; };
  }, [selectedHub]);

  const requestMembership = async (hubId: number) => {
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const response = await fetch("/api/diaspora/hub-memberships", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ hub_id: hubId }),
      });
      const data = await response.json().catch(() => ({})) as { membership?: HubMembership; error?: string };
      if (!response.ok || !data.membership) throw new Error(data.error ?? "Membership request could not be sent.");
      if (selectedHub?.id === hubId) setMembership(data.membership);
    } catch (reason: unknown) {
      setMembershipError(reason instanceof Error ? reason.message : "Membership request could not be sent.");
    } finally {
      setMembershipBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (messageHub) {
        setMessageHub(null);
        return;
      }
      if (selectedHub) setSelectedHub(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messageHub, selectedHub]);

  return (
    <section data-niakofa-surface="diaspora-globe" className={`${diasporaTheme.radiusHero} relative h-[calc(100vh-5.5rem)] min-h-[520px] overflow-hidden border border-teal-300/20 bg-[#071312] ${diasporaTheme.shadow} sm:min-h-[620px]`}>
      {loading && <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#071312]/70 backdrop-blur-sm"><div className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs text-white/70">Loading Diaspora Hubs…</div></div>}
      {token ? <Map
        ref={mapRef}
        initialViewState={{ longitude: -20, latitude: 18, zoom: 1.25 }}
        projection="globe"
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={token}
        attributionControl={false}
      >
        <NavigationControl
          position="bottom-right"
          showZoom
          showCompass
          visualizePitch={false}
        />
        {filteredHubs.map((hub) => (
          <Marker key={hub.id} longitude={hub.lng} latitude={hub.lat} anchor="center">
            <button
              onClick={() => openHub(hub)}
              aria-label={`Open ${hubLabel(hub)} Hub`}
              title={hubLabel(hub)}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-lg transition-transform hover:scale-110 ${
                selectedHub?.id === hub.id
                  ? "scale-110 border-white bg-teal-200/35 ring-4 ring-teal-200/20"
                  : hub.is_crisis
                    ? "border-rose-300 bg-rose-300/30"
                    : "border-teal-300 bg-teal-300/25"
              }`}
            >
              <span className="text-[15px] leading-none" aria-hidden="true">{flagForHub(hub)}</span>
              {hub.live_user_count > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#071312] bg-emerald-300 motion-safe:animate-pulse motion-reduce:animate-none"
                  title={`${hub.live_user_count} people active now`}
                />
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 rounded-full border border-white/30 motion-safe:animate-pulse motion-reduce:animate-none"
              />
            </button>
          </Marker>
        ))}
      </Map> : <div className="absolute inset-0 flex items-center justify-center p-8 text-center"><div><Globe2 className="mx-auto h-12 w-12 text-teal-200/20" /><p className="mt-3 text-sm font-semibold text-white/60">Interactive globe unavailable</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-white/35">Add the Mapbox public token to enable the live globe. Hub discovery remains available through search.</p></div></div>}

      <div className="absolute left-3 right-3 top-3 z-20 sm:left-5 sm:right-auto sm:top-5 sm:w-[390px]">
        <div className="rounded-2xl border border-white/10 bg-[#071312]/55 p-2 shadow-lg backdrop-blur-xl">
          <div className="relative flex items-center gap-2">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search country, state or local hub…"
              aria-label="Find a Diaspora Hub"
              className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-9 pr-24 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-300/40"
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear hub search"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={resetGlobe}
                aria-label="Reset Globe to worldwide view"
                title="Reset Globe"
                className={`flex h-11 w-11 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-white ${diasporaTheme.focus}`}
              >
                <Globe2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="px-1 pt-1 text-[9px] text-white/25">
            <span aria-live="polite">{filteredHubs.length} Hubs</span>
          </div>
          {query && <div className="relative mt-1">
            <div className="absolute left-0 right-0 top-0 z-40 max-h-64 overflow-auto rounded-2xl border border-white/10 bg-[#0a1918] p-2 shadow-2xl">
              {filteredHubs.length === 0 ? <p className="p-3 text-xs text-white/40">No Hub matches that search.</p> : filteredHubs.slice(0, 12).map((hub) => (
                <button key={hub.id} onClick={() => openHub(hub)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5 ${diasporaTheme.focus}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-300/30 bg-teal-300/10 text-[13px]">{flagForHub(hub)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{hubLabel(hub)}</span><span className="block text-[11px] text-white/40">{hubKind(hub)} · {hub.region}{hub.local_hubs && hub.local_hubs.length > 0 ? ` · ${hub.local_hubs.length} local` : ""}</span></span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/20" />
                </button>
              ))}
            </div>
          </div>}
        </div>
      </div>

      {selectedHub && <aside className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-20 max-h-[calc(100%-8.5rem)] overflow-auto rounded-2xl border border-white/10 bg-[#0a1918]/95 p-4 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-5 sm:max-h-[calc(100%-2.5rem)] sm:w-[390px] sm:p-5" aria-label={`${hubLabel(selectedHub)} Hub details`}>
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300"><CircleDot className="h-3 w-3" /> {hubKind(selectedHub)}</span>{selectedHub.is_crisis && <span className="rounded-full bg-rose-300/10 px-2 py-1 text-[10px] font-bold text-rose-200">Crisis</span>}</div><h3 className="mt-1 truncate text-xl font-black text-white">{hubLabel(selectedHub)}</h3><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">Hub context</p><p className="mt-1 text-xs text-white/40">{selectedHub.region}</p></div><button onClick={() => setSelectedHub(null)} aria-label="Close Hub details" className={`rounded-xl p-2 text-white/40 hover:bg-white/5 hover:text-white ${diasporaTheme.focus}`}><X className="h-4 w-4" /></button></div>
        {selectedHub.hero_image_url && (
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img
              src={selectedHub.hero_image_url}
              alt={`${hubLabel(selectedHub)} community`}
              className="h-32 w-full object-cover sm:h-36"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          </div>
        )}
        {selectedHub.crisis_message && <p className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-xs leading-relaxed text-rose-100/70">{selectedHub.crisis_message}</p>}
        <p className="mt-4 text-xs leading-relaxed text-white/50">{selectedHub.member_count} members · {selectedHub.story_count} stories · {selectedHub.spiral_count} Spirals · {selectedHub.open_requests} open needs</p>
         <div className="mt-4 rounded-xl border border-teal-300/15 bg-teal-300/[0.04] p-3">
           <div className="flex items-start justify-between gap-3">
             <div>
               <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-200/80">Hub membership</p>
               <p className="mt-1 text-xs leading-relaxed text-white/45">
                 {membership?.status === "approved" ? "You are an approved member of this Hub." : membership?.status === "requested" ? "Your request is waiting for a Hub leader review." : "Membership is explicit; location alone does not represent you in this Hub."}
               </p>
             </div>
             {membership?.status === "approved" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-label="Approved membership" />}
           </div>
           {membership?.status !== "approved" && (
             <button
               type="button"
               onClick={() => void requestMembership(selectedHub.id)}
               disabled={membershipBusy || membership?.status === "requested"}
               className={`mt-3 w-full rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 py-2.5 text-xs font-bold text-teal-100 hover:bg-teal-300/15 disabled:cursor-not-allowed disabled:opacity-50 ${diasporaTheme.focus}`}
             >
               {membershipBusy ? "Sending request…" : membership?.status === "requested" ? "Membership requested" : "Request membership"}
             </button>
           )}
           {membershipError && <p role="alert" className="mt-2 text-[11px] text-rose-200/80">{membershipError}</p>}
         </div>
        {selectedHub.live_user_count > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2 text-[11px] text-emerald-100/75">
            <span className="h-2 w-2 rounded-full bg-emerald-300 motion-safe:animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            <span><strong className="font-bold text-emerald-100">{selectedHub.live_user_count} active now</strong> in this Hub</span>
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2"><HubAction icon={Users} label="Community" onClick={() => navigate(`/community?hubId=${selectedHub.id}`)} /><HubAction icon={MessageCircle} label="Message hub" onClick={() => setMessageHub(selectedHub)} /><HubAction icon={CircleDot} label="Spirals" onClick={() => navigate(`/audio-circles?hubId=${selectedHub.id}`)} /></div>
        {selectedHub.hub_scope === "us_state" && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Other U.S. State Hubs</p>
              <span className="text-[9px] text-white/25">{hubs.filter((item) => item.hub_scope === "us_state").length} total</span>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {hubs.filter((item) => item.hub_scope === "us_state" && item.id !== selectedHub.id).slice(0, 6).map((item) => (
                <button key={item.id} onClick={() => openHub(item)} className={`shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] font-semibold text-white/60 hover:bg-white/[0.07] hover:text-white ${diasporaTheme.focus}`}>
                  {hubLabel(item)}
                </button>
              ))}
            </div>
          </div>
        )}
        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.025]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-bold text-white/55"><span>More from {hubLabel(selectedHub)}</span><ChevronDown className="h-3.5 w-3.5" /></summary>
         <div className="grid grid-cols-3 gap-2 border-t border-white/10 p-3"><HubAction icon={BookHeart} label="Stories" onClick={() => navigate(`/diaspora?hub=${selectedHub.id}&view=stories`)} /><HubAction icon={Users} label="Family" onClick={() => navigate(`/diaspora/family?hubId=${selectedHub.id}`)} /><HubAction icon={WalletCards} label="Pool" onClick={() => navigate(`/community?hubId=${selectedHub.id}&tab=pool`)} /></div>
           {selectedHub.local_hubs && selectedHub.local_hubs.length > 0 && (
             <div className="border-t border-white/10 px-3 py-3">
               <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Local communities</p>
               <div className="mt-2 grid gap-1.5">
                 {selectedHub.local_hubs.map((local) => (
                   <button
                     key={local.hub_id}
                     onClick={() => navigate(`/community?hubId=${local.hub_id}`)}
                     className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-left text-[11px] text-white/60 hover:bg-white/[0.05] hover:text-white ${diasporaTheme.focus}`}
                   >
                     <span className="min-w-0 truncate">{local.name}</span>
                     <span className="shrink-0 text-[9px] text-white/30">{local.member_count} members</span>
                   </button>
                 ))}
               </div>
             </div>
           )}
        </details>
      </aside>}
       {messageHub && <HubMessagingPanel hub={messageHub} hubs={hubs} onClose={() => setMessageHub(null)} onRequestMembership={() => void requestMembership(messageHub.id)} membershipStatus={selectedHub?.id === messageHub.id ? membership?.status : undefined} />}
    </section>
  );
}

function HubMessagingPanel({ hub, hubs, onClose, onRequestMembership, membershipStatus }: { hub: Hub; hubs: Hub[]; onClose: () => void; onRequestMembership: () => void; membershipStatus?: MembershipStatus }) {
  const [sourceHubs, setSourceHubs] = useState<MessageHub[]>([]);
  const [targetHubs, setTargetHubs] = useState<MessageHub[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState(String(hub.id));
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [body, setBody] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableTargets = useMemo(
    () => targetHubs.filter((item) => item.id !== Number(sourceId)),
    [targetHubs, sourceId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    fetch("/api/diaspora/hub-messages/options", { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Hub messaging is unavailable right now.");
        return response.json() as Promise<{ source_hubs?: MessageHub[]; target_hubs?: MessageHub[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const nextSources = Array.isArray(data.source_hubs) ? data.source_hubs : [];
        const nextTargets = Array.isArray(data.target_hubs) ? data.target_hubs : hubs;
        setSourceHubs(nextSources);
        setTargetHubs(nextTargets);
        setSourceId(String(nextSources[0]?.id ?? ""));
        if (!nextTargets.some((item) => item.id === hub.id)) setTargetId(String(nextTargets[0]?.id ?? ""));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Hub messaging is unavailable right now.");
      })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [hub.id, hubs]);

  const openConversation = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setLoadingConversation(true);
    setError(null);
    try {
      const response = await fetch("/api/diaspora/hub-messages/conversations", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ source_hub_id: Number(sourceId), target_hub_id: Number(targetId) }),
      });
      const data = await response.json().catch(() => ({})) as { conversation?: { id: number }; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error ?? "Could not open Hub conversation.");
      setConversationId(data.conversation.id);
      const messagesResponse = await fetch(`/api/diaspora/hub-messages/conversations/${data.conversation.id}`, { headers: authHeaders() });
      const messagesData = await messagesResponse.json().catch(() => ({})) as { messages?: HubMessage[]; error?: string };
      if (!messagesResponse.ok) throw new Error(messagesData.error ?? "Could not load Hub messages.");
      setMessages(Array.isArray(messagesData.messages) ? messagesData.messages : []);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not open Hub conversation.");
    } finally {
      setLoadingConversation(false);
    }
  };

  const sendMessage = async () => {
    if (!conversationId || !sourceId || !body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/diaspora/hub-messages/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sender_hub_id: Number(sourceId), body: body.trim() }),
      });
      const data = await response.json().catch(() => ({})) as { message?: HubMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "Message could not be sent.");
      setMessages((current) => [...current, data.message!]);
      setBody("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const selectedTarget = targetHubs.find((item) => item.id === Number(targetId));
  const selectedSource = sourceHubs.find((item) => item.id === Number(sourceId));
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`Message ${hubLabel(hub)} Hub`}>
       <div className="flex max-h-[calc(100%-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-teal-300/20 bg-[#0a1918] shadow-2xl sm:max-h-[92%] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-teal-300/75">Hub-to-Hub message</p><h3 className="mt-1 text-lg font-black text-white">Connect {hubLabel(hub)}</h3><p className="mt-1 text-xs text-white/45">Messages are saved to one shared thread for both Hubs.</p></div>
          <button onClick={onClose} aria-label="Close Hub messaging" className="rounded-xl p-2 text-white/40 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 overflow-auto p-4">
           {loadingOptions ? <div className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading Hub permissions…</div> : sourceHubs.length === 0 ? <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-xs leading-relaxed text-amber-100/70"><p>You need approved membership in a Hub before you can send a Hub-to-Hub message.</p><button type="button" onClick={onRequestMembership} disabled={membershipStatus === "requested" || membershipStatus === "approved"} className={`mt-3 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-50 ${diasporaTheme.focus}`}>{membershipStatus === "requested" ? "Membership requested" : membershipStatus === "approved" ? "Membership approved" : "Request membership"}</button></div> : <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">From your Hub<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-teal-300/40">{sourceHubs.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.name}</option>)}</select></label>
              <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">To Hub<select value={targetId} onChange={(event) => { setTargetId(event.target.value); setConversationId(null); setMessages([]); }} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-teal-300/40">{availableTargets.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.name}</option>)}</select></label>
            </div>
            <button disabled={loadingConversation || !sourceId || !targetId || sourceId === targetId} onClick={() => void openConversation()} className={`flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 py-2.5 text-xs font-bold text-teal-100 hover:bg-teal-300/15 disabled:cursor-not-allowed disabled:opacity-40 ${diasporaTheme.focus}`}>{loadingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {conversationId ? `Conversation with ${selectedTarget?.display_name || selectedTarget?.name || "Hub"}` : `Open conversation with ${selectedTarget?.display_name || selectedTarget?.name || "a Hub"}`}</button>
            {conversationId && <div className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
              {messages.length === 0 ? <p className="py-4 text-center text-xs text-white/35">No messages yet. Start the conversation.</p> : messages.map((message) => <div key={message.id} className={`rounded-xl px-3 py-2 ${message.sender_hub_id === Number(sourceId) ? "ml-5 bg-teal-300/10" : "mr-5 bg-white/[0.05]"}`}><p className="text-[10px] font-bold text-teal-200/80">{message.sender_hub_name} · {message.sender_name}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/75">{message.body}</p></div>)}
              <div className="flex items-end gap-2 border-t border-white/10 pt-3"><textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} maxLength={2000} rows={2} placeholder={`Write to ${selectedTarget?.display_name || selectedTarget?.name || "this Hub"}…`} className="min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-teal-300/40" /><button onClick={() => void sendMessage()} disabled={sending || !body.trim()} aria-label="Send Hub message" className={`rounded-xl bg-teal-300 p-3 text-[#071312] hover:bg-teal-200 disabled:opacity-40 ${diasporaTheme.focus}`}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
            </div>}
            {selectedSource && <p className="text-[10px] text-white/30">Sending as {selectedSource.display_name || selectedSource.name}. Enter sends; Shift+Enter adds a line.</p>}
          </>}
          {error && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-3 text-xs text-rose-100/75">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function HubAction({ icon: Icon, label, onClick }: { icon: typeof Users; label: string; onClick: () => void }) { return <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-[11px] font-bold text-white/65 hover:bg-white/[0.06] hover:text-white ${diasporaTheme.focus}`}><Icon className="h-3.5 w-3.5 text-teal-300" />{label}</button>; }
export type DiasporaGlobeHub = Hub;
