import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  deleteCommunityMomentDraft,
  getCommunityMomentDraft,
  saveCommunityMomentDraft,
  uploadCommunityMomentMedia,
  validateCommunityMomentFile,
  type CommunityMomentContext,
} from "@/lib/community-moments-upload";

const ACCEPTED_MEDIA = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav";
const MAX_MEDIA_FILES = 6;

/**
 * Independent Community/Hub Moments media composer. Its media bytes are sent
 * directly to the authenticated media-assets upload API; no data URLs are used.
 * The parent owns the final post/story creation and association of returned IDs.
 */
export function CommunityMomentsUploader({
  contextKind,
  contextId,
  userId,
  onComplete,
}: {
  contextKind: CommunityMomentContext;
  contextId: number;
  userId: number;
  onComplete: (input: {
    caption: string;
    mediaAssetIds: number[];
    mediaAccessibility: Array<{ mediaAssetId: number; altText: string; captionsVtt?: string }>;
  }) => Promise<void>;
}) {
  const draftId = `${contextKind}:${contextId}:${userId}`;
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [altTexts, setAltTexts] = useState<string[]>([]);
  const [captionsVtt, setCaptionsVtt] = useState<string[]>([]);
  const [uploadedMediaAssetIds, setUploadedMediaAssetIds] = useState<number[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const [initialized, setInitialized] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingDraft(true);
    setInitialized(false);
    setCaption("");
    setFiles([]);
    setAltTexts([]);
    setCaptionsVtt([]);
    setUploadedMediaAssetIds([]);
    void getCommunityMomentDraft(draftId, userId)
      .then((draft) => {
        if (!active) return;
        if (draft && draft.contextKind === contextKind && draft.contextId === contextId) {
          setCaption(draft.caption);
          setFiles(draft.files);
          setAltTexts(draft.files.map(() => ""));
          setCaptionsVtt(draft.files.map(() => ""));
          setUploadedMediaAssetIds(draft.uploadedMediaAssetIds ?? []);
          setDraftNotice("Your saved draft was restored on this device.");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Saved draft could not be restored.");
      })
      .finally(() => {
        if (active) {
          setLoadingDraft(false);
          setInitialized(true);
        }
      });
    return () => {
      active = false;
    };
  }, [contextId, contextKind, draftId, userId]);

  useEffect(() => {
    if (!initialized || loadingDraft || uploading) return;
    if (!caption.trim() && files.length === 0) return;
    const timeout = window.setTimeout(() => {
      void saveCommunityMomentDraft({
        id: draftId,
        userId,
        contextKind,
        contextId,
        caption,
        files,
        uploadedMediaAssetIds,
        updatedAt: Date.now(),
      }).then(() => setDraftNotice("Draft saved on this device."))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Draft could not be saved."));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [caption, contextId, contextKind, draftId, files, initialized, loadingDraft, uploading, uploadedMediaAssetIds, userId]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const fileNames = useMemo(() => files.map((file) => file.name), [files]);

  const selectFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = [...files];
    let selectionError = "";
    for (const file of Array.from(selected)) {
      const validationError = validateCommunityMomentFile(file);
      if (validationError) {
        selectionError ||= validationError;
        continue;
      }
      if (next.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        continue;
      }
      if (next.length >= MAX_MEDIA_FILES) {
        selectionError ||= `Moments can include up to ${MAX_MEDIA_FILES} media files.`;
        break;
      }
      next.push(file);
    }
    setFiles(next);
    setAltTexts((current) => next.map((_, index) => current[index] ?? ""));
    setCaptionsVtt((current) => next.map((_, index) => current[index] ?? ""));
    setError(selectionError);
  };

  const submit = async () => {
    if (uploading || loadingDraft || (!caption.trim() && files.length === 0)) return;
    const missingDescription = files.findIndex((file, index) => (
      (file.type.startsWith("image/") || file.type.startsWith("video/")) && !altTexts[index]?.trim()
    ));
    if (missingDescription >= 0) {
      setError(`Add alternative text for ${files[missingDescription].name} before uploading.`);
      return;
    }
    setUploading(true);
    setError("");
    setProgress(0);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const mediaAssetIds = uploadedMediaAssetIds.slice();
      for (let index = mediaAssetIds.length; index < files.length; index += 1) {
        const id = await uploadCommunityMomentMedia({
          contextKind,
          contextId,
          file: files[index],
          signal: controller.signal,
          onProgress: (percent) => setProgress(Math.round((index * 100 + percent) / files.length)),
        });
        mediaAssetIds.push(id);
        setUploadedMediaAssetIds(mediaAssetIds.slice());
        await saveCommunityMomentDraft({
          id: draftId,
          userId,
          contextKind,
          contextId,
          caption,
          files,
          uploadedMediaAssetIds: mediaAssetIds.slice(),
          updatedAt: Date.now(),
        });
      }
      await onComplete({
        caption: caption.trim(),
        mediaAssetIds,
        mediaAccessibility: mediaAssetIds.flatMap((mediaAssetId, index) => {
          const file = files[index];
          if (!file || !(file.type.startsWith("image/") || file.type.startsWith("video/"))) return [];
          return [{
            mediaAssetId,
            altText: altTexts[index].trim(),
            ...(file.type.startsWith("video/") && captionsVtt[index]?.trim()
              ? { captionsVtt: captionsVtt[index].trim() }
              : {}),
          }];
        }),
      });
      await deleteCommunityMomentDraft(draftId, userId);
      setCaption("");
      setFiles([]);
      setAltTexts([]);
      setCaptionsVtt([]);
      setUploadedMediaAssetIds([]);
      setDraftNotice("");
      setProgress(100);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Your Moment could not be uploaded. The draft is saved for retry.");
    } finally {
      controllerRef.current = null;
      setUploading(false);
    }
  };

  const clearDraft = async () => {
    try {
      await deleteCommunityMomentDraft(draftId, userId);
      setCaption("");
      setFiles([]);
      setAltTexts([]);
      setCaptionsVtt([]);
      setUploadedMediaAssetIds([]);
      setDraftNotice("Saved draft removed.");
      setError("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Saved draft could not be removed.");
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-label={`${contextKind === "hub" || contextKind === "hub_moment" ? "Hub" : "Community"} Moments uploader`}>
      <div>
        <label htmlFor={`moment-caption-${draftId}`} className="text-xs font-bold text-foreground">Caption</label>
        <textarea
          id={`moment-caption-${draftId}`}
          data-testid="input-community-moment-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Add a few words to your Moment…"
          className="mt-1 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold hover:border-primary/50">
          <Upload className="h-4 w-4" aria-hidden="true" /> Add photo, video, or audio
          <input
            type="file"
            data-testid="input-community-moment-media"
            accept={ACCEPTED_MEDIA}
            multiple
            className="sr-only"
            disabled={uploading || loadingDraft}
            onChange={(event) => {
              selectFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" data-testid="button-clear-community-moment-draft" onClick={() => void clearDraft()} disabled={uploading || loadingDraft || uploadedMediaAssetIds.length > 0} className="min-h-10 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">
          Clear saved draft
        </button>
      </div>
      {fileNames.length > 0 && (
        <ul className="space-y-1" aria-label="Selected media">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="space-y-2 rounded-lg bg-background/70 px-3 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                <button type="button" data-testid={`button-remove-community-moment-file-${index}`} disabled={uploading || uploadedMediaAssetIds.length > 0} onClick={() => {
                  setFiles((current) => current.filter((_, item) => item !== index));
                  setAltTexts((current) => current.filter((_, item) => item !== index));
                  setCaptionsVtt((current) => current.filter((_, item) => item !== index));
                }} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label={`Remove ${file.name}`}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {(file.type.startsWith("image/") || file.type.startsWith("video/")) && (
                <div className="space-y-2">
                  <label htmlFor={`moment-alt-${draftId}-${index}`} className="block font-bold">
                    Alternative text <span className="font-normal text-muted-foreground">(required, up to 250 characters)</span>
                  </label>
                  <textarea id={`moment-alt-${draftId}-${index}`} value={altTexts[index] ?? ""} maxLength={250} rows={2}
                    onChange={(event) => setAltTexts((current) => current.map((value, item) => item === index ? event.target.value : value))}
                    placeholder="Describe the important visual information"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" data-testid={`input-community-moment-alt-${index}`} />
                </div>
              )}
              {file.type.startsWith("video/") && (
                <div className="space-y-2">
                  <label htmlFor={`moment-captions-${draftId}-${index}`} className="block font-bold">
                    Video captions <span className="font-normal text-muted-foreground">(optional plain-text WebVTT cues)</span>
                  </label>
                  <textarea id={`moment-captions-${draftId}-${index}`} value={captionsVtt[index] ?? ""} maxLength={64 * 1024} rows={4}
                    onChange={(event) => setCaptionsVtt((current) => current.map((value, item) => item === index ? event.target.value : value))}
                    placeholder={"WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSpoken words"}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" data-testid={`input-community-moment-captions-${index}`} />
                  <p className="text-muted-foreground">Use plain text, with cues ending within this video and the 180-second Moment limit.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {draftNotice && <p role="status" data-testid="status-community-moment-draft" className="text-xs text-muted-foreground">{draftNotice}</p>}
      {loadingDraft && <p className="text-xs text-muted-foreground">Checking for a saved draft…</p>}
      {uploading && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="text-xs text-muted-foreground">Uploading securely… {progress}%</p>
        </div>
      )}
      {error && <p role="alert" data-testid="status-community-moment-error" className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        data-testid="button-upload-community-moment"
        disabled={loadingDraft || uploading || (!caption.trim() && files.length === 0)}
        onClick={() => void submit()}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {uploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {uploading ? "Uploading…" : "Upload Moment"}
      </button>
      <p className="text-[11px] text-muted-foreground">Unpublished drafts and selected files are kept in this browser until shared or cleared.</p>
    </section>
  );
}