import "./community-moments-experience.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetCommunityStoryMutedAuthorsQueryKey,
  getGetDirectMessageBlockedUsersQueryKey,
  useBlockDirectMessageUser,
  useGetCommunityStoryMutedAuthors,
  useGetDirectMessageBlockedUsers,
  useMuteCommunityStoryAuthor,
  useUnblockDirectMessageUser,
  useUnmuteCommunityStoryAuthor,
} from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, BookHeart, ChevronLeft, ChevronRight, Eye, Flag, Heart, LoaderCircle, Maximize2, MessageCircle, Minimize2, MoreHorizontal, Play, Plus, RefreshCw, Send, Share2, VolumeX, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { deleteStoryComment, getStoryComments, getStoryMetrics, postStoryComment, reactToStory, recordStoryView, removeStoryReaction, sendStoryContextMessage, type StoryComment, type StoryMetrics } from "@/lib/community-story-client";
import { createCommunityStoryWatchContribution, MAX_COMMUNITY_STORY_WATCH_CONTRIBUTION_MS, postCommunityStoryWatchContribution, type CommunityStoryWatchContribution } from "@/lib/communityStoryWatchClient";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";
import { ReportModal } from "@/components/ReportModal";
import { CommunityStoryRail } from "./CommunityStoryRail";
import { CreatorInsightsPanel } from "./CreatorInsightsPanel";
import { StoryShareSheet } from "./StoryShareSheet";
import { validateMomentCompositionPlaybackUrl } from "./story-studio-publish";
import { StoryElementLayer, storyEffectFilter, type StoryElement } from "./StoryElementLayer";
import { KeepForMyFamilyDialog } from "@/components/family/KeepForMyFamilyDialog";
import { getWeeklyMomentChallenge } from "@/lib/community-moments-collection-client";

const MOMENTS_PAGE_SIZE = 12;

type MomentMedia = {
  id: number;
  media_type: "photo" | "video" | "audio";
  mime_type: string;
  media_url: string;
  duration_ms?: number | null;
  alt_text?: string | null;
  captions_vtt?: string | null;
  isMomentReel?: boolean;
};

type MomentElement = Omit<StoryElement, "id"> & { id: string | number };

type MomentSpark = {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  caption: string | null;
  tags?: string[];
  audience: string;
  reply_enabled?: boolean;
  created_at: string | null;
  expires_at?: string | null;
  community_id?: number | null;
  featured_at?: string | null;
  archive_enabled?: boolean;
  remix_enabled?: boolean;
  response_to_story_id?: number | null;
  response_to?: { story_id: number | null; author_user_id: number | null; author_name: string | null } | null;
  challenge_key?: string | null;
  challenge?: { key: string; prompt: string } | null;
  author: { id: number; name: string; avatar_url: string | null };
  media: MomentMedia[];
  moment_video?: {
    status: string;
    duration_ms?: number | null;
    playback_grant_url: string;
  } | null;
  elements?: MomentElement[];
  composition_manifest?: {
    version?: number;
    elements?: MomentElement[];
    effects?: string[];
  } | null;
};

type MomentPage = { stories?: MomentSpark[]; next_cursor?: string | null; viewer_user_id?: number; error?: string };

type WatchPlaybackState = {
  storyId: number;
  mediaId: number;
  lastMediaTime: number | null;
  seeking: boolean;
  accumulatedMs: number;
};

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

type MomentDiscoveryFilters = { search: string; tag: string; authorId: string };

async function fetchMomentPage(
  hubId: number | null,
  cursor: string | null,
  signal: AbortSignal,
  filters: MomentDiscoveryFilters,
) {
  const query = new URLSearchParams({ limit: String(MOMENTS_PAGE_SIZE) });
  if (hubId !== null) query.set("hubId", String(hubId));
  if (cursor) query.set("cursor", cursor);
  if (filters.search) query.set("search", filters.search);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.authorId) query.set("authorId", filters.authorId);
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
  fullBleed = false,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openSparkId?: number | null;
  compact?: boolean;
  fullBleed?: boolean;
}) {
  const [sparks, setSparks] = useState<MomentSpark[]>([]);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [authorInput, setAuthorInput] = useState("");
  const [discoveryFilters, setDiscoveryFilters] = useState<MomentDiscoveryFilters>({ search: "", tag: "", authorId: "" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [momentVideoStates, setMomentVideoStates] = useState<Record<number, { status: string; failureCode: string | null; playbackGrantUrl: string }>>({});
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [resolvedMediaKey, setResolvedMediaKey] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [mediaRetry, setMediaRetry] = useState(0);
  const [captionsTrackUrl, setCaptionsTrackUrl] = useState<string | null>(null);
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
  const [reportSparkId, setReportSparkId] = useState<number | null>(null);
  const [actionMenuSparkId, setActionMenuSparkId] = useState<number | null>(null);
  const [moderationPendingAuthorId, setModerationPendingAuthorId] = useState<number | null>(null);
  const [moderationNotice, setModerationNotice] = useState("");
  const [mutedAuthorsOpen, setMutedAuthorsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [blockPendingAuthorId, setBlockPendingAuthorId] = useState<number | null>(null);
  const [keepMomentId, setKeepMomentId] = useState<number | null>(null);
  const [creatorInsightsOpen, setCreatorInsightsOpen] = useState(false);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(() => fullBleed && (openComposerSignal ?? 0) > 0);
  const [composerActionSignal, setComposerActionSignal] = useState(0);
  const [responseToStoryId, setResponseToStoryId] = useState<number | null>(null);
  const [challengeKey, setChallengeKey] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const weeklyChallengeQuery = useQuery({
    queryKey: ["community-moments-challenge", hubId],
    queryFn: ({ signal }) => getWeeklyMomentChallenge(hubId, signal),
    refetchOnMount: "always",
    staleTime: 60_000,
  });
  const mutedAuthorsQuery = useGetCommunityStoryMutedAuthors({
    query: {
      enabled: mutedAuthorsOpen,
      queryKey: getGetCommunityStoryMutedAuthorsQueryKey(),
    },
    request: { headers: authHeaders() },
  });
  const blockedUsersQuery = useGetDirectMessageBlockedUsers({
    query: {
      enabled: blockedUsersOpen,
      queryKey: getGetDirectMessageBlockedUsersQueryKey(),
    },
    request: { headers: authHeaders() },
  });
  const muteAuthorMutation = useMuteCommunityStoryAuthor({ request: { headers: authHeaders() } });
  const unmuteAuthorMutation = useUnmuteCommunityStoryAuthor({ request: { headers: authHeaders() } });
  const blockUserMutation = useBlockDirectMessageUser({ request: { headers: authHeaders() } });
  const unblockUserMutation = useUnblockDirectMessageUser({ request: { headers: authHeaders() } });

  useEffect(() => {
    const refresh = () => {
      setRetry((value) => value + 1);
      void queryClient.invalidateQueries({ queryKey: ["community-moments-challenge"] });
    };
    window.addEventListener("community-moments-refresh", refresh);
    return () => window.removeEventListener("community-moments-refresh", refresh);
  }, [queryClient]);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const feedRef = useRef<HTMLDivElement>(null);
  const feedPanelRef = useRef<HTMLElement | null>(null);
  const fullScreenToggleRef = useRef<HTMLButtonElement | null>(null);
  const fullScreenReturnFocusRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watchPlaybackRef = useRef<WatchPlaybackState | null>(null);
  const pendingWatchContributionsRef = useRef<CommunityStoryWatchContribution[]>([]);
  const sendingWatchContributionsRef = useRef(false);
  const feedGenerationRef = useRef(0);
  const initialControllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const viewedIdsRef = useRef(new Set<number>());
  const activeSpark = sparks[activeIndex] ?? null;
  const shareSpark = shareSparkId === null
    ? null
    : sparks.find((spark) => spark.id === shareSparkId) ?? null;
  const reportSpark = reportSparkId === null ? null : sparks.find((spark) => spark.id === reportSparkId) ?? null;
  const commentsSpark = commentsOpenId == null ? null : sparks.find((spark) => spark.id === commentsOpenId) ?? null;
  const fullScreenOverlayOpen = commentsOpenId !== null
    || reportSparkId !== null
    || shareSparkId !== null
    || mutedAuthorsOpen
    || blockedUsersOpen
    || keepMomentId !== null;
  const activeMomentVideoState = useMemo(() => activeSpark?.moment_video
    ? momentVideoStates[activeSpark.id] ?? {
      status: activeSpark.moment_video.status,
      failureCode: null,
      playbackGrantUrl: activeSpark.moment_video.playback_grant_url,
    }
    : null, [activeSpark, momentVideoStates]);
  const activeMedia = useMemo<MomentMedia | null>(() => activeSpark?.moment_video && activeMomentVideoState?.status === "ready"
    ? {
      id: activeSpark.id,
      media_type: "video",
      mime_type: "video/mp4",
      media_url: activeMomentVideoState?.playbackGrantUrl ?? activeSpark.moment_video.playback_grant_url,
      duration_ms: activeSpark.moment_video.duration_ms ?? null,
      alt_text: `${activeSpark.media.length === 1 ? "Camera video" : `Stitched camera reel with ${activeSpark.media.length} original clips`}. ${activeSpark.media.map((item, index) => `Clip ${index + 1}: ${item.alt_text?.trim() || "No alternative text supplied."}`).join(" ")}`,
      isMomentReel: true,
    }
    : activeSpark?.media[Math.min(activeMediaIndex, Math.max(0, activeSpark.media.length - 1))] ?? null,
  [activeMediaIndex, activeMomentVideoState, activeSpark]);
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
    if (!fullScreenOpen && !fullBleed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullBleed, fullScreenOpen]);

  useEffect(() => {
    if (fullBleed && (openComposerSignal ?? 0) > 0) setContextPanelOpen(true);
  }, [fullBleed, openComposerSignal]);

  useEffect(() => {
    if (!fullScreenOpen) {
      const returnTarget = fullScreenReturnFocusRef.current;
      fullScreenReturnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
      return;
    }
    fullScreenToggleRef.current?.focus();
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const onKeyDown = (event: KeyboardEvent) => {
      if (fullScreenOverlayOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setFullScreenOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = feedPanelRef.current;
      const feedBounds = feedRef.current?.getBoundingClientRect();
      const focusable = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
          if (!feedBounds) return true;
          const card = element.closest<HTMLElement>("[data-moment-index]");
          if (!card) return true;
          const bounds = card.getBoundingClientRect();
          return bounds.top < feedBounds.bottom && bounds.bottom > feedBounds.top;
        })
        : [];
      if (!focusable.length) return;
      const current = document.activeElement;
      const index = focusable.indexOf(current as HTMLElement);
      if (event.shiftKey && (index <= 0 || current === panel)) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
      } else if (!event.shiftKey && (index === focusable.length - 1 || index === -1 || current === panel)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fullScreenOpen, fullScreenOverlayOpen]);

  const drainWatchContributions = useCallback(async () => {
    if (sendingWatchContributionsRef.current) return;
    sendingWatchContributionsRef.current = true;
    try {
      while (pendingWatchContributionsRef.current.length > 0) {
        const contribution = pendingWatchContributionsRef.current[0];
        try {
          await postCommunityStoryWatchContribution(contribution);
          if (pendingWatchContributionsRef.current[0] === contribution) {
            pendingWatchContributionsRef.current.shift();
          }
        } catch {
          // Keep the same event UUID queued; a later playback boundary retries it.
          break;
        }
      }
    } finally {
      sendingWatchContributionsRef.current = false;
    }
  }, []);

  const flushWatchContribution = useCallback((storyId: number, mediaId: number, completed = false) => {
    const playback = watchPlaybackRef.current;
    if (!playback || playback.storyId !== storyId || playback.mediaId !== mediaId) return;
    const durationMs = Math.min(
      MAX_COMMUNITY_STORY_WATCH_CONTRIBUTION_MS,
      Math.floor(playback.accumulatedMs),
    );
    playback.accumulatedMs = 0;
    playback.lastMediaTime = null;
    if (durationMs > 0 || completed) {
      try {
        pendingWatchContributionsRef.current.push(
          createCommunityStoryWatchContribution(storyId, durationMs, completed),
        );
      } catch {
        // Analytics is fail-open; playback must remain unaffected if UUID generation is unavailable.
      }
    }
    void drainWatchContributions();
  }, [drainWatchContributions]);

  const startWatchPlayback = useCallback((
    storyId: number,
    mediaId: number,
    authorId: number,
    currentTime: number,
  ) => {
    const previous = watchPlaybackRef.current;
    if (previous && (previous.storyId !== storyId || previous.mediaId !== mediaId)) {
      flushWatchContribution(previous.storyId, previous.mediaId);
    }
    if (authorId === viewerId) {
      watchPlaybackRef.current = null;
      return;
    }
    const current = watchPlaybackRef.current;
    if (current?.storyId === storyId && current.mediaId === mediaId) {
      current.lastMediaTime = currentTime;
      current.seeking = false;
      return;
    }
    watchPlaybackRef.current = {
      storyId,
      mediaId,
      lastMediaTime: currentTime,
      seeking: false,
      accumulatedMs: 0,
    };
  }, [flushWatchContribution, viewerId]);

  const accumulateWatchTime = useCallback((
    storyId: number,
    mediaId: number,
    video: HTMLVideoElement,
    includeFinalFrame = false,
  ) => {
    const playback = watchPlaybackRef.current;
    if (!playback || playback.storyId !== storyId || playback.mediaId !== mediaId || playback.seeking) return;
    if (video.paused && !includeFinalFrame) return;
    const currentTime = video.currentTime;
    if (!Number.isFinite(currentTime)) return;
    const previousTime = playback.lastMediaTime;
    playback.lastMediaTime = currentTime;
    if (previousTime === null) return;
    const deltaMs = (currentTime - previousTime) * 1000;
    // Ignore seeks and playback gaps; timeupdate only accumulates media time and
    // never sends a request itself.
    if (deltaMs > 0 && deltaMs <= 5000) {
      playback.accumulatedMs = Math.min(
        MAX_COMMUNITY_STORY_WATCH_CONTRIBUTION_MS,
        playback.accumulatedMs + deltaMs,
      );
    }
  }, []);

  const flushCurrentWatchContribution = useCallback(() => {
    const playback = watchPlaybackRef.current;
    const video = videoRef.current;
    if (!playback) return;
    if (video) accumulateWatchTime(playback.storyId, playback.mediaId, video, true);
    flushWatchContribution(playback.storyId, playback.mediaId);
  }, [accumulateWatchTime, flushWatchContribution]);

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
    setMomentVideoStates({});
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
    void fetchMomentPage(hubId, null, controller.signal, discoveryFilters)
      .then((page) => {
        if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
        setViewerId(page.viewerId);
        setSparks(page.stories);
        setMomentVideoStates(Object.fromEntries(page.stories.flatMap((spark) => spark.moment_video ? [[spark.id, {
          status: spark.moment_video.status,
          failureCode: null,
          playbackGrantUrl: spark.moment_video.playback_grant_url,
        }]] : [])));
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
  }, [discoveryFilters, hubId, retry]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    const generation = feedGenerationRef.current;
    moreControllerRef.current?.abort();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fetchMomentPage(hubId, cursor, controller.signal, discoveryFilters);
      if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
      setSparks((current) => {
        const existing = new Set(current.map((spark) => spark.id));
        return [...current, ...page.stories.filter((spark) => !existing.has(spark.id))];
      });
      setMomentVideoStates((current) => {
        const next = { ...current };
        page.stories.forEach((spark) => {
          if (spark.moment_video && !next[spark.id]) next[spark.id] = {
            status: spark.moment_video.status,
            failureCode: null,
            playbackGrantUrl: spark.moment_video.playback_grant_url,
          };
        });
        return next;
      });
      setCursor(page.cursor);
    } catch (reason: unknown) {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : "More Sparks could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) setLoadingMore(false);
    }
  }, [cursor, discoveryFilters, hubId, loadingMore]);

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
      if (!visible) {
        flushCurrentWatchContribution();
        videoRef.current?.pause();
      }
      setFeedInViewport(visible);
    }, { threshold: [0, 0.1] });
    observer.observe(root);
    return () => observer.disconnect();
  }, [flushCurrentWatchContribution, sparks.length, loading]);

  useEffect(() => {
    const updateVisibility = () => {
      const visible = document.visibilityState !== "hidden";
      if (!visible) {
        flushCurrentWatchContribution();
        videoRef.current?.pause();
      }
      setDocumentVisible(visible);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, [flushCurrentWatchContribution]);

  useEffect(() => {
    setVideoMuted(true);
  }, [activeSpark?.id, activeMedia?.id]);

  useEffect(() => () => {
    initialControllerRef.current?.abort();
    moreControllerRef.current?.abort();
    flushCurrentWatchContribution();
    videoRef.current?.pause();
  }, [flushCurrentWatchContribution]);

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
    const commentsRequest = commentsRequestRef.current;
    const requestController = commentsRequest.controller;
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      requestController?.abort();
      if (commentsRequest.controller === requestController) commentsRequest.controller = null;
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
    if (activeMedia.isMomentReel && activeMomentVideoState?.status !== "ready") return () => controller.abort();
    const resolveMedia = async () => {
      const reference = new URL(activeMedia.media_url, window.location.origin);
      if (activeMedia.isMomentReel) {
        const expectedGrant = `/api/community/stories/${activeSpark?.id}/moment-composition/playback-grant`;
        if (reference.origin !== window.location.origin || reference.pathname !== expectedGrant
          || reference.search || reference.hash || reference.username || reference.password) {
          throw new Error("This Spark does not have a valid camera reel playback grant.");
        }
        const grantResponse = await fetch(reference.pathname, {
          method: "POST",
          headers: authHeaders(),
          credentials: "same-origin",
          signal: controller.signal,
        });
        const grant = await grantResponse.json().catch(() => ({})) as { playback_url?: string; error?: string };
        if (!grantResponse.ok || typeof grant.playback_url !== "string") {
          throw new Error(grant.error || "Secure camera reel playback could not be opened.");
        }
        return validateMomentCompositionPlaybackUrl(grant.playback_url, activeSpark.id, window.location.origin);
      }
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
      flushCurrentWatchContribution();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [activeMedia, activeMomentVideoState?.status, activeSpark?.id, flushCurrentWatchContribution, mediaRetry, playbackAllowed]);

  useEffect(() => {
    const cues = activeMedia?.captions_vtt?.trim();
    if (!cues) {
      setCaptionsTrackUrl(null);
      return;
    }
    const trackUrl = URL.createObjectURL(new Blob([cues], { type: "text/vtt;charset=utf-8" }));
    setCaptionsTrackUrl(trackUrl);
    return () => URL.revokeObjectURL(trackUrl);
  }, [activeMedia?.captions_vtt]);

  useEffect(() => {
    const spark = activeSpark;
    const state = activeMomentVideoState;
    if (!spark?.moment_video || !playbackAllowed || !state || state.status === "ready") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    if (state.status === "failed") {
      void fetch(`/api/community/stories/${spark.id}/moment-composition`, {
        headers: authHeaders(),
        credentials: "same-origin",
        signal: controller.signal,
      }).then((response) => response.json().catch(() => ({}))).then((result: unknown) => {
        if (!active || !result || typeof result !== "object") return;
        const composition = (result as { composition?: { status?: string; failure_code?: string | null } }).composition;
        if (composition?.status === "failed") setMomentVideoStates((current) => ({
          ...current,
          [spark.id]: { ...current[spark.id], status: "failed", failureCode: composition.failure_code ?? null },
        }));
      }).catch(() => {});
      return () => { active = false; controller.abort(); };
    }
    const refresh = async () => {
      try {
        const response = await fetch(`/api/community/stories/${spark.id}/moment-composition`, {
          headers: authHeaders(),
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as {
          error?: string;
          composition?: { status?: string; failure_code?: string | null; duration_ms?: number | null; playback_grant_url?: string };
        };
        const composition = result.composition;
        if (!response.ok || !composition || typeof composition.status !== "string"
          || composition.playback_grant_url !== `/api/community/stories/${spark.id}/moment-composition/playback-grant`) {
          throw new Error(result.error || "Camera reel status could not be confirmed.");
        }
        if (!active) return;
        setMomentVideoStates((current) => ({
          ...current,
          [spark.id]: {
            status: composition.status!,
            failureCode: composition.failure_code ?? null,
            playbackGrantUrl: composition.playback_grant_url!,
          },
        }));
        if (composition.status !== "ready" && composition.status !== "failed") {
          timer = setTimeout(() => { void refresh(); }, 2000);
        }
      } catch {
        if (active && !controller.signal.aborted) timer = setTimeout(() => { void refresh(); }, 3000);
      }
    };
    timer = setTimeout(() => { void refresh(); }, 1200);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [activeMomentVideoState, activeSpark, playbackAllowed]);

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

  const muteAuthor = async (spark: MomentSpark) => {
    if (moderationPendingAuthorId !== null || spark.author_user_id === viewerId) return;
    setModerationPendingAuthorId(spark.author_user_id);
    setInteractionError("");
    try {
      await muteAuthorMutation.mutateAsync({ id: spark.author_user_id });
      await queryClient.invalidateQueries({ queryKey: getGetCommunityStoryMutedAuthorsQueryKey() });
      setActionMenuSparkId(null);
      setModerationNotice(`Moments from ${spark.author.name || "this author"} are now hidden.`);
      setRetry((value) => value + 1);
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not mute this author.");
    } finally {
      setModerationPendingAuthorId(null);
    }
  };

  const unmuteAuthor = async (authorId: number) => {
    if (moderationPendingAuthorId !== null) return;
    setModerationPendingAuthorId(authorId);
    setInteractionError("");
    try {
      await unmuteAuthorMutation.mutateAsync({ id: authorId });
      await queryClient.invalidateQueries({ queryKey: getGetCommunityStoryMutedAuthorsQueryKey() });
      setRetry((value) => value + 1);
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not restore this author's Moments.");
    } finally {
      setModerationPendingAuthorId(null);
    }
  };

  const blockAuthor = async (spark: MomentSpark) => {
    const authorId = spark.author_user_id;
    if (blockPendingAuthorId !== null || authorId === viewerId) return;
    const authorName = spark.author.name || "this author";
    if (!window.confirm(`Block ${authorName}? Blocking also prevents direct messages between you and this account.`)) return;
    setBlockPendingAuthorId(authorId);
    setInteractionError("");
    try {
      await blockUserMutation.mutateAsync({ id: authorId });
      await queryClient.invalidateQueries({ queryKey: getGetDirectMessageBlockedUsersQueryKey() });
      const remaining = sparks.filter((item) => item.author_user_id !== authorId);
      const removedBeforeActive = sparks.slice(0, activeIndex).filter((item) => item.author_user_id === authorId).length;
      setSparks(remaining);
      setActiveIndex(Math.min(Math.max(0, activeIndex - removedBeforeActive), Math.max(0, remaining.length - 1)));
      setActionMenuSparkId(null);
      setModerationNotice(`${authorName} was blocked. Their Moments were removed from this feed.`);
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not block this author.");
    } finally {
      setBlockPendingAuthorId(null);
    }
  };

  const unblockUser = async (userId: number) => {
    if (blockPendingAuthorId !== null) return;
    setBlockPendingAuthorId(userId);
    setInteractionError("");
    try {
      await unblockUserMutation.mutateAsync({ id: userId });
      await queryClient.invalidateQueries({ queryKey: getGetDirectMessageBlockedUsersQueryKey() });
    } catch (reason) {
      setInteractionError(reason instanceof Error ? reason.message : "Could not unblock this account.");
    } finally {
      setBlockPendingAuthorId(null);
    }
  };

  return (
    <section
      className={`nia-moments ${fullBleed ? "nia-moments--fullbleed" : "space-y-4"}`}
      aria-label={hubId === null ? "Community Moments" : "Hub Moments"}
      data-testid="community-moments-experience"
      data-fullbleed={fullBleed ? "true" : "false"}
    >
      {fullBleed && contextPanelOpen && (
        <button
          type="button"
          className="nia-moments__context-backdrop"
          aria-label="Close community tools"
          onClick={() => setContextPanelOpen(false)}
        />
      )}
      <aside
        id="moment-context-panel"
        className="nia-moments__context"
        data-open={contextPanelOpen ? "true" : "false"}
        aria-label="Community Moments tools"
      >
        {!compact && (
          <header className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">{hubId === null ? "Community" : "Hub"}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Moments</h1>
              <p className="mt-1 text-sm text-muted-foreground">A vertical feed of Sparks shared with you.</p>
            </div>
            {fullBleed && (
              <button
                type="button"
                className="nia-moments__context-close"
                onClick={() => setContextPanelOpen(false)}
                aria-label="Close community tools"
                data-testid="button-close-moment-context"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </header>
        )}

        <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 sm:p-5" aria-label="Weekly community prompt" data-testid="card-weekly-moment-prompt">
        <div className="absolute -right-8 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
        {weeklyChallengeQuery.isLoading ? (
          <div className="animate-pulse" role="status" aria-label="Loading this week’s prompt"><div className="h-3 w-28 rounded bg-muted" /><div className="mt-3 h-5 w-2/3 rounded bg-muted" /></div>
        ) : weeklyChallengeQuery.isError ? (
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">This week in your Community</p><p className="mt-1 text-sm text-muted-foreground">The weekly prompt could not load.</p></div>
            <button type="button" onClick={() => void weeklyChallengeQuery.refetch()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted" data-testid="button-retry-weekly-prompt"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry</button>
          </div>
        ) : weeklyChallengeQuery.data?.challenge ? (
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[.15em] text-primary">A small prompt for the week</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-xl" data-testid="text-weekly-prompt">{weeklyChallengeQuery.data.challenge.prompt}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{weeklyChallengeQuery.data.challenge.participant_count} neighbors have a live Moment for this prompt</p>
            </div>
            <button type="button" onClick={() => { setResponseToStoryId(null); setChallengeKey(weeklyChallengeQuery.data!.challenge.key); setComposerActionSignal((value) => value + 1); }} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-105" data-testid="button-join-weekly-prompt">Share your Moment</button>
          </div>
        ) : (
          <p className="relative text-sm text-muted-foreground">There is no active community prompt right now.</p>
        )}
        </section>

        <CommunityStoryRail
          hubId={hubId}
          openComposerSignal={openComposerSignal}
          additionalComposerSignal={composerActionSignal}
          responseToStoryId={responseToStoryId}
          challengeKey={challengeKey}
          compact
        />

        <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Creator analytics">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            aria-expanded={creatorInsightsOpen}
            onClick={() => setCreatorInsightsOpen((open) => !open)}
            data-testid="button-toggle-creator-insights"
          >
            <span>
              <span className="block text-sm font-bold">Creator insights</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Daily Moment watch time and completion retention</span>
            </span>
            {creatorInsightsOpen
              ? <ArrowUp className="h-4 w-4 shrink-0" aria-hidden="true" />
              : <ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
          {creatorInsightsOpen && <div className="border-t border-border p-3 sm:p-4"><CreatorInsightsPanel /></div>}
        </section>
      </aside>

      <div className="nia-moments__stage">
      <section
        ref={feedPanelRef}
        className="nia-moments__feed-panel overflow-hidden rounded-2xl border border-border bg-card"
        aria-label={fullScreenOpen ? "Full-screen Moments viewer" : "Spark feed"}
        aria-modal={fullScreenOpen ? "true" : undefined}
        data-fullscreen={fullScreenOpen ? "true" : "false"}
        role={fullScreenOpen ? "dialog" : undefined}
        tabIndex={fullScreenOpen ? -1 : undefined}
      >
        <div className="nia-moments__feed-header flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="nia-moments__feed-heading">
            {fullBleed && (
              <Link href="/community" className="nia-moments__back-link" aria-label="Back to Community" data-testid="link-back-from-moments">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span>Community</span>
              </Link>
            )}
            <p className="text-sm font-bold">Sparks shared with you</p>
          </div>
          <div className="nia-moments__feed-controls flex items-center gap-2">
            {fullBleed && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setContextPanelOpen(true);
                    setResponseToStoryId(null);
                    setChallengeKey(null);
                    setComposerActionSignal((value) => value + 1);
                  }}
                  className="nia-moments__create-button inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold"
                  aria-label="Create a Spark"
                  data-testid="button-create-moment-fullbleed"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Create</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContextPanelOpen((open) => !open)}
                  className="nia-moments__tools-button inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted"
                  aria-expanded={contextPanelOpen}
                  aria-controls="moment-context-panel"
                  aria-label={contextPanelOpen ? "Close community tools" : "Open community tools"}
                  data-testid="button-toggle-moment-context"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>Tools</span>
                </button>
              </>
            )}
            <button
              ref={fullScreenToggleRef}
              type="button"
              onClick={() => {
                if (!fullScreenOpen) fullScreenReturnFocusRef.current = document.activeElement as HTMLElement | null;
                setFullScreenOpen((open) => !open);
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted"
              aria-label={fullScreenOpen ? "Exit full-screen Moments" : "Open full-screen Moments"}
              aria-pressed={fullScreenOpen}
              data-testid="button-toggle-fullscreen-moments"
            >
              {fullScreenOpen
                ? <Minimize2 className="h-4 w-4" aria-hidden="true" />
                : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              <span className="sr-only">{fullScreenOpen ? "Exit full screen" : "View full screen"}</span>
            </button>
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="moment-filters" className="nia-moments__filters-toggle inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted active:bg-muted" data-testid="button-toggle-moment-filters">
              Filters
            </button>
            <button type="button" onClick={() => setMutedAuthorsOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted" aria-label="Manage hidden Moment authors" data-testid="button-manage-hidden-authors">
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
              Hidden authors
            </button>
            <button type="button" onClick={() => setBlockedUsersOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-bold hover:bg-muted" aria-label="Manage accounts you blocked" data-testid="button-manage-blocked-users">
              Blocked accounts
            </button>
            {!loading && sparks.length > 0 && (
              <>
                <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">Spark {activeIndex + 1} of {sparks.length}</span>
                <button type="button" onClick={() => moveTo(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Previous Spark" data-testid="button-previous-spark">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => moveTo(Math.min(sparks.length - 1, activeIndex + 1))} disabled={activeIndex === sparks.length - 1} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Next Spark" data-testid="button-next-spark">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <form
          id="moment-filters"
          data-moment-filters
          data-open={filtersOpen}
          className="grid gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_minmax(10rem,0.8fr)_auto]"
          aria-label="Discover Moments"
          onSubmit={(event) => {
            event.preventDefault();
            setDiscoveryFilters({
              search: searchInput.trim(),
              tag: tagInput.trim().replace(/^#/, "").toLowerCase(),
              authorId: authorInput,
            });
          }}
        >
          <label className="sr-only" htmlFor="moment-search">Search Moments</label>
          <input id="moment-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100} placeholder="Search Moments" className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm" data-testid="input-moment-search" />
          <label className="sr-only" htmlFor="moment-tag-filter">Filter by tag</label>
          <input id="moment-tag-filter" value={tagInput} onChange={(event) => setTagInput(event.target.value)}
            maxLength={31} placeholder="Tag (e.g. garden)" className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm" data-testid="input-moment-tag-filter" />
          <label className="sr-only" htmlFor="moment-author-filter">Filter by author</label>
          <select id="moment-author-filter" value={authorInput} onChange={(event) => setAuthorInput(event.target.value)}
            className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm" data-testid="select-moment-author-filter">
            <option value="">All authors</option>
            {authorInput && !sparks.some((spark) => String(spark.author_user_id) === authorInput) && <option value={authorInput}>Selected author</option>}
            {Array.from(new Map(sparks.map((spark) => [spark.author_user_id, spark.author.name])).entries()).map(([id, name]) => (
              <option key={id} value={id}>{name || `Author ${id}`}</option>
            ))}
          </select>
          <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground" data-testid="button-discover-moments">Discover</button>
        </form>

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
        {moderationNotice && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm" role="status" data-testid="status-moment-moderation">
            <span>{moderationNotice}</span>
            <button type="button" onClick={() => setModerationNotice("")} className="rounded-lg px-2 py-1 font-bold hover:bg-muted" aria-label="Dismiss moderation notice" data-testid="button-dismiss-moderation-notice">Dismiss</button>
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
                const showReel = Boolean(spark.moment_video
                  && (momentVideoStates[spark.id]?.status ?? spark.moment_video.status) === "ready");
                const media: MomentMedia | undefined = showReel && spark.moment_video
                  ? {
                    id: spark.id,
                    media_type: "video",
                    mime_type: "video/mp4",
                    media_url: momentVideoStates[spark.id]?.playbackGrantUrl ?? spark.moment_video.playback_grant_url,
                    duration_ms: spark.moment_video.duration_ms ?? null,
                    alt_text: `${spark.media.length === 1 ? "Camera video" : `Stitched camera reel with ${spark.media.length} original clips`}. ${spark.media.map((item, sourceIndex) => `Clip ${sourceIndex + 1}: ${item.alt_text?.trim() || "No alternative text supplied."}`).join(" ")}`,
                    isMomentReel: true,
                  }
                  : spark.media[itemIndex];
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
                      <video
                        ref={videoRef}
                        key={`${spark.id}-${media.id}`}
                        src={currentMediaUrl}
                        autoPlay muted={videoMuted} playsInline controls preload="metadata"
                        className={`absolute inset-0 h-full w-full ${media.isMomentReel ? "object-cover" : "object-contain"}`}
                        data-moment-reel={media.isMomentReel ? "true" : undefined}
                        style={{ filter: mediaFilter }}
                        aria-label={media.alt_text?.trim() || spark.caption || `Community Spark video shared by ${spark.author.name}`}
                        aria-describedby={spark.moment_video ? `moment-reel-sources-${spark.id}` : undefined}
                        onPlay={(event) => startWatchPlayback(spark.id, media.id, spark.author_user_id, event.currentTarget.currentTime)}
                        onTimeUpdate={(event) => accumulateWatchTime(spark.id, media.id, event.currentTarget)}
                        onSeeking={() => {
                          const playback = watchPlaybackRef.current;
                          if (playback?.storyId === spark.id && playback.mediaId === media.id) {
                            playback.seeking = true;
                            playback.lastMediaTime = null;
                          }
                        }}
                        onSeeked={(event) => {
                          const playback = watchPlaybackRef.current;
                          if (playback?.storyId === spark.id && playback.mediaId === media.id) {
                            playback.seeking = false;
                            playback.lastMediaTime = event.currentTarget.currentTime;
                          }
                        }}
                        onPause={(event) => {
                          accumulateWatchTime(spark.id, media.id, event.currentTarget, true);
                          flushWatchContribution(spark.id, media.id);
                        }}
                        onEnded={(event) => {
                          accumulateWatchTime(spark.id, media.id, event.currentTarget, true);
                          flushWatchContribution(spark.id, media.id, true);
                        }}
                        onVolumeChange={(event) => setVideoMuted(event.currentTarget.muted)}
                        onError={() => {
                        setMediaUrl(null);
                        setMediaError("The Spark video could not be played. Request a fresh playback link.");
                        }}
                      >
                        {captionsTrackUrl && <track kind="captions" src={captionsTrackUrl} srcLang="en" label="Creator captions" default />}
                      </video>
                    )}
                    {current && spark.moment_video && (
                      <span className="sr-only" id={`moment-reel-sources-${spark.id}`}>
                        Original clip descriptions and captions: {spark.media.map((source, sourceIndex) => {
                          const sourceCaptions = source.captions_vtt?.replace(/^WEBVTT[^\n]*\n?/m, "").replace(/^\d+\s*$/gm, "").replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm, "").trim();
                          return `Clip ${sourceIndex + 1}: ${source.alt_text?.trim() || "No alternative text supplied."}${sourceCaptions ? ` Original captions: ${sourceCaptions}` : ""}`;
                        }).join(" ")}
                      </span>
                    )}
                    {current && playbackAllowed && currentMediaUrl && media?.media_type === "photo" && (
                      <img src={currentMediaUrl} alt={media.alt_text?.trim() || (spark.caption ? `Spark from ${spark.author.name}: ${spark.caption}` : `Spark shared by ${spark.author.name}`)} className="absolute inset-0 h-full w-full object-contain" style={{ filter: mediaFilter }} />
                    )}
                    {current && playbackAllowed && currentMediaUrl && media?.media_type === "audio" && (
                      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-teal-950 via-emerald-950 to-slate-950 p-8">
                        <div className="w-full max-w-md rounded-2xl bg-black/40 p-5 text-center">
                          <p className="mb-3 font-bold">Audio Moment</p>
                          <audio src={currentMediaUrl} controls preload="metadata" className="w-full" aria-label={spark.caption || `Audio Moment shared by ${spark.author.name}`} />
                        </div>
                      </div>
                    )}
                    {!media && (
                      <div data-moment-text-only className={`absolute inset-0 grid place-items-center ${backgroundColor ? "" : "bg-gradient-to-br from-teal-950 via-emerald-950 to-slate-950"} p-8 text-center`} style={backgroundColor ? { backgroundColor } : undefined}>
                        <div className="max-w-md"><Play className="mx-auto h-10 w-10 text-white/70" aria-hidden="true" />{spark.caption && !hasCaptionOverlay(spark) && <p className="mt-4 text-xl font-semibold leading-relaxed sm:text-2xl">{spark.caption}</p>}</div>
                      </div>
                    )}
                    {current && spark.moment_video && activeMomentVideoState?.status !== "ready" && (
                      <div className="absolute inset-x-5 top-1/2 z-20 -translate-y-1/2 rounded-xl bg-black/85 p-4 text-center text-sm font-semibold text-white"
                        role={activeMomentVideoState?.status === "failed" ? "alert" : "status"}
                        data-testid={`status-moment-reel-${spark.id}`}>
                        {activeMomentVideoState?.status === "failed"
                          ? `Camera reel stitching failed${activeMomentVideoState.failureCode ? ` (${activeMomentVideoState.failureCode})` : ""}. The original clips remain attached to this Moment; the author can retry stitching from the Studio.`
                          : "Camera reel is being stitched. Its original clips remain attached to this Moment."}
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
                    {current && !showReel && spark.media.length > 1 && (
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
                    <div data-moment-caption className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5 pt-28 text-white sm:p-7 sm:pt-32">
                      <Link href={`/community/creators/${spark.author_user_id}`} className="pointer-events-auto inline-flex min-h-8 items-center rounded-md text-sm font-black underline decoration-white/45 underline-offset-4 hover:decoration-white focus:outline-none focus:ring-2 focus:ring-white" data-testid={`link-moment-creator-${spark.author_user_id}`}>{spark.author.name || "A neighbor"}<span className="sr-only">’s Moments</span></Link>
                      {spark.audience === "hub" && <p className="mt-1 text-xs font-semibold text-white/75">Hub Spark</p>}
                      {spark.response_to && <p className="mt-1 max-w-xl text-xs font-semibold text-white/75" data-testid={`text-moment-response-attribution-${spark.id}`}>Video response to {spark.response_to.author_name || "a neighbor"}’s Moment</p>}
                      {spark.caption && media && <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed sm:text-base">{spark.caption}</p>}
                    </div>
                    {current && (
                      <div data-moment-tools className="absolute inset-x-4 bottom-4 z-20 flex flex-col items-end gap-2 text-white sm:inset-x-6">
                        {spark.remix_enabled === true && spark.audience === "community" && spark.author_user_id !== viewerId && spark.media.some((item) => item.media_type === "video") && (
                          <button
                            type="button"
                            onClick={() => {
                              setResponseToStoryId(spark.id);
                              setChallengeKey(null);
                              setComposerActionSignal((value) => value + 1);
                            }}
                            className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/75 px-4 text-sm font-bold text-white shadow-xl backdrop-blur hover:bg-black/90"
                            data-testid={`button-video-response-${spark.id}`}
                          >
                            <Play className="h-4 w-4" aria-hidden="true" /> Make a video response
                          </button>
                        )}
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
                        <div data-moment-actions className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-2 py-1.5 shadow-xl backdrop-blur">
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
                          {(spark.author_user_id !== viewerId || (spark.caption?.trim() ?? "") !== "") && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActionMenuSparkId((currentId) => currentId === spark.id ? null : spark.id)}
                                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
                                aria-label={`More actions for ${spark.author_user_id === viewerId ? "your Moment" : `Moment by ${spark.author.name || "this author"}`}`}
                                aria-expanded={actionMenuSparkId === spark.id}
                                data-testid={`button-moment-actions-${spark.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                              {actionMenuSparkId === spark.id && (
                                <div className="absolute bottom-full right-0 z-30 mb-2 flex w-56 flex-col rounded-xl border border-white/15 bg-neutral-950 p-1.5 text-left shadow-2xl" onKeyDown={(event) => {
                                  if (event.key === "Escape") setActionMenuSparkId(null);
                                }}>
                                  <button type="button" onClick={() => { setReportSparkId(spark.id); setActionMenuSparkId(null); }} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-white hover:bg-white/10" data-testid={`button-report-moment-${spark.id}`}>
                                    <Flag className="h-4 w-4" aria-hidden="true" /> Report Moment
                                  </button>
                                  {spark.author_user_id !== viewerId ? (
                                    <>
                                      <button type="button" onClick={() => void muteAuthor(spark)} disabled={moderationPendingAuthorId === spark.author_user_id} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50" data-testid={`button-mute-moment-author-${spark.id}`}>
                                        {moderationPendingAuthorId === spark.author_user_id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                                        Hide this author
                                      </button>
                                      <button type="button" onClick={() => void blockAuthor(spark)} disabled={blockPendingAuthorId === spark.author_user_id} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50" data-testid={`button-block-moment-author-${spark.id}`}>
                                        {blockPendingAuthorId === spark.author_user_id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                                        Block author
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => { setKeepMomentId(spark.id); setActionMenuSparkId(null); }} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-white hover:bg-white/10" data-testid={`button-keep-moment-${spark.id}`}>
                                      <BookHeart className="h-4 w-4" aria-hidden="true" />
                                      Keep caption for my family
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
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
      </div>
      {shareSpark && (
        <StoryShareSheet
          storyId={shareSpark.id}
          audience={shareSpark.audience === "hub" ? "hub" : "community"}
          hubId={shareSpark.hub_id}
          onClose={() => setShareSparkId(null)}
          onShared={() => setMetricsById((current) => {
            const metrics = current[shareSpark.id];
            return metrics ? { ...current, [shareSpark.id]: { ...metrics, shares: metrics.shares + 1 } } : current;
          })}
        />
      )}
      {reportSpark && (
        <ReportModal
          reportedCommunityStoryId={reportSpark.id}
          reportedName={`Moment by ${reportSpark.author.name || "a neighbor"}`}
          onClose={() => setReportSparkId(null)}
        />
      )}
      {mutedAuthorsOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="muted-authors-title" data-testid="dialog-muted-authors" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setMutedAuthorsOpen(false);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") setMutedAuthorsOpen(false);
        }}>
          <section className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl" aria-label="Hidden Moment authors">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="muted-authors-title" className="text-lg font-black">Hidden authors</h2>
                <p className="mt-1 text-sm text-muted-foreground">Their Moments stay out of your feed until you restore them.</p>
              </div>
              <button type="button" onClick={() => setMutedAuthorsOpen(false)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border hover:bg-muted" aria-label="Close hidden authors" data-testid="button-close-hidden-authors">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {mutedAuthorsQuery.isLoading ? (
              <p className="mt-5 text-sm text-muted-foreground" role="status">Loading hidden authors…</p>
            ) : mutedAuthorsQuery.isError ? (
              <div className="mt-5 flex items-center justify-between gap-3 text-sm" role="alert">
                <span>Hidden authors could not be loaded.</span>
                <button type="button" onClick={() => void mutedAuthorsQuery.refetch()} className="font-bold underline" data-testid="button-retry-hidden-authors">Retry</button>
              </div>
            ) : (mutedAuthorsQuery.data?.muted_authors.length ?? 0) === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="status-no-hidden-authors">You have not hidden any authors.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {mutedAuthorsQuery.data?.muted_authors.map((author) => (
                  <li key={author.user_id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3" data-testid={`row-hidden-author-${author.user_id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold" data-testid={`text-hidden-author-${author.user_id}`}>{author.name}</p>
                      <p className="text-xs text-muted-foreground">Moments hidden</p>
                    </div>
                    <button type="button" onClick={() => void unmuteAuthor(author.user_id)} disabled={moderationPendingAuthorId === author.user_id} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-unmute-author-${author.user_id}`}>
                      {moderationPendingAuthorId === author.user_id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {blockedUsersOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="blocked-users-title" data-testid="dialog-blocked-users" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBlockedUsersOpen(false);
        }} onKeyDown={(event) => {
          if (event.key === "Escape") setBlockedUsersOpen(false);
        }}>
          <section className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl" aria-label="Accounts you blocked">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="blocked-users-title" className="text-lg font-black">Blocked accounts</h2>
                <p className="mt-1 text-sm text-muted-foreground">Accounts you blocked. Unblocking lets direct messages between you resume.</p>
              </div>
              <button type="button" onClick={() => setBlockedUsersOpen(false)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border hover:bg-muted" aria-label="Close blocked accounts" data-testid="button-close-blocked-users">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {interactionError && (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert" data-testid="status-blocked-users-error">{interactionError}</p>
            )}
            {blockedUsersQuery.isLoading ? (
              <p className="mt-5 text-sm text-muted-foreground" role="status">Loading blocked accounts…</p>
            ) : blockedUsersQuery.isError ? (
              <div className="mt-5 flex items-center justify-between gap-3 text-sm" role="alert">
                <span>Blocked accounts could not be loaded.</span>
                <button type="button" onClick={() => void blockedUsersQuery.refetch()} className="font-bold underline" data-testid="button-retry-blocked-users">Retry</button>
              </div>
            ) : (blockedUsersQuery.data?.blocked_users.length ?? 0) === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="status-no-blocked-users">You have not blocked any accounts.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {blockedUsersQuery.data?.blocked_users.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3" data-testid={`row-blocked-user-${user.id}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      {user.avatar_url
                        ? <img src={user.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                        : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold" aria-hidden="true">{user.name.slice(0, 1) || "?"}</span>}
                      <p className="truncate text-sm font-bold" data-testid={`text-blocked-user-${user.id}`}>{user.name}</p>
                    </div>
                    <button type="button" onClick={() => void unblockUser(user.id)} disabled={blockPendingAuthorId === user.id} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-unblock-user-${user.id}`}>
                      {blockPendingAuthorId === user.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <KeepForMyFamilyDialog
        open={keepMomentId !== null}
        momentId={keepMomentId ?? 0}
        onClose={() => setKeepMomentId(null)}
      />
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