import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Circle, Flashlight, ImagePlus, Loader2, Plus, ShieldCheck, SwitchCamera, Trash2, Type, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialStudioState, studioReducer } from "./studio-machine";
import { formatClock, itemFromFile } from "./studio-media";
import {
  CAMERA_CLIP_MAX_MS, MOMENT_TOTAL_MAX_MS, STUDIO_MAX_ITEMS, canAddItem, destinationAvailability, needsFamilyOriginalOffer,
  remainingCaptureMs, totalVideoMs, type StudioDestination, type StudioItem,
} from "./studio-policy";
import { publishStudioItemAsExchangeSpark, publishStudioItemsAsMoment, saveStudioOriginalsToFamily, type StudioScope } from "./studio-publishers";
import { useCaptureSession } from "./use-capture-session";
import type { ExchangeListing } from "@/lib/community-exchange-types";
import { newStudioPublishId, studioFileFingerprint } from "../community/story-studio-draft";
import { storiesClient } from "../family/stories-client";
import "./media-studio.css";

export type MediaStudioResult =
  | { kind: "moment"; storyId: number }
  | { kind: "exchange_spark"; status: "published" | "pending" }
  | { kind: "family_story" };

export type MediaStudioProps = {
  open: boolean;
  scope: StudioScope;
  onClose: () => void;
  onPublished: (result: MediaStudioResult) => void;
  /** Receives CameraClipReelPendingError (and any other error the host wants to own). Return true if handled. */
  onPublishError?: (error: unknown) => boolean;
  exchangeListingId?: number | null;
  exchangeListings?: ExchangeListing[];
  onExchangeListingChange?: (listingId: string) => void;
  onExchangeDraftChange?: (draft: { id: number; listingId: string; fingerprint: string } | null) => void;
  familySpaceId?: number | null;
  onFamilySpaceChange?: (familySpaceId: number | null) => void;
  responseToStoryId?: number | null;
  challengeKey?: string | null;
  initialClientPublishId?: string;
  /** Files recovered from a saved draft; opens straight into review. */
  initialFiles?: File[];
  initialCaption?: string;
  /** Called (debounced by the host) so the existing draft store can persist the working set. */
  onWorkingSetChange?: (items: StudioItem[], caption: string) => void;
};

function useObjectUrls(items: StudioItem[]) {
  const cache = useRef(new Map<string, string>());
  useEffect(() => {
    const live = new Set(items.map((item) => item.id));
    cache.current.forEach((url, id) => { if (!live.has(id)) { URL.revokeObjectURL(url); cache.current.delete(id); } });
  }, [items]);
  useEffect(() => () => { cache.current.forEach((url) => URL.revokeObjectURL(url)); cache.current.clear(); }, []);
  return useCallback((item: StudioItem) => {
    let url = cache.current.get(item.id);
    if (!url) { url = URL.createObjectURL(item.file); cache.current.set(item.id, url); }
    return url;
  }, []);
}

const DEST_LABEL: Record<StudioDestination, string> = { moment: "Moment", exchange_spark: "Exchange Spark", family_story: "Family original" };

export function MediaStudio(props: MediaStudioProps) {
  const { open, scope, onClose, onPublished } = props;
  const reduce = useReducedMotion();
  const [state, dispatch] = useReducer(studioReducer, undefined, () => initialStudioState());
  const capture = useCaptureSession();
  const urlFor = useObjectUrls(state.items);
  const galleryRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const archiveIdRef = useRef(`studio-${Date.now().toString(36)}`);
  const [captureKind, setCaptureKind] = useState<"video" | "photo">("video");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [adding, setAdding] = useState(false);
  const [workingSetReady, setWorkingSetReady] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(() => props.exchangeListingId ? String(props.exchangeListingId) : "");
  const [familySpaces, setFamilySpaces] = useState<Array<{ id: number; name: string }>>([]);
  const [familySpacesError, setFamilySpacesError] = useState("");
  const [familySpacesLoading, setFamilySpacesLoading] = useState(false);
  const publishIdRef = useRef(props.initialClientPublishId ?? newStudioPublishId());
  const publishSignatureRef = useRef("");

  const active = state.items.find((item) => item.id === state.activeId) ?? state.items[state.items.length - 1] ?? null;
  const usedMs = totalVideoMs(state.items);
  const budgetMs = remainingCaptureMs(state.items);
  const availability = useMemo(() => destinationAvailability(state.items, {
    hasExchangeListing: Boolean(selectedListingId || props.exchangeListingId), hasFamilySpace: Boolean(props.familySpaceId || familySpaces.length),
  }), [state.items, selectedListingId, props.exchangeListingId, props.familySpaceId, familySpaces.length]);
  const offerFamily = needsFamilyOriginalOffer(state.items) && availability.family_story.ok;

  // Open: recover files straight into review, otherwise straight into the live camera.
  useEffect(() => {
    if (!open) return;
    setWorkingSetReady(false);
    dispatch({ type: "reset" });
    setSelectedListingId(props.exchangeListingId ? String(props.exchangeListingId) : "");
    publishIdRef.current = props.initialClientPublishId ?? newStudioPublishId();
    publishSignatureRef.current = "";
    archiveIdRef.current = `studio-${Date.now().toString(36)}`;
    setFamilySpacesError("");
    setFamilySpacesLoading(true);
    let active = true;
    void storiesClient.mine().then(({ families }) => {
      if (active) setFamilySpaces(families.filter((family) => family.status === "active"
        && ["owner", "curator", "contributor"].includes(family.my_role)));
    }).catch((reason: unknown) => {
      if (active) setFamilySpacesError(reason instanceof Error ? reason.message : "Family Spaces could not be loaded.");
    }).finally(() => { if (active) setFamilySpacesLoading(false); });
    const files = props.initialFiles ?? [];
    if (files.length || props.initialCaption) {
      void Promise.all(files.map((file) => itemFromFile(file, "gallery"))).then((items) => {
        dispatch({ type: "add", items, goReview: true });
        if (props.initialCaption) dispatch({ type: "caption", caption: props.initialCaption });
        setWorkingSetReady(true);
      });
    } else {
      setWorkingSetReady(true);
      void capture.start();
    }
    return () => { active = false; abortRef.current?.abort(); capture.release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!workingSetReady) return;
    const signature = JSON.stringify({
      items: state.items.map((item) => studioFileFingerprint(item.file)),
      caption: state.caption.trim(),
      destination: state.destination,
      listingId: selectedListingId,
    });
    if (!publishSignatureRef.current) publishSignatureRef.current = signature;
    else if (publishSignatureRef.current !== signature) {
      publishSignatureRef.current = signature;
      publishIdRef.current = newStudioPublishId();
    }
  }, [workingSetReady, state.items, state.caption, state.destination, selectedListingId]);

  // Camera follows the mode: warm-suspend in review, instant resume in capture.
  useEffect(() => {
    if (!open) return;
    if (state.mode === "capture") void capture.start();
    else capture.suspend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, open]);

  useEffect(() => {
    if (workingSetReady) props.onWorkingSetChange?.(state.items, state.caption);
  }, [state.items, state.caption, workingSetReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = useCallback(() => {
    if (state.mode === "publishing") { abortRef.current?.abort(); dispatch({ type: "fail", message: "Upload cancelled. Nothing was posted." }); return; }
    if (state.mode === "publish") { dispatch({ type: "mode", mode: "review" }); return; }
    if (state.mode === "review") { dispatch({ type: "mode", mode: "capture" }); return; }
    if (state.items.length) { setConfirmDiscard(true); return; }
    onClose();
  }, [onClose, state.items.length, state.mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); back(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, back]);

  const addFiles = async (files: File[], source: StudioItem["source"], measuredMs?: number) => {
    setAdding(true);
    try {
      const items = await Promise.all(files.slice(0, STUDIO_MAX_ITEMS - state.items.length).map((file) => itemFromFile(file, source, measuredMs)));
      // Photos and library picks go to review; chained camera clips stay on the live camera.
      dispatch({ type: "add", items, goReview: source === "gallery" || items.some((item) => item.kind === "photo") });
    } finally { setAdding(false); }
  };

  const onShutter = async () => {
    if (!canAddItem(state.items)) { dispatch({ type: "mode", mode: "review" }); return; }
    if (captureKind === "photo") {
      const file = await capture.capturePhoto();
      if (file) await addFiles([file], "camera");
      return;
    }
    if (capture.status === "recording") { capture.stopClip(); return; }
    if (budgetMs < 1000) { dispatch({ type: "mode", mode: "review" }); return; }
    const startedAt = Date.now();
    const file = await capture.recordClip(budgetMs);
    if (file) await addFiles([file], "camera", Math.min(CAMERA_CLIP_MAX_MS, Date.now() - startedAt));
  };

  const publish = async () => {
    const check = availability[state.destination];
    const textOnly = state.destination === "moment" && state.items.length === 0 && state.caption.trim();
    if (!check.ok && !textOnly) { dispatch({ type: "fail", message: check.reason ?? "This destination is not available." }); return; }
    if ((state.destination === "family_story" || (state.destination === "moment" && state.saveOriginalPrivately))
      && !props.familySpaceId) {
      dispatch({ type: "fail", message: "Choose a writable Family Space before saving private originals." });
      return;
    }
    if (props.responseToStoryId && (state.destination !== "moment" || scope.audience !== "community"
      || !state.items.length || state.items.some((item) => item.kind !== "video"))) {
      dispatch({ type: "fail", message: "Video responses need one or more video clips shared with your Community as a Moment." });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "mode", mode: "publishing" });
    const onProgress = (label: string, percent: number) => dispatch({ type: "progress", label, percent });
    try {
      // Optional separate private copy of the ORIGINAL files, saved first so a later cut-down can never lose them.
      if (state.saveOriginalPrivately && state.destination === "moment" && props.familySpaceId) {
        await saveStudioOriginalsToFamily({ familyId: props.familySpaceId, archiveId: archiveIdRef.current, caption: state.caption, items: state.items, signal: controller.signal, onProgress });
      }
      const listingId = Number(selectedListingId);
      if (state.destination === "exchange_spark" && Number.isSafeInteger(listingId) && listingId > 0) {
        const status = await publishStudioItemAsExchangeSpark({
          scope, listingId, item: state.items[0], caption: state.caption, signal: controller.signal, onProgress,
          onDraftChange: (draft) => props.onExchangeDraftChange?.(draft),
        });
        onPublished({ kind: "exchange_spark", status });
      } else if (state.destination === "family_story" && props.familySpaceId) {
        await saveStudioOriginalsToFamily({ familyId: props.familySpaceId, archiveId: archiveIdRef.current, caption: state.caption, items: state.items, signal: controller.signal, onProgress });
        onPublished({ kind: "family_story" });
      } else {
        const storyId = await publishStudioItemsAsMoment({
          scope, items: state.items, caption: state.caption, clientPublishId: publishIdRef.current,
          responseToStoryId: props.responseToStoryId, challengeKey: props.challengeKey, signal: controller.signal, onProgress,
        });
        onPublished({ kind: "moment", storyId });
      }
    } catch (reason) {
      if (props.onPublishError?.(reason)) return;
      dispatch({ type: "fail", message: reason instanceof Error && reason.name === "AbortError" ? "Upload cancelled. Nothing was posted." : reason instanceof Error ? reason.message : "Could not publish. Your work is saved here — try again." });
    }
  };

  if (!open) return null;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 36 };
  const fade = reduce ? { duration: 0 } : { duration: 0.18 };
  const mirrored = capture.facing === "user";
  const recording = capture.status === "recording";
  const clipPct = Math.min(100, (capture.elapsedMs / Math.max(1, budgetMs)) * 100);

  return (
    <div className="nk-studio" role="dialog" aria-modal="true" aria-label="Media Studio" data-mode={state.mode} data-testid="media-studio">
      {/* Layer 0: the live camera stays mounted for the whole session; every other layer slides over it. */}
      <video ref={capture.videoRef} className={`nk-studio__camera${mirrored ? " is-mirrored" : ""}`} muted playsInline aria-hidden="true" />
      {capture.status === "starting" && state.mode === "capture" && <div className="nk-studio__center" role="status"><Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /><span>Starting camera…</span></div>}
      {capture.status === "error" && state.mode === "capture" && (
        <div className="nk-studio__center nk-studio__center--card" role="alert">
          <p>{capture.error}</p>
          <div className="nk-studio__row"><button type="button" className="nk-studio__pill" onClick={() => void capture.start()}>Try again</button><button type="button" className="nk-studio__pill" onClick={() => galleryRef.current?.click()}>Choose from library</button></div>
        </div>
      )}

      <input ref={galleryRef} type="file" multiple className="sr-only" aria-label="Choose photos or videos"
        accept={props.responseToStoryId ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"}
        onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void addFiles(files, "gallery"); }} />

      {/* Layer 1: capture controls */}
      <AnimatePresence>
        {state.mode === "capture" && (
          <motion.div key="capture" className="nk-studio__layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
            <div className="nk-studio__budget" aria-hidden="true">
              {state.items.map((item) => <span key={item.id} className="nk-studio__budget-seg" style={{ flexGrow: Math.max(1, item.durationMs ?? 2000) }} />)}
              {recording && <span className="nk-studio__budget-seg is-live" style={{ flexGrow: Math.max(1, capture.elapsedMs) }} />}
              <span className="nk-studio__budget-rest" style={{ flexGrow: Math.max(1, MOMENT_TOTAL_MAX_MS - usedMs - (recording ? capture.elapsedMs : 0)) }} />
            </div>
            <header className="nk-studio__top">
              <button type="button" className="nk-studio__icon" onClick={back} aria-label="Close Studio"><X className="h-5 w-5" /></button>
              {recording ? <span className="nk-studio__rec" role="timer" aria-live="off"><Circle className="h-2.5 w-2.5 fill-current" /> {formatClock(capture.elapsedMs)} / {formatClock(budgetMs)}</span>
                : <span className="nk-studio__hint">{state.items.length ? `${state.items.length} added · ${formatClock(usedMs)} of ${formatClock(MOMENT_TOTAL_MAX_MS)}` : "Spark Studio"}</span>}
              <div className="nk-studio__row">
                {capture.torchSupported && <button type="button" className="nk-studio__icon" onClick={() => void capture.toggleTorch()} aria-pressed={capture.torchOn} aria-label="Toggle light"><Flashlight className="h-5 w-5" /></button>}
                {capture.canFlip && !recording && <button type="button" className="nk-studio__icon" onClick={() => void capture.flip()} aria-label="Flip camera"><SwitchCamera className="h-5 w-5" /></button>}
              </div>
            </header>
            {!capture.micAvailable && capture.status === "live" && <p className="nk-studio__notice" role="status">Microphone is off — clips will have no sound.</p>}
            {state.error && <p className="nk-studio__notice" role="alert">{state.error}</p>}
            <div className="nk-studio__bottom">
              {!recording && (
                <div className="nk-studio__modes" role="radiogroup" aria-label="Capture mode">
                  <button type="button" role="radio" aria-checked={captureKind === "video"} className={captureKind === "video" ? "is-on" : ""} onClick={() => setCaptureKind("video")}><Video className="h-4 w-4" /> Video</button>
                  <button type="button" role="radio" aria-checked={captureKind === "photo"} className={captureKind === "photo" ? "is-on" : ""} onClick={() => setCaptureKind("photo")}><Camera className="h-4 w-4" /> Photo</button>
                  {!props.responseToStoryId && <button type="button" onClick={() => dispatch({ type: "mode", mode: "review" })}><Type className="h-4 w-4" /> Text</button>}
                </div>
              )}
              <div className="nk-studio__controls">
                <button type="button" className="nk-studio__side" onClick={() => galleryRef.current?.click()} disabled={recording || !canAddItem(state.items)} aria-label="Choose from library"><ImagePlus className="h-6 w-6" /></button>
                <button type="button" className={`nk-studio__shutter${recording ? " is-recording" : ""}${captureKind === "photo" ? " is-photo" : ""}`} onClick={() => void onShutter()}
                  disabled={capture.status !== "live" && !recording} aria-label={captureKind === "photo" ? "Take photo" : recording ? "Stop recording" : "Start recording"}>
                  {recording && <svg className="nk-studio__ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100" strokeDasharray={`${clipPct} 100`} /></svg>}
                  <span />
                </button>
                <button type="button" className="nk-studio__side nk-studio__next" disabled={recording || (!state.items.length)} onClick={() => dispatch({ type: "mode", mode: "review" })} aria-label={`Next, review ${state.items.length} items`}>
                  {state.items[state.items.length - 1] ? <>{state.items[state.items.length - 1].kind === "photo"
                    ? <img src={urlFor(state.items[state.items.length - 1])} alt="" /> : <video src={urlFor(state.items[state.items.length - 1])} muted playsInline preload="metadata" />}<b>{state.items.length}</b></> : <ChevronRight className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer 2: review/edit — the same surface, slides up over the (paused) camera */}
      <AnimatePresence>
        {(state.mode === "review" || state.mode === "publish" || state.mode === "publishing") && (
          <motion.div key="review" className="nk-studio__layer nk-studio__review" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={spring}>
            <div className="nk-studio__stage">
              {active ? (active.kind === "photo"
                ? <img key={active.id} src={urlFor(active)} alt="Selected photo" />
                : <video key={active.id} src={urlFor(active)} autoPlay loop playsInline muted controls={false} aria-label="Selected video" />)
                : <textarea className="nk-studio__textcard" value={state.caption} onChange={(e) => dispatch({ type: "caption", caption: e.target.value })} placeholder="Write something…" aria-label="Write your Moment" maxLength={2200} />}
            </div>
            <header className="nk-studio__top">
              <button type="button" className="nk-studio__icon" onClick={back} aria-label="Back to camera"><ArrowLeft className="h-5 w-5" /></button>
              <span className="nk-studio__hint">{state.items.length ? `${formatClock(usedMs)} of ${formatClock(MOMENT_TOTAL_MAX_MS)}` : "Text Moment"}</span>
              {active ? <button type="button" className="nk-studio__icon" onClick={() => dispatch({ type: "remove", id: active.id })} aria-label="Delete this item"><Trash2 className="h-5 w-5" /></button> : <span className="w-11" />}
            </header>
            <div className="nk-studio__bottom">
              {state.items.length > 0 && (
                <div className="nk-studio__tray" role="listbox" aria-label="Your items">
                  {state.items.map((item, index) => (
                    <div key={item.id} className="nk-studio__thumbwrap">
                      <button type="button" role="option" aria-selected={item.id === active?.id} className={`nk-studio__thumb${item.id === active?.id ? " is-on" : ""}`} onClick={() => dispatch({ type: "select", id: item.id })} aria-label={`${item.kind} ${index + 1}${item.durationMs ? `, ${formatClock(item.durationMs)}` : ""}`}>
                        {item.kind === "photo" ? <img src={urlFor(item)} alt="" /> : <video src={urlFor(item)} muted playsInline preload="metadata" />}
                      </button>
                      {item.id === active?.id && state.items.length > 1 && <div className="nk-studio__reorder">
                        <button type="button" disabled={index === 0} onClick={() => dispatch({ type: "move", id: item.id, to: index - 1 })} aria-label="Move earlier"><ChevronLeft className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={index === state.items.length - 1} onClick={() => dispatch({ type: "move", id: item.id, to: index + 1 })} aria-label="Move later"><ChevronRight className="h-3.5 w-3.5" /></button>
                      </div>}
                    </div>
                  ))}
                  {canAddItem(state.items) && <button type="button" className="nk-studio__thumb nk-studio__add" onClick={() => dispatch({ type: "mode", mode: "capture" })} aria-label="Add another"><Plus className="h-5 w-5" /></button>}
                </div>
              )}
              {state.items.length > 0 && <input className="nk-studio__caption" value={state.caption} onChange={(e) => dispatch({ type: "caption", caption: e.target.value })} placeholder="Add a caption…" aria-label="Caption" maxLength={2200} />}
              {state.error && state.mode === "review" && <p className="nk-studio__notice" role="alert">{state.error}</p>}
              <button type="button" className="nk-studio__primary" disabled={!state.items.length && !state.caption.trim()} onClick={() => dispatch({ type: "mode", mode: "publish" })}>Next <ChevronRight className="h-5 w-5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer 3: destination sheet — a sheet, not a page, so the work stays in view */}
      <AnimatePresence>
        {(state.mode === "publish" || state.mode === "publishing") && (
          <motion.div key="sheet" className="nk-studio__sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={spring}>
            <div className="nk-studio__grab" aria-hidden="true" />
            {state.mode === "publishing" ? (
              <div className="nk-studio__publishing" role="status" aria-live="polite">
                <p>{state.progress.label || "Working…"}</p>
                <div className="nk-studio__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress.percent}><span style={{ width: `${state.progress.percent}%` }} /></div>
                <button type="button" className="nk-studio__pill" onClick={back}>Cancel</button>
              </div>
            ) : (
              <>
                <h2>Share to</h2>
                <div className="nk-studio__dests" role="radiogroup" aria-label="Destination">
                   {(["moment", "exchange_spark", "family_story"] as StudioDestination[]).filter((d) => (
                   props.responseToStoryId ? d === "moment"
                     : d === "family_story" ? Boolean(props.familySpaceId || familySpaces.length)
                       : d !== "exchange_spark" || (props.exchangeListings?.length ?? 0) > 0 || props.exchangeListingId
                 )).map((dest) => (
                    <button key={dest} type="button" role="radio" aria-checked={state.destination === dest} disabled={!availability[dest].ok && !(dest === "moment" && !state.items.length && state.caption.trim())}
                      className={state.destination === dest ? "is-on" : ""} onClick={() => dispatch({ type: "destination", destination: dest })}>
                      <strong>{DEST_LABEL[dest]}</strong>
                      <small>{availability[dest].ok || (dest === "moment" && !state.items.length) ? (dest === "moment" ? "Visible 24 hours" : dest === "exchange_spark" ? "On your listing" : "Private, kept") : availability[dest].reason}</small>
                    </button>
                  ))}
                </div>
                {(state.destination === "family_story" || (offerFamily && state.destination === "moment" && state.saveOriginalPrivately)) && (
                  <label className="nk-studio__listing">
                    <span>Save originals to a private Family Story</span>
                    {familySpacesLoading ? <small role="status">Loading writable Family Spaces…</small> : familySpacesError ? <small role="alert">{familySpacesError}</small> : (
                      <select value={props.familySpaceId ?? ""} onChange={(event) => props.onFamilySpaceChange?.(event.target.value ? Number(event.target.value) : null)} aria-label="Choose a private Family Space">
                        <option value="">Choose a Family Space</option>
                        {familySpaces.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
                      </select>
                    )}
                  </label>
                )}
                {state.destination === "exchange_spark" && (
                  <label className="nk-studio__listing">
                    <span>Choose an active Exchange listing</span>
                    <select value={selectedListingId} onChange={(event) => {
                      setSelectedListingId(event.target.value);
                      props.onExchangeListingChange?.(event.target.value);
                    }} aria-label="Choose an active Exchange listing">
                      <option value="">Choose a listing</option>
                      {(props.exchangeListings ?? []).map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.neighborhood}</option>)}
                    </select>
                  </label>
                )}
                {availability.moment.note && state.destination === "moment" && <p className="nk-studio__notice" role="status">{availability.moment.note}</p>}
                {offerFamily && state.destination === "moment" && (
                  <label className="nk-studio__offer"><input type="checkbox" checked={state.saveOriginalPrivately} onChange={(e) => dispatch({ type: "saveOriginal", value: e.target.checked })} />
                    <span><ShieldCheck className="inline h-4 w-4" /> Also save the full originals as a private Family Story. Your Moment will use the earliest clips that fit {formatClock(MOMENT_TOTAL_MAX_MS)}.</span></label>
                )}
                {state.error && <p className="nk-studio__notice" role="alert">{state.error}</p>}
                <button type="button" className="nk-studio__primary" onClick={() => void publish()} disabled={adding}>Share {DEST_LABEL[state.destination]}</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {confirmDiscard && (
        <div className="nk-studio__scrim" role="alertdialog" aria-label="Discard your work?">
          <div className="nk-studio__card"><p>Discard {state.items.length} item{state.items.length === 1 ? "" : "s"}?</p>
            <div className="nk-studio__row"><button type="button" className="nk-studio__pill" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="nk-studio__pill is-danger" onClick={() => { setConfirmDiscard(false); onClose(); }}>Discard</button></div></div>
        </div>
      )}
    </div>
  );
}

export default MediaStudio;
