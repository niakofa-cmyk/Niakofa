import {
  AtSign,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Send,
  Share2,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { MessageAvatar } from "@/components/messages/MessageAvatar";

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this media."));
    reader.readAsDataURL(file);
  });
}

function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return "Story";
  const hours = Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.now()) / 3_600_000));
  return `${hours}h left`;
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

export function CommunityStoryRail({ hubId }: { hubId: number | null }) {
  const [, navigate] = useLocation();
  const [stories, setStories] = useState<CommunityStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaUrls, setMediaUrls] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"community" | "hub">(hubId ? "hub" : "community");
  const [tool, setTool] = useState<Tool | null>(null);
  const [effect, setEffect] = useState<Effect>("none");
  const [music, setMusic] = useState("Original audio");
  const [sticker, setSticker] = useState("💙");
  const [mention, setMention] = useState("");
  const [mentionUserId, setMentionUserId] = useState<number | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<Array<{ id: number; name: string; avatar_url: string | null }>>([]);
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState("18");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("center");
  const [publishing, setPublishing] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const authors = useMemo(() => groupStories(stories), [stories]);
  const selectedAuthor = viewerIndex === null ? null : authors[viewerIndex] ?? null;
  const selectedFrame = selectedAuthor?.frames[mediaIndex] ?? null;
  const selectedStory = selectedFrame?.story ?? null;
  const selectedMedia = selectedFrame?.media ?? null;
  const selectedFileUrl = files[0] ? URL.createObjectURL(files[0]) : null;
  const filter = effect === "warmth"
    ? "sepia(.25) saturate(1.25)"
    : effect === "contrast"
      ? "contrast(1.2)"
      : effect === "grayscale"
        ? "grayscale(1)"
        : "none";

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

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const loadMedia = async () => {
      const visible = stories.slice(0, 24).flatMap((story) => story.media);
      const entries = await Promise.all(visible.map(async (media) => {
        try {
          const response = await fetch(media.media_url, { headers: authHeaders() });
          if (!response.ok) return null;
          const url = URL.createObjectURL(await response.blob());
          urls.push(url);
          return [media.id, url] as const;
        } catch {
          return null;
        }
      }));
      if (!cancelled) setMediaUrls(Object.fromEntries(entries.filter((entry): entry is readonly [number, string] => Boolean(entry))));
    };
    void loadMedia();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stories]);

  useEffect(() => () => {
    if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
  }, [selectedFileUrl]);

  const resetComposer = () => {
    setFiles([]);
    setCaption("");
    setTool(null);
    setEffect("none");
    setMusic("Original audio");
    setSticker("💙");
    setMention("");
    setMentionUserId(null);
    setMentionCandidates([]);
    setTextColor("#ffffff");
    setTextSize("18");
    setTextAlign("center");
    setAudience(hubId ? "hub" : "community");
  };

  const publish = async () => {
    if (publishing || (!caption.trim() && files.length === 0 && !tool)) return;
    setPublishing(true);
    setError(null);
    try {
      const media = await Promise.all(files.slice(0, 6).map(async (file) => ({
        data_url: await readFileAsDataUrl(file),
        media_type: file.type.startsWith("video/") ? "video" as const : "photo" as const,
        mime_type: file.type,
      })));
      const elements: Array<Record<string, unknown>> = [];
       if (caption.trim()) elements.push({ type: "text", payload: { text: caption.trim(), color: textColor, font_size: Number(textSize), align: textAlign }, position_x: 50, position_y: 78, z_index: 10 });
      if (tool === "music") elements.push({ type: "music", payload: { audio_source: "niakofa_library", track: music, volume: 1 }, position_x: 50, position_y: 12 });
      if (tool === "stickers") elements.push({ type: "sticker", payload: { sticker }, position_x: 50, position_y: 50, scale: 1.2, z_index: 20 });
      if (tool === "effects") elements.push({ type: "effect", payload: { effect }, position_x: 50, position_y: 50 });
       if (tool === "mention" && mentionUserId) elements.push({ type: "mention", payload: { mention_user_id: mentionUserId, display_name: mention.trim() }, position_x: 50, position_y: 64, z_index: 20 });
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
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    setFiles(selected.slice(0, 6));
    event.target.value = "";
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
    if (!selectedStory) return;
    void fetch(`/api/community/stories/${selectedStory.id}/view`, { method: "POST", headers: authHeaders() }).catch(() => {});
  }, [selectedStory?.id]);

  const advanceFrame = (direction: 1 | -1) => {
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
  };

  const renderElement = (element: CommunityStory["elements"][number]) => {
    const payload = element.payload;
    const style = {
      left: `${element.position_x ?? 50}%`,
      top: `${element.position_y ?? 50}%`,
      transform: `translate(-50%, -50%) rotate(${element.rotation ?? 0}deg) scale(${element.scale ?? 1})`,
      zIndex: element.z_index ?? 0,
    };
    if (element.type === "text") return <span style={{ ...style, color: typeof payload.color === "string" ? payload.color : "#fff", fontSize: `${Number(payload.font_size) || 18}px`, textAlign: payload.align === "left" || payload.align === "right" ? payload.align : "center" }} className="absolute max-w-[86%] whitespace-pre-wrap font-black drop-shadow-lg">{String(payload.text ?? "")}</span>;
    if (element.type === "sticker") return <span style={style} className="absolute text-5xl drop-shadow-lg">{String(payload.sticker ?? "✨")}</span>;
    if (element.type === "mention") return <span style={style} className="absolute rounded-full bg-black/60 px-3 py-1 text-sm font-black text-white">@{String(payload.display_name ?? "neighbor")}</span>;
    return null;
  };

  const toolButtons: Array<{ key: Tool; label: string; icon: typeof Music2 }> = [
    { key: "music", label: "Music", icon: Music2 },
    { key: "stickers", label: "Stickers", icon: Sticker },
    { key: "text", label: "Text", icon: Type },
    { key: "effects", label: "Effects", icon: Sparkles },
    { key: "mention", label: "Mention", icon: AtSign },
  ];

  return (
    <>
      <section aria-label="Community Stories" className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Community Moments</p>
            <h2 className="mt-1 text-lg font-black">Stories from your community</h2>
            <p className="mt-1 text-xs text-muted-foreground">Short-lived updates expire after 24 hours. Griot Stories remain preserved.</p>
          </div>
          <button type="button" onClick={() => setComposerOpen(true)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-black text-primary-foreground">
            <Camera className="h-3.5 w-3.5" /> Create
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
        {loading ? (
          <div className="flex gap-3 overflow-hidden pt-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            <button type="button" onClick={() => setComposerOpen(true)} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/60 bg-primary/10 text-2xl text-primary">+</span>
              <span className="max-w-20 truncate text-[11px] font-bold">Your Story</span>
            </button>
            {authors.map((story, index) => (
              <button key={story.author_user_id} type="button" onClick={() => { setViewerIndex(index); setMediaIndex(0); }} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
                <span className="rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-amber-400 p-[2px]">
                  <MessageAvatar name={story.author.name} avatarUrl={story.author.avatar_url} size={60} />
                </span>
                <span className="max-w-20 truncate text-[11px] font-bold">{story.author.name}</span>
              </button>
            ))}
            {!authors.length && <p className="self-center px-2 text-xs text-muted-foreground">Be the first neighbor to share a Moment.</p>}
          </div>
        )}
      </section>

      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-4">
          <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden bg-background sm:rounded-3xl sm:border sm:border-border">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div><p className="font-black">Create Community Story</p><p className="text-[11px] text-muted-foreground">Camera → edit → share</p></div>
              <button type="button" onClick={() => { resetComposer(); setComposerOpen(false); }} className="rounded-full p-2 hover:bg-muted" aria-label="Close Story creator"><X className="h-5 w-5" /></button>
            </header>
            <div className="overflow-y-auto p-4">
              <div className={`relative flex min-h-80 items-center justify-center overflow-hidden rounded-3xl bg-muted ${!selectedFileUrl ? "border border-dashed border-primary/30" : ""}`}>
                {selectedFileUrl ? (
                  files[0]?.type.startsWith("video/") ? <video src={selectedFileUrl} controls playsInline className="max-h-[52dvh] w-full object-contain" style={{ filter }} /> : <img src={selectedFileUrl} alt="Story preview" className="max-h-[52dvh] w-full object-contain" style={{ filter }} />
                ) : (
                  <div className="px-8 text-center"><Camera className="mx-auto h-10 w-10 text-primary/60" /><p className="mt-3 font-black">Add a photo or video</p><p className="mt-1 text-xs text-muted-foreground">Use your camera or choose up to six recent items.</p></div>
                )}
                {caption && <div className="absolute bottom-5 left-4 right-4 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-bold text-white">{caption}</div>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => cameraInput.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-xs font-black"><Camera className="h-4 w-4" /> Camera / video</button>
                <button type="button" onClick={() => galleryInput.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-xs font-black"><ImagePlus className="h-4 w-4" /> Gallery {files.length > 1 ? `(${files.length})` : ""}</button>
                <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={onFileChange} />
                <input ref={galleryInput} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={onFileChange} />
              </div>
              <div className="mt-4 flex justify-between gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2">
                {toolButtons.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setTool(tool === key ? null : key)} className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold ${tool === key ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Icon className="h-5 w-5" />{label}</button>)}
              </div>
              {tool === "music" && <div className="mt-3 flex gap-2 overflow-x-auto">{["Original audio", "Sunrise", "Neighborhood pulse", "Quiet strength"].map((track) => <button key={track} type="button" onClick={() => setMusic(track)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${music === track ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><Music2 className="mr-1 inline h-3 w-3" />{track}</button>)}</div>}
              {tool === "stickers" && <div className="mt-3 flex gap-2 overflow-x-auto">{["💙", "🙏", "🤝", "🌍", "🙌", "✨", "📍"].map((item) => <button key={item} type="button" onClick={() => setSticker(item)} className={`h-11 w-11 shrink-0 rounded-xl border text-xl ${sticker === item ? "border-primary bg-primary/10" : "border-border"}`}>{item}</button>)}</div>}
              {tool === "effects" && <div className="mt-3 flex gap-2 overflow-x-auto">{(["none", "warmth", "contrast", "grayscale", "vignette"] as Effect[]).map((item) => <button key={item} type="button" onClick={() => setEffect(item)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize ${effect === item ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{item}</button>)}</div>}
               {tool === "mention" && <div className="mt-3 space-y-2"><input value={mention} onChange={(event) => { setMention(event.target.value); setMentionUserId(null); }} className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary" placeholder="@ Mention a community member" />{mentionCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => { setMention(candidate.name); setMentionUserId(candidate.id); setMentionCandidates([]); }} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${mentionUserId === candidate.id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}><MessageAvatar name={candidate.name} avatarUrl={candidate.avatar_url} size={28} />{candidate.name}</button>)}</div>}
               {tool === "text" && <div className="mt-3 grid grid-cols-3 gap-2"><label className="text-[10px] font-bold text-muted-foreground">Color<input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-card" /></label><label className="text-[10px] font-bold text-muted-foreground">Size<select value={textSize} onChange={(event) => setTextSize(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-1 text-xs"><option value="14">Small</option><option value="18">Medium</option><option value="26">Large</option></select></label><label className="text-[10px] font-bold text-muted-foreground">Align<select value={textAlign} onChange={(event) => setTextAlign(event.target.value as "left" | "center" | "right")} className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>}
              <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} rows={3} className="mt-4 w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none focus:border-primary" placeholder="Add text to your Moment…" />
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><div><p className="text-xs font-black">Share with</p><p className="text-[10px] text-muted-foreground">{audience === "hub" ? "Selected Hub members" : "Your approved community"}</p></div></div>
                <select value={audience} onChange={(event) => setAudience(event.target.value as "community" | "hub")} disabled={!hubId} className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-bold"><option value="community">Community</option><option value="hub">This Hub</option></select>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Video Stories are short recorded or camera-roll clips, not a live broadcast. Live broadcasting will be a separate Community capability. Music uses Niakofa’s curated audio metadata; add licensed catalogs only after rights review.</p>
            </div>
            <footer className="flex items-center gap-2 border-t border-border p-4">
              {files.length > 0 && <button type="button" onClick={() => setFiles([])} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold"><Trash2 className="h-4 w-4" /> Clear</button>}
              <button type="button" onClick={() => void publish()} disabled={publishing || (!caption.trim() && !files.length && !tool)} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-50">{publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> Sharing…</> : <><Send className="h-4 w-4" /> Share Story</>}</button>
            </footer>
          </div>
        </div>
      )}

      {selectedStory && selectedAuthor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label={`${selectedAuthor.author.name}'s Story`}>
          <div className="relative flex h-full max-h-[900px] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-zinc-950 text-white">
            <div className="flex gap-1 px-3 pt-3">{selectedAuthor.frames.map((frame, index) => <span key={`${frame.story.id}-${frame.media?.id ?? "text"}`} className={`h-1 flex-1 rounded-full ${index <= mediaIndex ? "bg-white" : "bg-white/25"}`} />)}</div>
            <header className="flex items-center gap-3 px-4 py-3"><MessageAvatar name={selectedAuthor.author.name} avatarUrl={selectedAuthor.author.avatar_url} size={38} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{selectedAuthor.author.name}</p><p className="text-[10px] text-white/60">{timeLeft(selectedStory.expires_at)}</p></div><button type="button" className="p-2" aria-label="Story options"><MoreHorizontal className="h-5 w-5" /></button><button type="button" onClick={() => setViewerIndex(null)} className="p-2" aria-label="Close Story viewer"><X className="h-5 w-5" /></button></header>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {selectedMedia && mediaUrls[selectedMedia.id] ? (selectedMedia.media_type === "video" ? <video key={selectedMedia.id} src={mediaUrls[selectedMedia.id]} autoPlay controls playsInline className="h-full w-full object-contain" /> : <img src={mediaUrls[selectedMedia.id]} alt="" className="h-full w-full object-contain" />) : <div className="flex h-full items-center justify-center px-8 text-center text-2xl font-black">{selectedStory.caption || "Community Moment"}</div>}
              {selectedStory.elements.map(renderElement)}
              <button type="button" onClick={() => advanceFrame(-1)} className="absolute inset-y-0 left-0 w-1/3" aria-label="Previous Story"><ChevronLeft className="absolute left-2 top-1/2 h-7 w-7 text-white/70" /></button>
              <button type="button" onClick={() => advanceFrame(1)} className="absolute inset-y-0 right-0 w-1/3" aria-label="Next Story"><ChevronRight className="absolute right-2 top-1/2 h-7 w-7 text-white/70" /></button>
            </div>
            <div className="space-y-3 p-4">
              {selectedStory.caption && <p className="text-sm leading-relaxed">{selectedStory.caption}</p>}
              <div className="flex items-center gap-2"><button type="button" onClick={() => navigate(`/messages?mode=direct&recipientId=${selectedStory.author_user_id}&storyId=${selectedStory.id}`)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-bold"><MessageCircle className="h-4 w-4" /> Reply</button><button type="button" onClick={() => void fetch(`/api/community/stories/${selectedStory.id}/reaction`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ reaction: "💙" }) })} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-label="React to Story"><span aria-hidden>💙</span></button><button type="button" onClick={() => void fetch(`/api/community/stories/${selectedStory.id}/share`, { method: "POST", headers: authHeaders() })} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-label="Share Story"><Share2 className="h-4 w-4" /></button></div>
              {selectedStory.reply_enabled && <p className="text-center text-[11px] font-bold text-primary">Replies include Story context in Messages.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}