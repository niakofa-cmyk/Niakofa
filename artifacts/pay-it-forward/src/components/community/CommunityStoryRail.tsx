import { reportClientSideEffectFailure } from "@/lib/client-error-reporting";

import {
  AtSign,
  Brush,
  Layers3,
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
import { validateCommunityMomentFile } from "@/lib/community-moments-upload";
import { useAppContext } from "@/lib/AppContext";
import { MessageAvatar } from "@/components/messages/MessageAvatar";
import { buildMomentsSparkHref } from "./CommunityExperienceContract";
import { useObjectUrls, useWebVttObjectUrl } from "./StoryComposerMedia";
import {
  buildMomentMediaAccessibility,
  emptyMomentStudioAccessibility,
  persistMomentStudioDraft,
  parseMomentStudioTags,
  restoreMomentStudioAccessibility,
  validateMomentStudioWebVtt,
  type MomentStudioAccessibilityDraft,
} from "./moment-studio-accessibility";
import { StoryEditorCanvas, type EditableStoryElement } from "./StoryEditorCanvas";
import { discardStudioDraft, emptyStudioScope, exchangeResumeAction, loadStudioDraft, newStudioPublishId, persistStudioPublishAttempt, saveStudioDraft, studioDraftKey, studioFileFingerprint, studioPublishSignature, type StudioDraft } from "./story-studio-draft";
import { CameraClipReelPendingError, chooseStudioFiles, getCameraClipReelStatus, isCameraClipReelSelection, publishStudioMoment, requestCameraClipReel, selectedStudioFiles, validateMomentCompositionPlaybackUrl, validateStudioFiles } from "./story-studio-publish";
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
  SparkComposerChrome,
  StoryVisualRail,
  type StoryVisualAuthor,
  type StoryVisualTool,
} from "./CommunityStoryVisual";
import { SparkFamilyStoryPreservationControl } from "./SparkFamilyStoryPreservationControl";
import {
  chooseMomentCutdownIndexes,
  canCopyStudioFilesToFamily,
  FAMILY_STORY_CANDIDATE_DURATION_MS,
  saveSparkAsPrivateFamilyStory,
  totalStudioVideoDurationMs,
} from "./community-spark-family-archive";
import {
  CommunityStoryGalleryOverlay,
  CommunityStoryShareOverlay,
  CommunityStoryViewerOverlay,
} from "./CommunityStoryRailOverlays";
import type { CommunityStory, Effect, StoryAuthor, StoryMedia } from "./story-rail-types";
import { TEXT_STORY_BACKGROUNDS } from "./story-rail-types";
import { StoryCameraRecorder } from "./StoryCameraRecorder";
import { trimVideoFile } from "./story-media-tools";
import {
  BUILT_IN_STORY_TEMPLATES,
  instantiateStoryTemplate,
  loadSavedStoryTemplates,
  removeStoryTemplate,
  saveStoryTemplate,
  type StoryStudioTemplate,
} from "./story-studio-templates";

type Tool = "music" | "templates" | "draw" | "stickers" | "text" | "effects" | "mention";

function groupStories(stories: CommunityStory[]): StoryAuthor[] {
  const byAuthor = new Map<number, StoryAuthor>();
  for (const story of [...stories].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))) {
    const group = byAuthor.get(story.author_user_id) ?? { author_user_id: story.author_user_id, author: story.author, frames: [] };
    if (story.moment_video?.status === "ready") group.frames.push({ story, media: null, isMomentReel: true });
    else if (story.media.length) story.media.forEach((media) => group.frames.push({ story, media }));
    else group.frames.push({ story, media: null });
    byAuthor.set(story.author_user_id, group);
  }
  return Array.from(byAuthor.values());
}

type CameraClipReelMarker = { orderedFingerprints: string[] };
type ExtendedStudioDraft = StudioDraft & MomentStudioAccessibilityDraft & {
  cameraClipReel?: CameraClipReelMarker | null;
  cameraReelStoryId?: number | null;
};

export function CommunityStoryRail({
  hubId,
  openComposerSignal,
  openStoryId = null,
  compact = false,
  additionalComposerSignal = 0,
  responseToStoryId = null,
  challengeKey = null,
}: {
  hubId: number | null;
  openComposerSignal?: number;
  openStoryId?: number | null;
  compact?: boolean;
  additionalComposerSignal?: number;
  responseToStoryId?: number | null;
  challengeKey?: string | null;
}) {
  const [location, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const userId = currentUser?.id ?? null;
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const autoCameraOpenedRef = useRef(false);
  const [responseTargetId, setResponseTargetId] = useState<number | null>(null);
  const [activeChallengeKey, setActiveChallengeKey] = useState<string | null>(null);
  const [archiveEnabled, setArchiveEnabled] = useState(false);
  const [remixEnabled, setRemixEnabled] = useState(false);
  const [familyStoryDurationMs, setFamilyStoryDurationMs] = useState<number | null>(null);
  const [familyStoryDestination, setFamilyStoryDestination] = useState<"family-only" | "moment" | null>(null);
  const [familyStoryCopyEnabled, setFamilyStoryCopyEnabled] = useState(false);
  const [familyStoryFamilyId, setFamilyStoryFamilyId] = useState<number | null>(null);
  const [familyStoryArchiveId, setFamilyStoryArchiveId] = useState<string>(() => newStudioPublishId());
  const familyStoryOriginalArchivedRef = useRef(false);
  const preserveFamilyStoryArchiveOnTrimRef = useRef(false);
  const [checkingStudioDuration, setCheckingStudioDuration] = useState(false);
  useEffect(() => {
    // The page-level signal starts at 0, so a positive value is always an
    // explicit Create → Story action. This also works when the rail is
    // mounted after switching from another Community tab.
    if ((openComposerSignal ?? 0) + additionalComposerSignal > 0) {
      setResponseTargetId(responseToStoryId);
      setActiveChallengeKey(challengeKey);
      setAudience(responseToStoryId ? "community" : (hubId ? "hub" : "community"));
      setComposerOpen(true);
      setCameraOpen(true);
    }
  }, [additionalComposerSignal, challengeKey, hubId, openComposerSignal, responseToStoryId]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallerySelection, setGallerySelection] = useState<number[]>([]);
  const [studioStep, setStudioStep] = useState<"source" | "edit" | "destination">("source");
  const [seenAuthorIds, setSeenAuthorIds] = useState<Set<number>>(() => new Set());
  const [mediaUrls, setMediaUrls] = useState<Record<number, string>>({});
  const mediaObjectUrlsRef = useRef<Record<number, string>>({});
  const [momentVideoUrls, setMomentVideoUrls] = useState<Record<number, string>>({});
  const momentVideoUrlsRef = useRef<Record<number, string>>({});
  const momentVideoGrantExpiryRef = useRef<Record<number, number>>({});
  const momentVideoLoadingRef = useRef(new Set<number>());
  const momentVideoRefreshAttemptedRef = useRef(new Set<number>());
  const [momentVideoVersions, setMomentVideoVersions] = useState<Record<number, number>>({});
  const [momentVideoStates, setMomentVideoStates] = useState<Record<number, { status: string; failureCode: string | null; durationMs: number | null; playbackGrantUrl: string }>>({});
  const [momentVideoPlaybackErrors, setMomentVideoPlaybackErrors] = useState<Record<number, string>>({});
  const [shareStoryId, setShareStoryId] = useState<number | null>(null);
  const [reactedStoryIds, setReactedStoryIds] = useState<Record<number, boolean>>({});
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [cameraClipReelMarker, setCameraClipReelMarker] = useState<CameraClipReelMarker | null>(null);
  const [pendingCameraReelStoryId, setPendingCameraReelStoryId] = useState<number | null>(null);
  const [momentAccessibility, setMomentAccessibility] = useState<MomentStudioAccessibilityDraft>(emptyMomentStudioAccessibility);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicRightsBasis, setMusicRightsBasis] = useState<"original" | "licensed">("original");
  const [musicLicenseReference, setMusicLicenseReference] = useState("");
  const [musicRightsAccepted, setMusicRightsAccepted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.65);
  const [uploadedMusicAssetId, setUploadedMusicAssetId] = useState<number | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"community" | "hub">(hubId ? "hub" : "community");
  const [tool, setTool] = useState<Tool | null>(null);
  const [effect, setEffect] = useState<Effect>("none");
  const [sticker, setSticker] = useState("💙");
  const [mention, setMention] = useState("");
  const [mentionUserId, setMentionUserId] = useState<number | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<Array<{ id: number; name: string; username: string | null; avatar_url: string | null }>>([]);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState("18");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("center");
  const [textBackground, setTextBackground] = useState<string>(TEXT_STORY_BACKGROUNDS[0]);
  const [editorElements, setEditorElements] = useState<EditableStoryElement[]>([]);
  const [drawingColor, setDrawingColor] = useState("#ffffff");
  const [drawingWidth, setDrawingWidth] = useState(4);
  const [studioTemplates, setStudioTemplates] = useState<StoryStudioTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState("");
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
  const recoveredDraftRef = useRef(false);
  const scopeSnapshotsRef = useRef(new Map<string, StudioDraft>());
  const galleryInput = useRef<HTMLInputElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const autoOpenedRef = useRef(false);
  const deepLinkedStoryRef = useRef<number | null>(null);
  const momentVideoOwnerRef = useRef(userId);

  useEffect(() => {
    if (momentVideoOwnerRef.current === userId) return;
    momentVideoOwnerRef.current = userId;
    momentVideoUrlsRef.current = {};
    momentVideoGrantExpiryRef.current = {};
    momentVideoRefreshAttemptedRef.current.clear();
    setMomentVideoUrls({});
    setMomentVideoVersions({});
    setMomentVideoStates({});
    setMomentVideoPlaybackErrors({});
  }, [userId]);

  useEffect(() => {
    setStudioTemplates(userId ? loadSavedStoryTemplates(userId) : []);
  }, [userId]);

  const authors = useMemo(() => groupStories(stories), [stories]);
  const selectedAuthor = viewerIndex === null ? null : authors[viewerIndex] ?? null;
  const selectedFrame = selectedAuthor?.frames[mediaIndex] ?? null;
  const selectedStory = selectedFrame?.story ?? null;
  const selectedStoryId = selectedStory?.id ?? null;
  const selectedMedia = selectedFrame?.media ?? null;
  const selectedMomentVideoState = useMemo(() => selectedStory?.moment_video
    ? momentVideoStates[selectedStory.id] ?? {
      status: selectedStory.moment_video.status,
      failureCode: null,
      durationMs: selectedStory.moment_video.duration_ms ?? null,
      playbackGrantUrl: selectedStory.moment_video.playback_grant_url,
    }
    : null, [momentVideoStates, selectedStory]);
  const previewUrls = useObjectUrls(files);
  const musicPreviewFiles = useMemo(() => musicFile ? [musicFile] : [], [musicFile]);
  const musicPreviewUrls = useObjectUrls(musicPreviewFiles);
  const selectedPreviewFile = files[previewFileIndex] ?? files[0] ?? null;
  const selectedFileUrl = previewUrls[previewFileIndex] ?? previewUrls[0] ?? null;
  const previewCaptionsTrackUrl = useWebVttObjectUrl(momentAccessibility.momentCaptionsVtt[previewFileIndex] ?? "");
  const selectedFiles = selectedStudioFiles(files, gallerySelection);
  const selectedMediaFingerprint = selectedFiles.map(studioFileFingerprint).join("\u001f");
  const selectedMediaFingerprintRef = useRef(selectedMediaFingerprint);
  useEffect(() => {
    if (selectedMediaFingerprintRef.current === selectedMediaFingerprint) return;
    selectedMediaFingerprintRef.current = selectedMediaFingerprint;
    if (!preserveFamilyStoryArchiveOnTrimRef.current) familyStoryOriginalArchivedRef.current = false;
    preserveFamilyStoryArchiveOnTrimRef.current = false;
    setFamilyStoryDurationMs(null);
    setFamilyStoryDestination(null);
    setFamilyStoryCopyEnabled(false);
    setFamilyStoryFamilyId(null);
    setFamilyStoryArchiveId(newStudioPublishId());
  }, [selectedMediaFingerprint]);
  const validCameraClipReel = Boolean(cameraClipReelMarker
    && isCameraClipReelSelection(selectedFiles)
    && JSON.stringify(cameraClipReelMarker.orderedFingerprints) === JSON.stringify(selectedFiles.map(studioFileFingerprint)));
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

  const applyStudioTemplate = (template: StoryStudioTemplate) => {
    setEditorElements(instantiateStoryTemplate(template));
    setTextBackground(template.textBackground);
    updateCaption(template.caption);
    setTool(null);
    setTemplateError("");
  };

  const saveCurrentStudioTemplate = () => {
    if (!userId || !templateName.trim()) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `template-${Date.now()}`;
    try {
      const template: StoryStudioTemplate = {
        id,
        name: templateName.trim(),
        caption,
        textBackground: /^#[0-9a-f]{6}$/i.test(textBackground) ? textBackground : "#172554",
        elements: editorElements.filter((element) => ["text", "sticker", "drawing"].includes(element.type)),
      };
      setStudioTemplates(saveStoryTemplate(userId, template));
      setTemplateName("");
      setTemplateError("");
    } catch (reason) {
      setTemplateError(reason instanceof Error ? reason.message : "This layout could not be saved.");
    }
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
        if (!cancelled) {
          const nextStories = Array.isArray(data.stories) ? data.stories : [];
          setStories(nextStories);
          setMomentVideoStates((current) => {
            const next = { ...current };
            nextStories.forEach((story) => {
              if (story.moment_video && !next[story.id]) next[story.id] = {
                status: story.moment_video.status,
                failureCode: null,
                durationMs: story.moment_video.duration_ms ?? null,
                playbackGrantUrl: story.moment_video.playback_grant_url,
              };
            });
            return next;
          });
        }
      } catch (reason: unknown) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load Moments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [hubId, refreshNonce, userId]);

  useEffect(() => {
    const scopeSnapshots = scopeSnapshotsRef.current;
    // A new authenticated scope must never inherit the previous scope's
    // in-memory files, selection, destination or upload references.
    draftGenerationRef.current++;
    activeScopeRef.current = scopeKey;
    recoveredScopeRef.current = null;
    recoveredDraftRef.current = false;
    autoCameraOpenedRef.current = false;
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
    setCameraClipReelMarker(null);
    setPendingCameraReelStoryId(null);
    setMomentAccessibility(emptyMomentStudioAccessibility());
    setMusicFile(empty.musicFile);
    setMusicRightsBasis(empty.musicRightsBasis);
    setMusicLicenseReference(empty.musicLicenseReference);
    setMusicRightsAccepted(empty.musicRightsAccepted);
    setMusicVolume(empty.musicVolume);
    setUploadedMusicAssetId(empty.uploadedMusicAssetId);
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
    setResponseTargetId(null);
    setActiveChallengeKey(null);
    setArchiveEnabled(false);
    setRemixEnabled(false);
    setFamilyStoryDurationMs(null);
    setFamilyStoryDestination(null);
    setFamilyStoryCopyEnabled(false);
    setFamilyStoryFamilyId(null);
    setFamilyStoryArchiveId(newStudioPublishId());
    familyStoryOriginalArchivedRef.current = false;
    preserveFamilyStoryArchiveOnTrimRef.current = false;
    setCheckingStudioDuration(false);
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
      const extendedDraft = draft as ExtendedStudioDraft | null;
      const hasRecoverableWork = Boolean(draft && (
        draft.files?.length
        || draft.caption?.trim()
        || draft.elements?.length
        || draft.musicFile
        || draft.exchangeDraftId
        || draft.uploadedMediaAssetIds?.some((id) => id > 0)
        || draft.publishAssetIds?.length
        || draft.attemptedSignature
        || extendedDraft?.cameraClipReel
        || extendedDraft?.cameraReelStoryId
        || extendedDraft?.momentTagsInput?.trim()
        || Object.values(extendedDraft?.momentAltTexts ?? {}).some((text) => text.trim())
        || Object.values(extendedDraft?.momentCaptionsVtt ?? {}).some((text) => text.trim())
      ));
      recoveredDraftRef.current = hasRecoverableWork;
      if (draft) {
        const recoveredDraft = draft as ExtendedStudioDraft;
        exchangeDraftRef.current = draft.exchangeDraftId && Number.isSafeInteger(draft.exchangeDraftId)
          ? { id: draft.exchangeDraftId, listingId: draft.destinationListingId, fingerprint: draft.exchangeFileFingerprint ?? "" }
          : null;
        clientPublishIdRef.current = draft.clientPublishId || newStudioPublishId();
        publishAttemptRef.current = draft.attemptedSignature ?? null;
        uploadedIdsRef.current = draft.uploadedMediaAssetIds ?? [];
        publishAssetIdsRef.current = draft.publishAssetIds ?? [];
        setFiles(draft.files ?? []);
        const recoveredFiles = draft.files ?? [];
        const recoveredSelection = draft.selection ?? [];
        selectedMediaFingerprintRef.current = selectedStudioFiles(recoveredFiles, recoveredSelection)
          .map(studioFileFingerprint).join("\u001f");
        const recoveredCameraFiles = selectedStudioFiles(recoveredFiles, recoveredSelection);
        const recoveredMarker = recoveredDraft.cameraClipReel;
        const markerMatches = Boolean(recoveredMarker
          && isCameraClipReelSelection(recoveredCameraFiles)
          && JSON.stringify(recoveredMarker.orderedFingerprints) === JSON.stringify(recoveredCameraFiles.map(studioFileFingerprint)));
        setCameraClipReelMarker(markerMatches ? recoveredMarker! : null);
        setPendingCameraReelStoryId(Number.isSafeInteger(recoveredDraft.cameraReelStoryId) ? recoveredDraft.cameraReelStoryId! : null);
        setMomentAccessibility(restoreMomentStudioAccessibility(draft));
        setMusicFile(draft.musicFile ?? null);
        setMusicRightsBasis(draft.musicRightsBasis ?? "original");
        setMusicLicenseReference(draft.musicLicenseReference ?? "");
        setMusicRightsAccepted(draft.musicRightsAccepted ?? false);
        setMusicVolume(draft.musicVolume ?? 0.65);
        setUploadedMusicAssetId(draft.uploadedMusicAssetId ?? null);
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
        const recoveredFamilyDestination = recoveredDraft.familyStoryDestination === "family-only"
          || recoveredDraft.familyStoryDestination === "moment"
          ? recoveredDraft.familyStoryDestination
          : null;
        setFamilyStoryDurationMs(Number.isFinite(recoveredDraft.familyStoryDurationMs)
          ? recoveredDraft.familyStoryDurationMs ?? null
          : null);
        setFamilyStoryDestination(recoveredFamilyDestination);
        setFamilyStoryCopyEnabled(recoveredFamilyDestination === "moment" && recoveredDraft.familyStoryCopyEnabled === true);
        setFamilyStoryFamilyId(recoveredFamilyDestination ? recoveredDraft.familyStoryFamilyId ?? null : null);
        setFamilyStoryArchiveId(typeof recoveredDraft.familyStoryArchiveId === "string"
          && /^[a-zA-Z0-9_-]{1,64}$/.test(recoveredDraft.familyStoryArchiveId)
          ? recoveredDraft.familyStoryArchiveId
          : newStudioPublishId());
        if (hasRecoverableWork) setStudioStep("edit");
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
        draftQueueRef.current = draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-recovery")).then(() => persistMomentStudioDraft(outgoing));
        void draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-save"));
      }
    };
  }, [userId, hubId, scopeKey]);

  const draftSnapshot = (): ExtendedStudioDraft => ({
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
    musicFile, musicRightsBasis, musicLicenseReference, musicRightsAccepted, musicVolume, uploadedMusicAssetId,
    uploadedMediaAssetIds: files.map((_, index) => uploadedIdsRef.current[index] ?? 0),
    cameraClipReel: cameraClipReelMarker,
    cameraReelStoryId: pendingCameraReelStoryId,
    familyStoryDestination,
    familyStoryCopyEnabled,
    familyStoryFamilyId,
    familyStoryArchiveId,
    familyStoryDurationMs,
    ...momentAccessibility,
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
    draftQueueRef.current = draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-recovery")).then(async () => {
      if (generation !== draftGenerationRef.current || version !== draftWriteVersionRef.current) return;
      await persistMomentStudioDraft(snapshot);
      if (generation === draftGenerationRef.current) { setDraftSaved(true); setDraftError(""); }
    }).catch((reason: unknown) => {
      setDraftError(`Draft not saved on this device: ${reason instanceof Error ? reason.message : "Storage unavailable."}`);
      throw reason;
    });
    return draftQueueRef.current;
  };
  const queueDraftSaveRef = useRef(queueDraftSave);
  queueDraftSaveRef.current = queueDraftSave;
  const signature = `${studioPublishSignature({
    files, selection: gallerySelection, caption, elements: editorElements, audience, hubId, textBackground, coverTimes,
    musicFile, musicRightsBasis, musicLicenseReference, musicRightsAccepted, musicVolume,
  })}::${JSON.stringify(momentAccessibility)}::${JSON.stringify(cameraClipReelMarker)}`;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const rotateAttemptAfterEdit = () => {
    if (!publishAttemptRef.current || publishAttemptRef.current === signature) return;
    publishAttemptRef.current = null;
    clientPublishIdRef.current = newStudioPublishId();
    uploadedIdsRef.current = [];
    publishAssetIdsRef.current = [];
    setUploadedMusicAssetId(null);
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
    if (!cameraClipReelMarker) return;
    const currentFiles = selectedStudioFiles(files, gallerySelection);
    if (!isCameraClipReelSelection(currentFiles)
      || JSON.stringify(cameraClipReelMarker.orderedFingerprints) !== JSON.stringify(currentFiles.map(studioFileFingerprint))) {
      setCameraClipReelMarker(null);
      setPendingCameraReelStoryId(null);
    }
  }, [cameraClipReelMarker, files, gallerySelection]);
  useEffect(() => {
    if (!draftReady || !userId || activeScopeRef.current !== scopeKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftSaved(false);
    draftTimerRef.current = setTimeout(() => { void queueDraftSaveRef.current().catch(reportClientSideEffectFailure("community.story-studio.draft-save")); }, 300);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [draftReady, userId, scopeKey, files, musicFile, musicRightsBasis, musicLicenseReference, musicRightsAccepted, musicVolume, uploadedMusicAssetId, gallerySelection, previewFileIndex, caption, audience, exchangeListingId, editorElements, effect, textBackground, textColor, textSize, textAlign, trimPreview, coverTimes, uploadedIds, momentAccessibility, cameraClipReelMarker, pendingCameraReelStoryId]);

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

  const loadMomentVideoUrl = useCallback(async (story: CommunityStory, forceGrant = false) => {
    if (!story.moment_video || momentVideoLoadingRef.current.has(story.id)) return;
    const grantedUrl = momentVideoUrlsRef.current[story.id];
    if (!forceGrant && grantedUrl && momentVideoGrantExpiryRef.current[story.id] > Date.now() + 15_000) return;
    momentVideoLoadingRef.current.add(story.id);
    try {
      const grantUrl = new URL(story.moment_video.playback_grant_url, window.location.origin);
      if (grantUrl.origin !== window.location.origin || grantUrl.search || grantUrl.hash
        || grantUrl.pathname !== `/api/community/stories/${story.id}/moment-composition/playback-grant`) {
        throw new Error("The camera reel playback grant URL was invalid.");
      }
      const grantResponse = await fetch(grantUrl.pathname, {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
      });
      const grant = await grantResponse.json().catch(() => ({})) as { playback_url?: string; expires_at?: string; error?: string };
      if (!grantResponse.ok || typeof grant.playback_url !== "string") {
        throw new Error(grant.error || "Authorized camera reel playback could not be started.");
      }
      const url = validateMomentCompositionPlaybackUrl(grant.playback_url, story.id, window.location.origin);
      const expiry = typeof grant.expires_at === "string" ? Date.parse(grant.expires_at) : Number.NaN;
      if (!Number.isFinite(expiry)) throw new Error("The camera reel playback grant did not include a valid expiry.");
      momentVideoUrlsRef.current[story.id] = url;
      momentVideoGrantExpiryRef.current[story.id] = expiry;
      setMomentVideoUrls((current) => ({ ...current, [story.id]: url }));
      setMomentVideoVersions((current) => ({ ...current, [story.id]: (current[story.id] ?? 0) + 1 }));
      setMomentVideoPlaybackErrors((current) => { const next = { ...current }; delete next[story.id]; return next; });
    } catch (reason) {
      setMomentVideoPlaybackErrors((current) => ({
        ...current,
        [story.id]: reason instanceof Error ? reason.message : "Camera reel playback could not be loaded.",
      }));
    } finally {
      momentVideoLoadingRef.current.delete(story.id);
    }
  }, []);

  useEffect(() => {
    const visible = stories.slice(0, 24).flatMap((story) => story.moment_video ? [] : story.media);
    void Promise.all(visible.map((media) => loadMediaUrl(media)));
  }, [loadMediaUrl, stories]);

  useEffect(() => {
    const refreshAttempts = momentVideoRefreshAttemptedRef.current;
    return () => {
      Object.values(mediaObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      mediaObjectUrlsRef.current = {};
      momentVideoUrlsRef.current = {};
      momentVideoGrantExpiryRef.current = {};
      refreshAttempts.clear();
    };
  }, []);

  useEffect(() => {
    if (selectedMedia) void loadMediaUrl(selectedMedia);
  }, [loadMediaUrl, selectedMedia]);

  useEffect(() => {
    const story = selectedStory;
    if (!story?.moment_video || !selectedMomentVideoState) return;
    if (selectedMomentVideoState.status === "ready") {
      if (viewerIndex !== null) momentVideoRefreshAttemptedRef.current.delete(story.id);
      void loadMomentVideoUrl(story, viewerIndex !== null);
      return;
    }
    if (selectedMomentVideoState.status === "failed") {
      const controller = new AbortController();
      let active = true;
      void getCameraClipReelStatus(story.id, controller.signal).then((state) => {
        if (active) setMomentVideoStates((current) => {
          const existing = current[story.id];
          if (existing?.status === state.status && existing.failureCode === state.failureCode
            && existing.durationMs === state.durationMs && existing.playbackGrantUrl === state.playbackGrantUrl) return current;
          return {
            ...current,
            [story.id]: {
            status: state.status,
            failureCode: state.failureCode,
            durationMs: state.durationMs,
            playbackGrantUrl: state.playbackGrantUrl,
            },
          };
        });
      }).catch(reportClientSideEffectFailure("community.story-studio.composition-status"));
      return () => { active = false; controller.abort(); };
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const state = await getCameraClipReelStatus(story.id, controller.signal);
        if (!active) return;
        setStories((current) => current.map((item) => {
          if (item.id !== story.id || !item.moment_video
            || (item.moment_video.status === state.status && item.moment_video.duration_ms === state.durationMs)) return item;
          return { ...item, moment_video: { ...item.moment_video, status: state.status, duration_ms: state.durationMs } };
        }));
        setMomentVideoStates((current) => {
          const existing = current[story.id];
          if (existing?.status === state.status && existing.failureCode === state.failureCode
            && existing.durationMs === state.durationMs && existing.playbackGrantUrl === state.playbackGrantUrl) return current;
          return {
            ...current,
            [story.id]: {
            status: state.status,
            failureCode: state.failureCode,
            durationMs: state.durationMs,
            playbackGrantUrl: state.playbackGrantUrl,
            },
          };
        });
        if (state.status === "ready") {
          if (selectedStoryId === story.id) setMediaIndex(0);
          await loadMomentVideoUrl(story);
          return;
        }
        if (state.status !== "failed") timer = setTimeout(() => { void refresh(); }, 2000);
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
  }, [loadMomentVideoUrl, selectedMomentVideoState, selectedStory, selectedStoryId, viewerIndex]);

  useEffect(() => {
    if (previewFileIndex >= files.length && files.length > 0) setPreviewFileIndex(0);
  }, [files.length, previewFileIndex]);
  useEffect(() => { setVideoDuration(0); }, [previewFileIndex, files]);

  const resetComposer = () => {
    recoveredDraftRef.current = false;
    if (scopeKey) scopeSnapshotsRef.current.delete(scopeKey);
    setFiles([]);
    setCameraClipReelMarker(null);
    setPendingCameraReelStoryId(null);
    setMomentAccessibility(emptyMomentStudioAccessibility());
    setMusicFile(null);
    setMusicRightsBasis("original");
    setMusicLicenseReference("");
    setMusicRightsAccepted(false);
    setMusicVolume(0.65);
    setUploadedMusicAssetId(null);
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
    setResponseTargetId(null);
    setActiveChallengeKey(null);
    setArchiveEnabled(false);
    setRemixEnabled(false);
    setFamilyStoryDurationMs(null);
    setFamilyStoryDestination(null);
    setFamilyStoryCopyEnabled(false);
    setFamilyStoryFamilyId(null);
    setFamilyStoryArchiveId(newStudioPublishId());
    familyStoryOriginalArchivedRef.current = false;
    preserveFamilyStoryArchiveOnTrimRef.current = false;
    setCheckingStudioDuration(false);
  };

  const closeComposer = useCallback(() => {
    publishControllerRef.current?.abort();
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    void queueDraftSaveRef.current().catch(reportClientSideEffectFailure("community.story-studio.draft-save"));
    setCheckingStudioDuration(false);
    setComposerOpen(false);
    const query = new URLSearchParams(window.location.search);
    if (location === "/community/moments" && query.getAll("composer").length === 1 && query.get("composer") === "1") {
      query.delete("composer");
      const remainingQuery = query.toString();
      navigate(`${location}${remainingQuery ? `?${remainingQuery}` : ""}`);
    }
  }, [location, navigate]);

  const cancelCamera = useCallback(() => {
    setCameraOpen(false);
    const hasStudioWork = recoveredDraftRef.current
      || files.length > 0
      || editorElements.length > 0
      || Boolean(caption.trim())
      || Boolean(musicFile)
      || Boolean(exchangeDraftRef.current)
      || Boolean(momentAccessibility.momentTagsInput.trim())
      || Object.values(momentAccessibility.momentAltTexts).some((text) => text.trim())
      || Object.values(momentAccessibility.momentCaptionsVtt).some((text) => text.trim());
    if (!hasStudioWork && !responseTargetId) closeComposer();
  }, [caption, closeComposer, editorElements.length, files.length, momentAccessibility, musicFile, responseTargetId]);

  useEffect(() => {
    if (!composerOpen) {
      autoCameraOpenedRef.current = false;
      return;
    }
    if (!draftReady
      || draftError
      || activeScopeRef.current !== scopeKey
      || recoveredScopeRef.current !== scopeKey
      || autoCameraOpenedRef.current) return;
    autoCameraOpenedRef.current = true;
    const hasStudioWork = recoveredDraftRef.current
      || files.length > 0
      || editorElements.length > 0
      || Boolean(caption.trim())
      || Boolean(musicFile)
      || Boolean(exchangeDraftRef.current)
      || Boolean(responseTargetId);
    if (!hasStudioWork) setCameraOpen(true);
    else setCameraOpen(false);
  }, [caption, composerOpen, draftError, draftReady, editorElements.length, files.length, musicFile, responseTargetId, scopeKey]);

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
        if (cameraOpen) { cancelCamera(); return; }
        if (galleryOpen) { setGalleryOpen(false); return; }
        if (studioStep === "destination") { setStudioStep("edit"); return; }
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
  }, [composerOpen, cameraOpen, galleryOpen, studioStep, draftReady, cancelCamera, closeComposer]);

  const moveToStudioStep = async (
    nextStep: "source" | "edit" | "destination",
    forceCommunityCheck = false,
  ) => {
    setTool(null);
    if (nextStep !== "destination") {
      setStudioStep(nextStep);
      return;
    }
    if (exchangeListingId && !forceCommunityCheck) {
      setFamilyStoryDurationMs(null);
      setFamilyStoryDestination(null);
      setFamilyStoryCopyEnabled(false);
      setFamilyStoryFamilyId(null);
      setStudioStep(nextStep);
      return;
    }

    const selectedForCheck = selectedStudioFiles(files, gallerySelection);
    const fingerprint = selectedForCheck.map(studioFileFingerprint).join("\u001f");
    setCheckingStudioDuration(true);
    setError(null);
    try {
      const durations = await validateStudioFiles(selectedForCheck);
      if (selectedMediaFingerprintRef.current !== fingerprint) return;
      const durationMs = totalStudioVideoDurationMs(selectedForCheck, durations);
      setFamilyStoryDurationMs(durationMs);
      if (durationMs <= FAMILY_STORY_CANDIDATE_DURATION_MS) {
        setFamilyStoryDestination(null);
        setFamilyStoryCopyEnabled(false);
        setFamilyStoryFamilyId(null);
      }
      setStudioStep(nextStep);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not inspect the selected videos.");
    } finally {
      setCheckingStudioDuration(false);
    }
  };

  const publish = async () => {
    if (trimming) {
      setError("Wait for video trimming to finish before publishing.");
      return;
    }
    if (publishing || (!caption.trim() && gallerySelection.length === 0)) {
      setError("Add a photo, video, or a few words before publishing.");
      return;
    }
    if (familyStoryDurationMs !== null
      && familyStoryDurationMs > FAMILY_STORY_CANDIDATE_DURATION_MS
      && familyStoryDestination === null
      && !familyStoryOriginalArchivedRef.current) {
      setError("For videos over 180 seconds, save the full original privately or save it privately before publishing a shorter Moment.");
      return;
    }
    if (familyStoryDestination === "moment" && !familyStoryCopyEnabled && !familyStoryOriginalArchivedRef.current) {
      setError("Save the full original as a private Family Story before publishing a shorter Moment.");
      return;
    }
    if ((familyStoryDestination === "family-only"
      || (familyStoryDestination === "moment" && familyStoryCopyEnabled))
      && !familyStoryFamilyId
      && !familyStoryOriginalArchivedRef.current) {
      setError("Choose a Family Space for the private Family Story copy, or turn the option off.");
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
      const familyOnlyRequested = familyStoryDestination === "family-only";
      const controller = new AbortController();
      publishControllerRef.current = controller;
      const attemptId = clientPublishIdRef.current;
      const attemptSignature = signature;
      const attemptSnapshot = snapshotRef.current();
      const videoDurationsMs = await validateStudioFiles(publishFiles);
      const selectedVideoDurationMs = totalStudioVideoDurationMs(publishFiles, videoDurationsMs);
      const overMomentLimit = selectedVideoDurationMs > FAMILY_STORY_CANDIDATE_DURATION_MS;
      if (overMomentLimit && familyStoryDestination === null && !familyStoryOriginalArchivedRef.current) {
        throw new Error("Videos over 180 seconds must be archived to a private Family Story before any shorter Moment is published.");
      }
      if (familyStoryDestination !== null && !overMomentLimit && !familyStoryOriginalArchivedRef.current) {
        throw new Error("This selection no longer exceeds 180 seconds. Review it before choosing a destination.");
      }
      if (overMomentLimit && familyStoryDestination === "moment" && exchangeListingId) {
        throw new Error("An Exchange Spark longer than 180 seconds must be saved to a private Family Story or trimmed in a separate video editor.");
      }
      const familyStoryOnly = overMomentLimit && familyStoryDestination === "family-only";
      const shouldSaveFamilyStory = !familyStoryOriginalArchivedRef.current && (familyStoryOnly
        || (overMomentLimit && familyStoryDestination === "moment" && familyStoryCopyEnabled));
      if (overMomentLimit && familyStoryDestination === "moment" && !familyStoryCopyEnabled
        && !familyStoryOriginalArchivedRef.current) {
        throw new Error("Save the full original as a private Family Story before publishing a shorter Moment.");
      }
      if (shouldSaveFamilyStory) {
        if (!familyStoryFamilyId) {
          throw new Error("Choose a Family Space for the private Family Story copy.");
        }
        if (!canCopyStudioFilesToFamily(publishFiles)) {
          throw new Error("Every item in a private Family Story copy must be a supported photo or video no larger than 20 MB.");
        }
      }
      if (familyStoryOnly) {
        if (exchangeDraftRef.current) {
          throw new Error("This Exchange Spark already has a saved draft. Finish or explicitly discard that draft before archiving the video as a Family Story.");
        }
        if (!familyStoryOriginalArchivedRef.current) {
          setPublishStatus("Saving the full original in Family Stories…");
          await saveSparkAsPrivateFamilyStory({
            familyId: familyStoryFamilyId!,
            archiveId: familyStoryArchiveId,
            caption,
            files: publishFiles,
            signal: controller.signal,
            onProgress: (status) => setPublishStatus(status),
          });
          familyStoryOriginalArchivedRef.current = true;
        }
        draftGenerationRef.current++;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
        await discardStudioDraft(userId, hubId);
        resetComposer();
        setComposerOpen(false);
        navigate(`/family/${familyStoryFamilyId}`);
        return;
      }
      if (!familyOnlyRequested && responseTargetId && (!publishFiles.length || publishFiles.some((file) => !file.type.startsWith("video/")))) {
        throw new Error("Choose a video clip in this Studio to make a response.");
      }
      if (!familyOnlyRequested && responseTargetId && (audience !== "community" || exchangeListingId)) {
        throw new Error("Video responses are shared with the same Community, not a Hub or Exchange listing.");
      }
      if (musicFile && exchangeListingId) {
        throw new Error("Background music is supported for Community and Hub Moments, not Exchange listing Sparks yet.");
      }
      if (exchangeDraftRef.current && !exchangeListingId) {
        throw new Error("Your listing-owned Exchange Spark is still saved. Resume that listing and video, or explicitly discard the Exchange draft before sharing a Moment.");
      }
      if (exchangeListingId && (momentAccessibility.momentTagsInput.trim()
        || Object.values(momentAccessibility.momentAltTexts).some((text) => text.trim())
        || Object.values(momentAccessibility.momentCaptionsVtt).some((text) => text.trim()))) {
        throw new Error("Moment tags and accessibility descriptions are not published to Exchange Sparks. Unlink the listing to publish these as a 24-hour Moment, or clear the Moment-only fields.");
      }
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
            draftQueueRef.current = draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-recovery")).then(() => saveStudioDraft(saved));
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
          await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
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
      const momentSelectionIndexes = overMomentLimit && !familyStoryOnly
        ? chooseMomentCutdownIndexes(publishFiles, videoDurationsMs)
        : publishFiles.map((_, index) => index);
      const momentFiles = momentSelectionIndexes.map((index) => publishFiles[index]);
      const momentDurationsMs = momentSelectionIndexes.map((index) => videoDurationsMs[index]);
      const momentSourceIndexes = momentSelectionIndexes.map((index) => selectedIndexes[index]);

      const tags = familyStoryOnly ? [] : parseMomentStudioTags(momentAccessibility.momentTagsInput);
      const mediaAltTexts = momentSourceIndexes.map((index) => momentAccessibility.momentAltTexts[index] ?? "");
      const mediaCaptionsVtt = momentSourceIndexes.map((index) => momentAccessibility.momentCaptionsVtt[index] ?? "");
      if (!familyStoryOnly) {
        mediaCaptionsVtt.forEach((captionsVtt, index) => {
          if (!captionsVtt.trim() || !momentFiles[index].type.startsWith("video/")) return;
          const captionError = validateMomentStudioWebVtt(captionsVtt, momentDurationsMs[index]);
          if (captionError) throw new Error(`${momentFiles[index].name}: ${captionError}`);
        });
        buildMomentMediaAccessibility(
          momentFiles,
          momentFiles.map((_, index) => index),
          momentFiles.map((_, index) => index + 1),
          Object.fromEntries(mediaAltTexts.map((text, index) => [index, text])),
          Object.fromEntries(mediaCaptionsVtt.map((text, index) => [index, text])),
        );
      }

      if (shouldSaveFamilyStory) {
        setPublishStatus("Saving the full original in Family Stories…");
        await saveSparkAsPrivateFamilyStory({
          familyId: familyStoryFamilyId!,
          archiveId: familyStoryArchiveId,
          caption,
          files: publishFiles,
          signal: controller.signal,
          onProgress: (status) => setPublishStatus(status),
        });
        familyStoryOriginalArchivedRef.current = true;
      }
      if (familyStoryOnly) {
        draftGenerationRef.current++;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
        await discardStudioDraft(userId, hubId);
        resetComposer();
        setComposerOpen(false);
        navigate(`/family/${familyStoryFamilyId}`);
        return;
      }

      const elements: Array<Record<string, unknown>> = [];
      if (!momentFiles.length) elements.push({ type: "background", payload: { color: textBackground }, position_x: 50, position_y: 50, z_index: 0 });
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
      const publishedSparkId = await publishStudioMoment({
        userId, hubId, audience, files: momentFiles, caption, tags,
        mediaAltTexts, mediaCaptionsVtt,
        elements: elements as Array<{ type: string; payload: Record<string, unknown> }>, effect,
        musicFile,
        musicRightsBasis,
        musicLicenseReference,
        musicRightsAccepted,
        musicVolume,
        uploadedMusicAssetId,
        clientPublishId: attemptId,
        signal: controller.signal,
        uploadedIds: momentSourceIndexes.map((index) => uploadedIdsRef.current[index]),
        cameraClipReel: !overMomentLimit && validCameraClipReel,
        archiveEnabled,
        remixEnabled,
        responseToStoryId: responseTargetId,
        challengeKey: activeChallengeKey,
        mediaEdits: momentSourceIndexes.flatMap((fileIndex, publishIndex) => coverTimes[fileIndex] !== undefined
          ? [{ index: publishIndex, coverTimeMs: coverTimes[fileIndex] }]
          : []),
        onAssetUploaded: (index, id) => {
          const next = [...uploadedIdsRef.current];
          next[momentSourceIndexes[index]] = id;
          uploadedIdsRef.current = next;
          setUploadedIds(next);
        },
        onMusicAssetUploaded: (id) => setUploadedMusicAssetId(id),
        beforePublish: async (orderedAssetIds) => {
          if (signatureRef.current !== attemptSignature || clientPublishIdRef.current !== attemptId || activeScopeRef.current !== scopeKey) {
            throw new Error("The Spark changed during upload. Review your edits and publish again; nothing was posted.");
          }
          if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
          draftWriteVersionRef.current++;
          const musicAssetId = musicFile ? orderedAssetIds[orderedAssetIds.length - 1] : null;
          publishAssetIdsRef.current = [...orderedAssetIds];
          const frozen: StudioDraft = { ...attemptSnapshot, clientPublishId: attemptId, attemptedSignature: attemptSignature,
            uploadedMediaAssetIds: files.map((_, index) => uploadedIdsRef.current[index] ?? 0),
            uploadedMusicAssetId: musicAssetId,
            publishAssetIds: [...orderedAssetIds] };
          draftQueueRef.current = draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-recovery")).then(async () => {
          const durable = await persistStudioPublishAttempt(frozen, momentSourceIndexes, orderedAssetIds, musicAssetId);
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
      window.dispatchEvent(new Event("community-moments-refresh"));
      draftGenerationRef.current++;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
      await discardStudioDraft(userId, hubId);
      resetComposer();
      setComposerOpen(false);
      navigate(buildMomentsSparkHref(publishedSparkId, audience, hubId));
    } catch (reason: unknown) {
      if (reason instanceof CameraClipReelPendingError) {
        setPendingCameraReelStoryId(reason.storyId);
        setError(reason.message);
        setRefreshNonce((value) => value + 1);
        const pendingSnapshot: ExtendedStudioDraft = {
          ...snapshotRef.current(),
          cameraClipReel: cameraClipReelMarker,
          cameraReelStoryId: reason.storyId,
        };
        if (scopeKey) scopeSnapshotsRef.current.set(scopeKey, pendingSnapshot);
        draftQueueRef.current = draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-recovery")).then(() => saveStudioDraft(pendingSnapshot));
        try {
          await draftQueueRef.current;
        } catch (saveReason: unknown) {
          setDraftError(saveReason instanceof Error ? saveReason.message : "The posted Spark's stitching retry could not be saved on this device.");
        }
        window.dispatchEvent(new Event("community-moments-refresh"));
        setComposerOpen(false);
        navigate(buildMomentsSparkHref(reason.storyId, audience, hubId));
      } else {
        setError(reason instanceof Error && reason.name === "AbortError"
          ? "Upload cancelled. Your Spark was not published."
          : reason instanceof Error ? reason.message : "Could not publish your Spark.");
      }
    } finally {
      publishControllerRef.current = null;
      setPublishing(false);
      setPublishStatus("");
      setPublishProgress(0);
    }
  };

  const retryCameraClipStitching = async () => {
    if (!pendingCameraReelStoryId || !validCameraClipReel || !userId || publishing) return;
    const cameraAssetIds = publishAssetIdsRef.current.slice(0, selectedFiles.length);
    if (cameraAssetIds.length !== selectedFiles.length) {
      setError("Spark posted but stitching is pending. The saved ordered camera assets are incomplete; keep this draft and try again.");
      return;
    }
    const controller = new AbortController();
    publishControllerRef.current = controller;
    setPublishing(true);
    setPublishStatus("Retrying camera clip stitching…");
    setError(null);
    try {
      await requestCameraClipReel(pendingCameraReelStoryId, cameraAssetIds, controller.signal);
      draftGenerationRef.current++;
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
      await discardStudioDraft(userId, hubId);
      resetComposer();
      setComposerOpen(false);
      setRefreshNonce((value) => value + 1);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "Retry stitching from the saved Studio draft.";
      setError(detail.startsWith("Spark posted") ? detail : `Spark posted, but stitching is pending. ${detail}`);
    } finally {
      publishControllerRef.current = null;
      setPublishing(false);
      setPublishStatus("");
      setPublishProgress(0);
    }
  };

  const selectStudioFiles = (incoming: File[]) => {
    setCameraClipReelMarker(null);
    setPendingCameraReelStoryId(null);
    const { files: selected, errors } = chooseStudioFiles([...files, ...incoming]);
    if (errors.length) setError(errors[0]);
    if (selected.length) {
      const nextAltTexts: Record<number, string> = {};
      const nextCaptions: Record<number, string> = {};
      selected.forEach((file, index) => {
        const previousIndex = files.indexOf(file);
        if (previousIndex < 0) return;
        if (momentAccessibility.momentAltTexts[previousIndex]) nextAltTexts[index] = momentAccessibility.momentAltTexts[previousIndex];
        if (momentAccessibility.momentCaptionsVtt[previousIndex]) nextCaptions[index] = momentAccessibility.momentCaptionsVtt[previousIndex];
      });
      setMomentAccessibility((current) => ({
        ...current,
        momentAltTexts: nextAltTexts,
        momentCaptionsVtt: nextCaptions,
      }));
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

  const onCameraVideo = (recorded: File[]) => {
    setCameraOpen(false);
    const chosen = chooseStudioFiles([...files, ...recorded]).files;
    const cameraOnlyGroup = files.length === 0
      && isCameraClipReelSelection(recorded)
      && chosen.length === recorded.length
      && chosen.every((file, index) => file === recorded[index]);
    selectStudioFiles(recorded);
    setCameraClipReelMarker(cameraOnlyGroup
      ? { orderedFingerprints: recorded.map(studioFileFingerprint) }
      : null);
  };

  const discardDraft = async () => {
    if (!userId || !window.confirm(exchangeDraftRef.current
      ? "Discard this Spark? If its Exchange video is still a draft, it will also be removed from the server. A Spark already published cannot be undone here."
      : "Discard this Spark and its saved media? This cannot be undone.")) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    try {
      await draftQueueRef.current.catch(reportClientSideEffectFailure("community.story-studio.draft-flush"));
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
    setCameraClipReelMarker(null);
    setPendingCameraReelStoryId(null);
    setPreviewFileIndex(index);
    setGallerySelection((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index]);
  };

  useEffect(() => {
    if (tool !== "mention" || mentionUserId !== null) {
      setMentionCandidates([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/community/stories/mention-candidates?q=${encodeURIComponent(mention)}`, { headers: authHeaders() });
        if (!response.ok) throw new Error("Could not find members. Try again.");
        const data = await response.json() as { users?: Array<{ id: number; name: string; username: string | null; avatar_url: string | null }> };
        if (active) setMentionCandidates(Array.isArray(data.users) ? data.users : []);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not find members.");
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mention, mentionUserId, tool]);

  useEffect(() => {
    if (selectedStoryId === null) return;
    setStoryProgress(0);
    void recordStoryView(selectedStoryId)
      .then(() => trackCommunityContent("community_spark_viewed", { spark_id: selectedStoryId }))
      .catch(reportClientSideEffectFailure("community.story-studio.analytics"));
    void getStoryMetrics(selectedStoryId)
      .then((metrics) => setReactedStoryIds((current) => ({ ...current, [selectedStoryId]: Boolean(metrics.viewer_reaction) })))
      .catch(reportClientSideEffectFailure("community.story-studio.metrics"));
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
    if (selectedFrame?.isMomentReel && selectedStory?.moment_video) {
      const mediaUrl = momentVideoUrls[selectedStory.id];
      if (!mediaUrl) return null;
      const descriptions = selectedStory.media.map((item, index) => `Clip ${index + 1}: ${item.alt_text?.trim() || "No alternative text supplied."}`).join(" ");
      return {
        id: -selectedStory.id,
        media_type: "video" as const,
        mime_type: "video/mp4",
        duration_ms: selectedMomentVideoState?.durationMs ?? null,
        media_url: mediaUrl,
        alt_text: `Camera clip reel with ${selectedStory.media.length} original clips. ${descriptions}`,
        captions_vtt: null,
      };
    }
    if (!selectedMedia) return null;
    const mediaUrl = mediaUrls[selectedMedia.id];
    if (!mediaUrl) return null;
    return { ...selectedMedia, media_url: mediaUrl };
  }, [mediaUrls, momentVideoUrls, selectedFrame?.isMomentReel, selectedMedia, selectedStory, selectedMomentVideoState?.durationMs]);

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

  const beginCreateSpark = () => {
    setComposerOpen(true);
    setCameraOpen(true);
  };

  const toolButtons: Array<{ key: StoryVisualTool; label: string; icon: ReactNode }> = [
    { key: "music", label: "Audio", icon: <Volume2 size={22} /> },
    { key: "templates", label: "Templates", icon: <Layers3 size={22} /> },
    { key: "draw", label: "Draw", icon: <Brush size={22} /> },
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
          <button className="nia-story-pill" type="button" onClick={beginCreateSpark}>
            <span aria-hidden="true">＋</span>
            Create a Spark
          </button>
        </header>}

        <StoryVisualRail
          authors={visualAuthors}
          loading={loading}
          onCreate={beginCreateSpark}
          onOpen={openStory}
          emptyLabel="No Sparks yet. Create the first Spark."
        />
      </section>

      {composerOpen && (!draftReady || activeScopeRef.current !== scopeKey) && <div className="nia-story-composer-overlay" role="status" aria-live="polite"><div className="nia-story-composer-shell p-8 text-center text-white">Recovering your saved Spark…</div></div>}
      {composerOpen && !cameraOpen && draftReady && activeScopeRef.current === scopeKey && (
        <div className="nia-story-composer-overlay">
          <input ref={galleryInput} type="file" accept={responseTargetId ? "video/*" : "image/*,video/*"} multiple className="sr-only" onChange={onFileChange} aria-label={responseTargetId ? "Choose video response clips" : "Choose Spark media"} disabled={trimming} />
          <div className="nia-story-composer-shell">
            {exchangeDraftRef.current && <div className="flex items-center justify-between gap-3 border-b border-white/20 bg-[#08182b] px-4 py-3 text-xs text-white" role="status"><span>A listing-owned Exchange video draft is saved. Resume with its original listing and video, or discard it.</span><button type="button" onClick={() => void discardDraft()} className="min-h-10 shrink-0 rounded-lg border border-white/40 px-3 font-bold" data-testid="button-discard-exchange-draft">Discard</button></div>}
            <SparkComposerChrome
              step={studioStep}
              onStep={(next) => { void moveToStudioStep(next); }}
              canContinue={Boolean(caption.trim() || gallerySelection.length)}
              preview={(
                <StoryEditorCanvas
                  elements={editorElements}
                  onChange={setEditorElements}
                  className="nia-story-editor-surface"
                  drawingMode={tool === "draw"}
                  drawingColor={drawingColor}
                  drawingWidth={drawingWidth}
                >
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={!selectedFileUrl ? { background: textBackground } : undefined}>
                    {selectedFileUrl ? (
                      selectedPreviewFile?.type.startsWith("video/") ? <video ref={previewVideo} key={selectedFileUrl} src={selectedFileUrl} controls playsInline preload="metadata" aria-label={momentAccessibility.momentAltTexts[previewFileIndex] || `Spark video attachment ${previewFileIndex + 1}`} className="h-full w-full object-contain" style={{ filter }} onError={() => setError("This video preview could not be loaded. Try selecting the clip again or choose another video.")} onLoadedMetadata={(event) => { setVideoDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); event.currentTarget.currentTime = trimPreview[previewFileIndex]?.start ?? 0; }} onPlay={(event) => { if (event.currentTarget.currentTime < (trimPreview[previewFileIndex]?.start ?? 0)) event.currentTarget.currentTime = trimPreview[previewFileIndex].start; }} onTimeUpdate={(event) => {
                        const bounds = trimPreview[previewFileIndex];
                        if (bounds && event.currentTarget.currentTime >= bounds.end) { event.currentTarget.pause(); event.currentTarget.currentTime = bounds.start; }
                      }} >{previewCaptionsTrackUrl && <track kind="captions" src={previewCaptionsTrackUrl} srcLang="und" label="Creator captions" default />}</video> : <img src={selectedFileUrl} alt={momentAccessibility.momentAltTexts[previewFileIndex] || `Spark photo attachment ${previewFileIndex + 1}`} className="h-full w-full object-contain" style={{ filter }} />
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
              onSettings={() => {
                void moveToStudioStep("destination").then(() => {
                  window.setTimeout(() => document.getElementById("story-audience")?.focus(), 0);
                });
              }}
              onGallery={() => { if (!trimming) setGalleryOpen(true); }}
              onCamera={() => { if (!trimming) { setGalleryOpen(false); setCameraOpen(true); } }}
              onPublish={() => void publish()}
              publishing={publishing}
              galleryCount={files.length}
            >
              <div className="nia-story-composer__form">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/75" aria-live="polite">
                  <span>{draftReady ? draftError ? "Local save unavailable" : draftSaved ? "Draft saved on this device" : "Saving draft…" : "Recovering your draft…"}</span>
                  {(files.length > 0 || caption.trim() || momentAccessibility.momentTagsInput.trim() || exchangeDraftRef.current) && <button type="button" className="rounded-lg border border-white/30 px-3 py-2 font-semibold" onClick={() => void discardDraft()} disabled={publishing} data-testid="button-discard-studio-draft">Discard draft</button>}
                </div>
                {draftError && <p role="alert" className="mb-2 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">{draftError} Keep this tab open or try editing again to save.</p>}
                {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
                {checkingStudioDuration && <p role="status" className="mb-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs">Checking selected video lengths…</p>}
                {validCameraClipReel && <p role="status" className="mb-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs">These camera-recorded clips will be stitched into one Spark video after publishing. Choosing or changing media clears this camera-only marker.</p>}
                {pendingCameraReelStoryId !== null && <button type="button" onClick={() => void retryCameraClipStitching()} disabled={publishing || !validCameraClipReel} className="mb-3 min-h-10 rounded-xl border border-amber-300/50 px-4 text-xs font-bold text-amber-100 disabled:opacity-50" data-testid="button-retry-camera-reel">Retry stitching — Spark already posted</button>}
                {publishing && publishStatus && <div role="status" aria-live="polite" className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs"><p>{publishStatus}{publishProgress ? ` ${publishProgress}%` : ""}</p>{publishProgress > 0 && <progress aria-label="Spark upload progress" value={publishProgress} max={100} className="mt-2 w-full" />}<button type="button" className="mt-2 min-h-10 rounded-lg border border-white/20 px-3 font-bold" onClick={() => publishControllerRef.current?.abort()}>Cancel upload</button></div>}
                {studioStep === "destination" ? <>
                  <div className="nia-story-destination-intro"><p className="nia-story-kicker">The final step</p><h2>Where should<br /><em>this Spark land?</em></h2><p>Choose who gets to see your moment before it goes live.</p></div>
                    {responseTargetId && <p className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-white/85" role="status" data-testid="status-video-response-context">Video response to Moment {responseTargetId}. This will be shared with your Community using the existing Studio upload and review flow.</p>}
                    {activeChallengeKey && <p className="mb-3 rounded-xl border border-secondary/30 bg-secondary/10 p-3 text-xs text-white/85" role="status" data-testid="status-weekly-challenge-context">Your Spark will join this week’s community prompt.</p>}
                  <div className="nia-story-destination-card">
                    <Users size={22} />
                    <div><label htmlFor="story-audience">Your audience</label><p data-testid="status-community-posting-scope" role="status">{audience === "hub" ? "Posting to: This Hub — only its members" : "Posting to: Your Community — approved community members"}</p></div>
                    <select id="story-audience" value={audience} onChange={(event) => { setAudience(event.target.value as "community" | "hub"); uploadedIdsRef.current = []; publishAssetIdsRef.current = []; setUploadedIds([]); }} disabled={!hubId || publishing || Boolean(responseTargetId)} aria-label="Spark audience"><option value="community">Community</option>{hubId && <option value="hub">This Hub</option>}</select>
                  </div>
                  {!exchangeListingId && <div className="nia-story-destination-card nia-story-destination-card__full">
                    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={archiveEnabled} onChange={(event) => setArchiveEnabled(event.target.checked)} disabled={publishing} className="h-4 w-4 accent-teal-500" data-testid="input-archive-moment-setting" /><span><strong>Keep a private archive copy</strong><small className="mt-0.5 block text-xs text-white/60">Only you can browse Moments you choose to save.</small></span></label>
                    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={remixEnabled} onChange={(event) => setRemixEnabled(event.target.checked)} disabled={publishing} className="h-4 w-4 accent-teal-500" data-testid="input-remix-moment-setting" /><span><strong>Allow video responses</strong><small className="mt-0.5 block text-xs text-white/60">Neighbors can add a short, kind video response in your Community.</small></span></label>
                  </div>}
                  {familyStoryDurationMs !== null
                    && familyStoryDurationMs > FAMILY_STORY_CANDIDATE_DURATION_MS && (
                    <SparkFamilyStoryPreservationControl
                      durationMs={familyStoryDurationMs}
                      files={selectedFiles}
                      destination={familyStoryDestination}
                      checked={familyStoryCopyEnabled}
                      familyId={familyStoryFamilyId}
                      allowMomentCutdown={!exchangeListingId}
                      onDestinationChange={setFamilyStoryDestination}
                      onCheckedChange={setFamilyStoryCopyEnabled}
                      onFamilyChange={setFamilyStoryFamilyId}
                    />
                  )}
                  {selectedVideo && <div className="nia-story-destination-card nia-story-destination-card--listing">
                    <div className="nia-story-destination-card__full"><label htmlFor="spark-exchange-listing">Connect an Exchange listing <span>(optional)</span></label><p>Only an active listing you own can be linked. The server checks eligibility.</p>
                      {exchangeListingsError && <p role="alert">{exchangeListingsError} <button type="button" onClick={() => { setExchangeListingsLoading(true); setExchangeListingsError(""); getExchangeListings({ mine: true, limit: 50 }).then((result) => setOwnedExchangeListings((result.listings ?? []).filter((listing) => listing.status === "active"))).catch((reason: unknown) => setExchangeListingsError(reason instanceof Error ? reason.message : "Could not load listings.")).finally(() => setExchangeListingsLoading(false)); }}>Retry</button></p>}
                       <select id="spark-exchange-listing" value={exchangeListingId} onChange={(event) => {
                         const nextListingId = event.target.value;
                         setExchangeListingId(nextListingId);
                         setFamilyStoryCopyEnabled(false);
                         setFamilyStoryFamilyId(null);
                         if (nextListingId) setFamilyStoryDurationMs(null);
                         else void moveToStudioStep("destination", true);
                         if (nextListingId && audience !== "community") { setAudience("community"); uploadedIdsRef.current = []; publishAssetIdsRef.current = []; setUploadedIds([]); }
                       }} disabled={publishing || exchangeListingsLoading || (!ownedExchangeListings.length && !exchangeDraftRef.current)} data-testid="select-spark-exchange-listing"><option value="">{exchangeListingsLoading ? "Loading listings…" : ownedExchangeListings.length ? "No listing connected" : "No active listings available"}</option>{exchangeDraftRef.current && !ownedExchangeListings.some((listing) => String(listing.id) === exchangeDraftRef.current?.listingId) && <option value={exchangeDraftRef.current.listingId}>Saved listing (no longer active)</option>}{ownedExchangeListings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}</select>
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
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-3 py-2 font-bold"
                      data-testid="button-trim-spark-video"
                      disabled={trimming || (trimStart <= 0 && trimEnd >= videoDuration)}
                      onClick={async () => {
                        const bounds = { start: trimStart, end: trimEnd };
                        setTrimming(true);
                        try {
                          setError(null);
                          const selectedForTrim = selectedStudioFiles(files, gallerySelection);
                          const trimDurations = await validateStudioFiles(selectedForTrim);
                          const previewDurationMs = Number.isFinite(videoDuration) && videoDuration > 0
                            ? Math.ceil(videoDuration * 1000)
                            : 0;
                          const originalDurationMs = Math.max(
                            totalStudioVideoDurationMs(selectedForTrim, trimDurations),
                            previewDurationMs,
                          );
                          if (originalDurationMs > FAMILY_STORY_CANDIDATE_DURATION_MS
                            && !familyStoryOriginalArchivedRef.current) {
                            const archiveWasSelected = familyStoryDestination === "family-only"
                              || (familyStoryDestination === "moment" && familyStoryCopyEnabled);
                            if (!archiveWasSelected || !familyStoryFamilyId) {
                              throw new Error("Before trimming a video selection over 180 seconds, choose a private Family Story copy in Destinations, then return here. The full original must be saved first.");
                            }
                            const archiveFiles = selectedForTrim.includes(selectedPreviewFile!)
                              ? selectedForTrim
                              : [...selectedForTrim, selectedPreviewFile!];
                            if (!canCopyStudioFilesToFamily(archiveFiles)) {
                              throw new Error("Every original in this Family Story copy must be a supported photo or video no larger than 20 MB.");
                            }
                            setPublishStatus("Saving the full original in Family Stories…");
                            await saveSparkAsPrivateFamilyStory({
                              familyId: familyStoryFamilyId,
                              archiveId: familyStoryArchiveId,
                              caption,
                              files: archiveFiles,
                              signal: new AbortController().signal,
                              onProgress: (status) => setPublishStatus(status),
                            });
                            familyStoryOriginalArchivedRef.current = true;
                          }
                          const trimmed = await trimVideoFile(selectedPreviewFile!, bounds.start, bounds.end);
                          const nextFiles = files.slice(); nextFiles[previewFileIndex] = trimmed;
                          preserveFamilyStoryArchiveOnTrimRef.current = familyStoryOriginalArchivedRef.current;
                          setFiles(nextFiles);
                          setCameraClipReelMarker(null);
                          setPendingCameraReelStoryId(null);
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
                          setPublishStatus(familyStoryOriginalArchivedRef.current
                            ? "The full original is safely saved in Family Stories."
                            : "");
                        } catch (reason) {
                          setPublishStatus("");
                          setError(reason instanceof Error ? reason.message : "Video trimming is not supported.");
                        } finally {
                          setTrimming(false);
                        }
                      }}
                    >{trimming ? "Trimming…" : "Apply trim"}</button>
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
                {tool === "music" && <div className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-4" data-testid="panel-spark-music">
                  <div>
                    <p className="text-sm font-bold">Background music</p>
                    <p className="mt-1 text-xs text-white/65">Add one MP3, OGG, or WAV track to a video Moment. Your video stays playable while the mixed version is prepared.</p>
                  </div>
                  <label className="block text-xs font-bold text-white/80">
                    Music file
                    <input
                      type="file"
                      accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
                      className="mt-2 block min-h-11 w-full rounded-xl border border-white/15 bg-slate-950/40 p-2 text-xs"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (!file) return;
                        const fileError = validateCommunityMomentFile(file);
                        if (fileError || !file.type.startsWith("audio/")) {
                          setError(fileError || "Choose an MP3, OGG, or WAV music file.");
                          event.currentTarget.value = "";
                          return;
                        }
                        setError(null);
                        setMusicFile(file);
                        setUploadedMusicAssetId(null);
                        setMusicRightsAccepted(false);
                      }}
                      data-testid="input-spark-music-file"
                    />
                  </label>
                  {musicFile && <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs font-semibold" title={musicFile.name}>{musicFile.name}</span>
                      <button type="button" onClick={() => {
                        setMusicFile(null);
                        setUploadedMusicAssetId(null);
                        setMusicRightsAccepted(false);
                        setMusicLicenseReference("");
                      }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs font-bold hover:bg-white/10" data-testid="button-remove-spark-music">Remove</button>
                    </div>
                    {musicPreviewUrls[0] && <audio className="w-full" controls preload="metadata" src={musicPreviewUrls[0]}>Audio preview unavailable.</audio>}
                    {!selectedVideo && <p className="text-xs text-amber-200">Select at least one video for background music.</p>}
                    {!!exchangeListingId && <p className="text-xs text-amber-200">Background music is not supported for Exchange listing Sparks yet.</p>}
                    <label className="block text-xs font-bold text-white/80">
                      Rights basis
                      <select
                        value={musicRightsBasis}
                        onChange={(event) => {
                          setMusicRightsBasis(event.target.value as "original" | "licensed");
                          setMusicRightsAccepted(false);
                          setUploadedMusicAssetId(null);
                        }}
                        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-sm text-white"
                        data-testid="select-spark-music-rights"
                      >
                        <option value="original">I created this recording</option>
                        <option value="licensed">I have a license to use it</option>
                      </select>
                    </label>
                    {musicRightsBasis === "licensed" && <label className="block text-xs font-bold text-white/80">
                      License or source URL
                      <input
                        type="url"
                        value={musicLicenseReference}
                        onChange={(event) => setMusicLicenseReference(event.target.value)}
                        placeholder="https://…"
                        maxLength={1000}
                        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/35"
                        data-testid="input-spark-music-license-url"
                      />
                    </label>}
                    <label className="flex items-start gap-2 text-xs leading-5 text-white/80">
                      <input
                        type="checkbox"
                        checked={musicRightsAccepted}
                        onChange={(event) => setMusicRightsAccepted(event.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                        data-testid="checkbox-spark-music-rights"
                      />
                      <span>I confirm I created this recording or have rights to reproduce and distribute it in this Moment.</span>
                    </label>
                    <label className="block text-xs font-bold text-white/80">
                      Music volume
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={musicVolume}
                        onChange={(event) => setMusicVolume(Number(event.target.value))}
                        className="mt-2 w-full"
                        aria-label="Background music volume"
                        data-testid="input-spark-music-volume"
                      />
                    </label>
                    <p className="text-[11px] leading-4 text-white/55">Niakofa records your declaration but does not independently verify third-party music licenses. Upload audio only when you have the necessary rights.</p>
                  </div>}
                </div>}
                {tool === "templates" && <div className="space-y-3" data-testid="panel-spark-templates">
                  <div><p className="text-sm font-bold">Reusable Spark formats</p><p className="text-xs text-white/60">Templates save text and layout on this device. Your photos and videos are never included.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[...BUILT_IN_STORY_TEMPLATES, ...studioTemplates].map((template) => (
                      <div key={template.id} className="flex min-w-0 items-stretch gap-2 rounded-xl border border-white/15 bg-white/5 p-2">
                        <button type="button" onClick={() => applyStudioTemplate(template)} className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left text-xs font-bold hover:bg-white/10" aria-label={`Apply ${template.name} Spark template`}>
                          <span className="block truncate">{template.name}</span>
                          <span className="mt-1 block truncate font-normal text-white/60">{template.caption || "Reusable layout"}</span>
                        </button>
                        {!BUILT_IN_STORY_TEMPLATES.some((item) => item.id === template.id) && <button type="button" onClick={() => {
                          if (!userId) return;
                          try {
                            setStudioTemplates(removeStoryTemplate(userId, template.id));
                            setTemplateError("");
                          } catch (reason) {
                            setTemplateError(reason instanceof Error ? reason.message : "This template could not be removed.");
                          }
                        }} className="min-h-11 rounded-lg px-3 text-xs text-white/65 hover:bg-white/10 hover:text-white" aria-label={`Delete ${template.name} template`}>Delete</button>}
                      </div>
                    ))}
                  </div>
                  <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); saveCurrentStudioTemplate(); }}>
                    <input value={templateName} onChange={(event) => { setTemplateName(event.target.value); setTemplateError(""); }} maxLength={60} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none focus:border-primary" placeholder="Name this layout" aria-label="Template name" />
                    <button type="submit" disabled={!userId || !templateName.trim()} className="min-h-11 rounded-xl bg-[#00cfff] px-3 text-xs font-bold text-[#08182b] transition-colors hover:bg-[#66e4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00cfff] disabled:opacity-40" data-testid="button-save-spark-template">Save layout</button>
                  </form>
                  {templateError && <p role="alert" className="text-xs text-rose-200">{templateError}</p>}
                </div>}
                {tool === "draw" && <div className="flex flex-wrap items-end gap-3" data-testid="panel-spark-drawing">
                  <label className="text-xs font-bold text-white/75">Brush color<input type="color" value={drawingColor} onChange={(event) => setDrawingColor(event.target.value)} className="mt-1 block h-10 w-14 cursor-pointer rounded-lg border border-white/20 bg-white/10" /></label>
                  <label className="min-w-36 flex-1 text-xs font-bold text-white/75">Brush size
                    <input type="range" min={1} max={12} step={1} value={drawingWidth} onChange={(event) => setDrawingWidth(Number(event.target.value))} className="mt-2 w-full" aria-label="Drawing brush size" />
                  </label>
                  <button type="button" onClick={() => setEditorElements((current) => current.filter((element) => element.type !== "drawing"))} disabled={!editorElements.some((element) => element.type === "drawing")} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold disabled:opacity-40">Clear drawings</button>
                  <p className="w-full text-xs text-white/60">Draw on the preview. Use Undo to remove the last stroke.</p>
                </div>}
                {tool === "stickers" && <div className="flex gap-2 overflow-x-auto pb-1">{["💙", "🙏", "🤝", "🌍", "🙌", "✨", "📍"].map((item) => <button key={item} type="button" onClick={() => { setSticker(item); upsertEditorElement({ id: "sticker", type: "sticker", payload: { sticker: item }, position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15 }); }} className={`h-11 w-11 shrink-0 rounded-xl border text-xl ${sticker === item ? "border-primary bg-primary/10" : "border-white/20"}`} aria-label={`Add ${item} sticker`}>{item}</button>)}</div>}
                {tool === "effects" && <div className="flex gap-2 overflow-x-auto pb-1">{(["none", "warmth", "contrast", "grayscale", "vignette"] as Effect[]).map((item) => <button key={item} type="button" onClick={() => setEffect(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize ${effect === item ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}>{item}</button>)}</div>}
                {tool === "mention" && <div className="space-y-2"><input value={mention} onChange={(event) => { setMention(event.target.value); setMentionUserId(null); setMentionCandidates([]); setEditorElements((current) => current.filter((element) => element.id !== "mention")); }} className="min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none focus:border-primary" placeholder="Search by name or @username" />{mentionCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => { const displayName = candidate.username ?? candidate.name; setMention(candidate.username ? `@${candidate.username}` : candidate.name); setMentionUserId(candidate.id); setMentionCandidates([]); upsertEditorElement({ id: "mention", type: "mention", payload: { display_name: displayName, mention_user_id: candidate.id }, position_x: 50, position_y: 65, scale: 1, rotation: 0, z_index: 18 }); }} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${mentionUserId === candidate.id ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}><MessageAvatar name={candidate.name} avatarUrl={candidate.avatar_url} size={28} /><span className="min-w-0"><span className="block truncate">{candidate.username ? `@${candidate.username}` : candidate.name}</span>{candidate.username && candidate.name.toLocaleLowerCase() !== candidate.username.toLocaleLowerCase() && <span className="block truncate text-[10px] font-medium text-white/60">{candidate.name}</span>}</span></button>)}</div>}
                {tool === "text" && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-bold text-white/65">Color<input type="color" value={textColor} onChange={(event) => { const value = event.target.value; setTextColor(value); updateEditorElement("caption", { payload: { color: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-white/10" /></label><label className="text-[10px] font-bold text-white/65">Size<select value={textSize} onChange={(event) => { const value = event.target.value; setTextSize(value); updateEditorElement("caption", { payload: { font_size: Number(value) } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="14">Small</option><option value="18">Medium</option><option value="26">Large</option></select></label><label className="text-[10px] font-bold text-white/65">Align<select value={textAlign} onChange={(event) => { const value = event.target.value as "left" | "center" | "right"; setTextAlign(value); updateEditorElement("caption", { payload: { align: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><div className="col-span-3"><p className="mb-1 text-[10px] font-bold text-white/65">Text background</p><div className="flex gap-2">{TEXT_STORY_BACKGROUNDS.map((color) => <button key={color} type="button" onClick={() => setTextBackground(color)} className={`h-8 w-8 rounded-full border-2 ${textBackground === color ? "border-white ring-2 ring-primary" : "border-white/20"}`} style={{ background: color }} aria-label={`Choose background ${color}`} />)}</div></div></div>}
                <textarea value={caption} onChange={(event) => updateCaption(event.target.value)} maxLength={1000} rows={2} className="mt-3 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white outline-none focus:border-primary" placeholder="Add text to your Spark…" />
                 <div className="mt-4 space-y-4 rounded-2xl border border-white/15 bg-black/15 p-3" data-testid="panel-moment-accessibility">
                   <div>
                     <label htmlFor="spark-moment-tags" className="block text-xs font-bold text-white/85">Moment tags <span className="font-normal text-white/55">(optional, up to 10)</span></label>
                     <input id="spark-moment-tags" value={momentAccessibility.momentTagsInput} onChange={(event) => setMomentAccessibility((current) => ({ ...current, momentTagsInput: event.target.value.slice(0, 320) }))} maxLength={320} className="mt-2 min-h-11 w-full rounded-xl border border-white/20 bg-slate-950/60 px-3 text-sm text-white placeholder:text-white/35" placeholder="community, art, celebration" aria-describedby="spark-moment-tags-help" data-testid="input-spark-moment-tags" />
                     <p id="spark-moment-tags-help" className="mt-1 text-[11px] leading-4 text-white/55">Separate tags with commas. Letters, numbers, and hyphens only; saved as lowercase.</p>
                   </div>
                   {selectedPreviewFile && (selectedPreviewFile.type.startsWith("image/") || selectedPreviewFile.type.startsWith("video/")) && (
                     <div className="space-y-3 border-t border-white/10 pt-3">
                       <p className="text-xs font-bold text-white/85">Accessibility for attachment {previewFileIndex + 1}: <span className="font-normal text-white/65">{selectedPreviewFile.name}</span></p>
                       <label htmlFor="spark-moment-alt" className="block text-xs font-bold text-white/85">Alternative text <span className="font-normal text-white/55">(required, up to 250 characters)</span>
                         <textarea id="spark-moment-alt" value={momentAccessibility.momentAltTexts[previewFileIndex] ?? ""} onChange={(event) => setMomentAccessibility((current) => ({ ...current, momentAltTexts: { ...current.momentAltTexts, [previewFileIndex]: event.target.value } }))} maxLength={250} rows={2} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/35" placeholder="Describe the important visual information" data-testid="input-spark-moment-alt" />
                       </label>
                       {selectedPreviewFile.type.startsWith("video/") && <label htmlFor="spark-moment-captions" className="block text-xs font-bold text-white/85">Creator video captions <span className="font-normal text-white/55">(optional plain-text WebVTT)</span>
                         <textarea id="spark-moment-captions" value={momentAccessibility.momentCaptionsVtt[previewFileIndex] ?? ""} onChange={(event) => setMomentAccessibility((current) => ({ ...current, momentCaptionsVtt: { ...current.momentCaptionsVtt, [previewFileIndex]: event.target.value } }))} maxLength={64 * 1024} rows={4} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-950/60 px-3 py-2 font-mono text-xs text-white placeholder:text-white/35" placeholder={"WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSpoken words"} aria-describedby="spark-moment-captions-help" data-testid="input-spark-moment-captions" />
                         <span id="spark-moment-captions-help" className="mt-1 block font-normal text-white/55">Plain-text cues only, ending within this video and the 180-second Moment limit.</span>
                       </label>}
                     </div>
                   )}
                   {exchangeListingId && <p role="status" className="text-[11px] leading-4 text-amber-100">Moment tags and attachment descriptions are not sent to Exchange Sparks. Clear these fields or unlink the listing before publishing.</p>}
                 </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-white/55">Original audio is preserved. Apply trim to replace the clip before upload; visual effects remain preview-only. Text and stickers stay with your Spark.</p>
                  {files.length > 0 && <button type="button" disabled={trimming} onClick={() => { setFiles([]); setGallerySelection([]); setCameraClipReelMarker(null); setPendingCameraReelStoryId(null); setMomentAccessibility((current) => ({ ...current, momentAltTexts: {}, momentCaptionsVtt: {} })); setTrimPreview({}); setCoverTimes({}); }} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-bold"><Trash2 className="h-4 w-4" /> Clear</button>}
                </div>
                </>}
              </div>
            </SparkComposerChrome>
          </div>
        </div>
      )}
      {cameraOpen && <StoryCameraRecorder
        onUse={onCameraVideo}
        onCancel={cancelCamera}
        onGallery={() => { setCameraOpen(false); setGalleryOpen(true); }}
        onText={() => { setCameraOpen(false); setStudioStep("edit"); setTool(null); }}
        allowText={!responseTargetId}
      />}

      {selectedStory && selectedAuthor && (
        <CommunityStoryViewerOverlay
          author={selectedAuthor}
          story={selectedStory}
          media={selectedMedia}
          playerMedia={selectedPlayerMedia}
          playbackAttempt={selectedStory.moment_video ? momentVideoVersions[selectedStory.id] ?? 0 : 0}
          reelStatus={selectedMomentVideoState?.status ?? null}
          reelFailureCode={selectedMomentVideoState?.failureCode ?? null}
          reelPlaybackError={selectedStory?.moment_video ? momentVideoPlaybackErrors[selectedStory.id] ?? null : null}
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
          onRetryReel={selectedStory.moment_video ? () => {
            momentVideoRefreshAttemptedRef.current.delete(selectedStory.id);
            setMomentVideoPlaybackErrors((current) => { const next = { ...current }; delete next[selectedStory.id]; return next; });
            void loadMomentVideoUrl(selectedStory, true);
          } : undefined}
          onPlaybackError={selectedStory.moment_video ? () => {
            if (momentVideoRefreshAttemptedRef.current.has(selectedStory.id)) {
              setMomentVideoPlaybackErrors((current) => ({ ...current, [selectedStory.id]: "The camera reel could not be played. Try refreshing its secure playback grant." }));
              return;
            }
            momentVideoRefreshAttemptedRef.current.add(selectedStory.id);
            setMomentVideoPlaybackErrors((current) => ({ ...current, [selectedStory.id]: "Refreshing secure camera reel playback…" }));
            void loadMomentVideoUrl(selectedStory, true);
          } : undefined}
        />
      )}
      {galleryOpen && composerOpen && draftReady && activeScopeRef.current === scopeKey && (
        <CommunityStoryGalleryOverlay
          thumbnails={galleryThumbnails}
          selected={gallerySelection}
          onSelect={(id) => toggleGallerySelection(Number(id))}
          onMultiple={() => { setCameraClipReelMarker(null); setPendingCameraReelStoryId(null); setGallerySelection(files.map((_, index) => index)); }}
          onClose={() => setGalleryOpen(false)}
          onCamera={() => { if (!trimming) { setGalleryOpen(false); setCameraOpen(true); } }}
          onChooseFiles={() => galleryInput.current?.click()}
          onDone={() => setGalleryOpen(false)}
        />
      )}
      {shareStoryId !== null && selectedStory?.id === shareStoryId && (
        <CommunityStoryShareOverlay
          storyId={shareStoryId}
          audience={selectedStory.audience === "hub" ? "hub" : "community"}
          hubId={selectedStory.hub_id}
          onClose={() => setShareStoryId(null)}
        />
      )}
    </>
  );
}