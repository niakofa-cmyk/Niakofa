import { useEffect, useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { MessageAvatar } from "./MessageAvatar";

type Person = { id: number; name: string; avatar_url: string | null };
type Hub = { id: number; name: string; display_name: string | null; region?: string };
type Community = { id: number; name: string; member_count?: number };
type Tab = "people" | "hubs" | "communities";

export function NewMessageRail({
  onSelectPerson,
  onSelectHub,
  onSelectCommunity,
}: {
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
      if (!hubResponse.ok && !communityResponse.ok) setError("Message destinations are unavailable right now.");
    }).catch(() => { if (!cancelled) setError("Message destinations are unavailable right now."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tab !== "people" || query.trim().length < 2) { setPeople([]); return; }
    const timer = window.setTimeout(() => {
      void fetch("/api/messages/direct/users?q=" + encodeURIComponent(query.trim()), { headers: authHeaders() })
        .then(async (response) => {
          const data = await response.json().catch(() => ({})) as { users?: Person[] };
          if (response.ok) setPeople(Array.isArray(data.users) ? data.users : []);
        }).catch(() => setError("Could not search approved people."));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tab]);

  return (
    <aside className="hidden min-h-0 w-[15rem] shrink-0 flex-col border-l border-border bg-card xl:flex">
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-base font-black">New Message</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Connect with people, Hubs, and communities.</p>
      </div>
      <div className="border-b border-border px-3 pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-background p-1">
          {([
            ["people", "Contacts"],
            ["hubs", "Hubs"],
            ["communities", "Groups"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => { setTab(value); setQuery(""); }}
              className={"min-h-9 rounded-xl px-1 text-[10px] font-black " + (tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative my-3 block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={tab !== "people"}
            placeholder={tab === "people" ? "Search users, hubs..." : tab === "hubs" ? "Choose a Hub below" : "Discover communities"}
            className="min-h-10 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary disabled:opacity-60" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {loading && <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[10px] text-rose-200">{error}</p>}
        {!loading && tab === "people" && (
          people.length ? people.map((person) => (
            <button key={person.id} type="button" onClick={() => onSelectPerson(person)} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted">
              <MessageAvatar name={person.name} avatarUrl={person.avatar_url} size={34} />
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{person.name}</span>
            </button>
          )) : <p className="py-8 text-center text-[11px] text-muted-foreground">{query.trim().length < 2 ? "Search approved people" : "No people found"}</p>
        )}
        {!loading && tab === "hubs" && (
          targetHubs.length ? targetHubs.map((hub) => {
            const source = sourceHubs.find((candidate) => candidate.id !== hub.id);
            return <button key={hub.id} type="button" disabled={!source} onClick={() => source && onSelectHub(source.id, hub.id)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted disabled:opacity-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate text-xs font-bold">{hub.display_name || hub.name}</span><span className="block truncate text-[9px] text-muted-foreground">{hub.region || "Diaspora Hub"}</span></span>
            </button>;
          }) : <p className="py-8 text-center text-[11px] text-muted-foreground">{sourceHubs.length ? "No contact Hubs available" : "Approved Hub membership required"}</p>
        )}
        {!loading && tab === "communities" && (
          communities.length ? communities.map((community) => (
            <button key={community.id} type="button" onClick={onSelectCommunity} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-2 text-left hover:bg-muted">
              <span className="min-w-0"><span className="block truncate text-xs font-bold">{community.name}</span><span className="block text-[9px] text-muted-foreground">{community.member_count ? community.member_count + " members" : "Community"}</span></span>
              <span className="text-[9px] font-black text-primary">Open</span>
            </button>
          )) : <p className="py-8 text-center text-[11px] text-muted-foreground">No communities available</p>
        )}
      </div>
    </aside>
  );
}
