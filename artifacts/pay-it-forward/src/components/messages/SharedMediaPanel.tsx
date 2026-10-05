import { reportClientSideEffectFailure } from "@/lib/client-error-reporting";

import { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Link2, Loader2, MapPinned, Music2, Video, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";

type MediaItem = {
  id: number;
  message_id: number;
  attachment_type?: "file" | "link" | "location" | string;
  mime_type: string;
  byte_size: number;
  original_name: string | null;
  alt_text: string | null;
  created_at: string | null;
  media_url: string;
  link_url?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_label?: string | null;
};

type Tab = "photos" | "videos" | "audio" | "files" | "links" | "location";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function SharedMediaPanel({
  conversationId,
  onClose,
}: {
  conversationId: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("photos");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [objectUrls, setObjectUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/messages/direct/${conversationId}/media`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load shared media.");
        const data = await response.json() as { media?: MediaItem[] };
        if (!cancelled) setItems(Array.isArray(data.media) ? data.media : []);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load shared media."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  const visible = useMemo(() => {
    if (tab === "photos") return items.filter((item) => item.mime_type.startsWith("image/"));
    if (tab === "videos") return items.filter((item) => item.mime_type.startsWith("video/"));
    if (tab === "audio") return items.filter((item) => item.mime_type.startsWith("audio/"));
    if (tab === "files") return items.filter((item) => item.attachment_type === "file" && !item.mime_type.startsWith("image/") && !item.mime_type.startsWith("video/") && !item.mime_type.startsWith("audio/"));
    return [];
  }, [items, tab]);

  const contextItems = useMemo(
    () => items.filter((item) => item.attachment_type === tab),
    [items, tab],
  );

  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];
    const created: Record<number, string> = {};

    if (!visible.length) return;
    for (const item of visible.slice(0, 60)) {
      const controller = new AbortController();
      controllers.push(controller);
      void fetch(item.media_url, { headers: authHeaders(), signal: controller.signal })
        .then((response) => response.ok ? response.blob() : Promise.reject(new Error("media")))
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created[item.id] = url;
          setObjectUrls((current) => ({ ...current, [item.id]: url }));
        })
        .catch(reportClientSideEffectFailure("components.shared-media.load"));
    }

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      Object.values(created).forEach((url) => URL.revokeObjectURL(url));
      setObjectUrls({});
    };
  }, [visible]);

  const tabs: Array<{ value: Tab; label: string; icon: typeof ImageIcon }> = [
    { value: "photos", label: "Photos", icon: ImageIcon },
    { value: "videos", label: "Videos", icon: Video },
    { value: "audio", label: "Audio", icon: Music2 },
    { value: "files", label: "Files", icon: FileText },
    { value: "links", label: "Links", icon: Link2 },
    { value: "location", label: "Location", icon: MapPinned },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Shared media">
      <section className="flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Conversation</p><h2 className="mt-1 text-xl font-black">Shared Media & Files</h2><p className="mt-1 text-xs text-muted-foreground">{items.length} stored attachments in this conversation.</p></div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted" aria-label="Close shared media"><X className="h-5 w-5" /></button>
        </header>
        <div className="border-b border-border p-3">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-background p-1 sm:grid-cols-6">
            {tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setTab(value)} className={`flex min-h-10 items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-black ${tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
          {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          {!loading && !error && (tab === "links" || tab === "location") && contextItems.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              {tab === "links" ? <Link2 className="h-8 w-8 text-primary/50" /> : <MapPinned className="h-8 w-8 text-primary/50" />}
              <p className="mt-3 text-sm font-black">{tab === "links" ? "No shared links stored" : "No shared locations stored"}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Shared {tab === "links" ? "links" : "locations"} appear here when they are posted in this conversation.</p>
            </div>
          )}
          {!loading && !error && tab === "links" && contextItems.length > 0 && (
            <div className="space-y-2">{contextItems.map((item) => item.link_url ? <a key={item.id} href={item.link_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-sm font-bold text-primary"><Link2 className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{item.original_name || item.link_url}</span></a> : null)}</div>
          )}
          {!loading && !error && tab === "location" && contextItems.length > 0 && (
            <div className="space-y-2">{contextItems.map((item) => item.location_lat !== null && item.location_lat !== undefined && item.location_lng !== null && item.location_lng !== undefined ? <a key={item.id} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.location_lat},${item.location_lng}`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-sm font-bold text-primary"><MapPinned className="h-5 w-5 shrink-0" /><span className="min-w-0 truncate">{item.location_label || "Shared location"} · {item.location_lat.toFixed(4)}, {item.location_lng.toFixed(4)}</span></a> : null)}</div>
          )}
          {!loading && !error && tab !== "links" && tab !== "location" && visible.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <ImageIcon className="h-8 w-8 text-primary/40" />
              <p className="mt-3 text-sm font-black">Nothing shared here yet</p>
            </div>
          )}
          {visible.length > 0 && (
            <div className={`grid gap-3 ${tab === "photos" || tab === "videos" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}>
              {visible.slice(0, 60).map((item) => {
                const url = objectUrls[item.id];
                if (item.mime_type.startsWith("image/")) return <a key={item.id} href={url || "#"} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-border bg-background">{url ? <img src={url} alt={item.alt_text || item.original_name || "Shared image"} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" /> : <div className="aspect-square animate-pulse bg-muted" />}<div className="p-2 text-[10px] font-bold truncate">{item.original_name || "Image"}</div></a>;
                if (item.mime_type.startsWith("video/")) return <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-background">{url ? <video src={url} controls playsInline className="aspect-video w-full object-cover" /> : <div className="aspect-video animate-pulse bg-muted" />}<div className="p-2 text-[10px] font-bold truncate">{item.original_name || "Video"}</div></div>;
                if (item.mime_type.startsWith("audio/")) return <div key={item.id} className="rounded-2xl border border-border bg-background p-3"><div className="flex items-center gap-2 text-sm font-bold"><Music2 className="h-4 w-4 text-primary" />{item.original_name || "Audio"}</div>{url && <audio src={url} controls className="mt-3 w-full" />}<p className="mt-2 text-[10px] text-muted-foreground">{formatBytes(item.byte_size)}</p></div>;
                return <a key={item.id} href={url || "#"} download={item.original_name || "attachment"} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 hover:bg-muted"><FileText className="h-5 w-5 text-primary" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{item.original_name || "Document"}</span><span className="text-[10px] text-muted-foreground">{formatBytes(item.byte_size)}</span></a>;
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
