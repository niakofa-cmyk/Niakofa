import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Film,
  Globe2,
  Headphones,
  ImageIcon,
  Loader2,
  Search,
  Users,
  Video,
} from "lucide-react";
import type { HubCommunityFeed } from "@/lib/hubCommunityFeed";
import { fetchHubCommunityFeed } from "@/lib/hubCommunityFeed";
import { authHeaders } from "@/lib/auth";
import {
  fetchCommunityVisualDiscovery,
  type VisualDiscoveryItem,
  type VisualDiscoveryKind,
} from "@/lib/communityVisualDiscovery";

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

function AuthenticatedMediaAsset({ item }: { item: VisualDiscoveryItem }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    const url = item.media_url;
    fetch(url, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error("fetch failed")))
      .then(blob => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [item.media_url]);

  if (failed) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 bg-muted px-4 text-center text-muted-foreground">
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs font-semibold">This memory is still preparing.</span>
      </div>
    );
  }
  if (!objectUrl) return <div className="h-full min-h-32 w-full animate-pulse bg-muted" aria-label="Loading media" />;

  return (
    item.mime_type.startsWith("video/") ? (
      <video src={objectUrl} controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={item.alt_text ?? "Community video"} />
    ) : item.mime_type.startsWith("audio/") ? (
      <div className="flex h-full min-h-32 items-center justify-center bg-gradient-to-br from-primary/15 via-background to-muted p-4">
        <audio src={objectUrl} controls className="w-full" aria-label={item.alt_text ?? "Community audio"} />
      </div>
    ) : (
      <img src={objectUrl} alt={item.alt_text ?? ""} loading="lazy" className="h-full w-full object-cover" />
    )
  );
}

export function MediaDiscoveryView({ hubId }: { hubId: number | null }) {
  const [items, setItems] = useState<VisualDiscoveryItem[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<VisualDiscoveryKind>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hubId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    setHasMore(true);

    fetchCommunityVisualDiscovery(hubId, { query, kind })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.next_cursor);
        setHasMore(page.has_more);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load Community Media.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hubId, query, kind]);

  const loadMore = useCallback(async () => {
    if (!hubId || !cursor || !hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchCommunityVisualDiscovery(hubId, { cursor, query, kind });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.next_cursor);
      setHasMore(page.has_more);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not load more Community Media.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, hubId, kind, loading, loadingMore, query]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: "480px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (!hubId) return <div className="p-8 text-center text-muted-foreground">Select a Hub first.</div>;

  return (
    <div className="min-h-[70vh] bg-card px-3 py-5 sm:rounded-2xl sm:border sm:border-border sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ImageIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Visual discovery</p>
          <h2 className="text-xl font-black">Community Media</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Photographs, stories, projects, and memories shared by approved members—always connected to the Hub context that gives them meaning.
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shared moments"
            aria-label="Search shared moments"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex gap-1 rounded-xl border border-border bg-background p-1" role="group" aria-label="Filter community media">
          {([
            ["all", "All", ImageIcon],
            ["photo", "Photos", ImageIcon],
            ["video", "Videos", Video],
            ["audio", "Audio", Headphones],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold transition sm:px-3 ${kind === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss media error" className="rounded-lg p-1 hover:bg-destructive/10">×</button>
        </div>
      )}

      {loading ? (
        <div className="columns-2 gap-3 sm:columns-3">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className={`mb-3 break-inside-avoid animate-pulse rounded-2xl bg-muted ${index % 3 === 0 ? "h-64" : index % 2 === 0 ? "h-48" : "h-56"}`} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/50 px-6 text-center">
          <ImageIcon className="mb-3 h-9 w-9 text-muted-foreground/35" />
          <h3 className="font-black">No shared moments yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {query ? "Try another search, or clear the search to see the full Hub gallery." : "When neighbors share a photo, project, or oral-history moment, it will appear here with its community context."}
          </p>
        </div>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3">
          {items.map((item) => (
            <article key={item.id} className="group mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <Link href={item.context.href} className="block" aria-label={`Open community context for ${item.alt_text || "shared media"}`}>
                <div className={`relative overflow-hidden bg-muted ${item.mime_type.startsWith("audio/") ? "min-h-36" : "aspect-[4/3]"}`}>
                  <AuthenticatedMediaAsset item={item} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="truncate text-[11px] font-bold text-white">{item.author_name ? `By ${item.author_name}` : "Community member"}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-white" />
                  </div>
                </div>
              </Link>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.body}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{item.context.label}</span>
                  {item.mime_type.startsWith("video/") ? <Film className="h-3.5 w-3.5 shrink-0" /> : item.mime_type.startsWith("audio/") ? <Headphones className="h-3.5 w-3.5 shrink-0" /> : <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex min-h-12 items-center justify-center pt-2" aria-live="polite">
        {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        {!loading && !loadingMore && hasMore && <span className="text-xs text-muted-foreground">Loading more community moments…</span>}
        {!loading && !loadingMore && !hasMore && items.length > 0 && <span className="text-xs text-muted-foreground">You’ve reached the end of this Hub gallery.</span>}
      </div>
    </div>
  );
}
