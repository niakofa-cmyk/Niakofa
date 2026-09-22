import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { authHeaders } from "@/lib/auth";

export type MessageAttachmentData = {
  id: number;
  message_id: number;
   attachment_type?: "file" | "link" | "location" | "story" | string;
  mime_type: string;
  byte_size: number;
  original_name: string | null;
  alt_text: string | null;
  media_url: string;
  link_url?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_label?: string | null;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageAttachment({ attachment, compact = false }: { attachment: MessageAttachmentData; compact?: boolean }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attachment.attachment_type === "link" || attachment.attachment_type === "location") {
      setObjectUrl(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    setError(null);

    void fetch(attachment.media_url, { headers: authHeaders(), signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Attachment unavailable.");
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch((fetchError: unknown) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Attachment unavailable.");
      });

    return () => {
      controller.abort();
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [attachment.attachment_type, attachment.media_url]);

  if (attachment.attachment_type === "link" && attachment.link_url) {
    return <a href={attachment.link_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs font-bold text-primary"><span className="truncate">{attachment.original_name || attachment.link_url}</span></a>;
  }

  if (attachment.attachment_type === "location" && attachment.location_lat !== null && attachment.location_lat !== undefined && attachment.location_lng !== null && attachment.location_lng !== undefined) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${attachment.location_lat},${attachment.location_lng}`)}`;
    return <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs font-bold text-primary"><span>{attachment.location_label || "Shared location"}</span><span className="text-muted-foreground">{attachment.location_lat.toFixed(4)}, {attachment.location_lng.toFixed(4)}</span></a>;
  }

  if (attachment.attachment_type === "story") {
    return <a href={`/community?storyId=${encodeURIComponent(attachment.original_name?.match(/\d+/)?.[0] ?? "")}`} className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs font-bold text-primary"><Sparkles className="h-4 w-4 shrink-0" /><span>{attachment.original_name || "Community Story"}</span></a>;
  }

  if (error) return <p role="status" className="text-xs text-muted-foreground">{error}</p>;
  if (!objectUrl) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading attachment" />;

  if (attachment.mime_type.startsWith("image/")) {
    return (
      <a href={objectUrl} target="_blank" rel="noreferrer" className="block">
        <img
          src={objectUrl}
          alt={attachment.alt_text || attachment.original_name || "Message attachment"}
          loading="lazy"
          className={compact ? "h-20 w-24 rounded-xl object-cover" : "max-h-80 max-w-full rounded-2xl object-cover"}
        />
      </a>
    );
  }

  if (attachment.mime_type.startsWith("video/")) {
    return <video src={objectUrl} controls className="max-h-80 max-w-full rounded-2xl" />;
  }

  if (attachment.mime_type.startsWith("audio/")) {
    return <audio src={objectUrl} controls className="max-w-full" />;
  }

  return (
    <a
      href={objectUrl}
      download={attachment.original_name || "message-attachment"}
      className={`flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs font-bold ${compact ? "min-w-0 p-2" : ""}`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.original_name || "Document"} · {formatBytes(attachment.byte_size)}</span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}