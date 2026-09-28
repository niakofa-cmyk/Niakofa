import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Camera, ImagePlus, Loader2, Video, X } from "lucide-react";
import { getExchangeListings } from "@/lib/community-exchange-client";
import type { ExchangeListing } from "@/lib/community-exchange-types";
import {
  completeSparkUpload,
  createExchangeSparkDraft,
  createSparkUploadSession,
  ExchangeSparkUploadError,
  publishExchangeSparkDraft,
  putRawSparkFile,
  readExchangeSparkVideoDuration,
  waitForExchangeSparkMediaReady,
} from "@/lib/exchange-spark-upload-client";
import {
  EXCHANGE_SPARK_MAX_BYTES,
  EXCHANGE_SPARK_UPLOAD_ATTEMPTS,
  isExchangeSparkFeatureUnavailable,
  validateExchangeSparkVideo,
} from "@/lib/exchange-spark-upload-rules";

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`;
}

function unavailableMessage(code: string | undefined, message: string): string {
  if (code === "MEDIA_PLATFORM_DISABLED") return "Direct video publishing is not enabled here yet.";
  if (code === "MEDIA_STORAGE_UNAVAILABLE") return "Secure video storage is temporarily unavailable.";
  if (code === "MEDIA_PROCESSING_UNAVAILABLE") return "Video processing is temporarily unavailable.";
  return message;
}

export function CommunityExchangeSparkComposer({ onPublished }: { onPublished: (status: "published" | "pending") => void }) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<ExchangeListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [listingId, setListingId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const metadataControllerRef = useRef<AbortController | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setListingsLoading(true);
    setListingsError("");
    getExchangeListings({ mine: true, limit: 50 })
      .then((result) => {
        if (!controller.signal.aborted) {
          const active = (result.listings ?? []).filter((listing) => listing.status === "active");
          setListings(active);
          setListingId((current) => active.some((item) => String(item.id) === current) ? current : "");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setListingsError(reason instanceof Error ? reason.message : "Your Exchange posts could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setListingsLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => () => {
    metadataControllerRef.current?.abort();
    requestControllerRef.current?.abort();
  }, []);

  const selectFile = (nextFile: File | null) => {
    metadataControllerRef.current?.abort();
    setFile(nextFile);
    setDurationSeconds(null);
    setFileError("");
    setError("");
    setUnavailable("");
    setProgress(0);
    if (!nextFile) return;
    const basicError = validateExchangeSparkVideo({ mimeType: nextFile.type, byteSize: nextFile.size });
    if (basicError && !basicError.includes("Wait for video details")) {
      setFileError(basicError);
      return;
    }
    const controller = new AbortController();
    metadataControllerRef.current = controller;
    void readExchangeSparkVideoDuration(nextFile, controller.signal)
      .then((duration) => {
        if (controller.signal.aborted) return;
        setDurationSeconds(duration);
        setFileError(validateExchangeSparkVideo({ mimeType: nextFile.type, byteSize: nextFile.size, durationSeconds: duration }) ?? "");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setFileError(reason instanceof Error ? reason.message : "Video details could not be checked.");
      });
  };

  const resetForm = () => {
    selectFile(null);
    setCaption("");
    setListingId("");
    setProgress(0);
    setUploadAttempt(0);
  };

  const publish = async () => {
    if (busyRef.current) return;
    if (!listingId) {
      setError("Choose an active Exchange post that you own.");
      return;
    }
    if (!file || fileError || durationSeconds === null) {
      setError(fileError || "Choose and validate an MP4 or WebM video before continuing.");
      return;
    }
    if (file.size > EXCHANGE_SPARK_MAX_BYTES) {
      setError("Video must be no larger than 64 MiB.");
      return;
    }
    const controller = new AbortController();
    requestControllerRef.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setUnavailable("");
    setProgress(0);
    setUploadAttempt(1);
    try {
      setStatusText("Creating your Exchange Spark draft…");
      const draft = await createExchangeSparkDraft(Number(listingId), caption.trim(), controller.signal);
      if (draft.upload_context.contextKind !== "story" || draft.upload_context.contextId !== draft.spark_id) {
        throw new Error("The server returned an invalid Spark upload context.");
      }
      setStatusText("Preparing secure video upload…");
      const session = await createSparkUploadSession({
        contextId: draft.upload_context.contextId,
        file,
        signal: controller.signal,
      });
      let uploaded = false;
      let lastUploadError: unknown;
      for (let attempt = 1; attempt <= EXCHANGE_SPARK_UPLOAD_ATTEMPTS; attempt += 1) {
        setUploadAttempt(attempt);
        setProgress(0);
        setStatusText(attempt === 1
          ? "Uploading video bytes…"
          : `Retrying upload (${attempt} of ${EXCHANGE_SPARK_UPLOAD_ATTEMPTS})…`);
        try {
          await putRawSparkFile(session.upload, file, controller.signal, (loaded, total) => {
            setProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
          });
          uploaded = true;
          break;
        } catch (reason) {
          if (controller.signal.aborted) throw reason;
          lastUploadError = reason;
          if (attempt === EXCHANGE_SPARK_UPLOAD_ATTEMPTS) throw reason;
        }
      }
      if (!uploaded) throw lastUploadError instanceof Error ? lastUploadError : new Error("The video could not be uploaded.");

      setStatusText("Checking your video…");
      await completeSparkUpload(session.complete_url, controller.signal);
      setStatusText("Processing video…");
      await waitForExchangeSparkMediaReady(draft.spark_id, controller.signal, (mediaStatus) => {
        setStatusText(mediaStatus === "ready" ? "Finishing video checks…" : "Processing video…");
      });
      setStatusText("Publishing your Spark…");
      const result = await publishExchangeSparkDraft(draft.spark_id, caption.trim(), controller.signal);
      if (result.status !== "published" && result.status !== "pending") {
        throw new Error("The server returned an unknown Spark publication status.");
      }
      setStatusText(result.status === "pending"
        ? "Spark submitted for community review. It will appear after approval."
        : "Your Exchange Spark is live.");
      onPublished(result.status);
      resetForm();
    } catch (reason) {
      if (controller.signal.aborted) return;
      const failure = reason instanceof ExchangeSparkUploadError
        ? reason
        : new ExchangeSparkUploadError(reason instanceof Error ? reason.message : "Your Exchange Spark could not be published.");
      if (isExchangeSparkFeatureUnavailable(failure.errorCode)) {
        setUnavailable(unavailableMessage(failure.errorCode, failure.message));
        setError("");
      } else {
        setError(failure.message);
      }
      setStatusText("");
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      busyRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-card" aria-label="Create an Exchange Spark">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary"><Video className="h-4 w-4" aria-hidden="true" /> Share an Exchange video</p>
          <p className="mt-1 text-sm text-muted-foreground">Attach a short MP4 or WebM video to an active post you own.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-black text-primary-foreground disabled:opacity-60" aria-expanded={open}>
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
          {open ? "Close creator" : "Create video Spark"}
        </button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">Videos must be MP4 or WebM, 64 MiB or smaller, and 60 seconds or shorter. Your video is checked before upload and won’t be shown while processing.</p>
          {unavailable && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm" role="alert"><p className="font-bold">{unavailable}</p><p className="mt-1 text-xs text-muted-foreground">Direct-binary publishing is currently gated for this environment.</p><Link href="/community/moments" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-black text-primary hover:bg-primary/10">Continue in the legacy Moments composer</Link></div>}
          {listingsError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">{listingsError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold">
              <span>Connect an active Exchange post</span>
              <select value={listingId} onChange={(event) => setListingId(event.target.value)} disabled={busy || listingsLoading || !listings.length} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" data-testid="select-exchange-spark-listing">
                <option value="">{listingsLoading ? "Loading your posts…" : listings.length ? "Choose your post" : "No active owned posts"}</option>
                {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold">
              <span>Caption <span className="font-normal text-muted-foreground">(optional)</span></span>
              <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} disabled={busy} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" placeholder="What should neighbors know?" />
            </label>
          </div>
          <input ref={cameraInputRef} type="file" accept="video/mp4,video/webm" capture="environment" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <input ref={galleryInputRef} type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-60"><Camera className="h-4 w-4 text-primary" aria-hidden="true" /> Record video</button>
            <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-60"><ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" /> Choose video</button>
            {file && <div className="flex min-h-10 items-center rounded-xl bg-muted px-3 text-xs">{file.name} · {formatBytes(file.size)}{durationSeconds !== null ? ` · ${Math.ceil(durationSeconds)} sec` : ""}</div>}
          </div>
          {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
          {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div>}
          {busy && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs"><span className="inline-flex items-center gap-2 font-bold"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />{statusText}</span>{progress > 0 && <span>{progress}% · try {uploadAttempt}/{EXCHANGE_SPARK_UPLOAD_ATTEMPTS}</span>}</div>
              {progress > 0 && <progress className="h-2 w-full accent-primary" value={progress} max={100} aria-label="Video upload progress" />}
            </div>
          )}
          {statusText && !busy && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">{statusText}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Maximum size: {formatBytes(EXCHANGE_SPARK_MAX_BYTES)}</span>
            <button type="button" onClick={() => void publish()} disabled={busy || !file || Boolean(fileError) || durationSeconds === null || !listingId} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50" data-testid="button-publish-exchange-spark">
              {busy ? "Publishing…" : "Publish Exchange Spark"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}