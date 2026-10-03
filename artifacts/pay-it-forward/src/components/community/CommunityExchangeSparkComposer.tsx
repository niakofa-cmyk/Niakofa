import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Camera, ImagePlus, Loader2, Video, X } from "lucide-react";
import { getExchangeListings } from "@/lib/community-exchange-client";
import type { ExchangeListing } from "@/lib/community-exchange-types";
import {
  completeSparkUpload,
  createExchangeSparkDraft,
  createSparkUploadSession,
  discardExchangeSparkDraft,
  ExchangeSparkUploadError,
  clearExchangeSparkDraftId,
  getExchangeSparkDraftStatus,
  loadExchangeSparkDraftId,
  listExchangeSparkDrafts,
  publishExchangeSparkDraft,
  putRawSparkFile,
  readExchangeSparkVideoDuration,
  resumeSparkUploadSession,
  saveExchangeSparkDraftId,
  type SparkDraftStatus,
  updateExchangeSparkDraftCaption,
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
  const [draftEntryVisible, setDraftEntryVisible] = useState(false);
  const [listings, setListings] = useState<ExchangeListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [listingId, setListingId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftMedia, setDraftMedia] = useState<SparkDraftStatus["media_assets"][number] | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(false);
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
    const controller = new AbortController();
    let savedDraftId: number | null = null;
    try {
      savedDraftId = loadExchangeSparkDraftId();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Saved Spark draft reference could not be read.");
      setDraftEntryVisible(true);
    }
    void listExchangeSparkDrafts(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (!Array.isArray(result.drafts)) throw new Error("The server returned an invalid saved-drafts response.");
          setDraftEntryVisible(result.drafts.length > 0 || savedDraftId !== null);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        // Keep recovery reachable if the server cannot confirm whether an
        // in-progress draft exists. Opening the fallback reports the cause.
        setDraftEntryVisible(true);
        setError(reason instanceof Error ? reason.message : "Saved Spark drafts could not be checked.");
      });
    return () => controller.abort();
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRestoringDraft(true);
    void (async () => {
      let savedDraftId: number | null = null;
      try {
        savedDraftId = loadExchangeSparkDraftId();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Saved Spark draft reference could not be read.");
      }
      try {
        const result = await listExchangeSparkDrafts(controller.signal);
        if (!Array.isArray(result.drafts)) throw new Error("The server returned an invalid saved-drafts response.");
        if (controller.signal.aborted) return;
        const savedDraft = result.drafts.find((draft) => draft.spark_id === savedDraftId) ?? result.drafts[0];
        if (!savedDraft) {
          if (savedDraftId) {
            try {
              clearExchangeSparkDraftId();
            } catch (clearFailure) {
              setError(clearFailure instanceof Error ? clearFailure.message : "The stale draft reference could not be cleared.");
            }
            setStatusText("Your saved draft is no longer available. It may already be published or have expired; check your Exchange Sparks.");
          }
          return;
        }
        setDraftId(savedDraft.spark_id);
        try {
          saveExchangeSparkDraftId(savedDraft.spark_id);
        } catch (storageFailure) {
          setError(storageFailure instanceof Error ? storageFailure.message : "The saved draft reference could not be stored on this device.");
        }
        setListingId(String(savedDraft.listing_id));
        setCaption(savedDraft.caption ?? "");
        setDraftMedia(savedDraft.media_assets.find((asset) => asset.media_type === "video") ?? null);
        setStatusText("Restored your saved Exchange Spark draft. Continue where you left off.");
      } catch (reason) {
        if (controller.signal.aborted) return;
        const failure = reason instanceof ExchangeSparkUploadError
          ? reason
          : new ExchangeSparkUploadError(reason instanceof Error ? reason.message : "Saved Spark draft could not be restored.");
        if (savedDraftId) {
          try {
            const savedDraft = await getExchangeSparkDraftStatus(savedDraftId, controller.signal);
            if (controller.signal.aborted) return;
            setDraftId(savedDraft.spark_id);
            setListingId(String(savedDraft.listing_id));
            setCaption(savedDraft.caption ?? "");
            setDraftMedia(savedDraft.media_assets.find((asset) => asset.media_type === "video") ?? null);
            setStatusText("Restored your saved Exchange Spark draft. Continue where you left off.");
            return;
          } catch {
            // The failure below is more useful than a second fallback failure.
          }
        }
        setError(failure.message);
      }
    })().finally(() => {
      if (!controller.signal.aborted) setRestoringDraft(false);
    });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!draftId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void updateExchangeSparkDraftCaption(draftId, caption.trim(), controller.signal)
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setError(reason instanceof Error ? reason.message : "Your Spark caption could not be saved.");
          }
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draftId, caption]);

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
    setDraftId(null);
    setDraftMedia(null);
    setProgress(0);
    setUploadAttempt(0);
  };

  const publish = async () => {
    if (busyRef.current) return;
    if (!listingId) {
      setError("Choose an active Exchange post that you own.");
      return;
    }
    const readyExistingMedia = draftMedia?.status === "ready" && draftMedia.variant_ready;
    const processingExistingMedia = draftMedia?.status === "processing";
    const pendingExistingMedia = draftMedia?.status === "pending";
    if (draftMedia?.status === "failed") {
      setError("This draft's video could not be processed. Start a new draft and choose the video again.");
      return;
    }
    if (pendingExistingMedia && draftMedia && file
      && (file.size !== draftMedia.byte_size || file.type.toLowerCase() !== draftMedia.mime_type.toLowerCase())) {
      setError("Select the same video used for this saved upload so its server-checked file details match.");
      return;
    }
    if ((!file || fileError || durationSeconds === null) && !readyExistingMedia && !processingExistingMedia) {
      setError(fileError || "Choose and validate an MP4 or WebM video before continuing.");
      return;
    }
    if (file && file.size > EXCHANGE_SPARK_MAX_BYTES) {
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
      let activeDraftId = draftId;
      if (!activeDraftId) {
        setStatusText("Creating your Exchange Spark draft…");
        const draft = await createExchangeSparkDraft(Number(listingId), caption.trim(), controller.signal);
        if (draft.upload_context.contextKind !== "exchange_spark" || draft.upload_context.contextId !== draft.spark_id) {
          throw new Error("The server returned an invalid Spark upload context.");
        }
        activeDraftId = draft.spark_id;
        setDraftId(activeDraftId);
      }
      try {
        saveExchangeSparkDraftId(activeDraftId);
      } catch (storageFailure) {
        setError(storageFailure instanceof Error ? storageFailure.message : "Your draft reference could not be stored on this device.");
      }
      await updateExchangeSparkDraftCaption(activeDraftId, caption.trim(), controller.signal);

      if (!readyExistingMedia && !processingExistingMedia) {
        if (!file) throw new Error("Select the original video again to resume this saved upload.");
        const session = pendingExistingMedia && draftMedia
          ? resumeSparkUploadSession(draftMedia.media_asset_id, file)
          : await (async () => {
            setStatusText("Preparing secure video upload…");
            const created = await createSparkUploadSession({
              contextId: activeDraftId,
              file,
              signal: controller.signal,
            });
            setDraftMedia({
              media_asset_id: created.media_asset_id,
              media_type: "video",
              mime_type: file.type,
              byte_size: file.size,
              status: "pending",
              variant_ready: false,
            });
            return created;
          })();
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
        setDraftMedia((current) => current ? { ...current, status: "processing" } : current);
      }

      setStatusText("Processing video…");
      await waitForExchangeSparkMediaReady(activeDraftId, controller.signal, (mediaStatus) => {
        setStatusText(mediaStatus === "ready" ? "Finishing video checks…" : "Processing video…");
      });
      setDraftMedia((current) => current ? { ...current, status: "ready", variant_ready: true } : current);
      setStatusText("Publishing your Spark…");
      const result = await publishExchangeSparkDraft(activeDraftId, caption.trim(), controller.signal);
      if (result.status !== "published" && result.status !== "pending") {
        throw new Error("The server returned an unknown Spark publication status.");
      }
      setStatusText(result.status === "pending"
        ? "Spark submitted for community review. It will appear after approval."
        : "Your Exchange Spark is live.");
      onPublished(result.status);
      try {
        clearExchangeSparkDraftId();
      } catch {
        setStatusText(`${result.status === "pending" ? "Spark submitted for review." : "Your Exchange Spark is live."} The device could not clear its saved draft reference; it may reappear after reload.`);
      }
      resetForm();
      setDraftEntryVisible(false);
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

  const cancelUpload = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    busyRef.current = false;
    setBusy(false);
    setProgress(0);
    setStatusText("Upload cancelled. You can try again with the same video.");
  };

  const startFreshDraft = async () => {
    if (busyRef.current) return;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (draftId) await discardExchangeSparkDraft(draftId, controller.signal);
      clearExchangeSparkDraftId();
      setDraftId(null);
      setDraftMedia(null);
      setStatusText("Draft discarded. Choose a video to create a fresh Exchange Spark.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved draft could not be reset.");
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!draftEntryVisible) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-card" aria-label="Create an Exchange Spark">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary"><Video className="h-4 w-4" aria-hidden="true" /> Legacy Exchange video draft</p>
          <p className="mt-1 text-sm text-muted-foreground">Resume a saved video upload from the legacy composer. For new Sparks, use the unified Studio above.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-black text-primary-foreground disabled:opacity-60" aria-expanded={open}>
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
          {open ? "Close recovery" : "Resume saved video draft"}
        </button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">Videos must be MP4 or WebM, 64 MiB or smaller, and 180 seconds or shorter. Your video is checked before upload and won’t be shown while processing.</p>
          {unavailable && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm" role="alert"><p className="font-bold">{unavailable}</p><p className="mt-1 text-xs text-muted-foreground">Direct-binary publishing is currently gated for this environment.</p><Link href="/community/moments" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-black text-primary hover:bg-primary/10">Continue in the legacy Moments composer</Link></div>}
          {listingsError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">{listingsError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold">
              <span>Connect an active Exchange post</span>
              <select value={listingId} onChange={(event) => setListingId(event.target.value)} disabled={busy || restoringDraft || Boolean(draftId) || listingsLoading || !listings.length} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" data-testid="select-exchange-spark-listing">
                <option value="">{listingsLoading ? "Loading your posts…" : listings.length ? "Choose your post" : "No active owned posts"}</option>
                {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold">
              <span>Caption <span className="font-normal text-muted-foreground">(optional)</span></span>
              <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} disabled={busy} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal" placeholder="What should neighbors know?" data-testid="input-exchange-spark-caption" />
            </label>
          </div>
          <input ref={cameraInputRef} type="file" accept="video/mp4,video/webm" capture="environment" className="sr-only" data-testid="input-exchange-spark-camera" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <input ref={galleryInputRef} type="file" accept="video/mp4,video/webm" className="sr-only" data-testid="input-exchange-spark-video" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-60" data-testid="button-record-exchange-spark"><Camera className="h-4 w-4 text-primary" aria-hidden="true" /> Record video</button>
            <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-60" data-testid="button-choose-exchange-spark"><ImagePlus className="h-4 w-4 text-primary" aria-hidden="true" /> Choose video</button>
            {file && <div className="flex min-h-10 items-center rounded-xl bg-muted px-3 text-xs" data-testid="text-exchange-spark-file">{file.name} · {formatBytes(file.size)}{durationSeconds !== null ? ` · ${Math.ceil(durationSeconds)} sec` : ""}</div>}
            {draftId && draftMedia?.status === "pending" && !file && <p className="text-xs text-muted-foreground" role="status">Your upload draft is saved. Select the original video again to resume its secure upload.</p>}
            {draftId && draftMedia?.status === "ready" && !file && <p className="text-xs text-muted-foreground" role="status">Your video is safely uploaded and ready. You can publish this saved draft without selecting the file again.</p>}
            {draftId && <button type="button" onClick={() => void startFreshDraft()} disabled={busy} className="min-h-10 rounded-lg border border-border px-3 text-xs font-bold disabled:opacity-60" data-testid="button-start-fresh-exchange-spark">Discard draft and start another</button>}
          </div>
          {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
          {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm" data-testid="text-exchange-spark-error">{error}</div>}
          {busy && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs"><span className="inline-flex items-center gap-2 font-bold"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />{statusText}</span>{progress > 0 && <span>{progress}% · try {uploadAttempt}/{EXCHANGE_SPARK_UPLOAD_ATTEMPTS}</span>}</div>
              {progress > 0 && <progress className="h-2 w-full accent-primary" value={progress} max={100} aria-label="Video upload progress" />}
              <button type="button" onClick={cancelUpload} className="min-h-10 rounded-lg border border-border px-3 text-xs font-bold" data-testid="button-cancel-exchange-spark">Cancel upload</button>
            </div>
          )}
          {restoringDraft && <p role="status" className="text-sm text-muted-foreground" data-testid="status-restoring-exchange-spark">Restoring your saved Spark draft…</p>}
          {statusText && !busy && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm" data-testid="status-exchange-spark">{statusText}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Maximum size: {formatBytes(EXCHANGE_SPARK_MAX_BYTES)}</span>
            <button type="button" onClick={() => void publish()} disabled={busy || restoringDraft || !listingId || (draftMedia?.status !== "ready" && draftMedia?.status !== "processing" && (!file || Boolean(fileError) || durationSeconds === null)) || draftMedia?.status === "failed"} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50" data-testid="button-publish-exchange-spark">
              {busy ? "Publishing…" : "Publish Exchange Spark"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}