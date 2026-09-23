import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CircleDot, FileImage, Globe2, Heart, Loader2, MessageCircle, Send, Share2, Users, BookOpen, BriefcaseBusiness, Image as ImageIcon } from "lucide-react";
import { useLocation } from "wouter";
import {
  addHubCommunityComment,
  createHubCommunityPost,
  fetchHubCommunityFeed,
  toggleHubCommunityReaction,
  uploadHubCommunityMedia,
  type HubCommunityFeed,
} from "@/lib/hubCommunityFeed";
import { communitySpiralsPath, spiralsDiscoveryPath } from "@/lib/spirals";
import { useWebSocket } from "@/lib/useWebSocket";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";

export default function HubCommunityFeedPanel({
  hubId,
  socialHomeMode = false,
  openPostId = null,
  onOpenStoryComposer,
  homeInterstitial,
  searchQuery = "",
}: {
  hubId: number | string;
  socialHomeMode?: boolean;
  openPostId?: number | null;
  onOpenStoryComposer?: () => void;
  homeInterstitial?: ReactNode;
  searchQuery?: string;
}) {
  const [, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const [feed, setFeed] = useState<HubCommunityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postBody, setPostBody] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [posting, setPosting] = useState(false);
  const [commentingPostId, setCommentingPostId] = useState<number | null>(null);
  const [reactingPostId, setReactingPostId] = useState<number | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<number | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setFeed(await fetchHubCommunityFeed(hubId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not load this Hub feed.");
    }
  }, [hubId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!feed || openPostId === null) return;
    let highlightTimeout: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`community-post-${openPostId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedPostId(openPostId);
      highlightTimeout = window.setTimeout(() => setHighlightedPostId(null), 2400);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (highlightTimeout !== null) window.clearTimeout(highlightTimeout);
    };
  }, [feed, openPostId]);

  const handleFeedRealtime = useCallback((event: { payload: unknown }) => {
    const payload = event.payload as { hub_id?: number };
    if (Number(payload.hub_id) === Number(hubId)) void reload();
  }, [hubId, reload]);

  useWebSocket("hub_community_post_created", handleFeedRealtime);
  useWebSocket("hub_community_post_updated", handleFeedRealtime);

  type FeedItem =
    | { kind: "gratitude"; id: number; createdAt: string | null; text: string; authorName: string | null; authorAvatar: string | null; meta: string }
    | { kind: "request"; id: number; createdAt: string | null; title: string; category: string; urgency: string }
    | { kind: "post"; id: number; createdAt: string; post: HubCommunityFeed["posts"][number] };

  const items = useMemo<FeedItem[]>(() => {
    if (!feed) return [];
    const gratitude: FeedItem[] = feed.gratitude.map((post) => ({
      kind: "gratitude",
      id: post.id,
      createdAt: post.created_at,
      text: post.message,
      authorName: post.author_name,
      authorAvatar: post.author_avatar,
      meta: `${post.author_name ?? "Community member"}${post.helper_name ? ` · thanked ${post.helper_name}` : ""}`,
    }));
    const requests: FeedItem[] = feed.requests.map((request) => ({
      kind: "request",
      id: request.id,
      createdAt: request.created_at,
      title: request.title,
      category: request.category ?? "Community help",
      urgency: request.urgency ?? "medium",
    }));
    const posts: FeedItem[] = feed.posts.map((post) => ({
      kind: "post",
      id: post.id,
      createdAt: post.created_at,
      post,
    }));
    return [...posts, ...gratitude, ...requests]
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
      .slice(0, 18);
  }, [feed]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((item) => {
      const searchable = item.kind === "gratitude"
        ? [item.authorName, item.text, item.meta]
        : item.kind === "request"
          ? [item.title, item.category, item.urgency]
          : [
              item.post.author_name,
              item.post.body,
              ...item.post.comments.flatMap((comment) => [comment.author_name, comment.body]),
            ];
      return searchable.some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
    });
  }, [items, normalizedSearch]);

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected media."));
    reader.readAsDataURL(file);
  });

  const submitPost = async () => {
    if (!feed || !postBody.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const result = await createHubCommunityPost(feed.hub.id, postBody.trim());
      if (mediaFile) {
        await uploadHubCommunityMedia(feed.hub.id, result.post.id, await readFileAsDataUrl(mediaFile), mediaFile.name);
      }
      setPostBody("");
      setMediaFile(null);
      setComposerExpanded(false);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not publish this Hub post.");
    } finally {
      setPosting(false);
    }
  };

  const submitComment = async (postId: number) => {
    if (!feed || !commentDrafts[postId]?.trim() || commentingPostId !== null) return;
    setCommentingPostId(postId);
    try {
      await addHubCommunityComment(feed.hub.id, postId, commentDrafts[postId].trim());
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not add this comment.");
    } finally {
      setCommentingPostId(null);
    }
  };

  const toggleReaction = async (postId: number) => {
    if (!feed || reactingPostId !== null) return;
    setReactingPostId(postId);
    try {
      await toggleHubCommunityReaction(feed.hub.id, postId);
      await reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not update this reaction.");
    } finally {
      setReactingPostId(null);
    }
  };

  const sharePost = async (postId: number, body: string) => {
    if (!feed) return;
    const shareUrl = new URL("/community", window.location.origin);
    shareUrl.searchParams.set("hubId", String(feed.hub.id));
    shareUrl.searchParams.set("postId", String(postId));
    const url = shareUrl.toString();
    const text = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${feed.hub.display_name} · Niakofa`, text, url });
        return;
      } catch {
        // A cancelled native share falls back to copying the feed link.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPostId(postId);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopiedPostId(null), 2000);
    } catch {
      setError("Could not copy the link. Try again.");
    }
  };

  useEffect(() => () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
  }, []);

  const spiralsPath = feed ? spiralsDiscoveryPath({ hubId: feed.hub.id }) : "";

  return (
    <section
      className={socialHomeMode ? "bg-transparent" : "rounded-3xl border border-border bg-card p-4 sm:p-5"}
      data-hub-community-feed={feed?.hub.id}
    >
      {feed && !socialHomeMode && (
        <>
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
            <Stat icon={<CircleDot className="h-3.5 w-3.5" />} label="Posts" value={feed.counts.posts} />
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <Action label="Community" onClick={() => navigate(`/community?hubId=${feed.hub.id}`)} />
            <Action label="Messages" onClick={() => navigate(feed.actions.messages)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
            <Action label="Spirals" onClick={() => navigate(spiralsPath)} icon={<CircleDot className="h-3.5 w-3.5" />} />
            <Action label="Community Spirals" onClick={() => navigate(communitySpiralsPath(feed.hub.id))} />
          </div>
        </>
      )}

      {socialHomeMode && homeInterstitial}

      {feed?.permissions.can_post && socialHomeMode && (
        <div id="hub-post-composer" className="mb-3 border-y border-border bg-card px-4 py-3 sm:rounded-2xl sm:border">
          <div className="flex items-center gap-3">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                {currentUser?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <button
              id="hub-post-composer-trigger"
              type="button"
              onClick={() => setComposerExpanded(true)}
              aria-expanded={composerExpanded}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-left text-[15px] text-muted-foreground transition hover:bg-muted/50"
            >
              What's on your mind?
            </button>
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted" aria-label="Attach photo or video">
              <ImageIcon className="h-5 w-5 text-emerald-500" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav"
                className="sr-only"
                onChange={(event) => {
                  setMediaFile(event.target.files?.[0] ?? null);
                  setComposerExpanded(true);
                }}
              />
            </label>
          </div>

          {composerExpanded && (
            <div className="mt-3 border-t border-border pt-3">
              <textarea
                id="hub-post-composer-textarea"
                value={postBody}
                onChange={(event) => setPostBody(event.target.value)}
                maxLength={5000}
                rows={3}
                autoFocus
                placeholder="Share an update with your Hub…"
                className="min-h-24 w-full resize-none rounded-2xl bg-muted/45 px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/50"
                aria-label="Hub post"
              />
              {mediaFile && (
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs">
                  <FileImage className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{mediaFile.name}</span>
                  <button type="button" onClick={() => setMediaFile(null)} aria-label="Remove attached media" className="font-black text-muted-foreground hover:text-foreground">&times;</button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => navigate("/request/new")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted">
                    <BriefcaseBusiness className="h-4 w-4 text-rose-500" />
                    Request
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerExpanded(false);
                      onOpenStoryComposer?.();
                    }}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
                  >
                    <BookOpen className="h-4 w-4 text-primary" />
                    Story
                  </button>
                </div>
                <button type="button" disabled={posting || !postBody.trim()} onClick={() => void submitPost()} className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                  {posting ? "Publishing…" : "Post"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {feed?.permissions.can_post && !socialHomeMode && (
        <div id="hub-post-composer" className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Share with this Hub</p>
          <textarea
            id="hub-post-composer-textarea"
            value={postBody}
            onChange={(event) => setPostBody(event.target.value)}
            maxLength={5000}
            rows={3}
            placeholder="Share an update, resource, or encouragement…"
            className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            aria-label="Hub post"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:border-primary/50">
              <FileImage className="h-3.5 w-3.5" />
              {mediaFile ? mediaFile.name : "Add media"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav"
                className="sr-only"
                onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" disabled={posting || !postBody.trim()} onClick={() => void submitPost()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> {posting ? "Publishing…" : "Post"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Media is stored securely with this post. Files up to 5 MB are supported.</p>
        </div>
      )}

      {error && <div role="alert" className="mb-3 rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-100">{error}</div>}

      {!feed ? (
        !error && <div className="flex min-h-32 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (
      <div className={socialHomeMode ? "" : "mt-5"}>
        {!socialHomeMode && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Latest in this Hub</h3>
            <span className="text-[10px] text-muted-foreground">{visibleItems.length} recent items</span>
          </div>
        )}

        {normalizedSearch && (
          <p role="status" className="mb-3 px-4 text-xs text-muted-foreground sm:px-0">
            {visibleItems.length === 1 ? "1 result" : `${visibleItems.length} results`} for “{searchQuery.trim()}”
          </p>
        )}

        <div className="grid gap-3 sm:gap-4">
          {visibleItems.length === 0 ? <Empty text={normalizedSearch ? "No Hub posts, gratitude, or requests match this search." : "This Hub has no posts, gratitude, or open requests yet."} /> : visibleItems.map((item) => item.kind === "gratitude" ? (
            <article key={`gratitude-${item.id}`} className={socialHomeMode ? "border-y border-border bg-card p-4 sm:rounded-2xl sm:border" : "rounded-2xl border border-border bg-card p-3.5 sm:p-4"}>
              <div className="flex items-start gap-3">
                <PostAvatar name={item.authorName} avatarUrl={item.authorAvatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.authorName ?? "Community member"}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <span>{timeAgo(item.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <CircleDot className="h-3 w-3 text-primary" />
                    <span className="text-primary font-medium">Gratitude</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">{item.text}</p>
              {item.meta && <p className="mt-2 text-[11px] text-muted-foreground">{item.meta}</p>}
            </article>
          ) : item.kind === "post" ? (
            <article
              key={`post-${item.id}`}
              id={`community-post-${item.id}`}
              className={`${socialHomeMode ? "border-y border-border bg-card p-4 sm:rounded-2xl sm:border" : "rounded-2xl border border-border bg-card p-3.5 sm:p-4"} ${highlightedPostId === item.id ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background" : ""}`}
            >
              <div className="flex items-start gap-3">
                <PostAvatar name={item.post.author_name} avatarUrl={item.post.author_avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.post.author_name ?? "Community member"}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{timeAgo(item.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{feed.hub.display_name}</span>
                    <Globe2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{item.post.body}</p>
              {item.post.media.length > 0 && (
                <div className="mt-3 -mx-3.5 sm:mx-0 overflow-hidden sm:grid sm:gap-2 sm:rounded-xl sm:grid-cols-2">
                  {item.post.media.map((media) => media.mime_type.startsWith("image/") ? (
                    <HubMedia key={media.id} media={media} kind="image" />
                  ) : media.mime_type.startsWith("video/") ? (
                    <HubMedia key={media.id} media={media} kind="video" />
                  ) : (
                    <HubMedia key={media.id} media={media} kind="audio" />
                  ))}
                </div>
              )}
              {(item.post.reaction_count > 0 || item.post.comments.length > 0) && (
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">{item.post.reaction_count > 0 && <><Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" /> {item.post.reaction_count}</>}</span>
                  <span>{item.post.comments.length > 0 && `${item.post.comments.length} comment${item.post.comments.length === 1 ? "" : "s"}`}</span>
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-1 border-y border-border/70 py-1">
                <button type="button" disabled={!feed.permissions.can_react || reactingPostId === item.id} onClick={() => void toggleReaction(item.id)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold transition-colors hover:bg-muted disabled:opacity-50 ${item.post.viewer_reacted ? "text-rose-500" : "text-muted-foreground"}`}>
                  <Heart className="h-4 w-4" fill={item.post.viewer_reacted ? "currentColor" : "none"} /> Like
                </button>
                <button type="button" onClick={() => document.getElementById(`hub-comment-input-${item.id}`)?.focus()} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted">
                  <MessageCircle className="h-4 w-4" /> Comment
                </button>
                <button type="button" onClick={() => void sharePost(item.id, item.post.body)} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted">
                  <Share2 className="h-4 w-4" /> {copiedPostId === item.id ? "Copied!" : "Share"}
                </button>
              </div>
              {item.post.comments.length > 0 && (
                <div className="mt-3 space-y-3">
                  {item.post.comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2">
                      <PostAvatar name={comment.author_name} avatarUrl={comment.author_avatar} />
                      <div className="min-w-0 rounded-2xl bg-muted/60 px-3.5 py-2.5">
                        <p className="text-[13px] font-bold">{comment.author_name ?? "Member"}</p>
                        <p className="text-[13px] leading-relaxed mt-0.5">{comment.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {feed.permissions.can_comment && (
                <div className="mt-3 flex items-start gap-2">
                  <PostAvatar name={currentUser?.name ?? null} avatarUrl={currentUser?.avatar_url ?? null} />
                  <div className="flex min-w-0 flex-1 gap-2">
                    <input id={`hub-comment-input-${item.id}`} value={commentDrafts[item.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-full border border-border bg-muted/30 px-4 py-2.5 text-[13px] outline-none transition-colors focus:bg-background focus:border-primary" aria-label={`Comment on post ${item.id}`} />
                    <button type="button" disabled={!commentDrafts[item.id]?.trim() || commentingPostId === item.id} onClick={() => void submitComment(item.id)} className="shrink-0 rounded-full bg-primary/10 text-primary px-4 text-xs font-bold transition hover:bg-primary/20 disabled:opacity-50">{commentingPostId === item.id ? "…" : "Post"}</button>
                  </div>
                </div>
              )}
            </article>
          ) : (
            <button key={`request-${item.id}`} type="button" onClick={() => navigate(`/request/${item.id}/view`)} className={socialHomeMode ? "border-y border-border bg-card p-4 text-left transition hover:bg-muted/30 sm:rounded-2xl sm:border" : "rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm transition hover:border-primary/40"}>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-primary"><ArrowRight className="h-3 w-3" /> Open request</div>
              <p className="mt-1.5 truncate text-[15px] font-bold">{item.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.category} · {item.urgency}</p>
            </button>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}

function HubMedia({
  media,
  kind,
}: {
  media: HubCommunityFeed["posts"][number]["media"][number];
  kind: "image" | "video" | "audio";
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrl: string | null = null;
    void fetch(media.media_url, { headers: authHeaders(), signal: controller.signal })
      .then((response) => response.ok ? response.blob() : Promise.reject(new Error("media")))
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [media.media_url]);

  useEffect(() => {
    if (kind !== "video" || !objectUrl || !mediaFrameRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const frame = mediaFrameRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          video.muted = true;
          void video.play().catch(() => {
            // Browsers may still reject autoplay; controls remain available.
          });
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.65, 1] },
    );
    observer.observe(frame);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [kind, objectUrl]);

  if (failed) {
    return <div className="rounded-xl border border-border bg-background/70 p-3 text-xs text-muted-foreground">Media unavailable.</div>;
  }
  if (!objectUrl) {
    return <div className={`${kind === "image" ? "h-48" : "h-16"} animate-pulse rounded-xl bg-muted`} />;
  }
  if (kind === "image") {
    return <img src={objectUrl} alt={media.alt_text ?? "Hub post media"} loading="lazy" className="max-h-80 w-full object-cover" />;
  }
  if (kind === "video") {
    return (
      <div ref={mediaFrameRef} className="bg-black">
        <video
          ref={videoRef}
          src={objectUrl}
          controls
          muted
          playsInline
          loop
          preload="metadata"
          aria-label={media.alt_text ?? "Hub post video"}
          className="max-h-80 w-full"
        />
      </div>
    );
  }
  return <audio src={objectUrl} controls className="w-full mt-2" />;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-border/70 bg-background/40 p-3"><div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">{icon}{label}</div><p className="mt-1 text-lg font-black">{value}</p></div>;
}
function Action({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-black hover:border-primary/40 hover:bg-primary/5">{icon}{label}</button>;
}
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-center text-muted-foreground">{text}</p>; }

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PostAvatar({ name, avatarUrl }: { name: string | null; avatarUrl?: string | null }) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-full object-cover border border-border/50" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary border border-primary/20" aria-hidden="true">
      {initial}
    </div>
  );
}
