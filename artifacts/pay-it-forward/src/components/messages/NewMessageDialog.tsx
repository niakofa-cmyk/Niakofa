import { useEffect, useState } from "react";
import { Building2, Loader2, Search, Users, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };
type Hub = { id: number; name: string; display_name: string | null; region?: string };
type Community = { id: number; name: string; member_count?: number };
type Tab = "people" | "hubs" | "communities";

export function NewMessageDialog({
  onClose,
  onSelectPerson,
  onSelectHub,
  onSelectCommunity,
}: {
  onClose: () => void;
  onSelectPerson: (person: Person) => void;
  onSelectHub: (sourceId: number, targetId: number) => void;
  onSelectCommunity: () => void;
}) {
  const [tab, setTab] = useState<Tab>("people");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [sourceHubs, setSourceHubs] = useState<Hub[]>([]);
  const [targetHubs, setTargetHubs] = useState<Hub[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/diaspora/hub-messages/options", { headers: authHeaders() }),
      fetch("/api/communities", { headers: authHeaders() }),
    ]).then(async ([hubResponse, communityResponse]) => {
      const hubData = await hubResponse.json().catch(() => ({})) as { source_hubs?: Hub[]; target_hubs?: Hub[] };
      const communityData = await communityResponse.json().catch(() => ({})) as { communities?: Community[] };
      if (cancelled) return;
      setSourceHubs(hubResponse.ok && Array.isArray(hubData.source_hubs) ? hubData.source_hubs : []);
      setTargetHubs(hubResponse.ok && Array.isArray(hubData.target_hubs) ? hubData.target_hubs : []);
      setCommunities(communityResponse.ok && Array.isArray(communityData.communities) ? communityData.communities : []);
    }).catch(() => {
      if (!cancelled) setError("Some message destinations are unavailable right now.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tab !== "people" || query.trim().length < 2) {
      setPeople([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/messages/direct/users?q=${encodeURIComponent(query.trim())}`, { headers: authHeaders() })
        .then(async (response) => {
          const data = await response.json().catch(() => ({})) as { users?: Person[] };
          if (response.ok) setPeople(Array.isArray(data.users) ? data.users : []);
        })
        .catch(() => setError("Could not search approved people."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tab]);

  const tabs: Array<{ value: Tab; label: string; icon: typeof Users }> = [
    { value: "people", label: "People", icon: Users },
    { value: "hubs", label: "Hubs", icon: Building2 },
    { value: "communities", label: "Communities", icon: Users },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="new-message-title">
      <div className="flex max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Messages</p><h2 id="new-message-title" className="mt-1 text-xl font-black">New Message</h2><p className="mt-1 text-xs text-muted-foreground">Start with an approved person, Hub, or community.</p></div>
          <button type="button" onClick={onClose} data-testid="button-close-new-message" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Close new message"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-border px-5 pt-3">
          <div className="flex gap-1 rounded-2xl bg-background p-1">
            {tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => { setTab(value); setQuery(""); }} data-testid={`button-new-message-tab-${value}`} className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black ${tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
          <label className="relative my-3 block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={tab !== "people"} data-testid="input-new-message-search" placeholder={tab === "people" ? "Search approved people…" : tab === "hubs" ? "Choose a Hub below" : "Communities are discovery-only"} className="min-h-11 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary disabled:opacity-60" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading destinations…</div>}
          {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          {!loading && tab === "people" && (people.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">{query.trim().length < 2 ? "Type at least two characters to find an approved person." : "No approved people found."}</p> : people.map((person) => <button key={person.id} type="button" onClick={() => onSelectPerson(person)} data-testid={`button-new-message-person-${person.id}`} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-muted"><MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={40} /><span className="font-bold">{person.name}</span></button>))}
          {!loading && tab === "hubs" && (targetHubs.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">{sourceHubs.length === 0 ? "You need an approved Hub membership to speak as a Hub." : "No contact Hubs are available."}</p> : targetHubs.map((hub) => { const source = sourceHubs.find((candidate) => candidate.id !== hub.id); return <button key={hub.id} type="button" disabled={!source} onClick={() => source && onSelectHub(source.id, hub.id)} data-testid={`button-new-message-hub-${hub.id}`} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-200"><Building2 className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate font-bold">{hub.display_name || hub.name}</span><span className="block text-xs text-muted-foreground">{hub.region || "Diaspora Hub"} · {source ? `Speak as ${source.display_name || source.name}` : "No approved source"}</span></span></button>; }))}
          {!loading && tab === "communities" && <div><p className="mb-3 rounded-2xl border border-border bg-background px-3 py-3 text-xs leading-relaxed text-muted-foreground">Communities are public discovery spaces. Select one to open Community; group messaging remains in the existing Hub system.</p>{communities.map((community) => <button key={community.id} type="button" onClick={onSelectCommunity} data-testid={`button-new-message-community-${community.id}`} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-3 text-left hover:bg-muted"><span><span className="block font-bold">{community.name}</span><span className="text-xs text-muted-foreground">{community.member_count ? `${community.member_count} members` : "Open community"}</span></span><span className="text-xs font-black text-primary">Open</span></button>)}</div>}
        </div>
      </div>
    </div>
  );
}