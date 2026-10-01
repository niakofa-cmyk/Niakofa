import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, BookmarkCheck, CircleAlert, LoaderCircle, Play, RefreshCw, Star, Users } from "lucide-react";
import { CommunitySocialShell } from "@/components/community/CommunitySocialShell";
import { authHeaders } from "@/lib/auth";
import { archiveMoment, deleteMoment, getCreatorMoments, setMomentFeatured, updateMomentSettings, type CreatorMoment } from "@/lib/community-moments-collection-client";
import { validateMomentCompositionPlaybackUrl } from "@/components/community/story-studio-publish";

function AuthorizedMomentPreview({ story }: { story: CreatorMoment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const media = story.media?.[0];
  const mediaId = media?.id ?? null;
  const mediaType = media?.media_type ?? null;
  const mediaUrl = media?.media_url ?? null;
  const isReel = story.moment_video?.status === "ready";

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSrc(null);
    setLoading(true);
    setError("");
    const resolve = async () => {
      if (mediaId === null && !isReel) return null;
      const origin = window.location.origin;
      if (isReel) {
        const grantPath = `/api/community/stories/${story.id}/moment-composition/playback-grant`;
        const response = await fetch(grantPath, { method: "POST", headers: authHeaders(), credentials: "same-origin", signal: controller.signal });
        const result = await response.json().catch(() => ({})) as { playback_url?: string; error?: string };
        if (!response.ok || typeof result.playback_url !== "string") throw new Error(result.error || "Secure Moment playback could not be opened.");
        return validateMomentCompositionPlaybackUrl(result.playback_url, story.id, origin);
      }
      if (mediaId === null || mediaType === null || mediaUrl === null) return null;
      const reference = new URL(mediaUrl, origin);
      const expected = `/api/community/stories/media/${mediaId}`;
      if (reference.origin !== origin || reference.pathname.replace(/\/$/, "") !== expected || reference.search || reference.hash || reference.username || reference.password) {
        throw new Error("This Moment does not have a valid authenticated media reference.");
      }
      if (mediaType === "video") {
        const response = await fetch(`${expected}/playback-grant`, { method: "POST", headers: authHeaders(), credentials: "same-origin", signal: controller.signal });
        const result = await response.json().catch(() => ({})) as { playback_url?: string; error?: string };
        if (!response.ok || typeof result.playback_url !== "string") throw new Error(result.error || "Secure video playback could not be opened.");
        const playback = new URL(result.playback_url, origin);
        if (playback.origin !== origin || playback.search || playback.hash || playback.username || playback.password) throw new Error("The playback URL must remain on Niakofa.");
        return playback.pathname;
      }
      const response = await fetch(reference.pathname, { headers: authHeaders(), credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("This Moment image could not be loaded.");
      objectUrl = URL.createObjectURL(await response.blob());
      return objectUrl;
    };
    void resolve().then((url) => {
      if (controller.signal.aborted) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
      setSrc(url);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "This Moment media could not be loaded.");
        setLoading(false);
      }
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [isReel, mediaId, mediaType, mediaUrl, story.id]);

  if (loading) return <div className="grid h-full place-items-center bg-muted" role="status" aria-label="Loading Moment media"><div className="h-8 w-8 animate-pulse rounded-full bg-primary/20" /></div>;
  if (error) return <div className="grid h-full place-items-center bg-muted p-4 text-center text-xs text-muted-foreground" role="status">{error}</div>;
  if (media?.media_type === "video" || isReel) return src ? <video src={src} controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={media?.alt_text || story.caption || "Moment video"} /> : <div className="grid h-full place-items-center text-sm text-muted-foreground">Video preview unavailable</div>;
  if (media?.media_type === "audio") return src ? <div className="grid h-full place-items-center p-4"><audio src={src} controls preload="metadata" className="w-full" aria-label={story.caption || "Audio Moment"} /></div> : <div className="grid h-full place-items-center p-4 text-center text-sm text-muted-foreground">Audio Moment</div>;
  return src ? <img src={src} alt={media?.alt_text || story.caption || "Moment shared by this neighbor"} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" /> : <div className="grid h-full place-items-center p-5 text-center text-sm text-muted-foreground">{story.caption || "A shared moment"}</div>;
}

type View = "published" | "archive" | "featured";

export default function CommunityCreatorMomentsPage() {
  const [, params] = useRoute("/community/creators/:authorId");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const authorId = Number(params?.authorId);
  const validAuthor = Number.isSafeInteger(authorId) && authorId > 0;
  const [view, setView] = useState<View>("published");
  const [extraStories, setExtraStories] = useState<CreatorMoment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [mutationId, setMutationId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const collectionKey = useMemo(() => ["community-creator-moments", authorId, view], [authorId, view]);
  const query = useQuery({
    queryKey: collectionKey,
    queryFn: ({ signal }) => getCreatorMoments(authorId, view, null, signal),
    enabled: validAuthor,
    refetchOnMount: "always",
    staleTime: 20_000,
  });
  const collection = query.isPlaceholderData ? undefined : query.data;
  const creator = collection?.creator;
  const owner = collection?.viewer_user_id === collection?.creator.id;
  const stories = [...(collection?.stories ?? []), ...extraStories];

  useEffect(() => {
    setExtraStories([]);
    setNextCursor(collection?.next_cursor ?? null);
    setDeleteConfirmId(null);
  }, [authorId, view, collection]);

  const changeView = (next: View) => {
    setView(next);
    setDeleteConfirmId(null);
    setActionError("");
  };

  const loadMore = useCallback(async () => {
    if (!nextCursor || moreLoading) return;
    setMoreLoading(true);
    setActionError("");
    try {
      const result = await getCreatorMoments(authorId, view, nextCursor);
      setExtraStories((current) => [...current, ...result.stories.filter((story) => !current.some((item) => item.id === story.id))]);
      setNextCursor(result.next_cursor);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "More Moments could not be loaded.");
    } finally {
      setMoreLoading(false);
    }
  }, [authorId, moreLoading, nextCursor, view]);

  const refreshCollections = async () => {
    await queryClient.invalidateQueries({ queryKey: ["community-creator-moments", authorId] });
    window.dispatchEvent(new Event("community-moments-refresh"));
  };

  const runAction = async (storyId: number, action: () => Promise<unknown>) => {
    setMutationId(storyId);
    setActionError("");
    try {
      await action();
      await refreshCollections();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "That Moment could not be updated.");
    } finally {
      setMutationId(null);
    }
  };

  const tabs: Array<{ key: View; label: string }> = [
    { key: "published", label: "Published" },
    ...(owner ? [{ key: "archive" as const, label: "Archive" }] : []),
    { key: "featured", label: "Featured" },
  ];

  return (
    <CommunitySocialShell active="moments" onNavigate={(key) => navigate(key === "home" ? "/" : `/community/${key}`)} onRoute={navigate} onCreate={() => navigate("/community/moments?composer=1")} onSearch={(value) => { setSearchValue(value); if (value.trim()) navigate("/community"); }} searchValue={searchValue}>
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-3 sm:px-6" data-testid="page-community-creator-moments">
        <Link href="/community/moments" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" data-testid="link-back-to-moments">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Moments
        </Link>
        {query.isLoading || query.isPlaceholderData ? (
          <section className="animate-pulse rounded-3xl border border-border bg-card p-7" aria-label="Loading creator Moments" role="status">
            <div className="h-16 w-16 rounded-full bg-muted" /><div className="mt-4 h-6 w-44 rounded bg-muted" /><div className="mt-7 h-10 rounded-xl bg-muted" /><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="aspect-[4/5] rounded-2xl bg-muted" /><div className="aspect-[4/5] rounded-2xl bg-muted" /><div className="aspect-[4/5] rounded-2xl bg-muted" /></div>
          </section>
        ) : query.isError ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-destructive/25 bg-card p-8 text-center" role="alert">
            <CircleAlert className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold">Moments are unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : "We could not open this collection."}</p>
            <button type="button" onClick={() => void query.refetch()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground" data-testid="button-retry-creator-moments">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </section>
        ) : !creator ? (
          <section className="rounded-3xl border border-border bg-card p-8 text-center">
            <h1 className="text-xl font-bold">This neighbor is not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">Creator collections are only visible within the same Community.</p>
          </section>
        ) : (
          <>
            <header className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-6 sm:p-9">
              <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                {creator.avatar_url
                  ? <img src={creator.avatar_url} alt="" className="h-20 w-20 rounded-full border-2 border-primary/35 object-cover" data-testid={`img-creator-avatar-${creator.id}`} />
                  : <div aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full border-2 border-primary/35 bg-primary/10 text-2xl font-bold text-primary">{creator.name.slice(0, 1).toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Neighbor collection</p>
                  <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="text-creator-name">{creator.name}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Everyday care, shared by a neighbor in your Community.</p>
                </div>
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground sm:self-center">
                  <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Same-Community view
                </div>
              </div>
            </header>
            <nav className="mt-6 flex gap-2 overflow-x-auto border-b border-border pb-2" aria-label="Moment collection views">
              {tabs.map((tab) => (
                <button key={tab.key} type="button" onClick={() => changeView(tab.key)} aria-current={view === tab.key ? "page" : undefined} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition ${view === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} data-testid={`tab-creator-${tab.key}`}>
                  {tab.label}
                </button>
              ))}
            </nav>
            {actionError && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert" data-testid="status-creator-moments-action-error">{actionError}</p>}
            {query.isFetching && !query.data && <p className="p-8 text-center text-sm text-muted-foreground" role="status">Loading this collection…</p>}
            {!query.isFetching && stories.length === 0 ? (
              <section className="mt-5 grid min-h-64 place-items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-12 text-center" data-testid="status-empty-creator-moments">
                <div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Play className="h-6 w-6" aria-hidden="true" /></div><h2 className="mt-4 text-lg font-bold">{view === "archive" ? "Your archive is quiet" : view === "featured" ? "No featured Moments yet" : "A collection begins with one moment"}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{view === "published" ? "When this neighbor shares a Moment with the Community, it will live here." : "Moments saved to this collection will appear here."}</p></div>
              </section>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5" aria-live="polite">
                {stories.map((story) => {
                  return (
                    <article key={story.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`card-creator-moment-${story.id}`}>
                      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                        <AuthorizedMomentPreview story={story} />
                        {story.featured_at && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-bold text-foreground shadow"><Star className="h-3 w-3 fill-current text-secondary" aria-hidden="true" /> Featured</span>}
                        {story.audience === "hub" && <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-bold text-foreground">Hub members</span>}
                      </div>
                      <div className="p-3 sm:p-4">
                        {story.caption && <p className="line-clamp-3 text-sm leading-relaxed" data-testid={`text-moment-caption-${story.id}`}>{story.caption}</p>}
                        {story.response_to && <p className="mt-2 text-xs font-semibold text-muted-foreground" data-testid={`text-moment-response-attribution-${story.id}`}>Video response to {story.response_to.author_name || "a neighbor"}’s Moment</p>}
                        <p className="mt-2 text-xs text-muted-foreground">{story.created_at ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(story.created_at)) : "Shared with the Community"}</p>
                        {owner && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                          {view !== "archive" && <button type="button" onClick={() => void runAction(story.id, () => archiveMoment(story.id))} disabled={mutationId === story.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted disabled:opacity-60" data-testid={`button-archive-moment-${story.id}`}><Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive</button>}
                          <button type="button" onClick={() => void runAction(story.id, () => setMomentFeatured(story.id, !story.featured_at))} disabled={mutationId === story.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted disabled:opacity-60" data-testid={`button-feature-moment-${story.id}`}><Star className={`h-3.5 w-3.5 ${story.featured_at ? "fill-current text-secondary" : ""}`} aria-hidden="true" /> {story.featured_at ? "Unfeature" : "Feature"}</button>
                          <button type="button" onClick={() => void runAction(story.id, () => updateMomentSettings(story.id, !story.remix_enabled))} disabled={mutationId === story.id} aria-pressed={Boolean(story.remix_enabled)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted disabled:opacity-60" data-testid={`button-remix-setting-${story.id}`}><BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" /> Responses {story.remix_enabled ? "on" : "off"}</button>
                        </div>}
                        {owner && view === "archive" && deleteConfirmId === story.id && <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3" role="group" aria-label={`Confirm deletion of Moment ${story.id}`}>
                          <p className="text-xs leading-relaxed text-foreground">Delete this archived Moment and its stored media permanently? This cannot be undone.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => void runAction(story.id, async () => {
                              await deleteMoment(story.id);
                              setExtraStories((current) => current.filter((item) => item.id !== story.id));
                              setDeleteConfirmId(null);
                            })} disabled={mutationId === story.id} className="inline-flex min-h-10 items-center rounded-lg bg-destructive px-3 text-xs font-bold text-destructive-foreground disabled:opacity-60" data-testid={`button-confirm-delete-moment-${story.id}`}>Delete permanently</button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)} disabled={mutationId === story.id} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60" data-testid={`button-cancel-delete-moment-${story.id}`}>Keep this Moment</button>
                          </div>
                        </div>}
                        {owner && view === "archive" && deleteConfirmId !== story.id && <button type="button" onClick={() => setDeleteConfirmId(story.id)} disabled={mutationId === story.id} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-destructive/40 px-3 text-xs font-bold text-destructive hover:bg-destructive/5 disabled:opacity-60" data-testid={`button-delete-moment-${story.id}`}>Delete archived Moment</button>}
                        {mutationId === story.id && <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {nextCursor && <div className="mt-7 flex justify-center"><button type="button" onClick={() => void loadMore()} disabled={moreLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-bold hover:bg-muted disabled:opacity-60" data-testid="button-load-more-creator-moments">{moreLoading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Load more Moments</button></div>}
          </>
        )}
      </main>
    </CommunitySocialShell>
  );
}