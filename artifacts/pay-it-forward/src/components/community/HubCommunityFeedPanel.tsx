import { useEffect, useState } from "react";
import { ArrowRight, CircleDot, Loader2, MessageCircle, Users } from "lucide-react";
import { useLocation } from "wouter";
import { fetchHubCommunityFeed, type HubCommunityFeed } from "@/lib/hubCommunityFeed";
import { communitySpiralsPath, spiralsDiscoveryPath } from "@/lib/spirals";

export default function HubCommunityFeedPanel({ hubId }: { hubId: number | string }) {
  const [, navigate] = useLocation();
  const [feed, setFeed] = useState<HubCommunityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchHubCommunityFeed(hubId)
      .then((data) => { if (!cancelled) setFeed(data); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this Hub feed.");
      });
    return () => { cancelled = true; };
  }, [hubId]);

  if (error) return <div role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100">{error}</div>;
  if (!feed) return <div className="flex min-h-32 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const spiralsPath = spiralsDiscoveryPath({ hubId: feed.hub.id });

  return (
    <section className="rounded-3xl border border-border bg-card p-4 sm:p-5" data-hub-community-feed={feed.hub.id}>
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Hub Community</p>
          <h2 className="truncate text-xl font-black">{feed.hub.display_name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{feed.hub.region ?? feed.hub.country_code ?? "Diaspora Hub"}</p>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Members" value={feed.counts.members} />
        <Stat icon={<ArrowRight className="h-3.5 w-3.5" />} label="Open requests" value={feed.counts.open_requests} />
        <Stat icon={<CircleDot className="h-3.5 w-3.5" />} label="Gratitude" value={feed.counts.gratitude} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <Action label="Community" onClick={() => navigate(`/community?hubId=${feed.hub.id}`)} />
        <Action label="Messages" onClick={() => navigate(feed.actions.messages)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
        <Action label="Spirals" onClick={() => navigate(spiralsPath)} icon={<CircleDot className="h-3.5 w-3.5" />} />
        <Action label="Community Spirals" onClick={() => navigate(communitySpiralsPath(feed.hub.id))} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FeedSection title="Latest gratitude">
          {feed.gratitude.length === 0 ? <Empty text="No Hub-scoped gratitude yet." /> : feed.gratitude.slice(0, 6).map((post) => (
            <article key={post.id} className="rounded-2xl border border-border/70 bg-background/40 p-3">
              <p className="text-sm leading-relaxed">{post.message}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">{post.author_name ?? "Community member"}{post.helper_name ? ` · thanked ${post.helper_name}` : ""}</p>
            </article>
          ))}
        </FeedSection>

        <FeedSection title="Open requests">
          {feed.requests.length === 0 ? <Empty text="No open requests for this Hub right now." /> : feed.requests.slice(0, 6).map((request) => (
            <button key={request.id} type="button" onClick={() => navigate(`/request/${request.id}/view`)} className="rounded-2xl border border-border/70 bg-background/40 p-3 text-left hover:border-primary/40">
              <p className="truncate text-sm font-black">{request.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{request.category ?? "Community help"} · {request.urgency ?? "medium"}</p>
            </button>
          ))}
        </FeedSection>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-border/70 bg-background/40 p-3"><div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">{icon}{label}</div><p className="mt-1 text-lg font-black">{value}</p></div>;
}
function Action({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-black hover:border-primary/40 hover:bg-primary/5">{icon}{label}</button>;
}
function FeedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h3><div className="grid gap-2">{children}</div></div>;
}
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">{text}</p>; }
