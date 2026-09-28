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
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { StoryMediaPlayer } from "./StoryMediaPlayer";
import { StoryShareSheet } from "./StoryShareSheet";
import { normalizeStoryFiles, useObjectUrls, validateStoryFiles } from "./StoryComposerMedia";
import { StoryEditorCanvas, type EditableStoryElement } from "./StoryEditorCanvas";
import { readStoryMediaMetadata } from "@/lib/storyMediaPipeline";
import { trackCommunityContent } from "@/lib/communityMediaAnalytics";
import { getExchangeListings } from "@/lib/community-exchange-client";
import type { ExchangeListing } from "@/lib/community-exchange-types";
import {
  completeSparkUpload,
  createExchangeSparkDraft,
  createSparkUploadSession,
  publishExchangeSparkDraft,
  putRawSparkFile,
  readExchangeSparkVideoDuration,
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
  StoryGalleryChrome,
  StoryViewerChrome,
  StoryVisualRail,
  type StoryVisualAuthor,
  type StoryVisualTool,
} from "./CommunityStoryVisual";

type StoryMedia = {
  id: number;
  media_type: "photo" | "video" | "audio";
  mime_type: string;
  duration_ms: number | null;
  media_url: string;
  width?: number | null;
  height?: number | null;
};

type CommunityStory = {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  caption: string | null;
  audience: string;
  reply_enabled: boolean;
  created_at: string | null;
  expires_at: string | null;
  author: { id: number; name: string; avatar_url: string | null };
  media: StoryMedia[];
  elements: Array<{ id: number; type: string; payload: Record<string, unknown>; position_x?: number; position_y?: number; scale?: number; rotation?: number; z_index?: number }>;
};

type StoryFrame = { story: CommunityStory; media: StoryMedia | null };
type StoryAuthor = { author_user_id: number; author: CommunityStory["author"]; frames: StoryFrame[] };
type Tool = "music" | "stickers" | "text" | "effects" | "mention";
type Effect = "none" | "warmth" | "contrast" | "grayscale" | "vignette";
const TEXT_STORY_BACKGROUNDS = ["#172554", "#0f766e", "#7c2d12", "#701a75", "#111827"] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this media."));
    reader.readAsDataURL(file);
  });
}

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
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
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
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
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
  const selectedFiles = gallerySelection
    .filter((index) => Number.isInteger(index) && index >= 0 && index < files.length)
    .map((index) => files[index])
    .filter((file): file is File => Boolean(file));
  const selectedVideo = selectedFiles.some((file) => file.type.startsWith("video/"));
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
    if (!composerOpen) return;
    let cancelled = false;
    setExchangeListingsLoading(true);
    setExchangeListingsError("");
    getExchangeListings({ mine: true, limit: 50 })
      .then((result) => {
        if (!cancelled) {
          const eligible = (result.listings ?? []).filter((listing) => listing.status === "active");
          setOwnedExchangeListings(eligible);
          setExchangeListingId((current) => eligible.some((listing) => String(listing.id) === current) ? current : "");
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
      const response = await fetch(media.media_url, { headers: authHeaders() });
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

  const resetComposer = () => {
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
    setExchangeListingsError("");
  };

  useEffect(() => {
    if (!composerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>(galleryOpen ? ".nia-story-gallery" : ".nia-story-composer");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (galleryOpen) { setGalleryOpen(false); return; }
        if (studioStep !== "source") { setStudioStep(studioStep === "destination" ? "edit" : "source"); return; }
        publishControllerRef.current?.abort();
        resetComposer();
        setComposerOpen(false);
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
  // Reset is intentionally scoped to explicit close actions, not effect cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpen, galleryOpen, studioStep]);

  const publish = async () => {
    if (publishing || (!caption.trim() && gallerySelection.length === 0)) {
      setError("Add a photo, video, or a few words before publishing.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const selectedIndexes = gallerySelection
        .filter((index) => Number.isInteger(index) && index >= 0 && index < files.length)
        .sort((a, b) => a - b);
      const publishFiles = selectedIndexes.map((index) => files[index]).filter((file): file is File => Boolean(file));
      if (exchangeListingId) {
        if (audience !== "community" || publishFiles.length !== 1 || !publishFiles[0].type.startsWith("video/")) {
          throw new Error("An Exchange Spark needs one video shared with your Community. Remove other selected items or change the audience.");
        }
        if (editorElements.some((element) => element.id !== "caption") || effect !== "none") {
          throw new Error("Exchange video stickers, mentions, and effects are not rendered yet. Remove them or publish this as a 24-hour Moment.");
        }
        const file = publishFiles[0];
        const controller = new AbortController();
        publishControllerRef.current = controller;
        try {
          setPublishStatus("Checking your video…");
          const durationSeconds = await readExchangeSparkVideoDuration(file, controller.signal);
          const fileError = validateExchangeSparkVideo({ mimeType: file.type, byteSize: file.size, durationSeconds });
          if (fileError) throw new Error(fileError);
          setPublishStatus("Creating your Exchange Spark…");
          const draft = await createExchangeSparkDraft(Number(exchangeListingId), caption.trim(), controller.signal);
          if (draft.upload_context.contextKind !== "exchange_spark" || draft.upload_context.contextId !== draft.spark_id) {
            throw new Error("The server returned an invalid Spark upload context.");
          }
          const session = await createSparkUploadSession({ contextId: draft.spark_id, file, signal: controller.signal });
          setPublishStatus("Uploading video…");
          await putRawSparkFile(session.upload, file, controller.signal, (loaded, total) => {
            setPublishProgress(total > 0 ? Math.round(loaded / total * 100) : 0);
          });
          setPublishStatus("Processing video…");
          await completeSparkUpload(session.complete_url, controller.signal);
          await waitForExchangeSparkMediaReady(draft.spark_id, controller.signal, () => {});
          setPublishStatus("Publishing Spark…");
          await publishExchangeSparkDraft(draft.spark_id, caption.trim(), controller.signal);
          trackCommunityContent("community_spark_created", hubId === null ? {} : { hub_id: hubId });
          resetComposer();
          setComposerOpen(false);
          navigate("/community?section=exchange");
          return;
        } finally {
          publishControllerRef.current = null;
        }
      }
      const validationErrors = await validateStoryFiles(publishFiles);
      if (validationErrors.length) throw new Error(validationErrors[0]);
      const metadata = await Promise.all(publishFiles.map((file) => readStoryMediaMetadata(file)));
      const media = await Promise.all(publishFiles.map(async (file, index) => ({
        data_url: await readFileAsDataUrl(file),
        media_type: file.type.startsWith("video/") ? "video" as const : "photo" as const,
        mime_type: file.type,
        duration_ms: metadata[index].durationSeconds ? Math.round(metadata[index].durationSeconds * 1000) : null,
        width: metadata[index].width ?? null,
        height: metadata[index].height ?? null,
      })));
      const elements: Array<Record<string, unknown>> = [];
      if (!media.length) elements.push({ type: "background", payload: { color: textBackground }, position_x: 50, position_y: 50, z_index: 0 });
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
      if (tool === "effects" || effect !== "none") elements.push({ type: "effect", payload: { effect }, position_x: 50, position_y: 50 });
      const response = await fetch("/api/community/stories", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim(),
          hub_id: hubId,
          audience,
          media,
          elements,
          ...(media.some((item) => item.media_type === "video") && exchangeListingId
            ? { exchange_listing_id: Number(exchangeListingId) }
            : {}),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not publish your Spark.");
      trackCommunityContent("community_spark_created", hubId === null ? {} : { hub_id: hubId });
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
      setPublishing(false);
      setPublishStatus("");
      setPublishProgress(0);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files: selected, errors } = normalizeStoryFiles(
      [...files, ...Array.from(event.target.files ?? [])],
      { allowExchangeVideo: true },
    );
    if (errors.length) setError(errors[0]);
    if (selected.length) {
      setFiles(selected);
      setGallerySelection(selected.map((_, index) => index));
      setPreviewFileIndex(Math.max(0, selected.length - 1));
      setStudioStep("edit");
      setGalleryOpen(false);
      if (!errors.length) setError(null);
    }
    event.target.value = "";
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

      {composerOpen && (
        <div className="nia-story-composer-overlay">
          <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={onFileChange} aria-label="Capture Spark media" />
          <input ref={galleryInput} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={onFileChange} aria-label="Choose Spark media" />
          <div className="nia-story-composer-shell">
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
                      selectedPreviewFile?.type.startsWith("video/") ? <video src={selectedFileUrl} controls playsInline className="h-full w-full object-contain" style={{ filter }} /> : <img src={selectedFileUrl} alt="Spark preview" className="h-full w-full object-contain" style={{ filter }} />
                    ) : (
                      <div className="nia-story-text-preview"><span>Niakofa / Spark</span>{!caption && <p>Your words belong here.</p>}<small>{caption ? "Drag the text to place it" : "Write a few words below to begin"}</small></div>
                    )}
                  </div>
                </StoryEditorCanvas>
              )}
              tools={toolButtons}
              activeTool={tool}
              onTool={(nextTool) => setTool(tool === nextTool ? null : nextTool)}
              onClose={() => { publishControllerRef.current?.abort(); resetComposer(); setError(null); setComposerOpen(false); }}
              onSettings={() => { setStudioStep("destination"); window.setTimeout(() => document.getElementById("story-audience")?.focus(), 0); }}
              onGallery={() => setGalleryOpen(true)}
              onCamera={() => cameraInput.current?.click()}
              onPublish={() => void publish()}
              publishing={publishing}
              galleryCount={files.length}
            >
              <div className="nia-story-composer__form">
                {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
                {publishing && publishStatus && <div role="status" aria-live="polite" className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs"><p>{publishStatus}{publishProgress ? ` ${publishProgress}%` : ""}</p>{publishProgress > 0 && <progress aria-label="Spark upload progress" value={publishProgress} max={100} className="mt-2 w-full" />}<button type="button" className="mt-2 min-h-10 rounded-lg border border-white/20 px-3 font-bold" onClick={() => publishControllerRef.current?.abort()}>Cancel upload</button></div>}
                {studioStep === "destination" ? <>
                  <div className="nia-story-destination-intro"><p className="nia-story-kicker">The final step</p><h2>Where should<br /><em>this Spark land?</em></h2><p>Choose who gets to see your moment before it goes live.</p></div>
                  <div className="nia-story-destination-card">
                    <Users size={22} />
                    <div><label htmlFor="story-audience">Your audience</label><p>{audience === "hub" ? "Only members of this Hub" : "Your approved community"}</p></div>
                    <select id="story-audience" value={audience} onChange={(event) => setAudience(event.target.value as "community" | "hub")} disabled={!hubId} aria-label="Spark audience"><option value="community">Community</option>{hubId && <option value="hub">This Hub</option>}</select>
                  </div>
                  {selectedVideo && <div className="nia-story-destination-card nia-story-destination-card--listing">
                    <div className="nia-story-destination-card__full"><label htmlFor="spark-exchange-listing">Connect an Exchange listing <span>(optional)</span></label><p>Only an active listing you own can be linked. The server checks eligibility.</p>
                      {exchangeListingsError && <p role="alert">{exchangeListingsError} <button type="button" onClick={() => { setExchangeListingsLoading(true); setExchangeListingsError(""); getExchangeListings({ mine: true, limit: 50 }).then((result) => setOwnedExchangeListings((result.listings ?? []).filter((listing) => listing.status === "active"))).catch((reason: unknown) => setExchangeListingsError(reason instanceof Error ? reason.message : "Could not load listings.")).finally(() => setExchangeListingsLoading(false)); }}>Retry</button></p>}
                      <select id="spark-exchange-listing" value={exchangeListingId} onChange={(event) => { setExchangeListingId(event.target.value); if (event.target.value) setAudience("community"); }} disabled={exchangeListingsLoading || !ownedExchangeListings.length} data-testid="select-spark-exchange-listing"><option value="">{exchangeListingsLoading ? "Loading listings…" : ownedExchangeListings.length ? "No listing connected" : "No active listings available"}</option>{ownedExchangeListings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}</select>
                    </div>
                  </div>}
                  <p className="nia-story-destination-note">{exchangeListingId
                    ? "A linked video appears in Exchange Sparks while its listing remains active. It does not appear in 24-hour Moments. Only the original video and caption are published; editing overlays are not available here."
                    : "Your Spark appears in Moments for 24 hours, then expires."}</p>
                </> : <>
                {files.length > 0 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Spark media sequence">
                  {files.map((file, index) => <button key={`${file.name}-${index}`} type="button" onClick={() => setPreviewFileIndex(index)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${previewFileIndex === index ? "border-primary" : "border-white/20"}`} aria-label={`Preview Spark item ${index + 1}`}>
                    {previewUrls[index] ? (file.type.startsWith("video/") ? <video src={previewUrls[index]} muted playsInline className="h-full w-full object-cover" /> : <img src={previewUrls[index]} alt="" className="h-full w-full object-cover" />) : <span className="grid h-full place-items-center text-xs">{index + 1}</span>}
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{index + 1}</span>
                  </button>)}
                </div>}
                {tool === "music" && <div className="nia-story-audio-note"><Volume2 size={19} /><div><strong>Original audio only</strong><p>Your video keeps the sound it was recorded with. Music tracks are not available yet.</p></div></div>}
                {tool === "stickers" && <div className="flex gap-2 overflow-x-auto pb-1">{["💙", "🙏", "🤝", "🌍", "🙌", "✨", "📍"].map((item) => <button key={item} type="button" onClick={() => { setSticker(item); upsertEditorElement({ id: "sticker", type: "sticker", payload: { sticker: item }, position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15 }); }} className={`h-11 w-11 shrink-0 rounded-xl border text-xl ${sticker === item ? "border-primary bg-primary/10" : "border-white/20"}`} aria-label={`Add ${item} sticker`}>{item}</button>)}</div>}
                {tool === "effects" && <div className="flex gap-2 overflow-x-auto pb-1">{(["none", "warmth", "contrast", "grayscale", "vignette"] as Effect[]).map((item) => <button key={item} type="button" onClick={() => setEffect(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize ${effect === item ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}>{item}</button>)}</div>}
                {tool === "mention" && <div className="space-y-2"><input value={mention} onChange={(event) => { setMention(event.target.value); setMentionUserId(null); setEditorElements((current) => current.filter((element) => element.id !== "mention")); }} className="min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none focus:border-primary" placeholder="@ Mention a community member" />{mentionCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => { setMention(candidate.name); setMentionUserId(candidate.id); setMentionCandidates([]); upsertEditorElement({ id: "mention", type: "mention", payload: { display_name: candidate.name, mention_user_id: candidate.id }, position_x: 50, position_y: 65, scale: 1, rotation: 0, z_index: 18 }); }} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${mentionUserId === candidate.id ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}><MessageAvatar name={candidate.name} avatarUrl={candidate.avatar_url} size={28} />{candidate.name}</button>)}</div>}
                {tool === "text" && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-bold text-white/65">Color<input type="color" value={textColor} onChange={(event) => { const value = event.target.value; setTextColor(value); updateEditorElement("caption", { payload: { color: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-white/10" /></label><label className="text-[10px] font-bold text-white/65">Size<select value={textSize} onChange={(event) => { const value = event.target.value; setTextSize(value); updateEditorElement("caption", { payload: { font_size: Number(value) } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="14">Small</option><option value="18">Medium</option><option value="26">Large</option></select></label><label className="text-[10px] font-bold text-white/65">Align<select value={textAlign} onChange={(event) => { const value = event.target.value as "left" | "center" | "right"; setTextAlign(value); updateEditorElement("caption", { payload: { align: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><div className="col-span-3"><p className="mb-1 text-[10px] font-bold text-white/65">Text background</p><div className="flex gap-2">{TEXT_STORY_BACKGROUNDS.map((color) => <button key={color} type="button" onClick={() => setTextBackground(color)} className={`h-8 w-8 rounded-full border-2 ${textBackground === color ? "border-white ring-2 ring-primary" : "border-white/20"}`} style={{ background: color }} aria-label={`Choose background ${color}`} />)}</div></div></div>}
                <textarea value={caption} onChange={(event) => updateCaption(event.target.value)} maxLength={1000} rows={2} className="mt-3 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white outline-none focus:border-primary" placeholder="Add text to your Spark…" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-white/55">Photos and short videos only. Your original video audio is preserved; effects change the preview, not the uploaded file.</p>
                  {files.length > 0 && <button type="button" onClick={() => { setFiles([]); setGallerySelection([]); }} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-bold"><Trash2 className="h-4 w-4" /> Clear</button>}
                </div>
                </>}
              </div>
            </StoryComposerChrome>
          </div>
        </div>
      )}

      {selectedStory && selectedAuthor && (
        <div className="nia-story-viewer-overlay" role="dialog" aria-modal="true" aria-label={`${selectedAuthor.author.name}'s Spark`}>
          <StoryViewerChrome
            author={{
              id: selectedAuthor.author_user_id,
              name: selectedAuthor.author.name,
              avatarUrl: selectedAuthor.author.avatar_url,
              contextLabel: selectedStory.hub_id ? "Hub Spark" : "Community",
            }}
            progress={storyProgress}
            onPrevious={() => advanceFrame(-1)}
            onNext={() => advanceFrame(1)}
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
            replyPlaceholder={selectedStory.reply_enabled ? "Reply to this Spark…" : "Replies are off"}
            replyDisabled={!selectedStory.reply_enabled}
          >
            <div className="nia-story-viewer__player-shell">
              <StoryMediaPlayer
                media={selectedPlayerMedia}
                elements={selectedStory.elements}
                fallbackText={selectedMedia ? "Loading Spark media…" : selectedStory.caption || "Community Spark"}
                onComplete={completeSelectedFrame}
                onProgress={setStoryProgress}
                paused={storyPaused}
              />
              {selectedStory.caption && <p className="nia-story-viewer__caption">{selectedStory.caption}</p>}
            </div>
          </StoryViewerChrome>
        </div>
      )}
      {galleryOpen && composerOpen && (
        <div className="nia-story-gallery-overlay">
          <StoryGalleryChrome
            thumbnails={galleryThumbnails}
            selected={gallerySelection}
            onSelect={(id) => toggleGallerySelection(Number(id))}
            onMultiple={() => setGallerySelection(files.map((_, index) => index))}
            onClose={() => setGalleryOpen(false)}
            onCamera={() => cameraInput.current?.click()}
            onChooseFiles={() => galleryInput.current?.click()}
            onDone={() => setGalleryOpen(false)}
          />
        </div>
      )}
      {shareStoryId !== null && <StoryShareSheet storyId={shareStoryId} onClose={() => setShareStoryId(null)} />}
    </>
  );
}