import { useEffect, useState } from "react";
import { AlertCircle, Film, ImagePlus, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import {
  EXCHANGE_LISTING_MEDIA_MAX_FILES,
  validateExchangeListingMediaFile,
} from "@/lib/exchange-listing-media-client";
import type { ExchangeListingMedia } from "@/lib/community-exchange-types";

function useProtectedMediaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!path) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetch(path, {
      credentials: "same-origin",
      headers: authHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Protected media request failed.");
      const blob = await response.blob();
      if (!controller.signal.aborted) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return { url, failed };
}

function ProtectedImage({ path, alt, className }: { path: string | null | undefined; alt: string; className: string }) {
  const { url, failed } = useProtectedMediaUrl(path);
  if (failed) return <span className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4" /> Media unavailable</span>;
  if (!url) return <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading media…</span>;
  return <img src={url} alt={alt} className={className} />;
}

function LocalFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (!url) return null;
  return file.type.toLowerCase().startsWith("video/")
    ? <div className="flex h-full items-center justify-center bg-muted text-muted-foreground"><Film className="h-6 w-6" aria-hidden="true" /></div>
    : <img src={url} alt="" className="h-full w-full object-cover" />;
}

export function ExchangeListingMediaPreview({ item }: { item: ExchangeListingMedia | undefined }) {
  if (!item) return null;
  const path = item.status === "ready" ? item.thumbnail_url : null;
  return (
    <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-muted" aria-label={item.media_type === "video" ? "Listing includes a video" : "Listing includes a photo"}>
      {path
        ? <ProtectedImage path={path} alt={item.media_type === "video" ? "Video thumbnail" : "Listing photo"} className="h-full w-full object-cover" />
        : <span className="flex h-full items-center justify-center text-muted-foreground">
          {item.media_type === "video" ? <Film className="h-7 w-7" aria-hidden="true" /> : <ImagePlus className="h-7 w-7" aria-hidden="true" />}
        </span>}
      {item.media_type === "video" && <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold text-white">Video</span>}
    </div>
  );
}

export function ExchangeListingMediaGallery({ media }: { media: ExchangeListingMedia[] | undefined }) {
  if (!media?.length) return null;
  return (
    <section className="space-y-3" aria-label="Listing photos and videos" data-testid="exchange-listing-media-gallery">
      <h4 className="text-sm font-black">Photos and videos</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {media.map((item) => (
          <div key={item.media_asset_id} className="overflow-hidden rounded-xl border border-border bg-background">
            {item.status !== "ready"
              ? <div className="flex min-h-24 items-center gap-2 p-3 text-sm text-muted-foreground">
                {item.status === "failed" ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Film className="h-4 w-4" />}
                {item.status === "failed" ? "This upload could not be processed. Edit the post to remove it." : "Media is still processing."}
              </div>
              : item.media_type === "video"
                ? <ProtectedVideo item={item} />
                : <ProtectedImage
                  path={item.thumbnail_url ?? item.media_url}
                  alt="Photo attached to this Exchange post"
                  className="max-h-[420px] w-full bg-black object-contain"
                />}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProtectedVideo({ item }: { item: ExchangeListingMedia }) {
  const { url, failed } = useProtectedMediaUrl(item.media_url);
  if (failed) return <p className="p-3 text-sm text-muted-foreground" role="status">Video unavailable.</p>;
  if (!url) return <p className="p-3 text-sm text-muted-foreground">Loading protected video…</p>;
  return <video src={url} controls playsInline preload="metadata" className="max-h-[420px] w-full bg-black" aria-label="Exchange listing video" />;
}

export function ExchangeListingMediaEditor({
  idPrefix,
  existingMedia = [],
  selectedMediaIds,
  onSelectedMediaIdsChange,
  files,
  onFilesChange,
  disabled = false,
  progress,
}: {
  idPrefix: string;
  existingMedia?: ExchangeListingMedia[];
  selectedMediaIds: number[];
  onSelectedMediaIdsChange: (ids: number[]) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  progress?: string;
}) {
  const [validationError, setValidationError] = useState("");
  const selectedExisting = existingMedia.filter((item) => selectedMediaIds.includes(item.media_asset_id));

  const addFiles = (picked: File[]) => {
    setValidationError("");
    const combined = [...files, ...picked];
    if (selectedMediaIds.length + combined.length > EXCHANGE_LISTING_MEDIA_MAX_FILES) {
      setValidationError("A post can include up to six photos and videos.");
      return;
    }
    const nextVideoCount = selectedExisting.filter((item) => item.media_type === "video").length
      + combined.filter((file) => file.type.toLowerCase().startsWith("video/")).length;
    if (nextVideoCount > 1) {
      setValidationError("A post can include up to one short video.");
      return;
    }
    const invalidFile = picked.map(validateExchangeListingMediaFile).find(Boolean);
    if (invalidFile) {
      setValidationError(invalidFile);
      return;
    }
    onFilesChange(combined);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4" data-testid={`${idPrefix}-media-editor`}>
      <div>
        <h3 className="font-black">Add photos or a short video</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Up to 6 files, including 1 video of 180 seconds or less. Each file can be up to 64 MiB. Media stays private until it is ready and the post is approved.
        </p>
      </div>
      <label htmlFor={`${idPrefix}-media-input`} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-muted ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        <ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" />
        Choose photos or videos
      </label>
      <input
        id={`${idPrefix}-media-input`}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
        multiple
        disabled={disabled || selectedMediaIds.length + files.length >= EXCHANGE_LISTING_MEDIA_MAX_FILES}
        className="sr-only"
        onChange={(event) => {
          addFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
        data-testid={`${idPrefix}-media-input`}
      />
      {(selectedExisting.length > 0 || files.length > 0) && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {selectedExisting.map((item) => (
            <li key={item.media_asset_id} className="relative overflow-hidden rounded-xl border border-border bg-background">
              <div className="aspect-square bg-muted">
                {item.status === "ready" && item.thumbnail_url
                  ? <ProtectedImage path={item.thumbnail_url} alt="Existing listing media" className="h-full w-full object-cover" />
                  : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{item.status === "failed" ? "Processing failed" : "Processing"}</span>}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectedMediaIdsChange(selectedMediaIds.filter((id) => id !== item.media_asset_id))}
                className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                aria-label="Remove existing media"
                data-testid={`${idPrefix}-remove-media-${item.media_asset_id}`}
              ><X className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-border bg-background">
              <div className="aspect-square bg-muted"><LocalFilePreview file={file} /></div>
              <p className="truncate px-2 py-1 text-[11px] text-muted-foreground" title={file.name}>{file.name}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))}
                className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                aria-label={`Remove ${file.name}`}
                data-testid={`${idPrefix}-remove-file-${index}`}
              ><X className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      {validationError && <p role="alert" className="text-sm text-destructive" data-testid={`${idPrefix}-media-error`}>{validationError}</p>}
      {progress && <p role="status" className="text-xs text-muted-foreground" data-testid={`${idPrefix}-media-progress`}>{progress}</p>}
    </section>
  );
}
