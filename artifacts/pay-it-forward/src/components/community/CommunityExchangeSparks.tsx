import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowDown, ArrowUp, MapPin, Play, RefreshCw, Store, Volume2, VolumeX } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { getExchangeSparks, type ExchangeSpark } from "@/lib/community-exchange-client";
import { CommunityExchangeSparkComposer } from "./CommunityExchangeSparkComposer";

const SPARKS_PAGE_SIZE = 12;

export function CommunityExchangeSparks({ onOpenListing }: { onOpenListing: (listingId: number) => void }) {
  const [sparks, setSparks] = useState<ExchangeSpark[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [radius, setRadius] = useState(10);
  const [feedRetry, setFeedRetry] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [publishNotice, setPublishNotice] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [activeCardVisible, setActiveCardVisible] = useState(true);
  const [grantRetry, setGrantRetry] = useState(0);
  const [activeThumbnailUrl, setActiveThumbnailUrl] = useState<string | null>(null);
  const [nextThumbnailUrl, setNextThumbnailUrl] = useState<string | null>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const cardListRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedPositionRef = useRef<{ key: string | null; scrollTop: number }>({ key: null, scrollTop: 0 });
  const restoredPositionRef = useRef(false);
  const feedGenerationRef = useRef(0);
  const feedControllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const grantAttemptsRef = useRef(0);
  const activeSpark = sparks[activeIndex] ?? null;
  const activeSparkId = activeSpark?.id;
  const activeSparkKey = activeSpark ? `${activeSpark.durable ? "durable" : "legacy"}:${activeSpark.id}` : null;
  const activeSparkMediaUrl = activeSpark?.media_url;
  const nextSpark = sparks[activeIndex + 1] ?? null;
  const shouldPlay = viewerVisible && pageVisible && activeCardVisible;

  const savePosition = (key = activeSparkKey) => {
    const position = { key, scrollTop: cardListRef.current?.scrollTop ?? savedPositionRef.current.scrollTop };
    savedPositionRef.current = position;
    try {
      sessionStorage.setItem("exchange-sparks-viewer-position", JSON.stringify(position));
    } catch {
      // The in-memory position still works when browser storage is unavailable.
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++feedGenerationRef.current;
    feedControllerRef.current?.abort();
    feedControllerRef.current = controller;
    moreControllerRef.current?.abort();
    setLoading(true);
    setError("");
    setSparks([]);
    setCursor(null);
    setActiveIndex(0);
    setLoadingMore(false);
    restoredPositionRef.current = false;
    void getExchangeSparks({
        nearby: true,
        radius_miles: radius,
        limit: SPARKS_PAGE_SIZE,
        signal: controller.signal,
      })
      .then((result) => {
        if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
        setSparks(Array.isArray(result.sparks) ? result.sparks : []);
        setCursor(result.next_cursor ?? null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && generation === feedGenerationRef.current) {
          setError(reason instanceof Error ? reason.message : "Exchange Sparks could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === feedGenerationRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [feedRetry, radius]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    const generation = feedGenerationRef.current;
    moreControllerRef.current?.abort();
    moreControllerRef.current = controller;
    setLoadingMore(true);
    try {
      const result = await getExchangeSparks({
        nearby: true,
        radius_miles: radius,
        limit: SPARKS_PAGE_SIZE,
        cursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== feedGenerationRef.current) return;
      setSparks((current) => [...current, ...(Array.isArray(result.sparks) ? result.sparks : [])]);
      setCursor(result.next_cursor ?? null);
    } catch (reason) {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : "More Exchange Sparks could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted && generation === feedGenerationRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    const root = cardListRef.current;
    if (!root || !sparks.length) return;
    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.45)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const index = mostVisible ? Number((mostVisible.target as HTMLElement).dataset.sparkIndex) : NaN;
      if (Number.isInteger(index)) {
        setActiveIndex(index);
        setActiveCardVisible(true);
      } else if (entries.some((entry) => entry.target === cardRefs.current.get(activeIndex))) {
        setActiveCardVisible(false);
      }
    }, { root, threshold: [0.45, 0.65, 0.85] });
    cardRefs.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [sparks, activeIndex]);

  useEffect(() => {
    const section = sectionRef.current;
    const observer = typeof IntersectionObserver === "undefined" || !section
      ? null
      : new IntersectionObserver(([entry]) => setViewerVisible(Boolean(entry?.isIntersecting)), { threshold: 0.01 });
    if (observer && section) observer.observe(section);
    else setViewerVisible(true);
    const updatePageVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updatePageVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updatePageVisibility);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      // Autoplay can be blocked by the browser; native controls remain available.
    });
  }, [shouldPlay, playbackUrl]);

  useEffect(() => {
    if (loading || restoredPositionRef.current || !sparks.length) return;
    restoredPositionRef.current = true;
    let saved = savedPositionRef.current;
    try {
      const stored = sessionStorage.getItem("exchange-sparks-viewer-position");
      if (stored) saved = JSON.parse(stored) as typeof saved;
    } catch {
      // Ignore malformed or unavailable session storage.
    }
    if (saved.key) {
      const restoredIndex = sparks.findIndex((spark) => `${spark.durable ? "durable" : "legacy"}:${spark.id}` === saved.key);
      if (restoredIndex >= 0) setActiveIndex(restoredIndex);
    }
    if (cardListRef.current && Number.isFinite(saved.scrollTop)) cardListRef.current.scrollTop = saved.scrollTop;
  }, [loading, sparks]);

  useEffect(() => {
    grantAttemptsRef.current = 0;
    setPlaybackError("");
  }, [activeSparkKey]);

  useEffect(() => {
    if (!activeSparkId || !activeSparkMediaUrl) {
      setPlaybackUrl(null);
      setPlaybackError("");
      setPlaybackLoading(false);
      return;
    }
    if (!shouldPlay) {
      setPlaybackLoading(false);
      return;
    }
    const controller = new AbortController();
    setPlaybackUrl(null);
    setPlaybackError("");
    setPlaybackLoading(true);
    let mediaId: number;
    let grantPath: string;
    try {
      const mediaUrl = new URL(activeSparkMediaUrl, window.location.origin);
      const match = mediaUrl.pathname.match(/^\/api\/(?:community\/stories\/media|media-assets)\/(\d+)\/?$/);
      mediaId = Number(match?.[1]);
      if (mediaUrl.origin !== window.location.origin || mediaUrl.search || mediaUrl.hash
        || mediaUrl.username || mediaUrl.password || !Number.isSafeInteger(mediaId) || mediaId < 1) {
        throw new Error("This Spark does not have a valid authenticated media reference.");
      }
      grantPath = `${mediaUrl.pathname.replace(/\/$/, "")}/playback-grant`;
    } catch (reason) {
      setPlaybackError(reason instanceof Error ? reason.message : "This Spark does not have a valid media reference.");
      setPlaybackLoading(false);
      return () => controller.abort();
    }
    void fetch(grantPath, {
      method: "POST",
      headers: authHeaders(),
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { playback_url?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "A secure video playback grant could not be created.");
        if (typeof payload.playback_url !== "string" || !payload.playback_url) {
          throw new Error("The playback service returned no video URL.");
        }
        const url = new URL(payload.playback_url, window.location.origin);
        if (url.origin !== window.location.origin || url.search || url.hash || url.username || url.password) {
          throw new Error("The playback URL must remain on Niakofa and contain no URL token.");
        }
        return payload.playback_url;
      })
      .then((url) => {
        if (!controller.signal.aborted) setPlaybackUrl(url);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setPlaybackError(reason instanceof Error ? reason.message : "The Spark video could not be opened.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlaybackLoading(false);
      });
    return () => controller.abort();
  }, [activeSparkKey, activeSparkId, activeSparkMediaUrl, grantRetry, shouldPlay]);

  useEffect(() => {
    if (!shouldPlay || !nextSpark?.thumbnail_url) {
      setNextThumbnailUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let thumbnailUrl: URL;
    try {
      thumbnailUrl = new URL(nextSpark.thumbnail_url, window.location.origin);
      const oldStoryThumbnail = /^\/api\/community\/stories\/media\/\d+\/?$/.test(thumbnailUrl.pathname)
        && Array.from(thumbnailUrl.searchParams.keys()).every((key) => key === "thumbnail")
        && thumbnailUrl.searchParams.get("thumbnail") === "true";
      const durableThumbnail = /^\/api\/media-assets\/\d+\/thumbnail\/?$/.test(thumbnailUrl.pathname)
        && !thumbnailUrl.search;
      if (thumbnailUrl.origin !== window.location.origin || thumbnailUrl.hash || thumbnailUrl.username
        || thumbnailUrl.password || !(oldStoryThumbnail || durableThumbnail)) {
        throw new Error("Invalid next Spark preview URL.");
      }
    } catch {
      setNextThumbnailUrl(null);
      return () => controller.abort();
    }
    void fetch(`${thumbnailUrl.pathname}${thumbnailUrl.search}`, {
      headers: authHeaders(),
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? URL.createObjectURL(await response.blob()) : null)
      .then((url) => {
        if (!url) return;
        if (controller.signal.aborted) URL.revokeObjectURL(url);
        else {
          objectUrl = url;
          setNextThumbnailUrl(url);
        }
      })
      .catch(() => {
        // The next preview is optional; do not interrupt current playback.
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nextSpark?.id, nextSpark?.durable, nextSpark?.thumbnail_url, shouldPlay]);

  useEffect(() => {
    if (!activeSpark?.thumbnail_url) {
      setActiveThumbnailUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setActiveThumbnailUrl(null);
    let thumbnailUrl: URL;
    try {
      thumbnailUrl = new URL(activeSpark.thumbnail_url, window.location.origin);
      const oldStoryThumbnail = /^\/api\/community\/stories\/media\/\d+\/?$/.test(thumbnailUrl.pathname)
        && Array.from(thumbnailUrl.searchParams.keys()).every((key) => key === "thumbnail")
        && thumbnailUrl.searchParams.get("thumbnail") === "true";
      const durableThumbnail = /^\/api\/media-assets\/\d+\/thumbnail\/?$/.test(thumbnailUrl.pathname)
        && !thumbnailUrl.search;
      if (
        thumbnailUrl.origin !== window.location.origin
        || thumbnailUrl.hash || thumbnailUrl.username || thumbnailUrl.password
        || !(oldStoryThumbnail || durableThumbnail)
      ) {
        throw new Error("This Spark preview is not a same-origin media URL.");
      }
    } catch {
      setActiveThumbnailUrl(null);
      return () => controller.abort();
    }
    void fetch(`${thumbnailUrl.pathname}${thumbnailUrl.search}`, { headers: authHeaders(), credentials: "same-origin", signal: controller.signal })
      .then(async (response) => response.ok ? URL.createObjectURL(await response.blob()) : null)
      .then((url) => {
        if (!url) return;
        if (controller.signal.aborted) URL.revokeObjectURL(url);
        else {
          objectUrl = url;
          setActiveThumbnailUrl(url);
        }
      })
      .catch(() => {
        // The video remains usable when a preview image is unavailable.
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeSparkKey, activeSpark?.thumbnail_url]);

  const retryFeed = () => setFeedRetry((value) => value + 1);
  const handlePlaybackError = () => {
    setPlaybackUrl(null);
    if (grantAttemptsRef.current === 0) {
      grantAttemptsRef.current = 1;
      setPlaybackError("Refreshing secure playback…");
      setGrantRetry((value) => value + 1);
    } else {
      setPlaybackError("The video could not be played. You can request a fresh playback link.");
    }
  };
  const retryPlayback = () => {
    setPlaybackError("");
    grantAttemptsRef.current = 0;
    setGrantRetry((value) => value + 1);
  };

  const moveTo = (index: number) => {
    const target = cardRefs.current.get(index);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(index);
    savePosition(sparks[index] ? `${sparks[index].durable ? "durable" : "legacy"}:${sparks[index].id}` : activeSparkKey);
  };

  return (
    <section ref={sectionRef} className="overflow-hidden rounded-3xl border border-border bg-card" aria-label="Exchange Sparks" data-testid="exchange-sparks">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary"><Play className="h-3.5 w-3.5" aria-hidden="true" /> Exchange Sparks</p>
          <h2 className="mt-1 text-xl font-black tracking-tight">See what neighbors are sharing</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">Short videos connected to Exchange posts, shown by broad neighborhood and radius—not an exact address.</p>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          Radius
          <select aria-label="Exchange Sparks radius" value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="bg-transparent text-foreground outline-none">
            {[1, 5, 10, 15, 25, 50].map((miles) => <option key={miles} value={miles}>{miles} mi</option>)}
          </select>
        </label>
      </header>

      <div className="space-y-3 p-4 sm:p-5">
        {publishNotice && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{publishNotice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div>
            <p className="text-sm font-black">Create an Exchange Spark</p>
            <p className="mt-1 text-xs text-muted-foreground">Use the unified Sparks Studio to create a Moment or connect a video to an active Exchange post you own.</p>
          </div>
          <Link href="/community/moments?composer=1" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background" data-testid="button-create-exchange-spark-studio">
            Create in Studio
          </Link>
        </div>
        <CommunityExchangeSparkComposer onPublished={(status) => {
          setPublishNotice(status === "pending"
            ? "Your video Spark was submitted for review and is not visible until approved."
            : "Your Exchange Spark is published.");
          setFeedRetry((value) => value + 1);
        }} />
      </div>

      {error && <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm" role="alert"><span>{error}</span><button type="button" onClick={retryFeed} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-bold"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry</button></div>}

      {loading ? (
        <div className="grid min-h-64 place-items-center p-8 text-sm text-muted-foreground" role="status">Loading nearby Exchange Sparks…</div>
      ) : sparks.length === 0 ? (
        <div className="grid min-h-64 place-items-center p-8 text-center">
          <div><Store className="mx-auto h-8 w-8 text-primary" aria-hidden="true" /><h3 className="mt-3 font-black">No nearby Exchange videos yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a wider radius or check back when a neighbor shares a video with an Exchange post.</p></div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
            <span aria-live="polite" data-testid="text-exchange-spark-position">Spark {activeIndex + 1} of {sparks.length}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => moveTo(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Previous Exchange Spark" data-testid="button-previous-exchange-spark"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => moveTo(Math.min(sparks.length - 1, activeIndex + 1))} disabled={activeIndex === sparks.length - 1} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border disabled:opacity-40" aria-label="Next Exchange Spark" data-testid="button-next-exchange-spark"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </div>
          <div ref={cardListRef} onScroll={() => savePosition()} className="mx-auto flex h-[min(78dvh,780px)] max-h-[780px] max-w-md snap-y snap-mandatory flex-col overflow-y-auto overscroll-contain bg-black scroll-smooth sm:my-5 sm:rounded-2xl" aria-label="Swipe or scroll through Exchange videos" role="feed" aria-busy={loadingMore} data-testid="list-exchange-sparks">
            {sparks.map((spark, index) => (
              <article
                 key={`${spark.durable ? "durable" : "legacy"}:${spark.id}`}
                ref={(element) => {
                  if (element) cardRefs.current.set(index, element);
                  else cardRefs.current.delete(index);
                }}
                data-spark-index={index}
                className="relative flex h-full min-h-full w-full shrink-0 snap-start items-center justify-center overflow-hidden bg-neutral-950"
                aria-label={`Exchange Spark ${index + 1}`}
                aria-posinset={index + 1}
                aria-setsize={cursor ? -1 : sparks.length}
                data-testid={`card-exchange-spark-${spark.id}`}
              >
                {index === activeIndex && activeThumbnailUrl && <img src={activeThumbnailUrl} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity ${playbackUrl ? "opacity-0" : "opacity-100"}`} />}
                 {index === activeIndex + 1 && nextThumbnailUrl && <img src={nextThumbnailUrl} alt="" className="hidden" />}
                 {index === activeIndex && playbackUrl ? (
                    <video ref={videoRef} key={`${spark.durable ? "durable" : "legacy"}:${spark.id}`} src={playbackUrl} autoPlay={shouldPlay} muted={muted} playsInline controls preload="metadata" onError={handlePlaybackError} onWaiting={() => setPlaybackLoading(true)} onCanPlay={() => setPlaybackLoading(false)} className="relative z-10 h-full w-full object-contain" aria-label={spark.caption || "Exchange Spark video"} />
                ) : (
                  <div className="relative z-10 flex h-full w-full items-center justify-center bg-gradient-to-b from-black/10 via-transparent to-black/65">
                    {!activeThumbnailUrl && <span className="rounded-full bg-black/45 p-4 text-white"><Play className="h-8 w-8" aria-hidden="true" /></span>}
                  </div>
                )}
                 {index === activeIndex && (
                   <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
                     <button type="button" onClick={() => setMuted((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-black/75 px-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white" aria-label={muted ? "Unmute Exchange Spark" : "Mute Exchange Spark"} aria-pressed={!muted} data-testid="button-toggle-exchange-spark-sound">
                       {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
                       {muted ? "Sound off" : "Sound on"}
                     </button>
                   </div>
                 )}
                 {index === activeIndex && playbackLoading && <p role="status" className="absolute left-4 top-16 z-30 rounded-lg bg-black/75 px-3 py-2 text-xs text-white">Loading video…</p>}
                 {index === activeIndex && !spark.media_url && <p role="status" className="absolute left-4 right-4 top-16 z-30 rounded-lg bg-black/75 px-3 py-2 text-xs text-white">This Spark video is no longer available.</p>}
                {index === activeIndex && playbackError && <div className="absolute left-4 right-4 top-4 z-30 rounded-xl border border-white/20 bg-black/80 p-3 text-sm text-white" role="status"><p>{playbackError}</p>{playbackError !== "Refreshing secure playback…" && <button type="button" onClick={retryPlayback} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 font-bold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-white"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry video</button>}</div>}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5 pt-24 text-white">
                   <p className="mb-1 text-xs font-black">{spark.author_name || "A neighbor"}</p>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-white/80"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{spark.neighborhood}</p>
                  {spark.caption && <p className="mt-2 text-sm font-semibold leading-relaxed">{spark.caption}</p>}
                </div>
                 <button type="button" onClick={() => { savePosition(`${spark.durable ? "durable" : "legacy"}:${spark.id}`); onOpenListing(spark.listing_id); }} className="absolute bottom-4 right-4 z-30 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground shadow-lg focus:outline-none focus:ring-2 focus:ring-white" aria-label="Open connected Exchange listing">
                  <Store className="h-4 w-4" aria-hidden="true" /> View Exchange post
                </button>
              </article>
            ))}
          </div>
          {cursor && <div className="flex justify-center p-4"><button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-60" data-testid="button-load-more-exchange-sparks">{loadingMore ? "Loading…" : "Load more Sparks"}</button></div>}
        </>
      )}
      <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Videos start muted. Only the Spark in view plays; moving away stops and releases its media. Location is shown as a neighborhood area only.</p>
    </section>
  );
}