import { useRef, useState } from "react";
import { FileImage, FileText, Loader2, Paperclip, Send, X } from "lucide-react";

export type PendingAttachment = {
  data_url: string;
  original_name: string;
  alt_text?: string;
  mime_type?: string;
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
]);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

export function MessageComposerWithAttachments(props: {
  body: string;
  attachments: PendingAttachment[];
  working: boolean;
  onBodyChange: (value: string) => void;
  onAttachmentsChange: (value: PendingAttachment[]) => void;
  onSend: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...props.attachments];

    for (const file of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
        break;
      }
      if (!ACCEPTED_TYPES.has(file.type)) {
        setError(`${file.name} is not a supported attachment type.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 5 MB.`);
        continue;
      }
      try {
        next.push({
          data_url: await readAsDataUrl(file),
          original_name: file.name,
          mime_type: file.type,
        });
      } catch {
        setError(`Could not read ${file.name}.`);
      }
    }
    props.onAttachmentsChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  const canSend = !props.working && (props.body.trim().length > 0 || props.attachments.length > 0);

  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-card/95 p-3 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => { event.preventDefault(); if (canSend) props.onSend(); }}
    >
      {props.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Pending attachments">
          {props.attachments.map((file, index) => (
            <div key={`${file.original_name}-${index}`} className="flex max-w-full items-center gap-2 rounded-xl border border-border px-2 py-1.5 text-xs">
              {file.mime_type?.startsWith("image/") ? <FileImage className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="max-w-40 truncate">{file.original_name}</span>
              <button
                type="button"
                onClick={() => props.onAttachmentsChange(props.attachments.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`Remove ${file.original_name}`}
                className="rounded p-1 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...ACCEPTED_TYPES].join(",")}
          className="sr-only"
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={props.working || props.attachments.length >= MAX_ATTACHMENTS}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-border disabled:opacity-50"
          aria-label="Add attachment"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          value={props.body}
          onChange={(event) => props.onBodyChange(event.target.value)}
          rows={1}
          maxLength={4000}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) props.onSend();
            }
          }}
        />
        <button type="submit" disabled={!canSend} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send message">
          {props.working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}