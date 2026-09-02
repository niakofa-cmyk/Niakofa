import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Users, Mic, Video, ArrowLeft, Search, WifiOff, Crown, X, Share2, Bell, BellOff } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useCachedList } from "@/hooks/useCachedList";
import { acquireCircleDevice } from "@/lib/circleMediaReadiness";
import { CircleStartLocationError, getFreshCircleStartLocation } from "@/lib/circleStartLocation";

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
  topic?: string | null;
  description?: string | null;
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

interface RecommendedCircle {
  id: number;
  name: string;
  city_display: string;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  live_session: LiveSessionSummary | null;
  is_following: boolean;
  follower_count: number;
  reason: string;
}

interface TrendingCircle {
  id: number;
  name: string;
  city_display: string;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  live_session: LiveSessionSummary | null;
  participant_count: number;
  trend_score: number;
}

interface NearbyCircle {
  id: number;
  name: string;
  city_display: string;
  city_key: string;
  neighborhood_name: string | null;
  neighborhood_emoji: string | null;
  distance_km: number;
  live_session: LiveSessionSummary | null;
}

interface CircleAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
}

interface CircleMilestone {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
}

interface CommunityStats {
  trust_score: number;
  reputation_level: string;
  total_circles_hosted: number;
  total_speaking_time_minutes: number;
  total_reactions_given: number;
  total_reactions_received: number;
  achievements: CircleAchievement[];
  milestones: CircleMilestone[];
}

const SESSION_KEY = "niakofa_circles_city";

// ── Pre-join host modal ──────────────────────────────────────────────────────
const SPEAKER_LIMIT_OPTIONS = [4, 8, 12, 18, 24] as const;

interface HostModalProps {
  circle: CircleSummary;
  onClose: () => void;
  onStart: (circle: CircleSummary, videoEnabled: boolean, title: string, description: string, topic: string, maxSpeakers: number, recordingAllowed: boolean) => void;
  starting: boolean;
}

function HostCircleModal({ circle, onClose, onStart, starting }: HostModalProps) {
  const [format, setFormat] = useState<"audio" | "video">("audio");
  const [title, setTitle] = useState(() =>
    circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`
  );
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [maxSpeakers, setMaxSpeakers] = useState<number>(12);
  const [recordingAllowed, setRecordingAllowed] = useState(false);
  const [micReady, setMicReady] = useState<boolean | null>(null);
  const [camReady, setCamReady] = useState<boolean | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      const result = await acquireCircleDevice("microphone");
      if (result.ok) {
        result.stream.getTracks().forEach(t => t.stop());
        setMicReady(true);
      } else {
        setMicReady(false);
        setMicError(result.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (format !== "video") {
      setCamReady(null);
      setCamError(null);
      return;
    }
    (async () => {
      const result = await acquireCircleDevice("camera");
      if (result.ok) {
        result.stream.getTracks().forEach(t => t.stop());
        setCamReady(true);
      } else {
        setCamReady(false);
        setCamError(result.message);
      }
    })();
  }, [format]);

  const circleName = circle.neighborhood_name ? `${circle.neighborhood_name} Circle` : `${circle.city_display} Circle`;

  const canStart = title.trim().length > 0 && micReady === true && (format !== "video" ? true : camReady === true) && maxSpeakers > 0;

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

        {/* Speaker limit */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Speaker Limit</div>
          <div className="flex gap-1.5 flex-wrap">
            {SPEAKER_LIMIT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setMaxSpeakers(n)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                  maxSpeakers === n
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Max microphone slots (you + up to {maxSpeakers - 1} speakers)
          </div>
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
              {micError ?? "Microphone is not available. Check your browser settings and try again."}
            </div>
          )}
          {format === "video" && camReady === false && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              {camError ?? "Camera is not available. Check your browser settings and try again."}
            </div>
          )}
        </div>

        {/* Start button */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
          Hosting requires a fresh, accurate GPS check for this Circle’s city. Joining never requires your location.
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={recordingAllowed}
            onChange={(event) => setRecordingAllowed(event.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            <span className="block font-semibold text-foreground">Allow recording for this session</span>
            Recording is off unless you explicitly enable it. Everyone in the Circle must acknowledge before recording can begin.
          </span>
        </label>
        <Button
          className="w-full"
          disabled={starting || !canStart}
          onClick={() => onStart(circle, format === "video", title.trim(), description.trim(), topic.trim(), maxSpeakers, recordingAllowed)}
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
  const [followedCircles, setFollowedCircles] = useState<CircleSummary[]>([]);
  const [followedLoading, setFollowedLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"discover" | "following">("discover");
  const [recommended, _setRecommended] = useState<RecommendedCircle[]>([]);
  const [trending, _setTrending] = useState<TrendingCircle[]>([]);
  const [nearby, _setNearby] = useState<NearbyCircle[]>([]);
  const [_discoveryLoading, _setDiscoveryLoading] = useState(false);
  const [communityStats, _setCommunityStats] = useState<CommunityStats | null>(null);
  const [_showStatsModal, setShowStatsModal] = useState(false);

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

  // Load the "Following" list separately from the city-scoped list
  useEffect(() => {
    let cancelled = false;
    setFollowedLoading(true);
    fetch(`${base}/api/audio-circles/followed`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { followed: [] })
      .then(data => { if (!cancelled) setFollowedCircles(data.followed ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFollowedLoading(false); });
    return () => { cancelled = true; };
  }, [base]);

  // Scroll to the highlighted neighborhood when circles load
  useEffect(() => {
    if (neighborhoodParam && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [neighborhoodParam, circles]);

  const startRoom = async (circle: CircleSummary, video_enabled = false, title: string, description: string, topic: string, maxSpeakers = 12, recordingAllowed = false) => {
    setStartingId(circle.id);
    setHostModal(null);
    try {
      const location = await getFreshCircleStartLocation();
      const res = await fetch(`${base}/api/audio-circles/${circle.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title, video_enabled, description: description || undefined, topic: topic || undefined, max_speakers: maxSpeakers, recording_allowed: recordingAllowed, location }),
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
    } catch (error) {
      if (error instanceof CircleStartLocationError) {
        toast({ title: "Location needed to host", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Couldn't start the circle", description: "Check your connection and try again.", variant: "destructive" });
      }
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

        {/* Community Stats — reputation, trust score, achievements */}
        {communityStats && (
          <button
            onClick={() => setShowStatsModal(true)}
            className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-primary/40 transition-colors text-left"
          >
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4"
                  className="text-primary transition-all"
                  strokeDasharray={`${(communityStats.trust_score / 100) * 150.8} 150.8`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black">{communityStats.trust_score}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{communityStats.reputation_level}</span>
                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">Trust Score</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                <span>{communityStats.total_circles_hosted} hosted</span>
                <span>{Math.floor(communityStats.total_speaking_time_minutes)} min spoken</span>
                <span>{communityStats.achievements.length} achievements</span>
              </div>
            </div>
            {communityStats.achievements.length > 0 && (
              <div className="flex -space-x-1 shrink-0">
                {communityStats.achievements.slice(0, 3).map(a => (
                  <div key={a.id} className="w-7 h-7 rounded-full bg-primary/15 border-2 border-background flex items-center justify-center text-sm" title={a.title}>
                    {a.icon}
                  </div>
                ))}
              </div>
            )}
          </button>
        )}

        {/* Discover / Following tabs */}
        <div className="flex items-center border-b border-border -mb-1">
          <button
            onClick={() => setActiveSection("discover")}
            className={`pb-2 px-1 mr-4 text-sm font-bold border-b-2 transition-colors ${activeSection === "discover" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Discover
          </button>
          <button
            onClick={() => setActiveSection("following")}
            className={`pb-2 px-1 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeSection === "following" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Following
            {followedCircles.length > 0 && (
              <span className="text-[9px] font-black bg-primary/15 text-primary border border-primary/30 rounded-full px-1.5 py-0.5">{followedCircles.length}</span>
            )}
          </button>
        </div>

        {/* Live Now — trending rooms across all cities */}
        {activeSection === "discover" && trending.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Trending Now · {trending.length}
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {trending.slice(0, 8).map(t => (
                <button
                  key={t.id}
                  onClick={() => t.live_session && joinRoom(t.live_session.id)}
                  className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2 min-w-[200px] shrink-0 hover:border-primary/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{t.neighborhood_emoji ?? "🌆"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black truncate">{t.neighborhood_name ?? t.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{t.city_display}</div>
                    </div>
                    {t.live_session && (
                      <span className="flex items-center gap-1 text-[9px] font-black text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        LIVE
                      </span>
                    )}
                  </div>
                  {t.live_session && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" /> {t.participant_count}</span>
                      <span className="flex items-center gap-0.5"><Mic className="w-2.5 h-2.5" /> {t.live_session.speaker_count}</span>
                      {t.live_session.video_enabled && <Video className="w-2.5 h-2.5 text-primary" />}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recommended for you */}
        {activeSection === "discover" && recommended.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Recommended · {recommended.length}
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {recommended.slice(0, 6).map(r => (
                <button
                  key={r.id}
                  onClick={() => r.live_session && joinRoom(r.live_session.id)}
                  className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2 min-w-[200px] shrink-0 hover:border-primary/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.neighborhood_emoji ?? "🌆"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black truncate">{r.neighborhood_name ?? r.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{r.city_display}</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-primary/70 italic truncate">{r.reason}</div>
                  {r.live_session && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" /> {r.live_session.listener_count + r.live_session.speaker_count}</span>
                      <span className="flex items-center gap-1 text-[9px] font-black text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nearby cities */}
        {activeSection === "discover" && nearby.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Nearby Cities · {nearby.length}
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {nearby.slice(0, 6).map(n => (
                <button
                  key={n.id}
                  onClick={() => { setCity(n.city_display); setCityInput(n.city_display); }}
                  className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-1 min-w-[180px] shrink-0 hover:border-primary/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{n.neighborhood_emoji ?? "🌆"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black truncate">{n.neighborhood_name ?? n.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{n.city_display}</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-muted-foreground">{n.distance_km.toFixed(0)} km away</div>
                  {n.live_session && (
                    <span className="flex items-center gap-1 text-[9px] font-black text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Following section */}
        {activeSection === "following" && (
          <div className="space-y-3">
            {followedLoading ? (
              <div className="text-center text-sm text-muted-foreground py-6">Loading…</div>
            ) : followedCircles.length === 0 ? (
              <div className="bg-card/50 border border-dashed border-border rounded-2xl p-6 text-center space-y-2">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <div className="text-sm font-bold text-muted-foreground">No followed circles yet</div>
                <div className="text-xs text-muted-foreground/60">Follow a circle and you'll get notified the moment it goes live.</div>
              </div>
            ) : (
              followedCircles.map((circle) => {
                const isFollowing = followingSet.has(circle.id);
                return (
                  <div key={circle.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">
                      {circle.neighborhood_emoji ?? "🌆"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm">{circle.neighborhood_name ?? `${circle.city_display} (city-wide)`}</div>
                      <div className="text-xs text-muted-foreground">{circle.city_display}</div>
                    </div>
                    <button
                      onClick={() => toggleFollow(circle)}
                      className={`p-2.5 rounded-xl border transition-colors shrink-0 ${
                        isFollowing
                          ? "border-primary/40 text-primary"
                          : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                      }`}
                      title={isFollowing ? "Unfollow" : "Follow"}
                    >
                      {isFollowing ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Discover section */}
        {activeSection === "discover" && (
        <>
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

                            {/* Topic tag */}
                  {live?.topic && (
                    <div className="mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        {live.topic}
                      </span>
                    </div>
                  )}
                  {/* Description */}
                  {live?.description && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                      {live.description}
                    </div>
                  )}

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
        </> // end discover section
        )}
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
