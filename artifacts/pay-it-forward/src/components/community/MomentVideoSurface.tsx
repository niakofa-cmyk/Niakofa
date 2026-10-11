import { Play } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type VideoHTMLAttributes } from "react";
import { formatClock } from "../studio/studio-media";
import { SEEK_STEP_S, effectiveDurationS, fractionFromPointer, playbackFraction, steppedSeek, timeFromFraction } from "./moment-player-core";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "controls"> & {
  /** Accessible name for the play/pause surface, e.g. "Spark 3 by Ama". */
  surfaceLabel: string;
  /** Duration recorded by the server; used when the file itself reports Infinity (MediaRecorder WebM). */
  durationHintMs?: number | null;
};

const durationOf = (el: HTMLVideoElement, hintMs: number | null | undefined) =>
  effectiveDurationS(el.duration, el.seekable.length ? el.seekable.end(el.seekable.length - 1) : null, hintMs);

/**
 * Feed video with Niakofa's own controls instead of the browser's:
 * tap anywhere to pause/resume, a thin scrub bar, nothing else on the picture.
 * Every media event the viewer already relies on for watch-time accounting
 * (play, pause, seeking, seeked, timeupdate, ended, volumechange, error) is
 * forwarded untouched; seeking through the bar fires the same seeking/seeked
 * events as native controls, so accounting and the "ignore seeks" rule still hold.
 */
export const MomentVideoSurface = forwardRef<HTMLVideoElement, Props>(function MomentVideoSurface(
  { surfaceLabel, durationHintMs, onPlay, onPause, onLoadedMetadata, onDurationChange, children, ...video },
  forwardedRef,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [durationS, setDurationS] = useState(0);
  const [nowS, setNowS] = useState(0);
  const scrubbingRef = useRef(false);
  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement);

  // Smooth progress without re-rendering the card: write the fill width directly each frame while playing.
  useEffect(() => {
    if (paused) return;
    let frame = 0;
    const tick = () => {
      const el = videoRef.current;
      if (el && fillRef.current) fillRef.current.style.transform = `scaleX(${playbackFraction(el.currentTime, durationOf(el, durationHintMs))})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, durationHintMs]);

  const syncStatic = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setNowS(el.currentTime);
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${playbackFraction(el.currentTime, durationOf(el, durationHintMs))})`;
  }, [durationHintMs]);

  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el || !durationOf(el, durationHintMs)) return;
    el.currentTime = seconds;
    syncStatic();
  }, [syncStatic, durationHintMs]);

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const el = videoRef.current;
    const rect = barRef.current?.getBoundingClientRect();
    if (!el || !rect) return;
    seekTo(timeFromFraction(fractionFromPointer(event.clientX, rect.left, rect.width), durationOf(el, durationHintMs)));
  };

  const onBarKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const el = videoRef.current;
    if (!el) return;
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? SEEK_STEP_S : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -SEEK_STEP_S : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    seekTo(steppedSeek(el.currentTime, durationOf(el, durationHintMs), delta));
  };

  return (
    <>
      <video
        {...video}
        ref={videoRef}
        controls={false}
        onPlay={(event) => { setPaused(false); onPlay?.(event); }}
        onPause={(event) => { setPaused(true); syncStatic(); onPause?.(event); }}
        onLoadedMetadata={(event) => { setDurationS(durationOf(event.currentTarget, durationHintMs)); onLoadedMetadata?.(event); }}
        onDurationChange={(event) => { setDurationS(durationOf(event.currentTarget, durationHintMs)); onDurationChange?.(event); }}
      >
        {children}
      </video>
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        onClick={toggle}
        aria-label={`${paused ? "Play" : "Pause"} ${surfaceLabel}`}
        data-testid="moment-video-surface"
      >
        {paused && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white" aria-hidden="true">
            <Play className="h-8 w-8 translate-x-0.5 fill-current" />
          </span>
        )}
      </button>
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(durationS) ? Math.round(durationS) : 0}
        aria-valuenow={Math.round(nowS)}
        aria-valuetext={`${formatClock(nowS * 1000)} of ${formatClock((Number.isFinite(durationS) ? durationS : 0) * 1000)}`}
        className="absolute inset-x-0 bottom-0 z-20 flex h-6 touch-none items-end focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onPointerDown={(event) => { scrubbingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); }}
        onPointerMove={(event) => { if (scrubbingRef.current) seekFromPointer(event); }}
        onPointerUp={() => { scrubbingRef.current = false; }}
        onPointerCancel={() => { scrubbingRef.current = false; }}
        onKeyDown={onBarKey}
      >
        <span className="relative block h-1 w-full bg-white/25">
          <span ref={fillRef} className="absolute inset-0 origin-left bg-white" style={{ transform: "scaleX(0)" }} />
        </span>
      </div>
    </>
  );
});
