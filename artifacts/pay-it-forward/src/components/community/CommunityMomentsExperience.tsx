import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, Heart, LoaderCircle, MessageCircle, Play, RefreshCw, Send, Share2 } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { deleteStoryComment, getStoryComments, getStoryMetrics, postStoryComment, reactToStory, recordStoryView, removeStoryReaction, sendStoryContextMessage, type StoryComment, type StoryMetrics } from "@/lib/community-story-client";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";
import { CommunityStoryRail } from "./CommunityStoryRail";
import { StoryShareSheet } from "./StoryShareSheet";
import { StoryElementLayer, storyEffectFilter, type StoryElement } from "./StoryElementLayer";

const MOMENTS_PAGE_SIZE = 12;

type MomentMedia = {
  id: number;
  media_type: "photo" | "video" | "audio";
  mime_type: string;
  media_url: string;
  duration_ms?: number | null;
};

type MomentElement = Omit<StoryElement, "id"> & { id: string | number };

type MomentSpark = {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  caption: string | null;
  audience: string;
  reply_enabled?: boolean;
  created_at: string | null;
  author: { id: number; name: string; avatar_url: string | null };
  media: MomentMedia[];
  elements?: MomentElement[];
  composition_manifest?: {
    version?: number;
    elements?: MomentElement[];
    effects?: string[];
  } | null;
};

type MomentPage = { stories?: MomentSpark[]; next_cursor?: string | null; viewer_user_id?: number; error?: string };

function hasCaptionOverlay(spark: MomentSpark): boolean {
  const elements = spark.composition_manifest?.elements?.length
    ? spark.composition_manifest.elements
    : spark.elements ?? [];
  return elements.some((element) => (
    element.type === "text"
    && typeof element.payload?.text === "string"
    && element.payload.text.trim().length > 0
  ));
}

async function fetchMomentPage(hubId: number | null, cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: String(MOMENTS_PAGE_SIZE) });
  if (hubId !== null) query.set("hubId", String(hubId));
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/community/stories?${query.toString()}`, {
    headers: authHeaders(),
    credentials: "same-origin",
    signal,
  });
  const payload = await response.json().catch(() => ({})) as MomentPage;
  if (!response.ok) throw new Error(payload.error || "Moments could not be loaded.");
  if (!Array.isArray(payload.stories)) throw new Error("The Moments service returned an invalid Spark list.");
  if (!Number.isSafeInteger(payload.viewer_user_id) || (payload.viewer_user_id ?? 0) < 1) {
    throw new Error("The Moments service did not identify the current viewer.");
  }
  return { stories: payload.stories, cursor: payload.next_cursor ?? null, viewerId: payload.viewer_user_id! };
}

/**
 * Authorized, cursor-paginated Sparks in a vertical, one-at-a-time playback
 * feed. The existing Story rail remains responsible for creation and its
 * existing story viewer; this surface is strictly read-only.
 */
export function CommunityMomentsExperience({
  hubId,
  openComposerSignal,
  openSparkId,
  compact = false,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openSparkId?: number | null;
  compact?: boolean;
}) {
  const [sparks, setSparks] = useState<MomentSpark[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [resolvedMediaKey, setResolvedMediaKey] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [mediaRetry, setMediaRetry] = useState(0);
  const [metricsById, setMetricsById] = useState<Record<number, StoryMetrics>>({});
  const [reactionPendingId, setReactionPendingId] = useState<number | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySendingId, setReplySendingId] = useState<number | null>(null);
  const [interactionError, setInteractionError] = useState("");
  const [shareSparkId, setShareSparkId] = useState<number | null>(null);
  const [commentsOpenId, setCommentsOpenId] = useState<number | null>(null);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentNotice, setCommentNotice] = useState("");
  const commentsDialogRef = useRef<HTMLElement | null>(null);
  const commentsTriggerRef = useRef<HTMLElement | null>(null);
  const commentsRequestRef = useRef<{ sequence: number; controller: AbortController | null }>({ sequence: 0, controller: null });
  const [feedInViewport, setFeedInViewport] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [videoMuted, setVideoMuted] = useState(true);
  const [, navigate] = useLocation();
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const feedRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const feedGenerationRef = useRef(0);
  const initialControllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const viewedIdsRef = useRef(new Set<number>());
  const activeSpark = sparks[activeIndex] ?? null;
  const commentsSpark = commentsOpenId == null ? null : sparks.find((spark) => spark.id === commentsOpenId) ?? null;
  const activeMedia = activeSpark?.media[Math.min(activeMediaIndex, Math.max(0, activeSpark.media.length - 1))] ?? null;
  const currentMediaUrl = resolvedMediaKey === `${activeSpark?.id}-${activeMedia?.id}` ? mediaUrl : null;
  const playbackAllowed = feedInViewport && documentVisible;
  const activeElements = activeSpark?.composition_manifest?.elements?.length
    ? activeSpark.composition_manifest.elements
    : activeSpark?.elements ?? [];
  const storyElements = activeElements.map((element, index): StoryElement => ({
    ...element,
    id: index,
    payload: element.payload ?? {},
  }));
  const backgroundElement = storyElements.find((element) => element.type === "background");
  const backgroundColor = typeof backgroundElement?.payload.color === "string"
    && /^#[0-9a-f]{6}$/i.test(backgroundElement.payload.color)
    ? backgroundElement.payload.color
    : undefined;
  const visualElements = storyElements.filter((element) => element.type !== "background");
  const mediaFilter = storyEffectFilter(storyElements);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [activeSpark?.id]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++feedGenerationRef.current;
    initialControllerRef.current?.abort();
    initialControllerRef.current = controller;
    moreControllerRef.current?.abort();
    setSparks([]);
    setCursor(null);
    setActiveIndex(0);
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setMetricsById({});
    setReplyOpenId(null);
    setReplyDraft("");
    setInteractionError("");
    viewedIdsRef.current.clear();
    void fetchMomentPage(hubId, null, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
        setSparks(page.stories);
        setCursor(page.cursor);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && generation === feedGenerationRef.current) {
          setError(reason instanceof Error ? reason.message : "Moments could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === feedGenerationRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [hubId, retry]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    const generation = feedGenerationRef.current;
    moreControllerRef.current?.abort();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fetchMomentPage(hubId, cursor, controller.signal);
      if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
      setSparks((current) => {
        const existing = new Set(current.map((spark) => spark.id));
        return [...current, ...page.stories.filter((spark) => !existing.has(spark.id))];
      });
      setCursor(page.cursor);
    } catch (reason: unknown) {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : "More Sparks could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) setLoadingMore(false);
    }
  }, [cursor, hubId, loadingMore]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root || !sparks.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = Number((visible.target as HTMLElement).dataset.momentIndex);
      if (Number.isInteger(index)) setActiveIndex(index);
    }, { root, threshold: [0.45, 0.65, 0.85] });
    cardRefs.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [sparks]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      setFeedInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.1);
      if (!visible) videoRef.current?.pause();
      setFeedInViewport(visible);
    }, { threshold: [0, 0.1] });
    observer.observe(root);
    return () => observer.disconnect();
  }, [sparks.length, loading]);

  useEffect(() => {
    const updateVisibility = () => {
      const visible = document.visibilityState !== "hidden";
      if (!visible) videoRef.current?.pause();
      setDocumentVisible(visible);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    setVideoMuted(true);
  }, [activeSpark?.id, activeMedia?.id]);

  useEffect(() => () => {
    initialControllerRef.current?.abort();
    moreControllerRef.current?.abort();
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!activeSpark || viewedIdsRef.current.has(activeSpark.id)) return;
    viewedIdsRef.current.add(activeSpark.id);
    trackCommunityContent("community_spark_viewed", {
      spark_id: activeSpark.id,
      ...(hubId === null ? {} : { hub_id: hubId }),
    });
    void recordStoryView(activeSpark.id).catch(() => {
      // Viewing remains available when analytics recording is temporarily down.
    });
  }, [activeSpark, hubId]);

  useEffect(() => {
    if (commentsOpenId == null) return;
    const dialog = commentsDialogRef.current;
    const focusable = () => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"))
      : [];
    const first = focusable()[0];
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCommentsOpenId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const current = document.activeElement;
      const index = elements.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || current === dialog)) {
        event.preventDefault(); elements[elements.length - 1]?.focus();
      } else if (!event.shiftKey && (index === elements.length - 1 || index === -1 || current === dialog)) {
        event.preventDefault(); elements[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      commentsRequestRef.current.controller?.abort();
      commentsRequestRef.current.controller = null;
      commentsTriggerRef.current?.focus();
    };
  }, [commentsOpenId]);

  const loadComments = useCallback(async (storyId: number) => {
    const sequence = commentsRequestRef.current.sequence + 1;
    commentsRequestRef.current.sequence = sequence;
    commentsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    commentsRequestRef.current.controller = controller;
    setCommentsLoading(true); setCommentsError("");
    try {
      const result = await getStoryComments(storyId, controller.signal);
      if (controller.signal.aborted || commentsRequestRef.current.sequence !== sequence) return;
      setComments(result.comments); setCommentsTotal(result.total);
      setMetricsById((current) => current[storyId]
        ? { ...current, [storyId]: { ...current[storyId], comment_count: result.total } }
        : current);
    } catch (reason) {
      if (controller.signal.aborted || commentsRequestRef.current.sequence !== sequence) return;
      setCommentsError(reason instanceof Error ? reason.message : "Comments could not be loaded.");
    } finally {
      if (commentsRequestRef.current.sequence === sequence) {
        commentsRequestRef.current.controller = null;
        setCommentsLoading(false);
      }
    }
  }, []);

  const openComments = (storyId: number) => {
    commentsTriggerRef.current = document.activeElement as HTMLElement | null;
    setCommentsOpenId(storyId); setCommentDraft(""); setCommentNotice("");
    setComments([]); setCommentsTotal(0);
    void loadComments(storyId);
  };

  const submitComment = async () => {
    if (commentsOpenId == null || !commentDraft.trim() || commentPosting) return;
    setCommentPosting(true); setCommentNotice(""); setCommentsError("");
    try {
      const result = await postStoryComment(commentsOpenId, commentDraft.trim());
      setCommentDraft("");
      if (result.moderation_pending) setCommentNotice("Your comment is awaiting moderation and is not public yet.");
      await loadComments(commentsOpenId);
    } catch (reason) {
      setCommentsError(reason instanceof Error ? reason.message : "Comment could not be posted.");
    } finally { setCommentPosting(false); }
  };

  const removeComment = async (commentId: number) => {
    if (commentsOpenId == null) return;
    try { await deleteStoryComment(commentsOpenId, commentId); await loadComments(commentsOpenId); }
    catch (reason) { setCommentsError(reason instanceof Error ? reason.message : "Comment could not be removed."); }
  };

  useEffect(() => {
    if (!activeSpark || metricsById[activeSpark.id]) return;
    let cancelled = false;
    void getStoryMetrics(activeSpark.id)
      .then((metrics) => {
        if (!cancelled) setMetricsById((current) => ({ ...current, [activeSpark.id]: metrics }));
      })
      .catch(() => {
        // Playback and browsing remain available when interaction counts are unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [activeSpark, metricsById]);

  useEffect(() => {
    if (!activeMedia || !playbackAllowed) {
      setMediaUrl(null);
      setResolvedMediaKey(null);
      setMediaError("");
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setMediaUrl(null);
    setResolvedMediaKey(null);
    setMediaError("");
    const resolveMedia = async () => {
      const reference = new URL(activeMedia.media_url, window.location.origin);
      const match = reference.pathname.match(/^\/api\/community\/stories\/media\/(\d+)\/?$/);
      const mediaId = Number(match?.[1]);
      if (reference.origin !== window.location.origin || reference.search || reference.hash
        || reference.username || reference.password || !Number.isSafeInteger(mediaId) || mediaId !== activeMedia.id) {
        throw new Error("This Spark does not have a valid authenticated media reference.");
      }
      if (activeMedia.media_type === "video") {
        const response = await fetch(`${reference.pathname.replace(/\/$/, "")}/playback-grant`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as { playback_url?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "Secure Spark playback could not be opened.");
        if (typeof payload.playback_url !== "string" || !payload.playback_url) {
          throw new Error("The playback service returned no video URL.");
        }
        const playback = new URL(payload.playback_url, window.location.origin);
        if (playback.origin !== window.location.origin || playback.search || playback.hash
          || playback.username || playback.password) {
          throw new Error("The playback URL must remain on Niakofa and contain no URL token.");
        }
        return payload.playback_url;
      }
      const response = await fetch(reference.pathname, {
        headers: authHeaders(),
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("This Spark image could not be loaded.");
      objectUrl = URL.createObjectURL(await response.blob());
      return objectUrl;
    };
    void resolveMedia()
      .then((url) => {
        if (!controller.signal.aborted) {
          setMediaUrl(url);
          setResolvedMediaKey(`${activeSpark?.id}-${activeMedia.id}`);
        }
        else if (objectUrl) URL.revokeObjectURL(objectUrl);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setMediaError(reason instanceof Error ? reason.message : "This Spark media could not be loaded.");
        }
      });
    const video = videoRef.current;
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [activeMedia, activeSpark?.id, mediaRetry, playbackAllowed]);

  useEffect(() => {
    if (openSparkId == null || loading) return;
    const index = sparks.findIndex((spark) => spark.id === openSparkId);
    if (index >= 0) {
      cardRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveIndex(index);
    } else if (cursor && !loadingMore && !error) {
      void loadMore();
    }
  }, [cursor, error, loadMore, loading, loadingMore, openSparkId, sparks]);

  const moveTo = (index: number) => {
    cardRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(index);
  };

  const toggleReaction = async (spark: MomentSpark) => {
    if (reactionPendingId !== null) return;
    setReactionPendingId(spark.id);
    setInteractionError("");
    try {
      const metrics = metricsById[spark.id] ?? await getStoryMetrics(spark.id);
      const reacted = Boolean(metrics.viewer_reaction);
      if (reacted) await removeStoryReaction(spark.id);
      else await reactToStory(spark.id);
      setMetricsById((current) => ({
        ...current,
        [spark.id]: {
          ...metrics,
          reactions: Math.max(0, metrics.reactions + (reacted ? -1 : 1)),
          viewer_reaction: reacted ? null : "💙",
        },
      }));
      trackCommunityContent("community_spark_reacted", {
        spark_id: spark.id,
        action: reacted ? "removed" : "added",
      });
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not update your reaction.");
    } finally {
      setReactionPendingId(null);
    }
  };

  const submitReply = async (spark: MomentSpark) => {
    const body = replyDraft.trim();
    if (!body || replySendingId !== null || spark.reply_enabled === false) return;
    setReplySendingId(spark.id);
    setInteractionError("");
    try {
      await sendStoryContextMessage({ recipientId: spark.author_user_id, storyId: spark.id, body });
      setReplyDraft("");
      setReplyOpenId(null);
      navigate(`/messages?mode=direct&recipientId=${spark.author_user_id}&storyId=${spark.id}`);
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not send your Spark reply.");
    } finally {
      setReplySendingId(null);
    }
  };

  return (
    <section className="space-y-4" aria-label={hubId === null ? "Community Moments" : "Hub Moments"} data-testid="community-moments-experience">
      {!compact && (
        <header className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">{hubId === null ? "Community" : "Hub"}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Moments</h1>
          <p className="mt-1 text-sm text-muted-foreground">A vertical feed of Sparks shared with you.</p>
        </header>
      )}

      <CommunityStoryRail
        hubId={hubId}
        openComposerSignal={openComposerSignal}
        compact
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Spark feed">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <p className="text-sm font-bold">Sparks shared with you</p>
          {!loading && sparks.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">Spark {activeIndex + 1} of {sparks.length}</span>
              <button type="button" onClick={() => moveTo(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Previous Spark" data-testid="button-previous-spark">
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => moveTo(Math.min(sparks.length - 1, activeIndex + 1))} disabled={activeIndex === sparks.length - 1} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Next Spark" data-testid="button-next-spark">
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm" role="alert" data-testid="status-moments-error">
            <span>{error}</span>
            <button type="button" onClick={() => sparks.length === 0 ? setRetry((value) => value + 1) : void loadMore()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-bold" data-testid="button-retry-moments">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        {interactionError && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-sm text-white" role="alert">
            <span>{interactionError}</span>
            <button type="button" onClick={() => setInteractionError("")} className="rounded-lg px-2 py-1 font-bold hover:bg-white/10" aria-label="Dismiss interaction error">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center p-8 text-sm text-muted-foreground" role="status" data-testid="status-loading-moments">
            <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading Sparks shared with you…</span>
          </div>
        ) : sparks.length === 0 && error ? (
          <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-muted-foreground" role="status">Moments could not be loaded. Retry the request to try again.</div>
        ) : sparks.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center" data-testid="status-empty-moments">
            <div><Play className="mx-auto h-8 w-8 text-primary" aria-hidden="true" /><h2 className="mt-3 font-black">No Sparks to show yet</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">New community Moments shared with you will appear here.</p></div>
          </div>
        ) : (
          <>
            <div
              ref={feedRef}
              className="mx-auto flex h-[min(78dvh,780px)] max-h-[780px] max-w-2xl snap-y snap-mandatory flex-col overflow-y-auto overscroll-contain bg-neutral-950 scroll-smooth"
              aria-label="Scroll vertically through Sparks"
              role="feed"
              aria-busy={loadingMore}
              data-testid="list-moments-feed"
            >
              {sparks.map((spark, index) => {
                const current = index === activeIndex;
                const itemIndex = current ? Math.min(activeMediaIndex, Math.max(0, spark.media.length - 1)) : 0;
                const media = spark.media[itemIndex];
                return (
                  <article
                    key={spark.id}
                    ref={(element) => {
                      if (element) cardRefs.current.set(index, element);
                      else cardRefs.current.delete(index);
                    }}
                    data-moment-index={index}
                    className="relative flex min-h-full w-full shrink-0 snap-start items-center justify-center overflow-hidden bg-neutral-950 text-white"
                    style={current && backgroundColor ? { backgroundColor } : undefined}
                    aria-label={`Spark ${index + 1} by ${spark.author.name || "a neighbor"}`}
                    aria-posinset={index + 1}
                    aria-setsize={cursor ? -1 : sparks.length}
                    data-testid={`card-moment-${spark.id}`}
                  >
                    {current && playbackAllowed && currentMediaUrl && media?.media_type === "video" && (
                      <video ref={videoRef} key={`${spark.id}-${media.id}`} src={currentMediaUrl} autoPlay muted={videoMuted} playsInline controls preload="metadata" className="absolute inset-0 h-full w-full object-contain" style={{ filter: mediaFilter }} aria-label={spark.caption || "Community Spark video"} onVolumeChange={(event) => setVideoMuted(event.currentTarget.muted)} onError={() => {
                        setMediaUrl(null);
                        setMediaError("The Spark video could not be played. Request a fresh playback link.");
                      }} />
                    )}
                    {current && playbackAllowed && currentMediaUrl && media?.media_type === "photo" && (
                      <img src={currentMediaUrl} alt={spark.caption ? `Spark from ${spark.author.name}: ${spark.caption}` : `Spark shared by ${spark.author.name}`} className="absolute inset-0 h-full w-full object-contain" style={{ filter: mediaFilter }} />
                    )}
                    {current && playbackAllowed && currentMediaUrl && media?.media_type === "audio" && (
                      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 p-8">
                        <div className="w-full max-w-md rounded-2xl bg-black/40 p-5 text-center">
                          <p className="mb-3 font-bold">Audio Moment</p>
                          <audio src={currentMediaUrl} controls preload="metadata" className="w-full" aria-label={spark.caption || `Audio Moment shared by ${spark.author.name}`} />
                        </div>
                      </div>
                    )}
                    {!media && (
                      <div className={`absolute inset-0 grid place-items-center ${backgroundColor ? "" : "bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950"} p-8 text-center`} style={backgroundColor ? { backgroundColor } : undefined}>
                        <div className="max-w-md"><Play className="mx-auto h-10 w-10 text-white/70" aria-hidden="true" />{spark.caption && !hasCaptionOverlay(spark) && <p className="mt-4 text-xl font-semibold leading-relaxed sm:text-2xl">{spark.caption}</p>}</div>
                      </div>
                    )}
                    {current && visualElements.length > 0 && <StoryElementLayer elements={visualElements} />}
                    {current && !playbackAllowed && media && (
                      <div className="absolute inset-0 grid place-items-center text-sm text-white/80" role="status">Playback paused while Moments are offscreen or this tab is hidden.</div>
                    )}
                    {current && playbackAllowed && !currentMediaUrl && media && !mediaError && (
                      <div className="absolute inset-0 grid place-items-center text-sm text-white/80" role="status"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Opening Spark media…</div>
                    )}
                    {current && mediaError && (
                      <div className="absolute left-4 right-4 top-4 z-20 rounded-xl border border-white/20 bg-black/80 p-3 text-sm text-white" role="alert" data-testid="status-spark-media-error">
                        <p>{mediaError}</p>
                        <button type="button" onClick={() => { setMediaError(""); setMediaRetry((value) => value + 1); }} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-white" data-testid="button-retry-spark-media"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry video</button>
                      </div>
                    )}
                    {current && media?.media_type === "video" && currentMediaUrl && playbackAllowed && (
                      <button type="button" onClick={() => setVideoMuted((muted) => !muted)} className="absolute right-4 top-4 z-20 min-h-11 rounded-full bg-black/75 px-4 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-white" aria-label={videoMuted ? "Turn Spark sound on" : "Mute Spark sound"} aria-pressed={!videoMuted} data-testid={`button-moment-sound-${spark.id}`}>
                        {videoMuted ? "Turn sound on" : "Mute sound"}
                      </button>
                    )}
                    {current && spark.media.length > 1 && (
                      <div className="absolute inset-x-4 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between" aria-label="Moment attachments">
                        <button type="button" onClick={() => setActiveMediaIndex((value) => Math.max(0, value - 1))} disabled={activeMediaIndex <= 0} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-white" aria-label="Show previous attachment" data-testid={`button-moment-media-previous-${spark.id}`}>
                          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                        </button>
                        <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white" aria-live="polite" data-testid={`status-moment-media-index-${spark.id}`}>{itemIndex + 1} of {spark.media.length}</span>
                        <button type="button" onClick={() => setActiveMediaIndex((value) => Math.min(spark.media.length - 1, value + 1))} disabled={activeMediaIndex >= spark.media.length - 1} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-white" aria-label="Show next attachment" data-testid={`button-moment-media-next-${spark.id}`}>
                          <ChevronRight className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5 pt-28 text-white sm:p-7 sm:pt-32">
                      <p className="text-sm font-black">{spark.author.name || "A neighbor"}</p>
                      {spark.audience === "hub" && <p className="mt-1 text-xs font-semibold text-white/75">Hub Spark</p>}
                      {spark.caption && media && <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed sm:text-base">{spark.caption}</p>}
                    </div>
                    {current && (
                      <div className="absolute inset-x-4 bottom-4 z-20 flex flex-col items-end gap-2 text-white sm:inset-x-6">
                        {replyOpenId === spark.id && (
                          <form
                            className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/15 bg-black/80 p-2 shadow-xl backdrop-blur"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitReply(spark);
                            }}
                          >
                            <input
                              value={replyDraft}
                              onChange={(event) => setReplyDraft(event.target.value)}
                              maxLength={500}
                              autoFocus
                              placeholder={spark.reply_enabled === false ? "Replies are off" : "Reply to this Spark…"}
                              disabled={spark.reply_enabled === false || replySendingId === spark.id}
                              className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/55 focus:border-primary"
                              aria-label="Reply to Spark"
                            />
                            <button type="submit" disabled={!replyDraft.trim() || spark.reply_enabled === false || replySendingId === spark.id} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send reply">
                              {replySendingId === spark.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                          </form>
                        )}
                        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-2 py-1.5 shadow-xl backdrop-blur">
                          <button
                            type="button"
                            onClick={() => void toggleReaction(spark)}
                            disabled={reactionPendingId === spark.id}
                            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors ${metricsById[spark.id]?.viewer_reaction ? "bg-rose-500/25 text-rose-100" : "text-white hover:bg-white/10"}`}
                            aria-label={metricsById[spark.id]?.viewer_reaction ? "Remove reaction from Spark" : "React to Spark"}
                            aria-pressed={Boolean(metricsById[spark.id]?.viewer_reaction)}
                          >
                            {reactionPendingId === spark.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${metricsById[spark.id]?.viewer_reaction ? "fill-current" : ""}`} />}
                            <span>{metricsById[spark.id]?.reactions ?? 0}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openComments(spark.id)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white hover:bg-white/10"
                            aria-label={`View comments for Spark${metricsById[spark.id]?.comment_count ? `, ${metricsById[spark.id]?.comment_count} comments` : ""}`}
                            data-testid={`button-spark-comments-${spark.id}`}
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span>{metricsById[spark.id]?.comment_count ?? 0}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyOpenId((current) => current === spark.id ? null : spark.id);
                              setReplyDraft("");
                              setInteractionError("");
                            }}
                            disabled={spark.reply_enabled === false}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                            aria-label={spark.reply_enabled === false ? "Replies are off" : "Reply to Spark"}
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span>Reply</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShareSparkId(spark.id)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white hover:bg-white/10"
                            aria-label="Share Spark"
                          >
                            <Share2 className="h-4 w-4" />
                            <span>{metricsById[spark.id]?.shares ?? 0}</span>
                          </button>
                          <span className="inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-bold text-white/70" aria-label={`${metricsById[spark.id]?.views ?? 0} views`}>
                            <Eye className="h-4 w-4" />
                            <span>{metricsById[spark.id]?.views ?? 0}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {cursor && (
              <div className="flex justify-center p-4">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-60" data-testid="button-load-more-moments">
                  {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {loadingMore ? "Loading Sparks…" : "Load more Sparks"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">Only media for the Spark in view is opened. Videos start muted, and secure playback is authorized for your account.</p>
      {shareSparkId !== null && (
        <StoryShareSheet
          storyId={shareSparkId}
          onClose={() => setShareSparkId(null)}
          onShared={() => setMetricsById((current) => {
            const metrics = current[shareSparkId];
            return metrics ? { ...current, [shareSparkId]: { ...metrics, shares: metrics.shares + 1 } } : current;
          })}
        />
      )}
      {commentsSpark && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="spark-comments-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentsOpenId(null); }}>
          <section ref={commentsDialogRef} tabIndex={-1} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl" data-testid="spark-comments-panel">
            <div className="flex items-center justify-between gap-3">
              <h2 id="spark-comments-title" className="text-lg font-black">Comments <span className="text-sm font-normal text-muted-foreground">({commentsTotal})</span></h2>
              <button type="button" onClick={() => setCommentsOpenId(null)} className="min-h-10 rounded-lg px-3 font-bold hover:bg-muted" aria-label="Close comments">Close</button>
            </div>
            {commentsError && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert"><span>{commentsError}</span><button type="button" onClick={() => void loadComments(commentsSpark.id)} className="font-bold underline">Retry</button></div>}
            {commentNotice && <p className="mt-3 rounded-lg bg-primary/10 p-3 text-sm" role="status" aria-live="polite">{commentNotice}</p>}
            {commentsLoading ? <p className="grid min-h-24 place-items-center text-sm text-muted-foreground" role="status">Loading comments…</p>
              : comments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No public comments yet. Start the conversation.</p>
              : <ul className="mt-3 space-y-3" aria-live="polite">{comments.map((comment) => <li key={comment.id} className="rounded-xl bg-muted/50 p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-bold">{comment.author.name}</p>{comment.viewer_can_delete && <button type="button" onClick={() => void removeComment(comment.id)} className="text-xs font-bold text-destructive underline" aria-label={`Delete comment by ${comment.author.name}`}>Delete</button>}</div><p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p></li>)}</ul>}
            <form className="mt-4 flex gap-2 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); void submitComment(); }}>
              <label className="sr-only" htmlFor="spark-comment-input">Write a public comment</label>
              <input id="spark-comment-input" autoFocus value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={500} placeholder="Write a public comment…" disabled={commentPosting} className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" aria-describedby="spark-comment-status" />
              <button type="submit" disabled={!commentDraft.trim() || commentPosting} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Post public comment">{commentPosting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </form>
            <p id="spark-comment-status" className="mt-2 text-xs text-muted-foreground">Comments are public to people who can view this Spark.</p>
          </section>
        </div>
      )}
    </section>
  );
}