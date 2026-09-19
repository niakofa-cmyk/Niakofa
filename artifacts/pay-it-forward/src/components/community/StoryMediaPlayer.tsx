import { useEffect, useMemo, useRef, useState } from "react";
import { StoryElementLayer, storyEffectFilter, type StoryElement } from "./StoryElementLayer";

export type StoryPlayerMedia = {
  id: number;
  media_type: "photo" | "video";
  mime_type: string;
  media_url: string;
  duration_ms: number | null;
};

const DEFAULT_PHOTO_MS = 5_000;

export function StoryMediaPlayer({
  media,
  elements,
  fallbackText,
  onComplete,
  onProgress,
}: {
  media: StoryPlayerMedia | null;
  elements: StoryElement[];
  fallbackText?: string;
  onComplete: () => void;
  onProgress?: (fraction: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const durationMs = useMemo(
    () => (media?.media_type === "video" && media.duration_ms ? Math.max(1_000, media.duration_ms) : DEFAULT_PHOTO_MS),
    [media],
  );
  const filter = useMemo(() => storyEffectFilter(elements), [elements]);
  const hasVignette = elements.some((element) => element.type === "effect" && element.payload.effect === "vignette");

  useEffect(() => {
    setLoaded(false);
    if (!media || media.media_type === "video" || !media.media_url) return;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - started) / durationMs);
      onProgress?.(fraction);
      if (fraction >= 1) {
        onComplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media, durationMs, onComplete, onProgress]);

  useEffect(() => {
    if (!media || media.media_type !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        onProgress?.(Math.min(1, video.currentTime / video.duration));
      }
    };
    video.addEventListener("timeupdate", update);
    return () => video.removeEventListener("timeupdate", update);
  }, [media, onProgress]);

  if (!media || !media.media_url) {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden bg-black px-8 text-center text-2xl font-black text-white">
        <span>{fallbackText || "Community Moment"}</span>
        <StoryElementLayer elements={elements} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {media.media_type === "video" ? (
        <video
          ref={videoRef}
          key={media.id}
          src={media.media_url}
          autoPlay
          playsInline
          muted
          preload="auto"
          onCanPlay={() => setLoaded(true)}
          onEnded={onComplete}
          onError={() => setLoaded(true)}
          className="max-h-full max-w-full object-contain"
          style={{ filter }}
        />
      ) : (
        <img
          key={media.id}
          src={media.media_url}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className="max-h-full max-w-full object-contain"
          style={{ filter }}
        />
      )}
      {!loaded && <div className="absolute inset-0 grid place-items-center bg-black/30 text-xs text-white/70">Loading…</div>}
      {hasVignette && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,.72)_100%)]" />}
      <StoryElementLayer elements={elements} />
    </div>
  );
}