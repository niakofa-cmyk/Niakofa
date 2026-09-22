import {
  AtSign,
  Music2,
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
  StoryMusicChrome,
  StoryViewerChrome,
  StoryVisualRail,
  type StoryVisualAuthor,
  type StoryVisualTool,
} from "./CommunityStoryVisual";

type StoryMedia = {
  id: number;
  media_type: "photo" | "video";
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
  const [musicQuery, setMusicQuery] = useState("");
  const [musicTab, setMusicTab] = useState<"for-you" | "trending">("for-you");
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
  const visualAuthors = useMemo<StoryVisualAuthor[]>(
    () => authors.map((author) => ({
      id: author.author_user_id,
      name: author.author.name,
      avatarUrl: author.author.avatar_url,
      seen: seenAuthorIds.has(author.author_user_id),
      contextLabel: hubId ? "Hub Story" : "Community",
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
  const musicTracks = useMemo(() => [
    { id: "original", title: "Original audio", artist: "Your Story" },
    { id: "sunrise", title: "Sunrise", artist: "Niakofa curated" },
    { id: "neighborhood-pulse", title: "Neighborhood pulse", artist: "Niakofa curated" },
    { id: "quiet-strength", title: "Quiet strength", artist: "Niakofa curated" },
  ].filter((track) => {
    const matchesQuery = `${track.title} ${track.artist}`.toLowerCase().includes(musicQuery.toLowerCase());
    return matchesQuery && (musicTab === "for-you" || track.id !== "original");
  }), [musicQuery, musicTab]);
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
        if (!response.ok) throw new Error(data.error || "Could not load Community Stories.");
        if (!cancelled) setStories(Array.isArray(data.stories) ? data.stories : []);
      } catch (reason: unknown) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load Community Stories.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [hubId]);

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
    return () => {
      Object.values(mediaObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      mediaObjectUrlsRef.current = {};
      setMediaUrls({});
    };
  }, [loadMediaUrl, stories]);

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
    setMusicQuery("");
    setMusicTab("for-you");
    setAudience(hubId ? "hub" : "community");
  };

  const publish = async () => {
    if (publishing || (!caption.trim() && files.length === 0 && !tool)) return;
    setPublishing(true);
    setError(null);
    try {
      const validationErrors = await validateStoryFiles(files);
      if (validationErrors.length) throw new Error(validationErrors[0]);
      const selectedIndexes = gallerySelection
        .filter((index) => Number.isInteger(index) && index >= 0 && index < files.length)
        .sort((a, b) => a - b);
      const selectedFiles = selectedIndexes.map((index) => files[index]).filter((file): file is File => Boolean(file));
      const metadata = await Promise.all(selectedFiles.map((file) => readStoryMediaMetadata(file)));
      const media = await Promise.all(selectedFiles.map(async (file, index) => ({
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
        body: JSON.stringify({ caption: caption.trim(), hub_id: hubId, audience, media, elements }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not publish your Story.");
      resetComposer();
      setComposerOpen(false);
      const refresh = await fetch(`/api/community/stories${hubId ? `?hubId=${hubId}` : ""}`, { headers: authHeaders() });
      if (refresh.ok) {
        const next = await refresh.json() as { stories?: CommunityStory[] };
        setStories(Array.isArray(next.stories) ? next.stories : []);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not publish your Story.");
    } finally {
      setPublishing(false);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files: selected, errors } = normalizeStoryFiles(Array.from(event.target.files ?? []));
    if (errors.length) setError(errors[0]);
    setFiles(selected);
    setGallerySelection(selected.map((_, index) => index));
    setPreviewFileIndex(0);
    if (event.target === galleryInput.current) setGalleryOpen(true);
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
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/community/stories/mention-candidates?q=${encodeURIComponent(mention)}`, { headers: authHeaders() });
      if (response.ok) {
        const data = await response.json() as { users?: Array<{ id: number; name: string; avatar_url: string | null }> };
        setMentionCandidates(Array.isArray(data.users) ? data.users : []);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mention, tool]);

  useEffect(() => {
    if (selectedStoryId === null) return;
    setStoryProgress(0);
    void recordStoryView(selectedStoryId).catch(() => {});
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
      setReactedStoryIds((current) => ({ ...current, [selectedStoryId]: !alreadyReacted }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your reaction.");
    }
  }

  const toolButtons: Array<{ key: StoryVisualTool; label: string; icon: ReactNode }> = [
    { key: "music", label: "Music", icon: <Music2 size={22} /> },
    { key: "stickers", label: "Stickers", icon: <Sticker size={22} /> },
    { key: "text", label: "Text", icon: <Type size={22} /> },
    { key: "effects", label: "Effects", icon: <Sparkles size={22} /> },
    { key: "mention", label: "Mention", icon: <AtSign size={22} /> },
  ];

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
      <section className="nia-community-stories-shell" aria-label="Niakofa Community Stories">
        {!compact && <header className="nia-community-stories-hero">
          <div className="nia-community-stories-brand">
            <div className="nia-community-stories-mark" aria-hidden="true">N</div>
            <div>
              <p className="nia-story-kicker">Niakofa Community</p>
              <h1>Stories</h1>
              <p>Share • Connect • Build Together</p>
            </div>
          </div>
          <button className="nia-story-pill" type="button" onClick={() => setComposerOpen(true)}>
            <span aria-hidden="true">＋</span>
            Create Story
          </button>
        </header>}

        <StoryVisualRail
          authors={visualAuthors}
          loading={loading}
          onCreate={() => setComposerOpen(true)}
          onOpen={openStory}
          emptyLabel="No Stories yet. Start the first Community Story."
        />
      </section>

      {composerOpen && (
        <div className="nia-story-composer-overlay">
          <div className="nia-story-composer-shell">
            <StoryComposerChrome
              preview={(
                <StoryEditorCanvas
                  elements={editorElements}
                  onChange={setEditorElements}
                  className={`relative flex h-full min-h-80 w-full items-center justify-center overflow-hidden bg-black ${!selectedFileUrl ? "border border-dashed border-primary/30" : ""}`}
                >
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden" style={!selectedFileUrl ? { background: textBackground } : undefined}>
                    {selectedFileUrl ? (
                      selectedPreviewFile?.type.startsWith("video/") ? <video src={selectedFileUrl} muted playsInline className="max-h-[52dvh] max-w-full object-contain" style={{ filter }} /> : <img src={selectedFileUrl} alt="Story preview" className="max-h-[52dvh] max-w-full object-contain" style={{ filter }} />
                    ) : (
                      <div className="px-8 text-center text-white"><Type className="mx-auto h-10 w-10 text-white/70" /><p className="mt-3 font-black">{caption ? "Text Story preview" : "Add a photo or video"}</p><p className="mt-1 text-xs text-white/65">Use your camera, choose recent items, or create a text-only Story.</p></div>
                    )}
                  </div>
                </StoryEditorCanvas>
              )}
              tools={toolButtons}
              activeTool={tool}
              onTool={(nextTool) => setTool(tool === nextTool ? null : nextTool)}
              onClose={() => { resetComposer(); setComposerOpen(false); }}
              onSettings={() => document.getElementById("story-audience")?.focus()}
              onGallery={() => { setGallerySelection(files.map((_, index) => index)); setGalleryOpen(true); }}
              onCamera={() => cameraInput.current?.click()}
              onPublish={() => void publish()}
              publishing={publishing}
              galleryCount={files.length}
            >
              <div className="nia-story-composer__form">
                {error && <p role="alert" className="mb-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
                <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={onFileChange} />
                <input ref={galleryInput} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={onFileChange} />
                {files.length > 0 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Story media sequence">
                  {files.map((file, index) => <button key={`${file.name}-${index}`} type="button" onClick={() => setPreviewFileIndex(index)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${previewFileIndex === index ? "border-primary" : "border-white/20"}`} aria-label={`Preview Story item ${index + 1}`}>
                    {previewUrls[index] ? (file.type.startsWith("video/") ? <video src={previewUrls[index]} muted playsInline className="h-full w-full object-cover" /> : <img src={previewUrls[index]} alt="" className="h-full w-full object-cover" />) : <span className="grid h-full place-items-center text-xs">{index + 1}</span>}
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{index + 1}</span>
                  </button>)}
                </div>}
                {tool === "music" && (
                  <StoryMusicChrome
                    query={musicQuery}
                    onQuery={setMusicQuery}
                    tab={musicTab}
                    onTab={setMusicTab}
                    tracks={musicTracks}
                    onPlay={(id) => {
                      const track = musicTracks.find((item) => item.id === id);
                      if (!track) return;
                      upsertEditorElement({ id: "music", type: "music", payload: { track: track.title }, position_x: 50, position_y: 12, scale: 1, rotation: 0, z_index: 20 });
                    }}
                  />
                )}
                {tool === "stickers" && <div className="flex gap-2 overflow-x-auto pb-1">{["💙", "🙏", "🤝", "🌍", "🙌", "✨", "📍"].map((item) => <button key={item} type="button" onClick={() => { setSticker(item); upsertEditorElement({ id: "sticker", type: "sticker", payload: { sticker: item }, position_x: 50, position_y: 50, scale: 1, rotation: 0, z_index: 15 }); }} className={`h-11 w-11 shrink-0 rounded-xl border text-xl ${sticker === item ? "border-primary bg-primary/10" : "border-white/20"}`} aria-label={`Add ${item} sticker`}>{item}</button>)}</div>}
                {tool === "effects" && <div className="flex gap-2 overflow-x-auto pb-1">{(["none", "warmth", "contrast", "grayscale", "vignette"] as Effect[]).map((item) => <button key={item} type="button" onClick={() => setEffect(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize ${effect === item ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}>{item}</button>)}</div>}
                {tool === "mention" && <div className="space-y-2"><input value={mention} onChange={(event) => { setMention(event.target.value); setMentionUserId(null); setEditorElements((current) => current.filter((element) => element.id !== "mention")); }} className="min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none focus:border-primary" placeholder="@ Mention a community member" />{mentionCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => { setMention(candidate.name); setMentionUserId(candidate.id); setMentionCandidates([]); upsertEditorElement({ id: "mention", type: "mention", payload: { display_name: candidate.name, mention_user_id: candidate.id }, position_x: 50, position_y: 65, scale: 1, rotation: 0, z_index: 18 }); }} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${mentionUserId === candidate.id ? "border-primary bg-primary/10 text-primary" : "border-white/20"}`}><MessageAvatar name={candidate.name} avatarUrl={candidate.avatar_url} size={28} />{candidate.name}</button>)}</div>}
                {tool === "text" && <div className="grid grid-cols-3 gap-2"><label className="text-[10px] font-bold text-white/65">Color<input type="color" value={textColor} onChange={(event) => { const value = event.target.value; setTextColor(value); updateEditorElement("caption", { payload: { color: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-white/10" /></label><label className="text-[10px] font-bold text-white/65">Size<select value={textSize} onChange={(event) => { const value = event.target.value; setTextSize(value); updateEditorElement("caption", { payload: { font_size: Number(value) } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="14">Small</option><option value="18">Medium</option><option value="26">Large</option></select></label><label className="text-[10px] font-bold text-white/65">Align<select value={textAlign} onChange={(event) => { const value = event.target.value as "left" | "center" | "right"; setTextAlign(value); updateEditorElement("caption", { payload: { align: value } }); }} className="mt-1 h-9 w-full rounded-lg border border-white/20 bg-black px-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><div className="col-span-3"><p className="mb-1 text-[10px] font-bold text-white/65">Text background</p><div className="flex gap-2">{TEXT_STORY_BACKGROUNDS.map((color) => <button key={color} type="button" onClick={() => setTextBackground(color)} className={`h-8 w-8 rounded-full border-2 ${textBackground === color ? "border-white ring-2 ring-primary" : "border-white/20"}`} style={{ background: color }} aria-label={`Choose background ${color}`} />)}</div></div></div>}
                <textarea value={caption} onChange={(event) => updateCaption(event.target.value)} maxLength={1000} rows={2} className="mt-3 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white outline-none focus:border-primary" placeholder="Add text to your Moment…" />
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><div><p className="text-xs font-black">Share with</p><p className="text-[10px] text-white/60">{audience === "hub" ? "Selected Hub members" : "Your approved community"}</p></div></div>
                  <select id="story-audience" value={audience} onChange={(event) => setAudience(event.target.value as "community" | "hub")} disabled={!hubId} className="rounded-lg border border-white/20 bg-black px-2 py-2 text-xs font-bold"><option value="community">Community</option><option value="hub">This Hub</option></select>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-white/55">Video Stories are short recorded or camera-roll clips. Music remains curated metadata until a licensed audio pipeline is approved.</p>
                  {files.length > 0 && <button type="button" onClick={() => { setFiles([]); setGallerySelection([]); }} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-bold"><Trash2 className="h-4 w-4" /> Clear</button>}
                </div>
              </div>
            </StoryComposerChrome>
          </div>
        </div>
      )}

      {selectedStory && selectedAuthor && (
        <div className="nia-story-viewer-overlay" role="dialog" aria-modal="true" aria-label={`${selectedAuthor.author.name}'s Story`}>
          <StoryViewerChrome
            author={{
              id: selectedAuthor.author_user_id,
              name: selectedAuthor.author.name,
              avatarUrl: selectedAuthor.author.avatar_url,
              contextLabel: selectedStory.hub_id ? "Hub Story" : "Community",
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
                  setError(reason instanceof Error ? reason.message : "Could not send your Story reply.");
                });
            }}
            onShare={() => setShareStoryId(selectedStory.id)}
            replyPlaceholder={selectedStory.reply_enabled ? "Reply to this Story…" : "Replies are off"}
            replyDisabled={!selectedStory.reply_enabled}
          >
            <div className="nia-story-viewer__player-shell">
              <StoryMediaPlayer
                media={selectedPlayerMedia}
                elements={selectedStory.elements}
                fallbackText={selectedMedia ? "Loading Story media…" : selectedStory.caption || "Community Moment"}
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