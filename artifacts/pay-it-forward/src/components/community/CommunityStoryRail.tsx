import {
  AtSign,
  Volume2,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { useObjectUrls } from "./StoryComposerMedia";
import { StoryEditorCanvas, type EditableStoryElement } from "./StoryEditorCanvas";
import { discardStudioDraft, emptyStudioScope, exchangeResumeAction, loadStudioDraft, newStudioPublishId, persistStudioDraft, persistStudioPublishAttempt, saveStudioDraft, studioDraftKey, studioFileFingerprint, studioPublishSignature, type StudioDraft } from "./story-studio-draft";
import { chooseStudioFiles, publishStudioMoment, selectedStudioFiles, validateStudioFiles } from "./story-studio-publish";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";
import { getExchangeListings } from "@/lib/community-exchange-client";
import type { ExchangeListing } from "@/lib/community-exchange-types";
import {
  completeSparkUpload,
  createExchangeSparkDraft,
  createSparkUploadSession,
  discardExchangeSparkDraft,
  ExchangeSparkUploadError,
  getExchangeSparkDraftStatus,
  publishExchangeSparkDraft,
  putRawSparkFile,
  readExchangeSparkVideoDuration,
  resumeSparkUploadSession,
  updateExchangeSparkDraftCaption,
  waitForExchangeSparkMediaReady,
} from "@/lib/exchange-spark-upload-client";
import { validateExchangeSparkVideo } from "@/lib/exchange-spark-upload-rules";
import {
  getStoryMetrics,
  reactToStory,
  recordStoryView,
  removeStoryReaction,
  sendStoryContextMessage,
} from "@/lib/community-story-client";
import {
  StoryComposerChrome,
  StoryVisualRail,
  type StoryVisualAuthor,
  type StoryVisualTool,
} from "./CommunityStoryVisual";
import {
  CommunityStoryGalleryOverlay,
  CommunityStoryShareOverlay,
  CommunityStoryViewerOverlay,
} from "./CommunityStoryRailOverlays";
import type { CommunityStory, Effect, StoryAuthor, StoryMedia } from "./story-rail-types";
import { TEXT_STORY_BACKGROUNDS } from "./story-rail-types";
import { StoryCameraRecorder } from "./StoryCameraRecorder";
import { trimVideoFile } from "./story-media-tools";

type Tool = "music" | "stickers" | "text" | "effects" | "mention";

function groupStories(stories: CommunityStory[]): StoryAuthor[] {
  const byAuthor = new Map<number, StoryAuthor>();
  for (const story of [...stories].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))) {
    const group = byAuthor.get(story.author_user_id) ?? { author_user_id: story.author_user_id, author: story.author, frames: [] };
    if (story.media.length) story.media.forEach((media) => group.frames.push({ story, media }));
    else group.frames.push({ story, media: null });
    byAuthor.set(story.author_user_id, group);
  }
  return Array.from(byAuthor.values());
}

export function CommunityStoryRail({
  hubId,
  openComposerSignal,
  openStoryId = null,
  compact = false,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openStoryId?: number | null;
  compact?: boolean;
}) {
  const [, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const userId = currentUser?.id ?? null;
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => {
    // The page-level signal starts at 0, so a positive value is always an
    // explicit Create → Story action. This also works when the rail is
    // mounted after switching from another Community tab.
    if (openComposerSignal && openComposerSignal > 0) setComposerOpen(true);
  }, [openComposerSignal]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallerySelection, setGallerySelection] = useState<number[]>([]);
  const [studioStep, setStudioStep] = useState<"source" | "edit" | "destination">("source");
  const [seenAuthorIds, setSeenAuthorIds] = useState<Set<number>>(() => new Set());
  const [mediaUrls, setMediaUrls] = useState<Record<number, string>>({});
  const mediaObjectUrlsRef = useRef<Record<number, string>>({});
  const [shareStoryId, setShareStoryId] = useState<number | null>(null);
  const [reactedStoryIds, setReactedStoryIds] = useState<Record<number, boolean>>({});
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [trimming, setTrimming] = useState(false);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"community" | "hub">(hubId ? "hub" : "community");
  const [tool, setTool] = useState<Tool | null>(null);
  const [effect, setEffect] = useState<Effect>("none");
  const [sticker, setSticker] = useState("💙");
  const [mention, setMention] = useState("");
  const [mentionUserId, setMentionUserId] = useState<number | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<Array<{ id: number; name: string; avatar_url: string | null }>>([]);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState("18");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("center");
  const [textBackground, setTextBackground] = useState<string>(TEXT_STORY_BACKGROUNDS[0]);
  const [editorElements, setEditorElements] = useState<EditableStoryElement[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [publishProgress, setPublishProgress] = useState(0);
  const publishControllerRef = useRef<AbortController | null>(null);
  const [ownedExchangeListings, setOwnedExchangeListings] = useState<ExchangeListing[]>([]);
  const [exchangeListingsLoading, setExchangeListingsLoading] = useState(false);
  const [exchangeListingsError, setExchangeListingsError] = useState("");
  const [exchangeListingId, setExchangeListingId] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [uploadedIds, setUploadedIds] = useState<Array<number | null>>([]);
  const uploadedIdsRef = useRef<Array<number | null>>([]);
  const publishAssetIdsRef = useRef<number[]>([]);
  const [trimPreview, setTrimPreview] = useState<Record<number, { start: number; end: number }>>({});
  const [coverTimes, setCoverTimes] = useState<Record<number, number>>({});
  const exchangeDraftRef = useRef<{ id: number; listingId: string; fingerprint: string } | null>(null);
  const clientPublishIdRef = useRef<string>(newStudioPublishId());
  const publishAttemptRef = useRef<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftGenerationRef = useRef(0);
  const draftWriteVersionRef = useRef(0);
  const scopeKey = userId && Number.isSafeInteger(userId) && userId > 0 ? studioDraftKey(userId, hubId) : null;
  const activeScopeRef = useRef(scopeKey);
  const recoveredScopeRef = useRef<string | null>(null);
  const scopeSnapshotsRef = useRef(new Map<string, StudioDraft>());
  const galleryInput = useRef<HTMLInputElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const autoOpenedRef = useRef(false);
  const deepLinkedStoryRef = useRef<number | null>(null);

  const authors = useMemo(() => groupStories(stories), [stories]);
  const selectedAuthor = viewerIndex === null ? null : authors[viewerIndex] ?? null;
  const selectedFrame = selectedAuthor?.frames[mediaIndex] ?? null;
  const selectedStory = selectedFrame?.story ?? null;
  const selectedStoryId = selectedStory?.id ?? null;
  const selectedMedia = selectedFrame?.media ?? null;
  const previewUrls = useObjectUrls(files);
  const selectedPreviewFile = files[previewFileIndex] ?? files[0] ?? null;
  const selectedFileUrl = previewUrls[previewFileIndex] ?? previewUrls[0] ?? null;
  const selectedFiles = selectedStudioFiles(files, gallerySelection);
  const selectedVideo = selectedFiles.some((file) => file.type.startsWith("video/"));
  const rawTrimRange = trimPreview[previewFileIndex] ?? { start: 0, end: videoDuration };
  const trimStart = Math.min(Math.max(0, rawTrimRange.start), Math.max(0, videoDuration - 0.1));
  const trimEnd = Math.min(videoDuration, Math.max(trimStart + Math.min(0.1, videoDuration), rawTrimRange.end));
  const coverMinMs = Math.ceil(trimStart * 1000);
  const coverMaxMs = Math.max(coverMinMs, Math.floor(trimEnd * 1000) - 1);
  const coverValueMs = Math.min(coverMaxMs, Math.max(coverMinMs, coverTimes[previewFileIndex] ?? coverMinMs));
  const visualAuthors = useMemo<StoryVisualAuthor[]>(
    () => authors.map((author) => ({
      id: author.author_user_id,
      name: author.author.name,
      avatarUrl: author.author.avatar_url,
      seen: seenAuthorIds.has(author.author_user_id),
      contextLabel: hubId ? "Hub Spark" : "Community",
    })),
    [authors, hubId, seenAuthorIds],
  );
  const galleryThumbnails = useMemo(
    () => files.map((file, index) => ({
      id: index,
      src: previewUrls[index] ?? "",
      type: file.type.startsWith("video/") ? "video" as const : "photo" as const,
    })).filter((item) => item.src),
    [files, previewUrls],
  );
  const filter = effect === "warmth"
    ? "sepia(.25) saturate(1.25)"
    : effect === "contrast"
      ? "contrast(1.2)"
      : effect === "grayscale"
        ? "grayscale(1)"
        : "none";

  const updateEditorElement = (id: EditableStoryElement["id"], patch: Partial<EditableStoryElement>) => {
    setEditorElements((current) => current.map((element) => (
      element.id === id
        ? {
            ...element,
            ...patch,
            payload: patch.payload ? { ...element.payload, ...patch.payload } : element.payload,
          }
        : element
    )));
  };

  const upsertEditorElement = (element: EditableStoryElement) => {
    setEditorElements((current) => {
      const index = current.findIndex((item) => item.id === element.id);
      if (index < 0) return [...current, element];
      const next = current.slice();
      next[index] = { ...next[index], ...element, payload: { ...next[index].payload, ...element.payload } };
      return next;
    });
  };

  const updateCaption = (value: string) => {
    setCaption(value);
    if (!value.trim()) {
      setEditorElements((current) => current.filter((element) => element.id !== "caption"));
      return;
    }
    upsertEditorElement({
      id: "caption",
      type: "text",
      payload: { text: value, color: textColor, font_size: Number(textSize), align: textAlign },
      position_x: 50,
      position_y: 78,
      scale: 1,
      rotation: 0,
      z_index: 10,
    });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = hubId ? `?hubId=${encodeURIComponent(String(hubId))}` : "";
        const response = await fetch(`/api/community/stories${query}`, { headers: authHeaders() });
        const data = await response.json().catch(() => ({})) as { stories?: CommunityStory[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load Moments.");
        if (!cancelled) setStories(Array.isArray(data.stories) ? data.stories : []);
      } catch (reason: unknown) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load Moments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [hubId, refreshNonce]);

  useEffect(() => {
    const scopeSnapshots = scopeSnapshotsRef.current;
    // A new authenticated scope must never inherit the previous scope's
    // in-memory files, selection, destination or upload references.
    draftGenerationRef.current++;
    activeScopeRef.current = scopeKey;
    recoveredScopeRef.current = null;
    exchangeDraftRef.current = null;
    clientPublishIdRef.current = newStudioPublishId();
    publishAttemptRef.current = null;
    uploadedIdsRef.current = [];
    publishAssetIdsRef.current = [];
    const empty = emptyStudioScope(hubId);
    setDraftReady(false);
    setDraftSaved(false);
    setDraftError("");
    setFiles(empty.files);
    setGalleryOpen(false);
    setStudioStep("source");
    setGallerySelection(empty.selection);
    setPreviewFileIndex(0);
    setCaption(empty.caption);
    setAudience(empty.audience);
    setUploadedIds(empty.uploadedIds);
    setEditorElements([]);
    setEffect("none");
    setTrimPreview({});
    setCoverTimes({});
    setExchangeListingId(empty.listingId);
    setTextBackground(TEXT_STORY_BACKGROUNDS[0]);
    setTextColor("#ffffff");
    setTextSize("18");
    setTextAlign("center");
    if (!userId || !Number.isSafeInteger(userId) || userId < 1) {
      setDraftReady(true);
      setDraftError("Sign in to recover or publish a Spark.");
      return;
    }
    let active = true;
    setDraftReady(false);
    setDraftSaved(false);
    void loadStudioDraft(userId, hubId).then((draft) => {
      if (!active) return;
      if (draft) {
        exchangeDraftRef.current = draft.exchangeDraftId && Number.isSafeInteger(draft.exchangeDraftId)
          ? { id: draft.exchangeDraftId, listingId: draft.destinationListingId, fingerprint: draft.exchangeFileFingerprint ?? "" }
          : null;
        clientPublishIdRef.current = draft.clientPublishId || newStudioPublishId();
        publishAttemptRef.current = draft.attemptedSignature ?? null;
        uploadedIdsRef.current = draft.uploadedMediaAssetIds ?? [];
        publishAssetIdsRef.current = draft.publishAssetIds ?? [];
        setFiles(draft.files ?? []);
        setGallerySelection(draft.selection ?? []);
        setPreviewFileIndex(draft.previewIndex ?? 0);
        setCaption(draft.caption ?? "");
        setAudience(draft.audience ?? (hubId ? "hub" : "community"));
        setExchangeListingId(draft.destinationListingId ?? "");
        setEditorElements((draft.elements ?? []) as EditableStoryElement[]);
        setEffect(draft.effect ?? "none");
        setTextBackground(draft.textBackground ?? TEXT_STORY_BACKGROUNDS[0]);
        setTextColor(draft.textColor ?? "#ffffff");
        setTextSize(draft.textSize ?? "18");
        setTextAlign(draft.textAlign ?? "center");
        setTrimPreview(draft.trimPreview ?? {});
        setCoverTimes(draft.coverTimes ?? {});
        setUploadedIds(draft.uploadedMediaAssetIds ?? []);
        setDraftSaved(true);
      }
      recoveredScopeRef.current = scopeKey;
      setDraftReady(true);
    }).catch((reason: unknown) => {
      if (active) { setDraftError(reason instanceof Error ? reason.message : "Draft recovery failed."); setDraftReady(true); }
    });
    return () => {
      active = false;
      publishControllerRef.current?.abort();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      const outgoingKey = studioDraftKey(userId, hubId);
      const outgoing = scopeSnapshots.get(outgoingKey);
      scopeSnapshots.delete(outgoingKey);
      if (outgoing && recoveredScopeRef.current === studioDraftKey(userId, hubId)) {
        draftQueueRef.current = draftQueueRef.current.catch(() => {}).then(() => persistStudioDraft(outgoing));
        void draftQueueRef.current.catch(() => {});
      }
    };
  }, [userId, hubId, scopeKey]);

  const draftSnapshot = (): StudioDraft => ({
    id: studioDraftKey(userId!, hubId), userId: userId!,
    contextKind: hubId === null ? "community_moment" : "hub_moment",
    contextId: hubId ?? userId!, caption, files,
    selection: gallerySelection, previewIndex: previewFileIndex, audience,
    destinationListingId: exchangeListingId, elements: editorElements,
    exchangeDraftId: exchangeDraftRef.current?.id ?? null,
    exchangeFileFingerprint: exchangeDraftRef.current?.fingerprint,
    clientPublishId: clientPublishIdRef.current,
    attemptedSignature: publishAttemptRef.current ?? undefined,
    publishAssetIds: publishAssetIdsRef.current,
    effect, textBackground, textColor, textSize, textAlign, trimPreview, coverTimes,
    uploadedMediaAssetIds: files.map((_, index) => uploadedIdsRef.current[index] ?? 0),
    updatedAt: Date.now(),
  });
  const snapshotRef = useRef(draftSnapshot);
  if (scopeKey && activeScopeRef.current === scopeKey) {
    snapshotRef.current = draftSnapshot;
    scopeSnapshotsRef.current.set(scopeKey, draftSnapshot());
  }
  const queueDraftSave = () => {
    if (!userId || !draftReady || activeScopeRef.current !== scopeKey) return draftQueueRef.current;
    const snapshot = snapshotRef.current();
    const generation = draftGenerationRef.current;
    const version = draftWriteVersionRef.current;
    draftQueueRef.current = draftQueueRef.current.catch(() => {}).then(async () => {
      if (generation !== draftGenerationRef.current || version !== draftWriteVersionRef.current) return;
      await persistStudioDraft(snapshot);
      if (generation === draftGenerationRef.current) { setDraftSaved(true); setDraftError(""); }
    }).catch((reason: unknown) => {
      setDraftError(`Draft not saved on this device: ${reason instanceof Error ? reason.message : "Storage unavailable."}`);
      throw reason;
    });
    return draftQueueRef.current;
  };
  const queueDraftSaveRef = useRef(queueDraftSave);
  queueDraftSaveRef.current = queueDraftSave;
  const signature = studioPublishSignature({ files, selection: gallerySelection, caption, elements: editorElements, audience, hubId, textBackground, coverTimes });
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const rotateAttemptAfterEdit = () => {
    if (!publishAttemptRef.current || publishAttemptRef.current === signature) return;
    publishAttemptRef.current = null;
    clientPublishIdRef.current = newStudioPublishId();
    uploadedIdsRef.current = [];
    publishAssetIdsRef.current = [];
    draftWriteVersionRef.current++;
    setUploadedIds([]);
    setDraftSaved(false);
  };
  useEffect(() => {
    if (!draftReady || activeScopeRef.current !== scopeKey) return;
    // A changed story is a new publication, not a retry. Do not attach media
    // assets that may already belong to the earlier committed publication.
    rotateAttemptAfterEdit();
  // This effect follows semantic content changes, not upload state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, draftReady, scopeKey]);
  useEffect(() => {
    if (!draftReady || !userId || activeScopeRef.current !== scopeKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftSaved(false);
    draftTimerRef.current = setTimeout(() => { void queueDraftSaveRef.current().catch(() => {}); }, 300);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [draftReady, userId, scopeKey, files, gallerySelection, previewFileIndex, caption, audience, exchangeListingId, editorElements, effect, textBackground, textColor, textSize, textAlign, trimPreview, coverTimes, uploadedIds]);

  useEffect(() => {
    if (!composerOpen) return;
    let cancelled = false;
    setExchangeListingsLoading(true);
    setExchangeListingsError("");
    getExchangeListings({ mine: true, limit: 50 })
      .then((result) => {
        if (!cancelled) {
          const eligible = (result.listings ?? []).filter((listing) => listing.status === "active");
          setOwnedExchangeListings(eligible);
          setExchangeListingId((current) => eligible.some((listing) => String(listing.id) === current) || exchangeDraftRef.current?.listingId === current ? current : "");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setExchangeListingsError(reason instanceof Error ? reason.message : "Your Exchange listings could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setExchangeListingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [composerOpen]);

  const loadMediaUrl = useCallback(async (media: StoryMedia) => {
    if (mediaObjectUrlsRef.current[media.id]) return;
    try {
      let mediaUrl = media.media_url;
      if (media.media_type === "video") {
        const grantUrl = new URL(media.media_url, window.location.origin);
        if (grantUrl.origin !== window.location.origin || grantUrl.search || grantUrl.hash
          || !/^\/api\/community\/stories\/media\/\d+\/?$/.test(grantUrl.pathname)) {
          return;
        }
        const grantResponse = await fetch(`${grantUrl.pathname.replace(/\/$/, "")}/playback-grant`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "same-origin",
        });
        const grant = await grantResponse.json().catch(() => ({})) as { playback_url?: string };
        if (!grantResponse.ok || typeof grant.playback_url !== "string") return;
        const playbackUrl = new URL(grant.playback_url, window.location.origin);
        if (playbackUrl.origin !== window.location.origin || playbackUrl.search || playbackUrl.hash) return;
        mediaUrl = grant.playback_url;
      }
      const response = await fetch(mediaUrl, { headers: authHeaders(), credentials: "same-origin" });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      mediaObjectUrlsRef.current[media.id] = url;
      setMediaUrls((current) => (current[media.id] ? current : { ...current, [media.id]: url }));
    } catch {
      // The player keeps its loading state and can be retried when the Story is reopened.
    }
  }, []);

  useEffect(() => {
    const visible = stories.slice(0, 24).flatMap((story) => story.media);
    void Promise.all(visible.map((media) => loadMediaUrl(media)));
  }, [loadMediaUrl, stories]);

  useEffect(() => {
    return () => {
      Object.values(mediaObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      mediaObjectUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (selectedMedia) void loadMediaUrl(selectedMedia);
  }, [loadMediaUrl, selectedMedia]);

  useEffect(() => {
    if (previewFileIndex >= files.length && files.length > 0) setPreviewFileIndex(0);
  }, [files.length, previewFileIndex]);
  useEffect(() => { setVideoDuration(0); }, [previewFileIndex, files]);

  const resetComposer = () => {
    if (scopeKey) scopeSnapshotsRef.current.delete(scopeKey);
    setFiles([]);
    setPreviewFileIndex(0);
    setGalleryOpen(false);
    setGallerySelection([]);
    setCaption("");
    setTool(null);
    setEffect("none");
    setSticker("💙");
    setMention("");
    setMentionUserId(null);
    setMentionCandidates([]);
    setTextColor("#ffffff");
    setTextSize("18");
    setTextAlign("center");
    setTextBackground(TEXT_STORY_BACKGROUNDS[0]);
    setEditorElements([]);
    setStudioStep("source");
    setAudience(hubId ? "hub" : "community");
    setExchangeListingId("");
    exchangeDraftRef.current = null;
    clientPublishIdRef.current = newStudioPublishId();
    publishAttemptRef.current = null;
    uploadedIdsRef.current = [];
    publishAssetIdsRef.current = [];
    setExchangeListingsError("");
    setUploadedIds([]);
    setTrimPreview({});
    setCoverTimes({});
  };

  const closeComposer = () => {
    publishControllerRef.current?.abort();
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    void queueDraftSaveRef.current().catch(() => {});
    setComposerOpen(false);
  };

  useEffect(() => {
    if (!composerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>(cameraOpen
      ? '[data-testid="dialog-spark-camera"]'
      : galleryOpen ? ".nia-story-gallery" : ".nia-story-composer");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (cameraOpen) { setCameraOpen(false); return; }
        if (galleryOpen) { setGalleryOpen(false); return; }
        if (studioStep !== "source") { setStudioStep(studioStep === "destination" ? "edit" : "source"); return; }
        closeComposer();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ?? []).filter((element) => element.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.querySelector<HTMLElement>("button")?.focus();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKey); };
  }, [composerOpen, cameraOpen, galleryOpen, studioStep, draftReady]);

  const publish = async () => {
    if (trimming) {
      setError("Wait for video trimming to finish before publishing.");
      return;
    }
    if (publishing || (!caption.trim() && gallerySelection.length === 0)) {
      setError("Add a photo, video, or a few words before publishing.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      if (!userId || !Number.isSafeInteger(userId) || userId < 1 || !draftReady || activeScopeRef.current !== scopeKey) throw new Error("Confirm your account and wait for draft recovery before publishing.");
      rotateAttemptAfterEdit();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      await queueDraftSaveRef.current();
      if (signatureRef.current !== signature) throw new Error("The Spark changed while preparing it. Review the draft and try again.");
      const selectedIndexes = [...new Set(gallerySelection)].filter((index) => Number.isInteger(index) && index >= 0 && index < files.length);
      const publishFiles = selectedStudioFiles(files, selectedIndexes);
      if (exchangeDraftRef.current && !exchangeListingId) {
        throw new Error("Your listing-owned Exchange Spark is still saved. Resume that listing and video, or explicitly discard the Exchange draft before sharing a Moment.");
      }
      const controller = new AbortController();
      publishControllerRef.current = controller;
      const attemptId = clientPublishIdRef.current;
      const attemptSignature = signature;
      const attemptSnapshot = snapshotRef.current();
      if (exchangeListingId) {
        if (audience !== "community" || publishFiles.length !== 1 || !publishFiles[0].type.startsWith("video/")) {
          throw new Error("An Exchange Spark needs one video shared with your Community. Remove other selected items or change the audience.");
        }
        if (editorElements.some((element) => element.id !== "caption") || effect !== "none") {
          throw new Error("Exchange video stickers, mentions, and effects are not rendered yet. Remove them or publish this as a 24-hour Moment.");
        }
        const file = publishFiles[0];
        try {
          setPublishStatus("Checking your video…");
          const durationSeconds = await readExchangeSparkVideoDuration(file, controller.signal);
          const fileError = validateExchangeSparkVideo({ mimeType: file.type, byteSize: file.size, durationSeconds });
          if (fileError) throw new Error(fileError);
          const fingerprint = studioFileFingerprint(file);
          const listingId = Number(exchangeListingId);
          let remote = exchangeDraftRef.current;
          if (remote && (remote.listingId !== exchangeListingId || remote.fingerprint !== fingerprint)) {
            throw new Error("This saved Exchange Spark belongs to another listing or video. Resume the original or explicitly discard this draft first.");
          }
          if (!remote) {
            setPublishStatus("Creating your Exchange Spark…");
            const draft = await createExchangeSparkDraft(listingId, caption.trim(), controller.signal);
            if (draft.upload_context.contextKind !== "exchange_spark" || draft.upload_context.contextId !== draft.spark_id) {
              throw new Error("The server returned an invalid Spark upload context.");
            }
            remote = { id: draft.spark_id, listingId: exchangeListingId, fingerprint };
            exchangeDraftRef.current = remote;
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
            const saved = { ...snapshotRef.current(), exchangeDraftId: remote.id, exchangeFileFingerprint: fingerprint };
            if (scopeKey) scopeSnapshotsRef.current.set(scopeKey, saved);
            draftQueueRef.current = draftQueueRef.current.catch(() => {}).then(() => saveStudioDraft(saved));
            try { await draftQueueRef.current; } catch {
              throw new Error("Exchange draft created, but its recovery ID could not be saved on this device. Keep this tab open and retry saving before leaving.");
            }
            setDraftSaved(true);
          }
          setPublishStatus("Checking your saved Exchange draft…");
          let status: Awaited<ReturnType<typeof getExchangeSparkDraftStatus>> | null = null;
          try {
            status = await getExchangeSparkDraftStatus(remote.id, controller.signal);
          } catch (reason) {
            if (!(reason instanceof ExchangeSparkUploadError && reason.status === 404)) throw reason;
          }
          const action = exchangeResumeAction({
            draftId: remote.id, listingId, savedListingId: Number(remote.listingId),
            fingerprint, savedFingerprint: remote.fingerprint, status, file,
          });
          if (action === "create-upload" || action === "resume-upload") {
            const asset = status?.media_assets[0];
            if (asset?.status === "failed") {
              setPublishStatus("Retrying video processing…");
              await completeSparkUpload(`/api/media-assets/${asset.media_asset_id}/complete`, controller.signal);
            } else {
              const session = asset
                ? resumeSparkUploadSession(asset.media_asset_id, file)
                : await createSparkUploadSession({ contextId: remote.id, file, signal: controller.signal });
              setPublishStatus("Uploading video…");
              await putRawSparkFile(session.upload, file, controller.signal, (loaded, total) => {
                setPublishProgress(total > 0 ? Math.round(loaded / total * 100) : 0);
              });
              setPublishStatus("Processing video…");
              await completeSparkUpload(session.complete_url, controller.signal);
            }
          }
          if (status && status.caption !== caption.trim()) await updateExchangeSparkDraftCaption(remote.id, caption.trim(), controller.signal);
          if (action !== "publish-again" && action !== "publish") {
            setPublishStatus("Processing video…");
            await waitForExchangeSparkMediaReady(remote.id, controller.signal, () => {});
          }
          setPublishStatus("Publishing Spark…");
          await publishExchangeSparkDraft(remote.id, caption.trim(), controller.signal);
          trackCommunityContent("community_spark_created", hubId === null ? {} : { hub_id: hubId });
          draftGenerationRef.current++;
          await draftQueueRef.current.catch(() => {});
          await discardStudioDraft(userId, hubId);
          exchangeDraftRef.current = null;
          resetComposer();
          setComposerOpen(false);
          navigate("/community?section=exchange");
          return;
        } finally {
          publishControllerRef.current = null;
        }
      }
      await validateStudioFiles(publishFiles);
      const elements: Array<Record<string, unknown>> = [];
      if (!publishFiles.length) elements.push({ type: "background", payload: { color: textBackground }, position_x: 50, position_y: 50, z_index: 0 });
      const draftElements = editorElements.slice();
      if (caption.trim() && !draftElements.some((element) => element.id === "caption")) {
        draftElements.push({
          id: "caption",
          type: "text",
          payload: { text: caption.trim(), color: textColor, font_size: Number(textSize), align: textAlign },
          position_x: 50,
          position_y: 50,
          scale: 1,
          rotation: 0,
          z_index: 10,
        });
      }
      elements.push(...draftElements.map(({ id: _id, ...element }) => element));
      // Preview-only effects and trim are not included in the published manifest.
      publishAttemptRef.current = attemptSignature;
      await publishStudioMoment({
        userId, hubId, audience, files: publishFiles, caption, elements: elements as Array<{ type: string; payload: Record<string, unknown> }>, effect,
        clientPublishId: attemptId,
        signal: controller.signal,
        uploadedIds: selectedIndexes.map((index) => uploadedIdsRef.current[index]),
        mediaEdits: selectedIndexes.flatMap((fileIndex, publishIndex) => coverTimes[fileIndex] !== undefined
          ? [{ index: publishIndex, coverTimeMs: coverTimes[fileIndex] }]
          : []),
        onAssetUploaded: (index, id) => {
          const next = [...uploadedIdsRef.current];
          next[selectedIndexes[index]] = id;
          uploadedIdsRef.current = next;
          setUploadedIds(next);
        },
        beforePublish: async (orderedAssetIds) => {
          if (signatureRef.current !== attemptSignature || clientPublishIdRef.current !== attemptId || activeScopeRef.current !== scopeKey) {
            throw new Error("The Spark changed during upload. Review your edits and publish again; nothing was posted.");
          }
          if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
          draftWriteVersionRef.current++;
          publishAssetIdsRef.current = [...orderedAssetIds];
          const frozen: StudioDraft = { ...attemptSnapshot, clientPublishId: attemptId, attemptedSignature: attemptSignature,
            uploadedMediaAssetIds: files.map((_, index) => uploadedIdsRef.current[index] ?? 0), publishAssetIds: [...orderedAssetIds] };
          draftQueueRef.current = draftQueueRef.current.catch(() => {}).then(async () => {
            const durable = await persistStudioPublishAttempt(frozen, selectedIndexes, orderedAssetIds);
            if (scopeKey) scopeSnapshotsRef.current.set(scopeKey, durable);
          });
          try {
            await draftQueueRef.current;
          } catch (reason) {
            setDraftError(reason instanceof Error ? reason.message : "Could not save the publish identity. Nothing was posted.");
            throw reason;
          }
          if (signatureRef.current !== attemptSignature || clientPublishIdRef.current !== attemptId || activeScopeRef.current !== scopeKey) {
            throw new Error("The Spark changed during publication preparation. Nothing was posted.");
          }
        },
        onStatus: (status, percent) => { setPublishStatus(status); setPublishProgress(percent); },
      });
      trackCommunityContent("community_spark_created", hubId === null ? {} : { hub_id: hubId });
      draftGenerationRef.current++;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      await draftQueueRef.current.catch(() => {});
      await discardStudioDraft(userId, hubId);
      resetComposer();
      setComposerOpen(false);
      const refresh = await fetch(`/api/community/stories${hubId ? `?hubId=${hubId}` : ""}`, { headers: authHeaders() });
      if (refresh.ok) {
        const next = await refresh.json() as { stories?: CommunityStory[] };
        setStories(Array.isArray(next.stories) ? next.stories : []);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error && reason.name === "AbortError"
        ? "Upload cancelled. Your Spark was not published."
        : reason instanceof Error ? reason.message : "Could not publish your Spark.");
    } finally {
      publishControllerRef.current = null;
      setPublishing(false);
      setPublishStatus("");
      setPublishProgress(0);
    }
  };

  const selectStudioFiles = (incoming: File[]) => {
    const { files: selected, errors } = chooseStudioFiles([...files, ...incoming]);
    if (errors.length) setError(errors[0]);
    if (selected.length) {
      uploadedIdsRef.current = [];
      publishAssetIdsRef.current = [];
      setUploadedIds([]);
      setTrimPreview({});
      setCoverTimes({});
      setFiles(selected);
      setGallerySelection(selected.map((_, index) => index));
      setPreviewFileIndex(Math.max(0, selected.length - 1));
      setStudioStep("edit");
      setGalleryOpen(false);
      if (!errors.length) setError(null);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (trimming) {
      event.target.value = "";
      return;
    }
    selectStudioFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onCameraVideo = (recorded: File) => {
    setCameraOpen(false);
    selectStudioFiles([recorded]);
  };

  const discardDraft = async () => {
    if (!userId || !window.confirm(exchangeDraftRef.current
      ? "Discard this Spark? If its Exchange video is still a draft, it will also be removed from the server. A Spark already published cannot be undone here."
      : "Discard this Spark and its saved media? This cannot be undone.")) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    try {
      await draftQueueRef.current.catch(() => {});
      const remote = exchangeDraftRef.current;
      if (remote) {
        const controller = new AbortController();
        try {
          const status = await getExchangeSparkDraftStatus(remote.id, controller.signal);
          if (String(status.listing_id) !== remote.listingId) throw new Error("The server draft does not match the saved listing.");
          await discardExchangeSparkDraft(remote.id, controller.signal);
        } catch (reason) {
          // 404 means the draft is no longer active (possibly already
          // published). Never DELETE by id in that case: DELETE also removes
          // published Sparks.
          if (!(reason instanceof ExchangeSparkUploadError && reason.status === 404)) throw reason;
        }
      }
      draftGenerationRef.current++;
      await discardStudioDraft(userId, hubId);
      resetComposer();
      setDraftSaved(false);
      setDraftError("");
      setError(null);
    } catch (reason: unknown) {
      setDraftError(reason instanceof Error ? reason.message : "Could not discard the saved draft.");
    }
  };

  const openStory = useCallback((index: number) => {
    const author = authors[index];
    if (!author) return;
    setSeenAuthorIds((current) => {
      const next = new Set(current);
      next.add(author.author_user_id);
      return next;
    });
    setViewerIndex(index);
    setMediaIndex(0);
    setStoryPaused(false);
  }, [authors]);

  useEffect(() => {
    if (compact || openStoryId !== null || loading || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (authors.length > 0) openStory(0);
  }, [authors, compact, loading, openStory, openStoryId]);

  const toggleGallerySelection = (index: number) => {
    setPreviewFileIndex(index);
    setGallerySelection((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index]);
  };

  useEffect(() => {
    if (tool !== "mention") return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/community/stories/mention-candidates?q=${encodeURIComponent(mention)}`, { headers: authHeaders() });
        if (!response.ok) throw new Error("Could not find members. Try again.");
        const data = await response.json() as { users?: Array<{ id: number; name: string; avatar_url: string | null }> };
        if (active) setMentionCandidates(Array.isArray(data.users) ? data.users : []);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not find members.");
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mention, tool]);

  useEffect(() => {
    if (selectedStoryId === null) return;
    setStoryProgress(0);
    void recordStoryView(selectedStoryId)
      .then(() => trackCommunityContent("community_spark_viewed", { spark_id: selectedStoryId }))
      .catch(() => {});
    void getStoryMetrics(selectedStoryId)
      .then((metrics) => setReactedStoryIds((current) => ({ ...current, [selectedStoryId]: Boolean(metrics.viewer_reaction) })))
      .catch(() => {});
  }, [selectedStoryId]);

  useEffect(() => {
    if (openStoryId === null || loading || deepLinkedStoryRef.current === openStoryId) return;
    const authorIndex = authors.findIndex((author) => author.frames.some((frame) => frame.story.id === openStoryId));
    deepLinkedStoryRef.current = openStoryId;
    if (authorIndex < 0) return;
    const frameIndex = authors[authorIndex].frames.findIndex((frame) => frame.story.id === openStoryId);
    openStory(authorIndex);
    setMediaIndex(Math.max(0, frameIndex));
  }, [authors, loading, openStoryId, openStory]);

  const advanceFrame = useCallback((direction: 1 | -1) => {
    if (!selectedAuthor || viewerIndex === null) return;
    const next = mediaIndex + direction;
    if (next >= 0 && next < selectedAuthor.frames.length) {
      setMediaIndex(next);
      return;
    }
    const nextAuthor = viewerIndex + direction;
    if (nextAuthor >= 0 && nextAuthor < authors.length) {
      setViewerIndex(nextAuthor);
      setMediaIndex(direction > 0 ? 0 : authors[nextAuthor].frames.length - 1);
    } else if (direction > 0) {
      setViewerIndex(null);
    }
  }, [authors, mediaIndex, selectedAuthor, viewerIndex]);
  const completeSelectedFrame = useCallback(() => advanceFrame(1), [advanceFrame]);
  const moveToAuthor = useCallback((direction: 1 | -1) => {
    if (viewerIndex === null) return;
    const nextAuthorIndex = viewerIndex + direction;
    if (nextAuthorIndex < 0 || nextAuthorIndex >= authors.length) {
      if (direction > 0) setViewerIndex(null);
      return;
    }
    setViewerIndex(nextAuthorIndex);
    setMediaIndex(direction > 0 ? 0 : authors[nextAuthorIndex].frames.length - 1);
    setStoryPaused(false);
  }, [authors, viewerIndex]);
  const closeViewer = useCallback(() => {
    setViewerIndex(null);
    setStoryPaused(false);
  }, []);

  useEffect(() => {
    if (viewerIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        advanceFrame(-1);
      } else if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        advanceFrame(1);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [advanceFrame, closeViewer, viewerIndex]);

  const selectedPlayerMedia = useMemo(() => {
    if (!selectedMedia) return null;
    const mediaUrl = mediaUrls[selectedMedia.id];
    if (!mediaUrl) return null;
    return { ...selectedMedia, media_url: mediaUrl };
  }, [mediaUrls, selectedMedia]);

  async function toggleReaction() {
    if (!selectedStoryId) return;
    const alreadyReacted = Boolean(reactedStoryIds[selectedStoryId]);
    try {
      if (alreadyReacted) await removeStoryReaction(selectedStoryId);
      else await reactToStory(selectedStoryId);
      trackCommunityContent("community_spark_reacted", {
        spark_id: selectedStoryId,
        action: alreadyReacted ? "removed" : "added",
      });
      setReactedStoryIds((current) => ({ ...current, [selectedStoryId]: !alreadyReacted }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your reaction.");
    }
  }

  const toolButtons: Array<{ key: StoryVisualTool; label: string; icon: ReactNode }> = [
    { key: "music", label: "Audio", icon: <Volume2 size={22} /> },
    { key: "stickers", label: "Stickers", icon: <Sticker size={22} /> },
    { key: "text", label: "Text", icon: <Type size={22} /> },
    { key: "effects", label: "Effects", icon: <Sparkles size={22} /> },
    { key: "mention", label: "Mention", icon: <AtSign size={22} /> },
  ];

  return (
    <>
      {error && !composerOpen && <div role="alert" className="nia-story-error">{error} <button type="button" onClick={() => { setError(null); setRefreshNonce((value) => value + 1); }}>Retry</button></div>}
      <section className="nia-community-stories-shell" aria-label="Niakofa Community Moments">
        {!compact && <header className="nia-community-stories-hero">
          <div className="nia-community-stories-brand">
            <div className="nia-community-stories-mark" aria-hidden="true">N</div>
            <div>
              <p className="nia-story-kicker">Niakofa Community</p>
              <h1>Moments</h1>
              <p>Share • Connect • Build Together</p>
            </div>
          </div>
          <button className="nia-story-pill" type="button" onClick={() => setComposerOpen(true)}>
            <span aria-hidden="true">＋</span>
            Create a Spark
          </button>
        </header>}

        <StoryVisualRail
          authors={visualAuthors}
          loading={loading}
          onCreate={() => setComposerOpen(true)}
          onOpen={openStory}
          emptyLabel="No Sparks yet. Create the first Spark."
        />
      </section>

      {composerOpen && (!draftReady || activeScopeRef.current !== scopeKey) && <div className="nia-story-composer-overlay" role="status" aria-live="polite"><div className="nia-story-composer-shell p-8 text-center text-white">Recovering your saved Spark…</div></div>}
      {composerOpen && draftReady && activeScopeRef.current === scopeKey && (
        <div className="nia-story-composer-overlay">
          <input ref={galleryInput} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={onFileChange} aria-label="Choose Spark media" disabled={trimming} />
          <div className="nia-story-composer-shell">
            {studioStep === "source" && exchangeDraftRef.current && <div className="flex items-center justify-between gap-3 border-b border-white/20 bg-slate-900 px-4 py-3 text-xs text-white" role="status"><span>A listing-owned Exchange video draft is saved. Resume with its original listing and video, or discard it.</span><button type="button" onClick={() => void discardDraft()} className="min-h-10 shrink-0 rounded-lg border border-white/40 px-3 font-bold" data-testid="button-discard-exchange-draft">Discard</button></div>}
            <StoryComposerChrome
              step={studioStep}
              onStep={(next) => { setStudioStep(next); setTool(null); }}
              canContinue={Boolean(caption.trim() || gallerySelection.length)}
              preview={(
                <StoryEditorCanvas
                  elements={editorElements}
                  onChange={setEditorElements}
                  className="nia-story-editor-surface"
                >
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={!selectedFileUrl ? { background: textBackground } : undefined}>
                    {selectedFileUrl ? (
                      selectedPreviewFile?.type.startsWith("video/") ? <video ref={previewVideo} key={selectedFileUrl} src={selectedFileUrl} controls playsInline className="h-full w-full object-contain" style={{ filter }} onLoadedMetadata={(event) => { setVideoDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); event.currentTarget.currentTime = trimPreview[previewFileIndex]?.start ?? 0; }} onPlay={(event) => { if (event.currentTarget.currentTime < (trimPreview[previewFileIndex]?.start ?? 0)) event.currentTarget.currentTime = trimPreview[previewFileIndex].start; }} onTimeUpdate={(event) => {
                        const bounds = trimPreview[previewFileIndex];
                        if (bounds && event.currentTarget.currentTime >= bounds.end) { event.currentTarget.pause(); event.currentTarget.currentTime = bounds.start; }
                      }} /> : <img src={selectedFileUrl} alt="Spark preview" className="h-full w-full object-contain" style={{ filter }} />
                    ) : (
                      <div className="nia-story-text-preview"><span>Niakofa / Spark</span>{!caption && <p>Your words belong here.</p>}<small>{caption ? "Drag the text to place it" : "Write a few words below to begin"}</small></div>
                    )}
                  </div>
                </StoryEditorCanvas>
              )}
              tools={toolButtons}
              activeTool={tool}
              onTool={(nextTool) => setTool(tool === nextTool ? null : nextTool)}
              onClose={closeComposer}
              onSettings={() => { setStudioStep("destination"); window.setTimeout(() => document.getElementById("story-audience")?.focus(), 0); }}
              onGallery={() => { if (!trimming) setGalleryOpen(true); }}
              onCamera={() => { if (!trimming) setCameraOpen(true); }}
              onPublish={() => void publish()}
              publishing={publishing}
              galleryCount={files.length}
            >
              <div className="nia-story-composer__form">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/75" aria-live="polite">
                  <span>{draftReady ? draftError ? "Local save unavailable" : draftSaved ? "Draft saved on this device" : "Saving draft…" : "Recovering your draft…"}</span>
                  {(files.length > 0 || caption.trim() || exchangeDraftRef.current) && <button type="button" className="rounded-lg border border-white/30 px-3 py-2 font-semibold" onClick={() => void discardDraft()} disabled={publishing} data-testid="button-discard-studio-draft">Discard draft</button>}
                </div>
                {draftError && <p role="alert" className="mb-2 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">{draftError} Keep this tab open or try editing again to save.</p>}
                {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
                {publishing && publishStatus && <div role="status" aria-live="polite" className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs"><p>{publishStatus}{publishProgress ? ` ${publishProgress}%` : ""}</p>{publishProgress > 0 && <progress aria-label="Spark upload progress" value={publishProgress} max={100} className="mt-2 w-full" />}<button type="button" className="mt-2 min-h-10 rounded-lg border border-white/20 px-3 font-bold" onClick={() => publishControllerRef.current?.abort()}>Cancel upload</button></div>}
                {studioStep === "destination" ? <>
                  <div className="nia-story-destination-intro"><p className="nia-story-kicker">The final step</p><h2>Where should<br /><em>this Spark land?</em></h2><p>Choose who gets to see your moment before it goes live.</p></div>
                  <div className="nia-story-destination-card">
                    <Users size={22} />
                    <div><label htmlFor="story-audience">Your audience</label><p>{audience === "hub" ? "Only members of this Hub" : "Your approved community"}</p></div>
                    <select id="story-audience" value={audience} onChange={(event) => { setAudience(event.target.value as "community" | "hub"); uploadedIdsRef.current = []; publishAssetIdsRef.current = []; setUploadedIds([]); }} disabled={!hubId || publishing} aria-label="Spark audience"><option value="community">Community</option>{hubId && <option value="hub">This Hub</option>}</select>
                  </div>
                  {selectedVideo && <div className="nia-story-destination-card nia-story-destination-card--listing">
                    <div className="nia-story-destination-card__full"><label htmlFor="spark-exchange-listing">Connect an Exchange listing <span>(optional)</span></label><p>Only an active listing you own can be linked. The server checks eligibility.</p>
                      {exchangeListingsError && <p role="alert">{exchangeListingsError} <button type="button" onClick={() => { setExchangeListingsLoading(true); setExchangeListingsError(""); getExchangeListings({ mine: true, limit: 50 }).then((result) => setOwnedExchangeListings((result.listings ?? []).filter((listing) => listing.status === "active"))).catch((reason: unknown) => setExchangeListingsError(reason instanceof Error ? reason.message : "Could not load listings.")).finally(() => setExchangeListingsLoading(false)); }}>Retry</button></p>}
                      <select id="spark-exchange-listing" value={exchangeListingId} onChange={(event) => { setExchangeListingId(event.target.value); if (event.target.value && audience !== "community") { setAudience("community"); uploadedIdsRef.current = []; publishAssetIdsRef.current = []; setUploadedIds([]); } }} disabled={publishing || exchangeListingsLoading || (!ownedExchangeListings.length && !exchangeDraftRef.current)} data-testid="select-spark-exchange-listing"><option value="">{exchangeListingsLoading ? "Loading listings…" : ownedExchangeListings.length ? "No listing connected" : "No active listings available"}</option>{exchangeDraftRef.current && !ownedExchangeListings.some((listing) => String(listing.id) === exchangeDraftRef.current?.listingId) && <option value={exchangeDraftRef.current.listingId}>Saved listing (no longer active)</option>}{ownedExchangeListings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}</select>
                    </div>
                  </div>}
                  <p className="nia-story-destination-note">{exchangeListingId
                    ? "A linked video appears in Exchange Sparks while its listing remains active. It does not appear in 24-hour Moments. Only the original video and caption are published; editing overlays are not available here."
                    : `Confirm: ${audience === "hub" ? "this Hub's members" : "your approved community"} can see this Spark for 24 hours. ${selectedFiles.length ? `${selectedFiles.length} media item${selectedFiles.length === 1 ? "" : "s"} in your chosen order.` : "Text-only Spark."}`}</p>
                </> : <>
                {files.length > 0 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Spark media sequence">
                  {files.map((file, index) => <button key={`${file.name}-${index}`} type="button" disabled={trimming} onClick={() => setPreviewFileIndex(index)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${previewFileIndex === index ? "border-primary" : "border-white/20"}`} aria-label={`Preview Spark item ${index + 1}`}>
                    {previewUrls[index] ? (file.type.startsWith("video/") ? <video src={previewUrls[index]} muted playsInline className="h-full w-full object-cover" /> : <img src={previewUrls[index]} alt="" className="h-full w-full object-cover" />) : <span className="grid h-full place-items-center text-xs">{index + 1}</span>}
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{index + 1}</span>
                  </button>)}
                </div>}
                {selectedPreviewFile?.type.startsWith("video/") && videoDuration > 0 && <div className="mb-3 rounded-xl border border-white/20 bg-white/5 p-3 text-xs text-white/80">
                  <p className="mb-2 font-bold">Edit video</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label>Start {Math.round(trimStart)}s<input type="range" min={0} max={Math.max(0, Math.floor(videoDuration * 10 - 1) / 10)} step={0.1} value={trimStart} disabled={trimming} onChange={(event) => {
                      const start = Math.min(Number(event.target.value), Math.max(0, videoDuration - 0.1));
                      const end = Math.min(videoDuration, Math.max(start + Math.min(0.1, videoDuration), trimEnd));
                      setTrimPreview((current) => ({ ...current, [previewFileIndex]: { start, end } }));
                      setCoverTimes((current) => {
                        if (current[previewFileIndex] === undefined) return current;
                        const min = Math.ceil(start * 1000);
                        const max = Math.max(min, Math.floor(end * 1000) - 1);
                        return { ...current, [previewFileIndex]: Math.max(min, Math.min(current[previewFileIndex], max)) };
                      });
                      if (previewVideo.current) previewVideo.current.currentTime = start;
                    }} className="w-full" data-testid="input-spark-preview-start" /></label>
                    <label>End {Math.round(trimEnd)}s<input type="range" min={Math.min(videoDuration, trimStart + Math.min(0.1, videoDuration))} max={videoDuration} step={0.1} value={trimEnd} disabled={trimming} onChange={(event) => {
                      const end = Math.min(videoDuration, Number(event.target.value));
                      const start = Math.min(trimStart, Math.max(0, end - Math.min(0.1, videoDuration)));
                      setTrimPreview((current) => ({ ...current, [previewFileIndex]: { start, end } }));
                      setCoverTimes((current) => {
                        if (current[previewFileIndex] === undefined) return current;
                        const min = Math.ceil(start * 1000);
                        const max = Math.max(min, Math.floor(end * 1000) - 1);
                        return { ...current, [previewFileIndex]: Math.max(min, Math.min(current[previewFileIndex], max)) };
                      });
                    }} className="w-full" data-testid="input-spark-preview-end" /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" className="rounded-lg border border-white/20 px-3 py-2 font-bold" data-testid="button-trim-spark-video" disabled={trimming || (trimStart <= 0 && trimEnd >= videoDuration)} onClick={async () => {
                      const bounds = { start: trimStart, end: trimEnd };
                      setTrimming(true);
                      try {
                        setError(null);
                        const trimmed = await trimVideoFile(selectedPreviewFile!, bounds.start, bounds.end);
                        const nextFiles = files.slice(); nextFiles[previewFileIndex] = trimmed;
                        setFiles(nextFiles);
                        const nextIds = [...uploadedIdsRef.current]; nextIds[previewFileIndex] = null;
                        uploadedIdsRef.current = nextIds;
                        publishAssetIdsRef.current = [];
                        setUploadedIds(nextIds);
                        setCoverTimes((current) => {
                          if (current[previewFileIndex] === undefined) return current;
                          const next = { ...current };
                          next[previewFileIndex] = Math.max(0, Math.min(
                            Math.round(current[previewFileIndex] - bounds.start * 1000),
                            Math.max(0, Math.floor((bounds.end - bounds.start) * 1000) - 1),
                          ));
                          return next;
                        });
                        setTrimPreview((current) => { const next = { ...current }; delete next[previewFileIndex]; return next; });
                      } catch (reason) { setError(reason instanceof Error ? reason.message : "Video trimming is not supported."); }
                      finally { setTrimming(false); }
                    }}>{trimming ? "Trimming…" : "Apply trim"}</button>
                    <label className="flex items-center gap-2">Cover frame
                      <input type="range" min={coverMinMs} max={coverMaxMs} step={100} value={coverValueMs} disabled={trimming} onChange={(event) => {
                        const time = Math.max(coverMinMs, Math.min(Number(event.target.value), coverMaxMs));
                        setCoverTimes((current) => ({ ...current, [previewFileIndex]: time }));
                        if (previewVideo.current) previewVideo.current.currentTime = time / 1000;
                      }} data-testid="input-spark-cover-time" aria-label="Cover frame time" />
                      <span>{Math.round(coverValueMs / 1000)}s</span>
                    </label>
                  </div>
                </div>}
                {tool === "music" && <div className="nia-story-audio-note"><Volume2 size={19} /><div><strong>Original audio only</strong><p>Your video keeps the sound it was recorded with. Music tracks are not available yet.</p></div></div>}
                {tool === "stickers" && <div className="flex gap-2 overflow-x-auto pb-1">{["💙", "🙏", "🤝", "🌍", "🙌", "✨", "📍"].map((item) => <button key={item} type="button" onClick={() => { setSticker(item); upsertEditorElement({ id: "sticker", type: "sticker", payload: { sticker: item }, position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15 }); }} className={`h-11 w-11 shrink-0 rounded-xl border text-xl ${sticker === item ? "border-primary bg-primary/10" : "border-white/20"}`} aria-label={`Add ${item} sticker`}>{item}</button>)}</div>}
                {tool === "effects" && <div className="flex gap-2 overflow-x-auto pb-1">{(["none", "warmth", "contrast", "grayscale", "vignette"] as Effect[]).map((item) => <button key={item} type="button" onClick={() => setEffect(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize ${effect === item ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}>{item}</button>)}</div>}
                {tool === "mention" && <div className="space-y-2"><input value={mention} onChange={(event) => { setMention(event.target.value); setMentionUserId(null); setEditorElements((current) => current.filter((element) => element.id !== "mention")); }} className="min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none focus:border-primary" placeholder="@ Mention a community member" />{mentionCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => { setMention(candidate.name); setMentionUserId(candidate.id); setMentionCandidates([]); upsertEditorElement({ id: "mention", type: "mention", payload: { display_name: candidate.name, mention_user_id: candidate.id }, position_x: 50, position_y: 65, scale: 1, rotation: 0, z_index: 18 }); }} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${mentionUserId === candidate.id ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}><MessageAvatar name={candidate.name} avatarUrl={candidate.avatar_url} size={28} />{candidate.name}</button>)}</div>}
                {tool === "text" && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-bold text-white/65">Color<input type="color" value={textColor} onChange={(event) => { const value = event.target.value; setTextColor(value); updateEditorElement("caption", { payload: { color: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-white/10" /></label><label className="text-[10px] font-bold text-white/65">Size<select value={textSize} onChange={(event) => { const value = event.target.value; setTextSize(value); updateEditorElement("caption", { payload: { font_size: Number(value) } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="14">Small</option><option value="18">Medium</option><option value="26">Large</option></select></label><label className="text-[10px] font-bold text-white/65">Align<select value={textAlign} onChange={(event) => { const value = event.target.value as "left" | "center" | "right"; setTextAlign(value); updateEditorElement("caption", { payload: { align: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><div className="col-span-3"><p className="mb-1 text-[10px] font-bold text-white/65">Text background</p><div className="flex gap-2">{TEXT_STORY_BACKGROUNDS.map((color) => <button key={color} type="button" onClick={() => setTextBackground(color)} className={`h-8 w-8 rounded-full border-2 ${textBackground === color ? "border-white ring-2 ring-primary" : "border-white/20"}`} style={{ background: color }} aria-label={`Choose background ${color}`} />)}</div></div></div>}
                <textarea value={caption} onChange={(event) => updateCaption(event.target.value)} maxLength={1000} rows={2} className="mt-3 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white outline-none focus:border-primary" placeholder="Add text to your Spark…" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-white/55">Original audio is preserved. Apply trim to replace the clip before upload; visual effects remain preview-only. Text and stickers are saved as Story overlays.</p>
                  {files.length > 0 && <button type="button" disabled={trimming} onClick={() => { setFiles([]); setGallerySelection([]); setTrimPreview({}); setCoverTimes({}); }} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-bold"><Trash2 className="h-4 w-4" /> Clear</button>}
                </div>
                </>}
              </div>
            </StoryComposerChrome>
          </div>
        </div>
      )}
      {cameraOpen && <StoryCameraRecorder onUse={onCameraVideo} onCancel={() => setCameraOpen(false)} />}

      {selectedStory && selectedAuthor && (
        <CommunityStoryViewerOverlay
          author={selectedAuthor}
          story={selectedStory}
          media={selectedMedia}
          playerMedia={selectedPlayerMedia}
          progress={storyProgress}
          paused={storyPaused}
          onProgress={setStoryProgress}
          onPrevious={() => advanceFrame(-1)}
          onNext={completeSelectedFrame}
          onClose={closeViewer}
          onMore={() => setShareStoryId(selectedStory.id)}
          onReact={() => void toggleReaction()}
          onSwipe={(direction) => {
            if (direction === "close") {
              closeViewer();
              return;
            }
            moveToAuthor(direction === "next" ? 1 : -1);
          }}
          onHoldChange={setStoryPaused}
          onReply={(body) => {
            if (!selectedStory.reply_enabled) return;
            void sendStoryContextMessage({
              recipientId: selectedStory.author_user_id,
              storyId: selectedStory.id,
              body,
            })
              .then(() => navigate(`/messages?mode=direct&recipientId=${selectedStory.author_user_id}&storyId=${selectedStory.id}`))
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : "Could not send your Spark reply.");
              });
          }}
          onShare={() => setShareStoryId(selectedStory.id)}
        />
      )}
      {galleryOpen && composerOpen && draftReady && activeScopeRef.current === scopeKey && (
        <CommunityStoryGalleryOverlay
          thumbnails={galleryThumbnails}
          selected={gallerySelection}
          onSelect={(id) => toggleGallerySelection(Number(id))}
          onMultiple={() => setGallerySelection(files.map((_, index) => index))}
          onClose={() => setGalleryOpen(false)}
          onCamera={() => { if (!trimming) setCameraOpen(true); }}
          onChooseFiles={() => galleryInput.current?.click()}
          onDone={() => setGalleryOpen(false)}
        />
      )}
      {shareStoryId !== null && <CommunityStoryShareOverlay storyId={shareStoryId} onClose={() => setShareStoryId(null)} />}
    </>
  );
}