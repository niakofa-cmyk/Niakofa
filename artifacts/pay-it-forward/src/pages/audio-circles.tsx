import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Users, Mic, Video, ArrowLeft, Search, WifiOff, Crown, Volume2, X, Share2, Bell, BellOff } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCachedList } from "@/hooks/useCachedList";

interface LiveSessionSummary {
  id: number;
  title: string;
  host_id: number;
  host_name: string;
  video_enabled: boolean;
  is_recording: boolean;
  started_at: string;
  speaker_count: number;
  listener_count: number;
}

interface CircleSummary {
  id: number;
  city_key: string;
  city_display: string;
  neighborhood_id: number | null;
  name: string;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  live_session: LiveSessionSummary | null;
  is_following: boolean;
}

interface Recording {
  id: number;
  title: string;
  host_id: number | null;
  host_name: string | null;
  recording_url: string;
  started_at: string;
  ended_at: string | null;
}

const SESSION_KEY = "niakofa_circles_city";

// ── Pre-join host modal ──────────────────────────────────────────────────────
interface HostModalProps {
  circle: CircleSummary;
  onClose: () => void;
  onStart: (circle: CircleSummary, videoEnabled: boolean, title: string, description: string, topic: string) => void;
  starting: boolean;
}

function HostCircleModal({ circle, onClose, onStart, starting }: HostModalProps) {
  const [format, setFormat] = useState<"audio" | "video">("audio");
  const [title, setTitle] = useState(() =>
    circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`
  );
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [micReady, setMicReady] = useState<boolean | null>(null);
  const [camReady, setCamReady] = useState<boolean | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
        setMicReady(true);
      } catch { setMicReady(false); }
    })();
  }, []);

  useEffect(() => {
    if (format !== "video") { setCamReady(null); return; }
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach(t => t.stop());
        setCamReady(true);
      } catch { setCamReady(false); }
    })();
  }, [format]);

  const circleName = circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`;

  const canStart = title.trim().length > 0 && micReady !== false && (format !== "video" || camReady !== false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 32, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 32, scale: 0.97 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-black text-base">Host a Circle</div>
            <div className="text-xs text-muted-foreground mt-0.5">{circleName}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title input */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Circle Title</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 140))}
            placeholder="e.g. Southside Community Conversation"
            style={{ fontSize: "16px" }}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {/* Description input */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Description (optional)</div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 500))}
            placeholder="What's this circle about? e.g. Discuss neighborhood safety and development."
            rows={2}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Topic input */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Topic / Category (optional)</div>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value.slice(0, 100))}
            placeholder="e.g. Safety, Education, Development"
            style={{ fontSize: "16px" }}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>

        {/* Format picker */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Format</div>
          <div className="grid grid-cols-2 gap-2">
            {(["audio", "video"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                  format === f
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <span className="text-2xl">{f === "audio" ? "🎤" : "🎥"}</span>
                <span className="text-xs font-black">{f === "audio" ? "Audio Circle" : "Video Circle"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Device checks */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Device Check</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Mic className="w-4 h-4 text-muted-foreground" /> Microphone</span>
              {micReady === null && <span className="text-xs text-muted-foreground animate-pulse">Checking…</span>}
              {micReady === true && <span className="text-xs font-bold text-green-400">🟢 Ready</span>}
              {micReady === false && <span className="text-xs font-bold text-red-400">🔴 Not available</span>}
            </div>
            {format === "video" && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-muted-foreground" /> Camera</span>
                {camReady === null && <span className="text-xs text-muted-foreground animate-pulse">Checking…</span>}
                {camReady === true && <span className="text-xs font-bold text-green-400">🟢 Ready</span>}
                {camReady === false && <span className="text-xs font-bold text-red-400">🔴 Not available</span>}
              </div>
            )}
          </div>
          {micReady === false && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Allow microphone access in your browser settings, then try again.
            </div>
          )}
        </div>

        {/* Start button */}
        <Button
          className="w-full"
          disabled={starting || !canStart}
          onClick={() => onStart(circle, format === "video", title.trim(), description.trim(), topic.trim())}
        >
          {starting ? "Starting…" : `Start ${format === "audio" ? "Audio" : "Video"} Circle`}
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AudioCirclesScreen() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { currentUser } = useAppContext();

  // Pull ?neighborhood= from URL so Community → Circles tab card navigates here correctly
  const neighborhoodParam = new URLSearchParams(search).get("neighborhood");

  const [city, setCity] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || currentUser?.city?.trim() || "Fort Worth";
    } catch {
      return currentUser?.city?.trim() || "Fort Worth";
    }
  });
  const [cityInput, setCityInput] = useState(city);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [hostModal, setHostModal] = useState<CircleSummary | null>(null);
  const [recordingsByCircle, setRecordingsByCircle] = useState<Map<number, Recording[]>>(new Map());
  const [recordingsOpen, setRecordingsOpen] = useState<Set<number>>(new Set());
  const [followingSet, setFollowingSet] = useState<Set<number>>(new Set());

  // Ref for the highlighted neighborhood card (from Community tab navigation)
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, city); } catch { /* storage blocked */ }
  }, [city]);

  const fetcher = useCallback(async () => {
    const res = await fetch(
      `${base}/api/audio-circles?city=${encodeURIComponent(city.trim())}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return (data.circles ?? []) as CircleSummary[];
  }, [base, city]);

  const {
    data: circles,
    loading,
    stale,
    hasFetchedOnce,
    refresh,
  } = useCachedList<CircleSummary[]>({
    cacheKey: `niakofa_circles_cache_${city.trim().toLowerCase()}`,
    fetcher,
    pollMs: 15000,
    enabled: !!city.trim(),
  });

  // Track which circles the user follows
  useEffect(() => {
    if (circles) {
      setFollowingSet(new Set(circles.filter(c => c.is_following).map(c => c.id)));
    }
  }, [circles]);

  // Scroll to the highlighted neighborhood when circles load
  useEffect(() => {
    if (neighborhoodParam && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [neighborhoodParam, circles]);

  const startRoom = async (circle: CircleSummary, video_enabled = false, title: string, description: string, topic: string) => {
    setStartingId(circle.id);
    setHostModal(null);
    try {
      const res = await fetch(`${base}/api/audio-circles/${circle.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title, video_enabled, description: description || undefined, topic: topic || undefined }),
      });
      const data = await res.json();
      if (res.status === 409 && data.session_id) {
        setLocation(`/audio-circle/${data.session_id}`);
        return;
      }
      if (!res.ok) {
        toast({ title: "Couldn't start the circle", description: data.error ?? "Try again in a moment.", variant: "destructive" });
        return;
      }
      await refresh();
      setLocation(`/audio-circle/${data.session.id}`);
    } catch {
      toast({ title: "Couldn't start the circle", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  const joinRoom = (sessionId: number) => setLocation(`/audio-circle/${sessionId}`);

  const shareCircle = (circle: CircleSummary, live: LiveSessionSummary) => {
    const url = `${window.location.origin}/audio-circle/${live.id}`;
    if (navigator.share) {
      navigator.share({ title: circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Link copied!", description: "Share it with your neighbors." });
      }).catch(() => {
        toast({ title: "Circle link", description: url });
      });
    }
  };

  const toggleFollow = async (circle: CircleSummary) => {
    const isFollowing = followingSet.has(circle.id);
    // Optimistic update
    setFollowingSet(prev => {
      const next = new Set(prev);
      if (isFollowing) next.delete(circle.id);
      else next.add(circle.id);
      return next;
    });
    try {
      const endpoint = isFollowing ? "unfollow" : "follow";
      const res = await fetch(`${base}/api/audio-circles/${circle.id}/${endpoint}`, {
        method: "POST",
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error(String(res.status));
      toast({
        title: isFollowing ? "Unfollowed" : "Following",
        description: isFollowing
          ? "You won't get notified when this circle goes live."
          : "You'll get notified when this circle goes live.",
      });
    } catch {
      // Revert on error
      setFollowingSet(prev => {
        const next = new Set(prev);
        if (isFollowing) next.add(circle.id);
        else next.delete(circle.id);
        return next;
      });
      toast({ title: "Couldn't update follow status", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const loadRecordings = async (circleId: number) => {
    const nextOpen = new Set(recordingsOpen);
    if (nextOpen.has(circleId)) {
      nextOpen.delete(circleId);
      setRecordingsOpen(nextOpen);
      return;
    }
    try {
      const res = await fetch(`${base}/api/audio-circles/${circleId}/recordings`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRecordingsByCircle(prev => new Map(prev).set(circleId, data.recordings ?? []));
      nextOpen.add(circleId);
      setRecordingsOpen(nextOpen);
    } catch {
      toast({ title: "Couldn't load recordings", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/community")} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-lg flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" /> Circles
          </h1>
          <p className="text-xs text-muted-foreground">Live voice & video rooms for your neighborhood</p>
        </div>
        {stale && circles && circles.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <WifiOff className="w-3 h-3" />
            <span>Reconnecting…</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/30 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Think call-in radio, live. Host a room, raise your hand to speak, or just listen in —
            every neighborhood (and your whole city) has its own circle. Follow a circle to get
            notified when it goes live.
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setCity(cityInput); }}
        >
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Search a city…"
            style={{ fontSize: "16px" }}
            className="flex-1 px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
          <Button type="submit" size="icon" variant="outline"><Search className="w-4 h-4" /></Button>
        </form>

        {loading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading circles…</div>
        )}

        {!loading && !circles && hasFetchedOnce && (
          <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center space-y-3">
            <WifiOff className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <div className="text-sm font-bold text-muted-foreground">Couldn't load circles</div>
            <div className="text-xs text-muted-foreground/60">We had trouble reaching the server. Check your connection and try again.</div>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-4 py-2 rounded-xl active:scale-95 transition-transform"
            >
              Try again
            </button>
          </div>
        )}

        {circles?.length === 0 && !loading && (
          <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center">
            <div className="text-sm font-bold text-muted-foreground">No circles yet for {city}</div>
            <div className="text-xs text-muted-foreground/60 mt-1">Try a different city, or check back soon.</div>
          </div>
        )}

        <div className="space-y-3">
          {circles?.map((circle, i) => {
            const live = circle.live_session;
            const isFollowing = followingSet.has(circle.id);
            const isHighlighted = neighborhoodParam
              ? circle.neighborhood_name?.toLowerCase() === neighborhoodParam.toLowerCase()
              : false;
            return (
              <motion.div
                key={circle.id}
                ref={isHighlighted ? highlightRef : null}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-card border rounded-2xl overflow-hidden transition-all ${
                  live
                    ? "border-primary/50"
                    : isHighlighted
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "border-border"
                }`}
              >
                {/* Circle header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                      {circle.neighborhood_emoji ?? "🌆"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-black text-sm">{circle.neighborhood_name ?? `${circle.city_display} (city-wide)`}</div>
                        {live && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <Radio className="w-2.5 h-2.5" /> Live
                          </span>
                        )}
                        {isFollowing && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                            <Bell className="w-2.5 h-2.5" /> Following
                          </span>
                        )}
                      </div>
                      {live ? (
                        <div className="mt-1 space-y-1">
                          <div className="text-xs text-muted-foreground truncate">
                            "{live.title}"
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-amber-400" /> {live.host_name}</span>
                            <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {live.speaker_count} speaker{live.speaker_count !== 1 ? "s" : ""}</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {live.listener_count} audience</span>
                            {live.video_enabled && <span className="flex items-center gap-1 text-primary"><Video className="w-3 h-3" /> Video</span>}
                            {live.is_recording && <span className="flex items-center gap-1 text-red-400"><Radio className="w-3 h-3" /> Recording</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-0.5">No live session right now</div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex items-center gap-2">
                    {live ? (
                      <>
                        <Button className="flex-1" onClick={() => joinRoom(live.id)}>
                          Join Circle
                        </Button>
                        <button
                          onClick={() => shareCircle(circle, live)}
                          className="p-2.5 rounded-xl border border-border hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
                          title="Share this Circle"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleFollow(circle)}
                          className={`p-2.5 rounded-xl border transition-colors ${
                            isFollowing
                              ? "border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                          }`}
                          title={isFollowing ? "Unfollow this Circle" : "Follow this Circle for live notifications"}
                        >
                          {isFollowing ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                        </button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1"
                          disabled={startingId === circle.id}
                          onClick={() => setHostModal(circle)}
                        >
                          {startingId === circle.id ? "Starting…" : "Host a Circle"}
                        </Button>
                        <button
                          onClick={() => toggleFollow(circle)}
                          className={`p-2.5 rounded-xl border transition-colors ${
                            isFollowing
                              ? "border-primary/40 text-primary"
                              : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                          }`}
                          title={isFollowing ? "Unfollow this Circle" : "Follow this Circle for live notifications"}
                        >
                          {isFollowing ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => loadRecordings(circle.id)}
                      className="text-[11px] font-bold text-primary underline underline-offset-2 shrink-0"
                    >
                      {recordingsOpen.has(circle.id) ? "Hide recordings" : "Past recordings"}
                    </button>
                  </div>
                </div>

                {/* Recordings */}
                {recordingsOpen.has(circle.id) && (
                  <div className="border-t border-border p-4 space-y-2 bg-background/50">
                    {(recordingsByCircle.get(circle.id) ?? []).length === 0 ? (
                      <div className="text-xs text-muted-foreground">No recordings yet.</div>
                    ) : (
                      (recordingsByCircle.get(circle.id) ?? []).map(recording => (
                        <div key={recording.id} className="rounded-xl bg-card p-3">
                          <div className="text-xs font-bold truncate">{recording.title}</div>
                          <div className="text-[10px] text-muted-foreground mb-2">
                            Hosted by {recording.host_name ?? "a former member"}
                          </div>
                          <audio controls preload="none" src={recording.recording_url} className="w-full h-9" />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Host pre-join modal */}
      <AnimatePresence>
        {hostModal && (
          <HostCircleModal
            circle={hostModal}
            onClose={() => setHostModal(null)}
            onStart={startRoom}
            starting={startingId === hostModal.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
