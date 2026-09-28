import { useEffect, useMemo, useRef, useState } from "react";
import { StoryElementLayer, storyEffectFilter, type StoryElement } from "./StoryElementLayer";

export type StoryPlayerMedia = {
  id: number;
  media_type: "photo" | "video" | "audio";
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
  paused = false,
}: {
  media: StoryPlayerMedia | null;
  elements: StoryElement[];
  fallbackText?: string;
  onComplete: () => void;
  onProgress?: (fraction: number) => void;
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const photoElapsedRef = useRef(0);
  const photoLastTimeRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const durationMs = useMemo(
    () => (media && media.media_type !== "photo" && media.duration_ms ? Math.max(1_000, media.duration_ms) : DEFAULT_PHOTO_MS),
    [media],
  );
  const filter = useMemo(() => storyEffectFilter(elements), [elements]);
  const hasVignette = elements.some((element) => element.type === "effect" && element.payload.effect === "vignette");
  const hasPersistedText = elements.some((element) => element.type === "text" && typeof element.payload.text === "string" && element.payload.text.trim().length > 0);

  useEffect(() => {
    photoElapsedRef.current = 0;
    photoLastTimeRef.current = null;
  }, [media?.id]);

  useEffect(() => {
    setLoaded(false);
    if (!media || media.media_type !== "photo" || !media.media_url) return;
    let raf = 0;
    const tick = (now: number) => {
      if (photoLastTimeRef.current === null) photoLastTimeRef.current = now;
      if (!paused) {
        photoElapsedRef.current += now - photoLastTimeRef.current;
      }
      photoLastTimeRef.current = now;
      const fraction = Math.min(1, photoElapsedRef.current / durationMs);
      onProgress?.(fraction);
      if (fraction >= 1) {
        onComplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media, durationMs, onComplete, onProgress, paused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !media || media.media_type !== "video") return;
    if (paused) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      // Autoplay may be blocked until the viewer receives a user gesture.
    });
  }, [media, paused]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && paused) audio.pause();
  }, [media, paused]);

  useEffect(() => {
    if (!media || media.media_type === "photo") return;
    const video = videoRef.current;
    const audio = audioRef.current;
    const player = media.media_type === "video" ? video : audio;
    if (!player) return;
    const update = () => {
      if (player.duration && Number.isFinite(player.duration)) {
        onProgress?.(Math.min(1, player.currentTime / player.duration));
      }
    };
    player.addEventListener("timeupdate", update);
    return () => player.removeEventListener("timeupdate", update);
  }, [media, onProgress]);

  if (!media || !media.media_url) {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden bg-black px-8 text-center text-2xl font-black text-white">
        {!hasPersistedText && <span>{fallbackText || "Community Spark"}</span>}
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
      ) : media.media_type === "audio" ? (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-950 via-indigo-950 to-emerald-950 p-6">
          <audio
            ref={audioRef}
            key={media.id}
            src={media.media_url}
            controls
            preload="metadata"
            onCanPlay={() => setLoaded(true)}
            onEnded={onComplete}
            onError={() => setLoaded(true)}
            className="w-full max-w-lg"
            aria-label={fallbackText || "Community Moment audio"}
          />
        </div>
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