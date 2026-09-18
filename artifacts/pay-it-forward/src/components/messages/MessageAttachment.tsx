import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { authHeaders } from "@/lib/auth";

export type MessageAttachmentData = {
  id: number;
  message_id: number;
  mime_type: string;
  byte_size: number;
  original_name: string | null;
  alt_text: string | null;
  media_url: string;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageAttachment({ attachment }: { attachment: MessageAttachmentData }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [attachment.media_url]);

  if (error) return <p role="status" className="text-xs text-muted-foreground">{error}</p>;
  if (!objectUrl) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading attachment" />;

  if (attachment.mime_type.startsWith("image/")) {
    return (
      <a href={objectUrl} target="_blank" rel="noreferrer" className="block">
        <img
          src={objectUrl}
          alt={attachment.alt_text || attachment.original_name || "Message attachment"}
          loading="lazy"
          className="max-h-80 max-w-full rounded-2xl object-cover"
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
      className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-xs font-bold"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.original_name || "Document"} · {formatBytes(attachment.byte_size)}</span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}