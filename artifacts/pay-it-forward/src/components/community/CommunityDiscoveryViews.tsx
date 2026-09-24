import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Film,
  Globe2,
  Headphones,
  ImageIcon,
  Loader2,
  Maximize2,
  Search,
  Users,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HubCommunityFeed } from "@/lib/hubCommunityFeed";
import { fetchHubCommunityFeed } from "@/lib/hubCommunityFeed";
import { authHeaders } from "@/lib/auth";
import {
  fetchCommunityVisualDiscovery,
  fetchSavedCommunityVisualDiscovery,
  setCommunityMediaSaved,
  type VisualDiscoveryItem,
  type VisualDiscoveryKind,
} from "@/lib/communityVisualDiscovery";
import { trackCommunityMedia } from "@/lib/communityMediaAnalytics";

function mediaKindFromMime(mimeType: string): Exclude<VisualDiscoveryKind, "all"> {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "photo";
}

function kindCounts(items: VisualDiscoveryItem[]): Partial<Record<Exclude<VisualDiscoveryKind, "all">, number>> {
  return items.reduce<Partial<Record<Exclude<VisualDiscoveryKind, "all">, number>>>((counts, item) => {
    const mediaKind = mediaKindFromMime(item.mime_type);
    counts[mediaKind] = (counts[mediaKind] ?? 0) + 1;
    return counts;
  }, {});
}

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

function AuthenticatedMediaAsset({
  item,
  variant = "full",
  className,
}: {
  item: VisualDiscoveryItem;
  variant?: "preview" | "full";
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    const url = variant === "preview" && item.thumbnail_url && !item.mime_type.startsWith("audio/")
      ? item.thumbnail_url
      : item.media_url;
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
  }, [item.media_url, item.mime_type, item.thumbnail_url, variant]);

  if (failed) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 bg-muted px-4 text-center text-muted-foreground">
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs font-semibold">This memory is still preparing.</span>
      </div>
    );
  }
  if (!objectUrl) return <div className="h-full min-h-32 w-full animate-pulse bg-muted" aria-label="Loading media" />;

  if (variant === "preview" && item.thumbnail_url && !item.mime_type.startsWith("audio/")) {
    return <img src={objectUrl} alt={item.alt_text ?? ""} loading="lazy" className={className ?? "h-full w-full object-cover"} />;
  }

  return (
    item.mime_type.startsWith("video/") ? (
      <video src={objectUrl} controls playsInline preload="metadata" className={className ?? "h-full w-full object-cover"} aria-label={item.alt_text ?? "Community video"} />
    ) : item.mime_type.startsWith("audio/") ? (
      <div className="flex h-full min-h-32 items-center justify-center bg-gradient-to-br from-primary/15 via-background to-muted p-4">
        <audio src={objectUrl} controls className="w-full" aria-label={item.alt_text ?? "Community audio"} />
      </div>
    ) : (
      <img src={objectUrl} alt={item.alt_text ?? ""} loading="lazy" className={className ?? "h-full w-full object-cover"} />
    )
  );
}

export function MediaDiscoveryView({ hubId }: { hubId: number | null }) {
  const [items, setItems] = useState<VisualDiscoveryItem[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<VisualDiscoveryKind>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pageNumberRef = useRef(0);
  const [quickViewId, setQuickViewId] = useState<number | null>(null);

  const quickViewItem = useMemo(
    () => items.find((item) => item.id === quickViewId) ?? null,
    [items, quickViewId],
  );
  const quickViewIndex = quickViewItem ? items.findIndex((item) => item.id === quickViewItem.id) : -1;

  useEffect(() => {
    if (!hubId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    setHasMore(true);
    pageNumberRef.current = 0;

    const load = savedOnly ? fetchSavedCommunityVisualDiscovery : fetchCommunityVisualDiscovery;
    load(hubId, { query, kind })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.next_cursor);
        setHasMore(page.has_more);
        pageNumberRef.current = 1;
        trackCommunityMedia("community_media_gallery_viewed", {
          hub_id: hubId,
          requested_kind: kind,
          media_ids: page.items.map((item) => item.id),
          result_count: page.items.length,
          result_kind_counts: kindCounts(page.items),
          has_more: page.has_more,
          has_query: Boolean(query.trim()),
          page_number: pageNumberRef.current,
        });
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
  }, [hubId, query, kind, savedOnly]);

  const loadMore = useCallback(async () => {
    if (!hubId || !cursor || !hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    try {
      const load = savedOnly ? fetchSavedCommunityVisualDiscovery : fetchCommunityVisualDiscovery;
      const page = await load(hubId, { cursor, query, kind });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.next_cursor);
      setHasMore(page.has_more);
      pageNumberRef.current += 1;
      trackCommunityMedia("community_media_pagination_loaded", {
        hub_id: hubId,
        requested_kind: kind,
        media_ids: page.items.map((item) => item.id),
        result_count: page.items.length,
        result_kind_counts: kindCounts(page.items),
        has_more: page.has_more,
        has_query: Boolean(query.trim()),
        page_number: pageNumberRef.current,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not load more Community Media.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, hubId, kind, loading, loadingMore, query, savedOnly]);

  const toggleSave = useCallback(async (item: VisualDiscoveryItem) => {
    if (savingIds.has(item.id)) return;
    const nextSaved = !item.viewer_saved;
    setSavingIds((current) => new Set(current).add(item.id));
    try {
      const result = await setCommunityMediaSaved(item.id, nextSaved);
      setItems((current) => savedOnly && !result.saved
        ? current.filter((currentItem) => currentItem.id !== item.id)
        : current.map((currentItem) => currentItem.id === item.id
          ? { ...currentItem, viewer_saved: result.saved }
          : currentItem));
      trackCommunityMedia("community_media_save_changed", {
        hub_id: hubId ?? undefined,
        media_id: item.id,
        media_kind: mediaKindFromMime(item.mime_type),
        saved: result.saved,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not update this saved item.");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }, [hubId, savedOnly, savingIds]);

  const openQuickView = useCallback((item: VisualDiscoveryItem) => {
    setQuickViewId(item.id);
    trackCommunityMedia("community_media_quick_view_opened", {
      hub_id: hubId ?? undefined,
      media_id: item.id,
      media_kind: mediaKindFromMime(item.mime_type),
    });
  }, [hubId]);

  const moveQuickView = useCallback((direction: -1 | 1) => {
    const nextIndex = quickViewIndex + direction;
    const nextItem = items[nextIndex];
    if (nextItem) setQuickViewId(nextItem.id);
  }, [items, quickViewIndex]);

  useEffect(() => {
    if (quickViewId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") moveQuickView(-1);
      if (event.key === "ArrowRight") moveQuickView(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveQuickView, quickViewId]);

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
          <button
            type="button"
            onClick={() => setSavedOnly((current) => !current)}
            aria-pressed={savedOnly}
            className={`flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold transition sm:px-3 ${savedOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${savedOnly ? "fill-current" : ""}`} />
            <span className="hidden sm:inline">Saved</span>
          </button>
          {([
            ["all", "All", ImageIcon],
            ["photo", "Photos", ImageIcon],
            ["video", "Videos", Video],
            ["audio", "Audio", Headphones],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                trackCommunityMedia("community_media_filter_changed", {
                  hub_id: hubId,
                  requested_kind: value,
                  has_query: Boolean(query.trim()),
                });
                setKind(value);
              }}
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
          <h3 className="font-black">{savedOnly ? "No saved moments yet" : "No shared moments yet"}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {savedOnly
              ? "Save a photo, video, or audio memory and it will stay private to you for a later return."
              : query ? "Try another search, or clear the search to see the full Hub gallery." : "When neighbors share a photo, project, or oral-history moment, it will appear here with its community context."}
          </p>
        </div>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3">
          {items.map((item) => (
            <article key={item.id} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <Link
                href={item.context.href}
                className="block"
                aria-label={`Open community context for ${item.alt_text || "shared media"}`}
                onClick={() => trackCommunityMedia("community_media_context_opened", {
                  hub_id: hubId,
                  media_id: item.id,
                  media_kind: mediaKindFromMime(item.mime_type),
                  context_type: "hub_post",
                })}
              >
                <div className={`relative overflow-hidden bg-muted ${item.mime_type.startsWith("audio/") ? "min-h-36" : "aspect-[4/3]"}`}>
                  <AuthenticatedMediaAsset item={item} variant="preview" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="truncate text-[11px] font-bold text-white">{item.author_name ? `By ${item.author_name}` : "Community member"}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-white" />
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => openQuickView(item)}
                aria-label={`Quick view ${item.alt_text || "shared media"}`}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white opacity-100 shadow-sm backdrop-blur transition hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.body}</p>
                 <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                   <span className="truncate">{item.context.label}</span>
                   <div className="flex items-center gap-2">
                     {item.mime_type.startsWith("video/") ? <Film className="h-3.5 w-3.5 shrink-0" /> : item.mime_type.startsWith("audio/") ? <Headphones className="h-3.5 w-3.5 shrink-0" /> : <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
                     <button
                       type="button"
                       onClick={() => void toggleSave(item)}
                       disabled={savingIds.has(item.id)}
                       aria-label={item.viewer_saved ? "Remove from saved media" : "Save media for later"}
                       aria-pressed={item.viewer_saved}
                       className={`rounded-lg p-1 transition hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-50 ${item.viewer_saved ? "text-primary" : ""}`}
                     >
                       <Bookmark className={`h-4 w-4 ${item.viewer_saved ? "fill-current" : ""}`} />
                     </button>
                   </div>
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

      <Dialog
        open={Boolean(quickViewItem)}
        onOpenChange={(open) => {
          if (!open) setQuickViewId(null);
        }}
      >
        {quickViewItem && (
          <DialogContent className="max-w-4xl overflow-hidden p-0 sm:rounded-2xl">
            <div className="grid max-h-[86vh] overflow-y-auto md:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
              <div className="relative flex min-h-72 items-center justify-center bg-black/95 p-3 sm:min-h-[30rem]">
                <AuthenticatedMediaAsset
                  item={quickViewItem}
                  variant="full"
                  className="max-h-[62vh] w-full object-contain"
                />
                {quickViewIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => moveQuickView(-1)}
                    aria-label="Previous community media"
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-2 text-white backdrop-blur transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {quickViewIndex >= 0 && quickViewIndex < items.length - 1 && (
                  <button
                    type="button"
                    onClick={() => moveQuickView(1)}
                    aria-label="Next community media"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/65 p-2 text-white backdrop-blur transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col p-5 sm:p-6">
                <DialogHeader className="text-left">
                  <DialogTitle className="pr-8 text-xl font-black">
                    {quickViewItem.alt_text || "Community memory"}
                  </DialogTitle>
                  <DialogDescription>
                    {quickViewItem.author_name ? `Shared by ${quickViewItem.author_name}` : "Shared by a community member"} · {quickViewItem.context.label}
                  </DialogDescription>
                </DialogHeader>
                <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {quickViewItem.body}
                </p>
                <DialogFooter className="mt-auto flex-col gap-2 pt-8 sm:flex-col sm:space-x-0">
                  <button
                    type="button"
                    onClick={() => void toggleSave(quickViewItem)}
                    disabled={savingIds.has(quickViewItem.id)}
                    aria-pressed={quickViewItem.viewer_saved}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50 ${quickViewItem.viewer_saved ? "border-primary/40 text-primary" : "border-border"}`}
                  >
                    <Bookmark className={`h-4 w-4 ${quickViewItem.viewer_saved ? "fill-current" : ""}`} />
                    {quickViewItem.viewer_saved ? "Saved privately" : "Save for later"}
                  </button>
                  <Link
                    href={quickViewItem.context.href}
                    onClick={() => trackCommunityMedia("community_media_context_opened", {
                      hub_id: hubId,
                      media_id: quickViewItem.id,
                      media_kind: mediaKindFromMime(quickViewItem.mime_type),
                      context_type: "hub_post",
                    })}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Open Hub post
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
