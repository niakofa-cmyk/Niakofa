import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { Globe2, Users, ImageIcon, Loader2 } from "lucide-react";
import type { HubCommunityFeed } from "@/lib/hubCommunityFeed";
import { fetchHubCommunityFeed } from "@/lib/hubCommunityFeed";
import { authHeaders } from "@/lib/auth";

function useHubFeed(hubId: number | null) {
  const [feed, setFeed] = useState<HubCommunityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFeed(null);
    setError(null);
    if (!hubId) return;
    let active = true;
    fetchHubCommunityFeed(hubId)
      .then((data) => {
        if (active) setFeed(data);
      })
      .catch(() => {
        if (active) setError("Could not load this Hub right now.");
      });
    return () => {
      active = false;
    };
  }, [hubId]);

  return { feed, error };
}

export function PeopleDiscoveryView({ hubId }: { hubId: number | null }) {
  const { feed, error } = useHubFeed(hubId);

  const people = useMemo(() => {
    if (!feed) return [];
    const map = new Map<string, { name: string, avatar: string | null }>();
    feed.posts.forEach(p => {
      if (p.author_name && !map.has(p.author_name)) {
        map.set(p.author_name, { name: p.author_name, avatar: p.author_avatar });
      }
    });
    feed.gratitude.forEach(g => {
      if (g.author_name && !map.has(g.author_name)) {
        map.set(g.author_name, { name: g.author_name, avatar: g.author_avatar ?? null });
      }
      if (g.helper_name && !map.has(g.helper_name)) {
        map.set(g.helper_name, { name: g.helper_name, avatar: null });
      }
    });
    return Array.from(map.values());
  }, [feed]);

  if (!hubId) return <div className="p-8 text-center text-muted-foreground">Select a Hub first.</div>;
  if (error) return <div role="alert" className="p-8 text-center text-destructive">{error}</div>;
  if (!feed) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">People in {feed.hub.display_name}</h2>
          <p className="text-sm text-muted-foreground">Neighbors and helpers active recently</p>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          No recent activity to discover people.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {people.map(p => (
            <div key={p.name} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/50">
              {p.avatar ? (
                <img src={p.avatar} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary border border-primary/20">
                  {p.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="font-bold text-sm truncate">{p.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HubsDiscoveryView({ hubId }: { hubId: number | null }) {
  const { feed, error } = useHubFeed(hubId);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
          <Globe2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">Your Hubs</h2>
          <p className="text-sm text-muted-foreground">Communities you are part of</p>
        </div>
      </div>

      <div className="grid gap-3">
        {error && <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</div>}
        {feed && (
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
            <div>
              <div className="font-black text-lg">{feed.hub.display_name}</div>
              <div className="text-xs text-muted-foreground mt-1">{feed.hub.region ?? "Local Hub"}</div>
              <div className="text-xs font-bold text-primary mt-2">{feed.counts.members} members</div>
            </div>
            <Link href={`/community?hubId=${feed.hub.id}`} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold transition hover:bg-primary/90">
              View
            </Link>
          </div>
        )}

        <div className="p-5 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center gap-2 mt-4 bg-background/50">
          <Globe2 className="h-8 w-8 text-muted-foreground/40" />
          <div className="font-bold text-base">Discover more in Diaspora</div>
          <p className="text-xs text-muted-foreground max-w-xs">Connect with global cultural hubs and heritage groups across the world.</p>
          <Link href="/diaspora" className="mt-3 text-sm font-bold text-primary bg-primary/10 px-5 py-2.5 rounded-xl transition hover:bg-primary/20">
            Explore Diaspora
          </Link>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedMediaImage({ url, author }: { url: string; author: string | null }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrl: string | null = null;
    fetch(url, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error("fetch failed")))
      .then(blob => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {});

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  if (!objectUrl) return <div className="w-full h-full bg-muted animate-pulse" />;

  return (
    <>
      <img src={objectUrl} alt="" className="w-full h-full object-cover" />
      {author && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <span className="text-[11px] text-white font-bold truncate drop-shadow-md">By {author}</span>
        </div>
      )}
    </>
  );
}

export function MediaDiscoveryView({ hubId }: { hubId: number | null }) {
  const { feed, error } = useHubFeed(hubId);

  const media = useMemo(() => {
    if (!feed) return [];
    return feed.posts.flatMap(p =>
      p.media.filter(m => m.mime_type.startsWith("image/")).map(m => ({
        ...m,
        postId: p.id,
        author: p.author_name
      }))
    );
  }, [feed]);

  if (!hubId) return <div className="p-8 text-center text-muted-foreground">Select a Hub first.</div>;
  if (error) return <div role="alert" className="p-8 text-center text-destructive">{error}</div>;
  if (!feed) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
          <ImageIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">Community Media</h2>
          <p className="text-sm text-muted-foreground">Photos shared in {feed.hub.display_name}</p>
        </div>
      </div>

      {media.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl bg-background/50">
          <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          No photos have been shared recently.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {media.map((m, i) => (
            <div key={`${m.id}-${i}`} className="aspect-square bg-muted rounded-xl overflow-hidden relative group border border-border/50">
              <AuthenticatedMediaImage url={m.media_url} author={m.author} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
