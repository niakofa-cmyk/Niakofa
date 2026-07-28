import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Hand, Video, VideoOff, Users, PhoneOff,
  Circle as CircleIcon, ChevronDown, Crown, Upload,
  VolumeX, UserMinus, Flag, Volume2, Ban, AlertTriangle,
  Signal, SignalHigh, SignalMedium, SignalLow, Share2,
  Shield, MoreVertical, ArrowLeft, MessageSquare, Settings,
  UserPlus, Send, X,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import type { WsEvent } from "@/lib/wsClient";
import {
  AudioCircleMesh,
  fetchIceServers,
  getAudioCircleMediaCapabilities,
  type AudioCircleMediaCapabilities,
  type RemoteStreamHandle,
} from "@/lib/audioCircleWebRTC";

// ── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  user_id: number;
  role: "host" | "co_host" | "speaker" | "listener";
  hand_raised: boolean;
  muted: boolean;
  name: string;
  avatar_url: string | null;
}

interface SessionInfo {
  id: number;
  circle_id: number;
  host_id: number;
  title: string;
  status: string;
  video_enabled: boolean;
  is_recording: boolean;
  max_speakers: number;
  topic?: string | null;
  description?: string | null;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "lost";

const REACTION_EMOJIS = ["👏", "❤️", "😂", "😮", "🤔", "🔥", "💯"];

interface ChatMessage {
  id: string;
  user_id: number;
  name: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

// ── Speaking volume analyser ─────────────────────────────────────────────────
// Accepts an optional shared AudioContext so callers can avoid hitting the
// browser's per-page AudioContext limit (typically 6–50 across all tabs).
// When a sharedCtx is provided the analyser is connected to it and the
// returned cleanup only disconnects the nodes — it does NOT close the context.
// When no sharedCtx is provided a private one is created and closed on cleanup.
function startVolumeAnalyser(
  stream: MediaStream,
  onLevel: (v: number) => void,
  sharedCtx?: AudioContext | null,
): () => void {
  let ctx: AudioContext | null = null;
  let ownsCtx = false;
  let animId = 0;
  let src: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    if (sharedCtx && sharedCtx.state !== "closed") {
      ctx = sharedCtx;
    } else {
      ctx = new AudioContext();
      ownsCtx = true;
    }
    src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser!.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      onLevel(Math.min(1, avg / 80));
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
  } catch {
    // AudioContext unavailable — fail silently
  }
  return () => {
    cancelAnimationFrame(animId);
    try { src?.disconnect(); } catch { /* ignore */ }
    if (ownsCtx) ctx?.close().catch(() => {});
  };
}

function mediaErrorMessage(error: unknown, device: "microphone" | "camera"): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Allow ${device} access in your browser settings, then try again.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `No ${device} was found on this device.`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `Your ${device} is already in use by another app.`;
  }
  return `Couldn't access your ${device}. Check browser permissions and try again.`;
}

// ── Recording timer ──────────────────────────────────────────────────────────
function useRecordingTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Host / Co-host hero broadcast tile ───────────────────────────────────────
interface HostHeroTileProps {
  participant: Participant;
  isMe: boolean;
  level: number;
  videoStream?: MediaStream | null;
  videoOn?: boolean;
  size?: "full" | "half";
  canMod?: boolean;
  modMenuOpen?: boolean;
  onOpenMod?: () => void;
  onMute?: () => void;
  onDemote?: () => void;
  onKick?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onAssignCohost?: () => void;
  onRemoveCohost?: () => void;
}

function HostHeroTile({
  participant: p, isMe, level, videoStream, videoOn, size = "full",
  canMod, modMenuOpen, onOpenMod, onMute, onDemote, onKick, onBlock, onReport,
  onAssignCohost, onRemoveCohost,
}: HostHeroTileProps) {
  const isSpeaking = level > 0.1;
  const hasVideo = videoStream && videoOn && videoStream.getVideoTracks().length > 0;
  const roleLabel = p.role === "host" ? "Host" : "Co-Host";
  const roleBg = p.role === "host" ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className={`relative ${size === "full" ? "w-full" : "flex-1"} rounded-2xl overflow-hidden`}>
      {/* Speaking ring */}
      {isSpeaking && (
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-primary z-10 pointer-events-none"
          animate={{ opacity: [0.9, 0.3, 0.9] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}

      {/* Video or avatar area */}
      <div className={`relative ${size === "full" ? "aspect-[4/3]" : "aspect-[4/3]"} bg-zinc-900`}>
        {hasVideo ? (
          <video
            autoPlay playsInline muted={isMe}
            ref={(el) => { if (el && el.srcObject !== videoStream) { el.srcObject = videoStream!; el.play().catch(() => {}); } }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className={`w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border-4 ${isSpeaking ? "border-primary" : p.role === "host" ? "border-amber-400/60" : "border-blue-400/60"}`}>
              {p.avatar_url
                ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" />
                : <span className="text-3xl font-black text-foreground">{p.name?.[0] ?? "?"}</span>}
            </div>
          </div>
        )}

        {/* Role badge top-left */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white ${roleBg}`}>
          {p.role === "host" ? <Crown className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
          {roleLabel}
        </div>

        {/* Mic icon top-right */}
        <div className="absolute top-2 right-2">
          {p.muted
            ? <div className="bg-red-500/80 rounded-full p-1"><MicOff className="w-3 h-3 text-white" /></div>
            : <div className="bg-black/50 rounded-full p-1"><Mic className="w-3 h-3 text-white" /></div>}
        </div>

        {/* Name / mod button overlay at bottom */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-center justify-between">
          <span className="text-white text-sm font-black truncate">{isMe ? "You" : p.name}</span>
          {canMod && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMod?.(); }}
              className="p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Moderation dropdown */}
      <AnimatePresence>
        {modMenuOpen && canMod && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-10 right-2 z-30 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]"
            onClick={e => e.stopPropagation()}
          >
            {onMute && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted" onClick={onMute}>
                {p.muted ? <><Mic className="w-3 h-3" /> Unmute</> : <><MicOff className="w-3 h-3" /> Mute</>}
              </button>
            )}
            {onDemote && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted" onClick={onDemote}>
                <UserMinus className="w-3 h-3" /> Move to Audience
              </button>
            )}
            {onAssignCohost && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400" onClick={onAssignCohost}>
                <Shield className="w-3 h-3" /> Make Co-host
              </button>
            )}
            {onRemoveCohost && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400" onClick={onRemoveCohost}>
                <Shield className="w-3 h-3" /> Remove Co-host
              </button>
            )}
            {onKick && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400" onClick={onKick}>
                <Flag className="w-3 h-3" /> Remove from Circle
              </button>
            )}
            {onBlock && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400" onClick={onBlock}>
                <Ban className="w-3 h-3" /> Block user
              </button>
            )}
            {onReport && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400" onClick={onReport}>
                <AlertTriangle className="w-3 h-3" /> Report user
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Audience avatar strip with +N overflow ────────────────────────────────────
const AUDIENCE_STRIP_MAX = 7;
function AudienceStrip({ audience, canMod, onPromote }: {
  audience: Participant[];
  canMod: boolean;
  onPromote: (userId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? audience : audience.slice(0, AUDIENCE_STRIP_MAX);
  const overflow = audience.length - AUDIENCE_STRIP_MAX;

  if (audience.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
        Audience ({audience.length})
      </div>
      <div className="flex items-start flex-wrap gap-3">
        {visible.map(l => (
          <div key={l.user_id} className="flex flex-col items-center gap-1">
            <div className="relative">
              <div className={`w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${l.hand_raised ? "border-amber-400" : "border-transparent"}`}>
                {l.avatar_url
                  ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" />
                  : <span className="text-sm font-black">{l.name?.[0] ?? "?"}</span>}
              </div>
              {l.hand_raised && (
                <span className="absolute -top-1 -right-1 text-sm leading-none">✋</span>
              )}
            </div>
            <span className="text-[9px] truncate max-w-[48px] text-center text-muted-foreground">{l.name}</span>
            {canMod && l.hand_raised && (
              <button onClick={() => onPromote(l.user_id)} className="text-[9px] text-primary font-bold hover:underline">bring up</button>
            )}
          </div>
        ))}
        {!showAll && overflow > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-muted/80 border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-xs font-black text-muted-foreground">+{overflow}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">More</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Connection quality indicator ─────────────────────────────────────────────
function ConnectionQualityIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    connected:    { icon: SignalHigh,   color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  label: "Connected" },
    reconnecting: { icon: SignalMedium, color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  label: "Reconnecting…" },
    lost:         { icon: SignalLow,    color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    label: "Connection lost" },
    connecting:   { icon: Signal,       color: "text-muted-foreground", bg: "bg-muted", border: "border-border", label: "Connecting…" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${config.bg} ${config.border} border ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AudioCircleRoomScreen() {
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id ?? "", 10);
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  // ── State ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [meshReady, setMeshReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [mediaCapabilities, setMediaCapabilities] = useState<AudioCircleMediaCapabilities | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<Map<number, number>>(new Map());
  const [localLevel, setLocalLevel] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [modMenuOpen, setModMenuOpen] = useState<number | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [preJoinChecked, setPreJoinChecked] = useState(false);
  const [preJoinMicReady, setPreJoinMicReady] = useState(false);
  const [preJoinCameraReady, setPreJoinCameraReady] = useState(false);

  // Room / Chat tabs + management panel (Raised Hands / Room Controls / Host Controls)
  const [activeTab, setActiveTab] = useState<"room" | "chat">("room");
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"people" | "reactions">("people");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reactionLog, setReactionLog] = useState<{ id: string; emoji: string; name: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const meshRef = useRef<AudioCircleMesh | null>(null);
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const isRecordingRef = useRef(false);
  const analyserCleanupsRef = useRef<Map<string, () => void>>(new Map());
  const signalHandlerRef = useRef<((e: WsEvent) => void) | null>(null);
  // One shared AudioContext for ALL volume analysers in this session — avoids
  // hitting the browser's per-page AudioContext limit (Chrome: ~6 historically).
  const sharedAudioCtxRef = useRef<AudioContext | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const myUserId = currentUser?.id;
  const me = participants.find(p => p.user_id === myUserId);
  const isHost = session?.host_id === myUserId;
  const isCohost = me?.role === "co_host";
  const canSpeak = me?.role === "host" || me?.role === "co_host" || me?.role === "speaker";
  const canMod = isHost || isCohost;
  const host = participants.find(p => p.role === "host");
  const cohosts = participants.filter(p => p.role === "co_host");
  const speakers = participants.filter(p => p.role === "speaker");
  const audience = participants.filter(p => p.role === "listener");

  useEffect(() => { setMediaCapabilities(getAudioCircleMediaCapabilities()); }, []);

  const recordingTimer = useRecordingTimer(!!session?.is_recording);

  // ── Connection status ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && session) setConnectionStatus("connected");
  }, [loading, session]);

  // Timeout: if still "connecting" after 12 s (WebSocket never established),
  // flip to "lost" so the UI shows a recoverable error instead of a spinner.
  useEffect(() => {
    if (connectionStatus !== "connecting") return;
    const id = setTimeout(() => {
      setConnectionStatus(prev => prev === "connecting" ? "lost" : prev);
    }, 12000);
    return () => clearTimeout(id);
  }, [connectionStatus]);

  const resync = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setParticipants(data.participants ?? []);
      setConnectionStatus("connected");
    } catch {
      // Next reconnect will retry
    }
  }, [base, sessionId]);

  useWebSocket("ws_reconnected", () => { void resync(); });

  // ── Load initial state + chat history ─────────────────────────────────────
  useEffect(() => {
    if (isNaN(sessionId)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Session info + join in sequence (join needs the session to exist)
        const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}`, { headers: authHeaders() });
        if (!res.ok) {
          if (!cancelled) toast({ title: "Circle not found", description: "This room may have ended.", variant: "destructive" });
          setLocation("/audio-circles");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.session.status !== "live") {
          toast({ title: "This circle has ended" });
          setLocation("/audio-circles");
          return;
        }
        setSession(data.session);

        // Join + chat history in parallel — both are independent of each other
        const [joinRes, historyRes] = await Promise.all([
          fetch(`${base}/api/audio-circle-sessions/${sessionId}/join`, {
            method: "POST", headers: authHeaders(),
          }),
          fetch(`${base}/api/audio-circle-sessions/${sessionId}/chat`, { headers: authHeaders() }),
        ]);

        if (!cancelled) {
          if (joinRes.ok) {
            const joinData = await joinRes.json();
            setParticipants(joinData.participants ?? []);
          }
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            // Seed state with persisted history; WS handler deduplicates by id
            setChatMessages(historyData.messages ?? []);
          }
        }
      } catch {
        if (!cancelled) toast({ title: "Couldn't load the circle", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, base, setLocation]);

  // ── WebRTC mesh setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !myUserId) return;
    let cancelled = false;
    (async () => {
      const iceServers = await fetchIceServers(authHeaders, base);
      if (cancelled) return;
      const mesh = new AudioCircleMesh({
        sessionId,
        selfUserId: myUserId,
        videoEnabled: session.video_enabled,
        iceServers,
        onRemoteStream: (handle: RemoteStreamHandle) => {
          setRemoteStreams(prev => new Map(prev).set(handle.userId, handle.stream));
        },
        onRemoteStreamEnded: (userId: number) => {
          setRemoteStreams(prev => { const next = new Map(prev); next.delete(userId); return next; });
          setSpeakingLevels(prev => { const next = new Map(prev); next.delete(userId); return next; });
          const cleanup = analyserCleanupsRef.current.get(`remote:${userId}`);
          if (cleanup) { cleanup(); analyserCleanupsRef.current.delete(`remote:${userId}`); }
        },
        subscribeToCircleSignal: (handler) => {
          const unsub = subscribeRaw("circle_signal", handler);
          return unsub;
        },
      });
      meshRef.current = mesh;
      setMeshReady(true);
    })();
    return () => {
      cancelled = true;
      meshRef.current?.destroy();
      meshRef.current = null;
      setMeshReady(false);
      for (const cleanup of analyserCleanupsRef.current.values()) cleanup();
      analyserCleanupsRef.current.clear();
      // Close the shared AudioContext when the session ends
      sharedAudioCtxRef.current?.close().catch(() => {});
      sharedAudioCtxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, myUserId]);

  function subscribeRaw(type: string, handler: (e: WsEvent) => void): () => void {
    signalHandlerRef.current = handler;
    return () => { signalHandlerRef.current = null; };
  }
  useWebSocket("circle_signal", (e) => signalHandlerRef.current?.(e));

  // Lazily create the shared AudioContext for all volume analysers in this session.
  // Must be done inside a user-gesture-adjacent path or after first interaction;
  // browsers may auto-suspend it but that just means level readings pause — no crash.
  const getSharedAudioCtx = (): AudioContext | null => {
    if (!sharedAudioCtxRef.current || sharedAudioCtxRef.current.state === "closed") {
      try { sharedAudioCtxRef.current = new AudioContext(); } catch { return null; }
    }
    if (sharedAudioCtxRef.current.state === "suspended") {
      sharedAudioCtxRef.current.resume().catch(() => {});
    }
    return sharedAudioCtxRef.current;
  };

  // Wire volume analysers for remote streams (reusing shared AudioContext)
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const key = `remote:${userId}`;
      if (analyserCleanupsRef.current.has(key)) continue;
      const cleanup = startVolumeAnalyser(stream, (level) => {
        setSpeakingLevels(prev => new Map(prev).set(userId, level));
      }, getSharedAudioCtx());
      analyserCleanupsRef.current.set(key, cleanup);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStreams]);

  // Connect mesh to peers
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !myUserId) return;
    if (canSpeak) {
      for (const p of participants) {
        if (p.user_id !== myUserId) mesh.connectToPeer(p.user_id);
      }
    } else {
      const stageUsers = participants.filter(p => p.role === "host" || p.role === "speaker" || p.role === "co_host");
      for (const s of stageUsers) {
        if (s.user_id !== myUserId) mesh.connectToPeer(s.user_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.map(p => p.user_id).join(","), myUserId, canSpeak]);

  // Publish mic when promoted to speaker
  useEffect(() => {
    if (!meshRef.current) return;
    if (!canSpeak) {
      meshRef.current.stopLocalMedia();
      setLocalStream(null);
      setMicOn(false);
      setVideoOn(false);
      const cleanup = analyserCleanupsRef.current.get("local");
      if (cleanup) { cleanup(); analyserCleanupsRef.current.delete("local"); }
      return;
    }
    const startMuted = me?.muted ?? false;
    meshRef.current.publishLocalMedia({ video: !!session?.video_enabled && videoOn })
      .then((stream) => {
        setMediaError(null);
        if (startMuted) {
          meshRef.current?.setMicEnabled(false);
          setMicOn(false);
        } else {
          setMicOn(true);
        }
        setLocalStream(stream);
        const key = "local";
        const existing = analyserCleanupsRef.current.get(key);
        if (existing) existing();
        const cleanup = startVolumeAnalyser(stream, setLocalLevel, getSharedAudioCtx());
        analyserCleanupsRef.current.set(key, cleanup);
      })
      .catch((error) => {
        setMicOn(false);
        setMediaError(mediaErrorMessage(error, "microphone"));
        toast({ title: "Microphone unavailable", description: mediaErrorMessage(error, "microphone"), variant: "destructive" });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak]);

  // Remote audio element lifecycle
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const hasVideo = stream.getVideoTracks().length > 0;
      if (hasVideo) {
        const staleAudio = audioElsRef.current.get(userId);
        if (staleAudio) {
          staleAudio.pause();
          staleAudio.srcObject = null;
          audioElsRef.current.delete(userId);
        }
      } else {
        let el = audioElsRef.current.get(userId);
        if (!el) {
          el = new Audio();
          el.autoplay = true;
          audioElsRef.current.set(userId, el);
        }
        if (el.srcObject !== stream) el.srcObject = stream;
      }
    }
    for (const [userId] of Array.from(audioElsRef.current)) {
      if (!remoteStreams.has(userId)) {
        const el = audioElsRef.current.get(userId);
        if (el) { el.pause(); el.srcObject = null; }
        audioElsRef.current.delete(userId);
      }
    }
  }, [remoteStreams]);

  // ── Upload recording blob ────────────────────────────────────────────────
  const uploadRecording = useCallback(async (blob: Blob) => {
    if (!isHost) return;
    setUploading(true);
    try {
      const token = getToken();
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}/recording-upload`, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: blob,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Recording upload failed", description: err.error ?? "Check your connection.", variant: "destructive" });
      } else {
        toast({ title: "Recording saved", description: "The circle recording is now available in past recordings." });
      }
    } catch {
      toast({ title: "Recording upload failed", description: "Check your connection.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [base, sessionId, isHost]);

  // ── Leave / cleanup ────────────────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    if (isNaN(sessionId)) return;
    const url = `${base}/api/audio-circle-sessions/${sessionId}/leave`;
    const token = getToken();
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch(() => {});
  }, [sessionId, base]);

  useEffect(() => {
    const handler = () => leaveRoom();
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      leaveRoom();
    };
  }, [leaveRoom]);

  // ── Realtime room events ───────────────────────────────────────────────────
  useWebSocket("circle_participant_joined", (e) => {
    const p = e.payload as { session_id: number; user_id: number; name?: string; avatar_url?: string | null; role?: string };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.some(x => x.user_id === p.user_id) ? prev : [
      ...prev,
      { user_id: p.user_id, role: (p.role as Participant["role"]) ?? "listener", hand_raised: false, muted: false, name: p.name ?? "Someone", avatar_url: p.avatar_url ?? null },
    ]);
  });

  useWebSocket("circle_participant_left", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.filter(x => x.user_id !== p.user_id));
    meshRef.current?.disconnectFromPeer(p.user_id);
  });

  useWebSocket("circle_hand_raised", (e) => {
    const p = e.payload as { session_id: number; user_id: number; raised: boolean };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, hand_raised: p.raised } : x));
  });

  useWebSocket("circle_role_changed", (e) => {
    const p = e.payload as { session_id: number; user_id: number; role: Participant["role"] };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, role: p.role, hand_raised: false } : x));
    if (p.user_id !== myUserId && p.role === "listener") meshRef.current?.disconnectFromPeer(p.user_id);
  });

  useWebSocket("circle_cohost_assigned", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, role: "co_host" as const, hand_raised: false } : x));
    if (p.user_id === myUserId) toast({ title: "You are now a co-host", description: "You can promote, demote, mute, and remove participants." });
  });

  useWebSocket("circle_cohost_removed", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, role: "listener" as const } : x));
    if (p.user_id === myUserId) toast({ title: "You are no longer a co-host" });
  });

  useWebSocket("circle_muted", (e) => {
    const p = e.payload as { session_id: number; user_id: number | null; muted: boolean; all?: boolean };
    if (p.session_id !== sessionId) return;
    if (p.all) {
      setParticipants(prev => prev.map(x => x.role === "speaker" ? { ...x, muted: true } : x));
      if (me?.role === "speaker") {
        setMicOn(false);
        meshRef.current?.setMicEnabled(false);
        toast({ title: "The host muted everyone" });
      }
    } else if (p.user_id !== null) {
      setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, muted: p.muted } : x));
      if (p.user_id === myUserId) {
        setMicOn(!p.muted);
        meshRef.current?.setMicEnabled(!p.muted);
        toast({ title: p.muted ? "The host muted you" : "The host unmuted you" });
      }
    }
  });

  useWebSocket("circle_kicked", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    if (p.user_id === myUserId) {
      toast({ title: "You were removed from this circle", variant: "destructive" });
      setLocation("/audio-circles");
      return;
    }
    setParticipants(prev => prev.filter(x => x.user_id !== p.user_id));
    meshRef.current?.disconnectFromPeer(p.user_id);
  });

  useWebSocket("circle_reaction", (e) => {
    const p = e.payload as { session_id: number; emoji: string; user_id?: number };
    if (p.session_id !== sessionId) return;
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions(prev => [...prev, { id, emoji: p.emoji }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2000);
    const senderName = participants.find(x => x.user_id === p.user_id)?.name ?? "Someone";
    setReactionLog(prev => [...prev.slice(-19), { id, emoji: p.emoji, name: senderName }]);
  });

  useWebSocket("circle_chat_message", (e) => {
    const p = e.payload as ChatMessage & { session_id: number };
    if (p.session_id !== sessionId) return;
    // Deduplicate by id — prevents double-append when history was already
    // loaded on mount (the sender receives the WS event AND may have fetched
    // history that includes the same message if they reconnected quickly).
    setChatMessages(prev => {
      if (prev.some(m => m.id === p.id)) return prev;
      return [...prev, { id: p.id, user_id: p.user_id, name: p.name, avatar_url: p.avatar_url, body: p.body, created_at: p.created_at }];
    });
  });

  useWebSocket("circle_hands_lowered", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => ({ ...x, hand_raised: false })));
  });

  useWebSocket("circle_recording_changed", (e) => {
    const p = e.payload as { session_id: number; is_recording: boolean };
    if (p.session_id !== sessionId) return;
    const wasRecording = isRecordingRef.current;
    isRecordingRef.current = p.is_recording;
    setSession(prev => prev ? { ...prev, is_recording: p.is_recording } : prev);
    if (isHost) {
      if (p.is_recording && !wasRecording) {
        meshRef.current?.startRecording();
      } else if (!p.is_recording && wasRecording) {
        meshRef.current?.stopRecording().then((blob) => {
          if (blob && blob.size > 0) uploadRecording(blob);
        });
      }
    }
  });

  useEffect(() => {
    if (!isHost || !session?.is_recording || !meshRef.current || isRecordingRef.current) return;
    isRecordingRef.current = true;
    try {
      meshRef.current.startRecording();
    } catch {
      isRecordingRef.current = false;
    }
  }, [isHost, session?.is_recording, session?.id, meshReady]);

  useWebSocket("circle_recording_available", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    if (!isHost) toast({ title: "Recording available", description: "Check Past Recordings." });
  });

  useWebSocket("circle_session_ended", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    toast({ title: "The host ended this circle" });
    setLocation("/audio-circles");
  });

  useWebSocket("circle_host_disconnected", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    setConnectionStatus("reconnecting");
    toast({ title: "Host reconnecting…", description: "The circle is still open — hang tight." });
  });

  useWebSocket("circle_host_reconnected", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    setConnectionStatus("connected");
    toast({ title: "Host is back" });
  });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const post = async (path: string, body?: object) => {
    try {
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Action failed", description: data.error ?? "Try again.", variant: "destructive" });
      }
      return res.ok;
    } catch {
      toast({
        title: "Connection issue",
        description: "Couldn't reach the server — check your connection and try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const toggleHand = async () => {
    const raised = !me?.hand_raised;
    if (await post("/hand", { raised })) {
      setParticipants(prev => prev.map(x => x.user_id === myUserId ? { ...x, hand_raised: raised } : x));
    }
  };
  const promote = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/promote", { user_id: userId })) {
      setParticipants(prev => prev.map(x => x.user_id === userId
        ? { ...x, role: "speaker" as const, hand_raised: false }
        : x));
    }
  };
  const assignCohost = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/assign-cohost", { user_id: userId })) {
      setParticipants(prev => prev.map(x => x.user_id === userId
        ? { ...x, role: "co_host" as const, hand_raised: false }
        : x));
      toast({ title: "Co-host assigned" });
    }
  };
  const removeCohost = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/remove-cohost", { user_id: userId })) {
      setParticipants(prev => prev.map(x => x.user_id === userId
        ? { ...x, role: "listener" as const }
        : x));
      toast({ title: "Co-host removed" });
    }
  };
  const demote = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/demote", { user_id: userId })) {
      setParticipants(prev => prev.map(x => x.user_id === userId
        ? { ...x, role: "listener" as const, hand_raised: false }
        : x));
    }
  };
  const muteUser = async (userId: number, muted: boolean) => {
    setModMenuOpen(null);
    if (await post("/mute", { user_id: userId, muted })) {
      setParticipants(prev => prev.map(x => x.user_id === userId ? { ...x, muted } : x));
    }
  };
  const muteAll = async () => {
    if (await post("/mute-all")) {
      setParticipants(prev => prev.map(x => x.role === "speaker" ? { ...x, muted: true } : x));
    }
  };
  const kickUser = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/kick", { user_id: userId })) {
      setParticipants(prev => prev.filter(x => x.user_id !== userId));
    }
  };
  const blockUser = async (userId: number) => {
    setShowBlockConfirm(null);
    if (await post("/block", { user_id: userId })) {
      setParticipants(prev => prev.filter(x => x.user_id !== userId));
      toast({ title: "User blocked", description: "They have been removed from this circle and blocked from rejoining." });
    }
  };
  const reportUser = async (userId: number) => {
    if (!reportReason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }
    setShowReportModal(null);
    if (await post("/report", { user_id: userId, reason: reportReason })) {
      toast({ title: "Report submitted", description: "Thank you for helping keep our community safe." });
      setReportReason("");
    }
  };
  const react = (emoji: string) => post("/react", { emoji });

  const sendChat = async () => {
    const body = chatInput.trim();
    if (!body) return;
    setChatInput("");
    await post("/chat", { body });
  };

  const lowerAllHands = async () => {
    if (await post("/lower-all-hands")) {
      setParticipants(prev => prev.map(x => ({ ...x, hand_raised: false })));
    }
  };

  const shareCircle = () => {
    const url = `${window.location.origin}/audio-circle/${sessionId}`;
    if (navigator.share) {
      navigator.share({ title: session?.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Link copied!", description: "Share it with your neighbors." });
      }).catch(() => {});
    }
  };

  const endSession = async () => {
    if (isRecordingRef.current) await toggleRecording();
    await post("/end");
    setLocation("/audio-circles");
  };

  const leaveAndExit = async () => {
    if (isHost && isRecordingRef.current) await toggleRecording();
    leaveRoom();
    setLocation("/audio-circles");
  };

  const toggleMic = () => {
    const next = !micOn;
    if (next && me?.muted) {
      toast({ title: "Microphone muted by host", description: "The host must unmute you before you can speak." });
      return;
    }
    if (!next) {
      meshRef.current?.setMicEnabled(false);
      setMicOn(false);
      return;
    }
    if (localStream?.getAudioTracks().length) {
      meshRef.current?.setMicEnabled(true);
      setMicOn(true);
      return;
    }
    meshRef.current?.publishLocalMedia({ video: !!session?.video_enabled && videoOn })
      .then((stream) => {
        setLocalStream(stream);
        setMicOn(true);
        setMediaError(null);
        const existing = analyserCleanupsRef.current.get("local");
        if (existing) existing();
        analyserCleanupsRef.current.set("local", startVolumeAnalyser(stream, setLocalLevel, getSharedAudioCtx()));
      })
      .catch((error) => {
        setMicOn(false);
        setMediaError(mediaErrorMessage(error, "microphone"));
        toast({ title: "Microphone unavailable", description: mediaErrorMessage(error, "microphone"), variant: "destructive" });
      });
  };

  const toggleVideo = async () => {
    if (!meshRef.current || !session?.video_enabled) return;
    const next = !videoOn;
    if (next) {
      try {
        const stream = await meshRef.current.addVideoTrack();
        setLocalStream(stream);
        setVideoOn(true);
        setMediaError(null);
      } catch (error) {
        const description = mediaErrorMessage(error, "camera");
        setMediaError(description);
        toast({ title: "Camera unavailable", description, variant: "destructive" });
      }
    } else {
      meshRef.current.stopVideoTracks();
      setLocalStream(prev => {
        if (!prev) return prev;
        const audioTracks = prev.getAudioTracks();
        return audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
      });
      setVideoOn(false);
    }
  };

  const toggleRecording = async () => {
    const next = !isRecordingRef.current;
    if (next) {
      if (mediaCapabilities?.recording === false) {
        toast({
          title: "Recording is not supported",
          description: "Use a current Safari, Chrome, or Firefox browser to record this Circle.",
          variant: "destructive",
        });
        return;
      }
      isRecordingRef.current = true;
      setSession(prev => prev ? { ...prev, is_recording: true } : prev);
      try {
        meshRef.current?.startRecording();
      } catch {
        isRecordingRef.current = false;
        setSession(prev => prev ? { ...prev, is_recording: false } : prev);
        toast({ title: "Couldn't start recording", variant: "destructive" });
        return;
      }
      const ok = await post("/recording", { is_recording: true });
      if (!ok) {
        isRecordingRef.current = false;
        setSession(prev => prev ? { ...prev, is_recording: false } : prev);
        await meshRef.current?.stopRecording();
      }
      return;
    }
    isRecordingRef.current = false;
    setSession(prev => prev ? { ...prev, is_recording: false } : prev);
    const ok = await post("/recording", { is_recording: false });
    if (!ok) {
      isRecordingRef.current = true;
      setSession(prev => prev ? { ...prev, is_recording: true } : prev);
      return;
    }
    const blob = await meshRef.current?.stopRecording();
    if (blob && blob.size > 0) await uploadRecording(blob);
  };

  // ── Pre-join device check ──────────────────────────────────────────────────
  // IMPORTANT: setPreJoinChecked(true) must be called first so the effect
  // guard prevents this from re-running on every re-render.
  const checkPreJoinDevices = async () => {
    setPreJoinChecked(true); // guard must be set before the async ops
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPreJoinMicReady(true);
    } catch {
      setPreJoinMicReady(false);
    }
    if (session?.video_enabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        setPreJoinCameraReady(true);
      } catch {
        setPreJoinCameraReady(false);
      }
    }
  };

  useEffect(() => {
    if (!loading && session && !preJoinChecked) {
      void checkPreJoinDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.id, preJoinChecked]);

  useEffect(() => {
    if (activeTab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeTab]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !session) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading circle…</div>;
  }


  return (
    <div className="min-h-screen bg-background pb-40 relative overflow-hidden" onClick={() => { setModMenuOpen(null); setShowBlockConfirm(null); }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <button
          onClick={leaveAndExit}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-2 lg:hidden"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Circles
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-black text-sm truncate">{session.title}</div>
              {session.topic && (
                <div className="text-[10px] font-bold text-primary/80 truncate">{session.topic}</div>
              )}
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-bold text-green-400">LIVE</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {participants.length} in room</span>
                <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> {speakers.length + cohosts.length + (host ? 1 : 0)} on stage</span>
                <ConnectionQualityIndicator status={connectionStatus} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={shareCircle} className="p-2 rounded-full hover:bg-muted" title="Share this Circle">
              <Share2 className="w-4 h-4" />
            </button>
            {canMod && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowManagePanel(true); }}
                className="p-2 rounded-full hover:bg-muted"
                title="Manage circle"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}
            <button onClick={leaveAndExit} className="p-2 rounded-full hover:bg-muted hidden lg:inline-flex" title="Back to Circles">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Room / Chat tabs */}
        <div className="mt-3 flex items-center gap-6 border-b border-border -mb-3">
          <button
            onClick={() => setActiveTab("room")}
            className={`pb-2 text-sm font-bold border-b-2 transition-colors ${activeTab === "room" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Room
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`pb-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "chat" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </button>
        </div>

        {/* Recording bar */}
        {session.is_recording && (
          <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-1.5">
            <CircleIcon className="w-3 h-3 text-red-500 fill-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-400 font-bold flex-1">This Circle is being recorded</span>
            {isHost && <span className="text-xs text-red-400 font-mono">{recordingTimer}</span>}
            {uploading && <Upload className="w-3 h-3 text-amber-400 animate-bounce" />}
          </div>
        )}

        {/* Media status warning */}
        {mediaCapabilities && (!mediaCapabilities.microphone || !mediaCapabilities.recording || mediaError) && (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <div className="font-bold">Media status</div>
            <div className="mt-0.5 text-amber-200/80">
              {!mediaCapabilities.microphone && "This browser cannot access a microphone. "}
              {!mediaCapabilities.recording && "Recording is unavailable in this browser. "}
              {mediaError}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating reactions ──────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-48 flex justify-center z-20">
        <AnimatePresence>
          {floatingReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -80 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8 }}
              className="absolute text-3xl"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── End confirmation overlay ────────────────────────────────────────── */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={(e) => { e.stopPropagation(); setShowEndConfirm(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-base font-black">End this Circle?</div>
              <div className="text-sm text-muted-foreground">This will end the Circle for everyone in the room.</div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => { setShowEndConfirm(false); endSession(); }}>End Circle</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Block confirmation overlay ──────────────────────────────────────── */}
      <AnimatePresence>
        {showBlockConfirm !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={(e) => { e.stopPropagation(); setShowBlockConfirm(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-base font-black text-red-400">
                <Ban className="w-5 h-5" /> Block this user?
              </div>
              <div className="text-sm text-muted-foreground">
                They will be removed from this Circle and blocked from rejoining any of your future Circles.
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowBlockConfirm(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => blockUser(showBlockConfirm!)}>Block</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Report modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showReportModal !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={(e) => { e.stopPropagation(); setShowReportModal(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-base font-black text-amber-400">
                <AlertTriangle className="w-5 h-5" /> Report user
              </div>
              <div className="text-sm text-muted-foreground">
                Please describe why you're reporting this user. This helps us keep the community safe.
              </div>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm min-h-[80px] resize-none focus:outline-none focus:border-primary"
              />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowReportModal(null); setReportReason(""); }}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => reportUser(showReportModal!)}>Submit Report</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:flex lg:items-start lg:gap-4 lg:px-4 lg:pt-4">

        {/* ── Desktop-only left sidebar: People / Reactions ────────────────────── */}
        <div className="hidden lg:block lg:w-64 shrink-0 sticky top-24">
          <div className="bg-card border border-border rounded-2xl p-3">
            <div className="flex items-center gap-4 border-b border-border mb-3">
              <button
                onClick={() => setSidebarTab("people")}
                className={`pb-2 text-xs font-bold border-b-2 ${sidebarTab === "people" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                People
              </button>
              <button
                onClick={() => setSidebarTab("reactions")}
                className={`pb-2 text-xs font-bold border-b-2 ${sidebarTab === "reactions" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                Reactions
              </button>
            </div>
            {sidebarTab === "people" ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                    On Stage ({(host ? 1 : 0) + cohosts.length + speakers.length})
                  </div>
                  <div className="space-y-1.5">
                    {[...(host ? [host] : []), ...cohosts, ...speakers].map(p => (
                      <div key={p.user_id} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-muted/50">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                          {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : (p.name?.[0] ?? "?")}
                        </div>
                        <span className="flex-1 text-xs font-bold truncate">{p.user_id === myUserId ? "You" : p.name}</span>
                        {p.muted ? <MicOff className="w-3 h-3 text-red-400 shrink-0" /> : <Mic className="w-3 h-3 text-green-400 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                    Audience ({audience.length})
                  </div>
                  <div className="space-y-1.5">
                    {audience.map(p => (
                      <div key={p.user_id} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-muted/50">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                          {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : (p.name?.[0] ?? "?")}
                        </div>
                        <span className="flex-1 text-xs font-bold truncate">{p.name}</span>
                        {p.hand_raised && <Hand className="w-3 h-3 text-amber-400 shrink-0" />}
                        <MicOff className="w-3 h-3 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {reactionLog.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No reactions yet</div>
                ) : (
                  [...reactionLog].reverse().map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="text-base leading-none">{r.emoji}</span>
                      <span className="font-bold truncate">{r.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Room or Chat content ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
        {activeTab === "chat" ? (
          <div className="p-4 lg:p-0 flex flex-col" style={{ minHeight: "50vh" }}>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[60vh]">
              {chatMessages.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">No messages yet — say hello 👋</div>
              ) : (
                chatMessages.map(m => (
                  <div key={m.id} className={`flex items-start gap-2 ${m.user_id === myUserId ? "flex-row-reverse" : ""}`}>
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                      {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : (m.name?.[0] ?? "?")}
                    </div>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.user_id === myUserId ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {m.user_id !== myUserId && <div className="text-[10px] font-black mb-0.5 opacity-70">{m.name}</div>}
                      {m.body}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                placeholder="Message the room…"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-full text-sm focus:outline-none focus:border-primary"
              />
              <Button size="icon" onClick={sendChat} disabled={!chatInput.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
        <div className="p-4 space-y-5 lg:p-0">

        {/* Video is now embedded in the hero tiles (host/co-host) and speaker tiles — no separate grid */}

        {/* ── Stage: HOST hero tile ───────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Host</div>
          {host ? (
            <HostHeroTile
              participant={host}
              isMe={host.user_id === myUserId}
              level={host.user_id === myUserId ? localLevel : (speakingLevels.get(host.user_id) ?? 0)}
              videoStream={host.user_id === myUserId ? localStream : (remoteStreams.get(host.user_id) ?? null)}
              videoOn={host.user_id === myUserId ? videoOn : (remoteStreams.get(host.user_id)?.getVideoTracks().length ?? 0) > 0}
              size="full"
              canMod={false}
            />
          ) : (
            <div className="text-xs text-muted-foreground py-3">Host has left — hanging tight…</div>
          )}
        </div>

        {/* ── Stage: CO-HOST hero tiles ────────────────────────────────────────── */}
        {cohosts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3 h-3 text-blue-400" />
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                Co-Host{cohosts.length > 1 ? "s" : ""} ({cohosts.length})
              </div>
            </div>
            <div className={`flex gap-2 ${cohosts.length === 1 ? "" : "flex-wrap"}`} onClick={e => e.stopPropagation()}>
              {cohosts.map(c => (
                <HostHeroTile
                  key={c.user_id}
                  participant={c}
                  isMe={c.user_id === myUserId}
                  level={c.user_id === myUserId ? localLevel : (speakingLevels.get(c.user_id) ?? 0)}
                  videoStream={c.user_id === myUserId ? localStream : (remoteStreams.get(c.user_id) ?? null)}
                  videoOn={c.user_id === myUserId ? videoOn : (remoteStreams.get(c.user_id)?.getVideoTracks().length ?? 0) > 0}
                  size="half"
                  canMod={canMod && c.user_id !== myUserId}
                  modMenuOpen={modMenuOpen === c.user_id}
                  onOpenMod={() => setModMenuOpen(prev => prev === c.user_id ? null : c.user_id)}
                  onMute={() => muteUser(c.user_id, !c.muted)}
                  onDemote={() => demote(c.user_id)}
                  onKick={() => kickUser(c.user_id)}
                  onBlock={() => setShowBlockConfirm(c.user_id)}
                  onReport={() => setShowReportModal(c.user_id)}
                  onRemoveCohost={isHost ? () => removeCohost(c.user_id) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Stage: SPEAKERS ─────────────────────────────────────────────────── */}
        {(speakers.length > 0 || canMod) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Speakers ({speakers.length})
              </div>
              {canMod && speakers.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); muteAll(); }}
                  className="text-[10px] font-bold text-amber-400 flex items-center gap-1 hover:opacity-70"
                >
                  <VolumeX className="w-3 h-3" /> Mute all
                </button>
              )}
            </div>
            {speakers.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 italic">No speakers yet — bring up a hand-raiser above</div>
            ) : (
              <div className="grid grid-cols-4 gap-3" onClick={e => e.stopPropagation()}>
                {speakers.map(s => (
                  <SpeakerTile
                    key={s.user_id}
                    participant={s}
                    isMe={s.user_id === myUserId}
                    level={s.user_id === myUserId ? localLevel : (speakingLevels.get(s.user_id) ?? 0)}
                    isHost={isHost}
                    canMod={canMod && s.user_id !== myUserId}
                    modMenuOpen={modMenuOpen === s.user_id}
                    onOpenMod={() => setModMenuOpen(prev => prev === s.user_id ? null : s.user_id)}
                    onMute={() => muteUser(s.user_id, !s.muted)}
                    onDemote={() => demote(s.user_id)}
                    onKick={() => kickUser(s.user_id)}
                    onBlock={() => setShowBlockConfirm(s.user_id)}
                    onReport={() => setShowReportModal(s.user_id)}
                    onAssignCohost={isHost ? () => assignCohost(s.user_id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Raised hands (host-only) — ordered queue ───────────────────────── */}
        {canMod && audience.some(l => l.hand_raised) && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                ✋ Raised Hands ({audience.filter(l => l.hand_raised).length})
              </div>
              <span className="text-[10px] text-amber-400/70">Tap "Bring up" in order</span>
            </div>
            {audience.filter(l => l.hand_raised).map((l, idx) => (
              <div key={l.user_id} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-amber-400">{idx + 1}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-black overflow-hidden shrink-0">
                  {l.avatar_url ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" /> : l.name?.[0] ?? "?"}
                </div>
                <span className="flex-1 text-sm font-bold truncate">{l.name}</span>
                <div className="flex gap-1.5">
                  {isHost && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-400 border-blue-400/40" onClick={() => assignCohost(l.user_id)}>
                      <Shield className="w-3 h-3" /> Co-host
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-xs px-2" onClick={() => promote(l.user_id)}>Bring up</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => post("/hand", { raised: false, user_id: l.user_id })}>Dismiss</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Audience strip with overflow ─────────────────────────────────────── */}
        <AudienceStrip audience={audience} canMod={canMod} onPromote={promote} />
        </div>
        )}
        </div>

        {/* ── Desktop-only right sidebar: Raised Hands / Room Controls / Host Controls ── */}
        {canMod && (
          <div className="hidden lg:block lg:w-72 shrink-0 sticky top-24">
            <ManagementPanelBody
              audience={audience}
              isHost={isHost}
              session={session}
              onPromote={promote}
              onAssignCohost={assignCohost}
              onDismissHand={(userId) => post("/hand", { raised: false, user_id: userId })}
              onMuteAll={muteAll}
              onLowerAll={lowerAllHands}
              onShare={shareCircle}
              onToggleRecording={toggleRecording}
              recordingOn={!!session.is_recording}
              recordingDisabled={uploading || mediaCapabilities?.recording === false}
              onEndCircle={() => setShowEndConfirm(true)}
              speakerCount={(host ? 1 : 0) + cohosts.length + speakers.length}
              onlineParticipants={participants}
              myUserId={myUserId}
              onMuteUser={muteUser}
              onDemoteUser={demote}
              onKickUser={kickUser}
              onBlockUser={(userId) => setShowBlockConfirm(userId)}
              onReportUser={(userId) => setShowReportModal(userId)}
              onAssignCohostUser={assignCohost}
            />
          </div>
        )}
      </div>

      {/* ── Mobile management drawer (Room / Host controls) ──────────────────── */}
      <AnimatePresence>
        {showManagePanel && canMod && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end lg:hidden"
            onClick={() => setShowManagePanel(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="bg-background border-t border-border rounded-t-3xl w-full max-h-[85vh] overflow-y-auto p-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1.5 bg-muted rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <div className="font-black text-base">Manage Circle</div>
                <button onClick={() => setShowManagePanel(false)} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ManagementPanelBody
                audience={audience}
                isHost={isHost}
                session={session}
                onPromote={promote}
                onAssignCohost={assignCohost}
                onDismissHand={(userId) => post("/hand", { raised: false, user_id: userId })}
                onMuteAll={muteAll}
                onLowerAll={lowerAllHands}
                onShare={shareCircle}
                onToggleRecording={toggleRecording}
                recordingOn={!!session.is_recording}
                recordingDisabled={uploading || mediaCapabilities?.recording === false}
                onEndCircle={() => { setShowManagePanel(false); setShowEndConfirm(true); }}
                speakerCount={(host ? 1 : 0) + cohosts.length + speakers.length}
                onlineParticipants={participants}
                myUserId={myUserId}
                onMuteUser={muteUser}
                onDemoteUser={demote}
                onKickUser={kickUser}
                onBlockUser={(userId) => setShowBlockConfirm(userId)}
                onReportUser={(userId) => setShowReportModal(userId)}
                onAssignCohostUser={assignCohost}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom controls ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4 space-y-3" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        {/* Reactions */}
        <div className="flex items-center justify-center gap-2">
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => react(e)} className="text-xl px-1 hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>

        {/* "Want to speak?" CTA card — listeners who haven't raised their hand */}
        {!canSpeak && !me?.hand_raised && (
          <div className="bg-muted/60 border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
            <Hand className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black">Want to speak?</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">Raise your hand and the host can bring you on stage.</div>
            </div>
            <Button size="sm" onClick={toggleHand} className="shrink-0">
              Raise Hand
            </Button>
          </div>
        )}
        {/* Hand already raised confirmation */}
        {!canSpeak && me?.hand_raised && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl shrink-0">✋</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-amber-400">Hand raised!</div>
              <div className="text-xs text-muted-foreground mt-0.5">Waiting for the host to bring you on stage…</div>
            </div>
            <Button size="sm" variant="outline" onClick={toggleHand} className="shrink-0 text-amber-400 border-amber-400/40">
              Lower
            </Button>
          </div>
        )}

        {/* Controls row — labeled buttons */}
        <div className="flex items-center justify-center gap-2">
          {!canSpeak && (
            <button
              onClick={toggleHand}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[56px] ${
                me?.hand_raised
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Hand className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                {me?.hand_raised ? "Lower" : "Raise Hand"}
              </span>
            </button>
          )}
          {canSpeak && (
            <button
              onClick={toggleMic}
              disabled={mediaCapabilities?.microphone === false}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[56px] disabled:opacity-40 ${
                micOn
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                {micOn ? "Mute" : "Unmute"}
              </span>
            </button>
          )}
          {canSpeak && session.video_enabled && (
            <button
              onClick={toggleVideo}
              disabled={mediaCapabilities?.camera === false}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[56px] disabled:opacity-40 ${
                videoOn
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                {videoOn ? "Cam Off" : "Camera"}
              </span>
            </button>
          )}
          {(me?.role === "speaker" || me?.role === "co_host") && (
            <button
              onClick={() => demote(myUserId!)}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-border text-muted-foreground hover:border-amber-400/40 hover:text-amber-400 transition-all min-w-[56px]"
            >
              <UserMinus className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">Leave Stage</span>
            </button>
          )}
          {isHost && (
            <button
              onClick={toggleRecording}
              disabled={uploading || mediaCapabilities?.recording === false}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[56px] disabled:opacity-40 ${
                session.is_recording
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-border text-muted-foreground hover:border-red-400/40"
              }`}
            >
              <CircleIcon className={`w-5 h-5 ${session.is_recording ? "fill-red-500 text-red-500" : ""}`} />
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                {session.is_recording ? "Stop Rec" : "Record"}
              </span>
            </button>
          )}
          <button
            onClick={isHost ? () => setShowEndConfirm(true) : leaveAndExit}
            className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all min-w-[56px]"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
              {isHost ? "End Circle" : "Leave Room"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Speaker tile ───────────────────────────────────────────────────────────────
interface SpeakerTileProps {
  participant: Participant;
  isMe: boolean;
  level: number;
  isHost: boolean;
  canMod: boolean;
  modMenuOpen: boolean;
  onOpenMod: () => void;
  onMute: () => void;
  onDemote: () => void;
  onKick: () => void;
  onBlock: () => void;
  onReport: () => void;
  onAssignCohost?: () => void;
  onRemoveCohost?: () => void;
}

function SpeakerTile({ participant: s, isMe, level, canMod, modMenuOpen, onOpenMod, onMute, onDemote, onKick, onBlock, onReport, onAssignCohost, onRemoveCohost }: SpeakerTileProps) {
  const isSpeaking = level > 0.12;
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div className="relative">
        {/* Animated speaking ring */}
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.3, 0.8] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
        <button
          className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${
            isSpeaking ? "border-primary" : s.role === "host" ? "border-amber-400/60" : s.role === "co_host" ? "border-blue-400/60" : "border-primary/30"
          } ${canMod ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""}`}
          onClick={canMod ? onOpenMod : undefined}
        >
          {s.avatar_url
            ? <img src={s.avatar_url} className="w-full h-full object-cover" alt="" />
            : <span className="text-lg font-black">{s.name?.[0] ?? "?"}</span>}
        </button>
        {s.role === "host" && (
          <Crown className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1 drop-shadow" />
        )}
        {s.role === "co_host" && (
          <Shield className="w-3.5 h-3.5 text-blue-400 absolute -top-1 -right-1 drop-shadow" />
        )}
        {canMod && !modMenuOpen && (
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-background rounded-full p-0.5">
            <MoreVertical className="w-2.5 h-2.5 text-muted-foreground" />
          </div>
        )}
        {s.muted && (
          <MicOff className="w-3 h-3 text-red-400 absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5" />
        )}
        {isSpeaking && !s.muted && (
          <Volume2 className="w-3 h-3 text-primary absolute -bottom-0.5 -left-0.5 bg-background rounded-full p-0.5" />
        )}
      </div>
      <span className={`text-[10px] font-bold truncate max-w-[64px] ${s.role === "co_host" ? "text-blue-400" : ""}`}>{isMe ? "You" : s.name}</span>
      {s.role === "co_host" && (
        <span className="text-[8px] font-bold text-blue-400/80 uppercase tracking-wide">Co-host</span>
      )}

      {/* Host moderation dropdown */}
      <AnimatePresence>
        {modMenuOpen && canMod && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]"
            onClick={e => e.stopPropagation()}
          >
            <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted" onClick={onMute}>
              {s.muted ? <><Mic className="w-3 h-3" /> Unmute</> : <><MicOff className="w-3 h-3" /> Mute</>}
            </button>
            <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted" onClick={onDemote}>
              <UserMinus className="w-3 h-3" /> Move to Audience
            </button>
            {onAssignCohost && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400" onClick={onAssignCohost}>
                <Shield className="w-3 h-3" /> Make Co-host
              </button>
            )}
            {onRemoveCohost && (
              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400" onClick={onRemoveCohost}>
                <Shield className="w-3 h-3" /> Remove Co-host
              </button>
            )}
            <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400" onClick={onKick}>
              <Flag className="w-3 h-3" /> Remove from Circle
            </button>
            <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400" onClick={onBlock}>
              <Ban className="w-3 h-3" /> Block user
            </button>
            <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400" onClick={onReport}>
              <AlertTriangle className="w-3 h-3" /> Report user
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Management panel body (Raised Hands / Room Controls / Host Controls) ────
// Shared between the desktop right sidebar and the mobile bottom-sheet drawer.
interface ManagementPanelBodyProps {
  audience: Participant[];
  isHost: boolean;
  session: SessionInfo;
  onPromote: (userId: number) => void;
  onAssignCohost: (userId: number) => void;
  onDismissHand: (userId: number) => void;
  onMuteAll: () => void;
  onLowerAll: () => void;
  onShare: () => void;
  onToggleRecording: () => void;
  recordingOn: boolean;
  recordingDisabled: boolean;
  onEndCircle: () => void;
  speakerCount: number;
  onlineParticipants: Participant[];
  myUserId?: number;
  onMuteUser: (userId: number, muted: boolean) => void;
  onDemoteUser: (userId: number) => void;
  onKickUser: (userId: number) => void;
  onBlockUser: (userId: number) => void;
  onReportUser: (userId: number) => void;
  onAssignCohostUser: (userId: number) => void;
}

function RoomControlButton({ icon: Icon, label, onClick, disabled, tone }: {
  icon: typeof Mic; label: string; onClick: () => void; disabled?: boolean; tone?: "danger" | "record";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors disabled:opacity-40 ${
        tone === "danger"
          ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : tone === "record"
          ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "border-border bg-muted/40 hover:bg-muted"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-bold leading-tight">{label}</span>
    </button>
  );
}

function ManagementPanelBody({
  audience, isHost, session, onPromote, onAssignCohost, onDismissHand,
  onMuteAll, onLowerAll, onShare, onToggleRecording, recordingOn, recordingDisabled,
  onEndCircle, speakerCount, onlineParticipants, myUserId,
  onMuteUser, onDemoteUser, onKickUser, onBlockUser, onReportUser, onAssignCohostUser,
}: ManagementPanelBodyProps) {
  const raisedHands = audience.filter(l => l.hand_raised);
  const [showAllHands, setShowAllHands] = useState(false);
  const visibleHands = showAllHands ? raisedHands : raisedHands.slice(0, 5);
  const [targetId, setTargetId] = useState<number | "">("");
  const targetable = onlineParticipants.filter(p => p.user_id !== myUserId && p.role !== "host");
  const target = onlineParticipants.find(p => p.user_id === targetId);

  return (
    <div className="space-y-4">
      {/* Raised Hands */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Raised Hands ({raisedHands.length})
          </div>
          {raisedHands.length > 5 && (
            <button onClick={() => setShowAllHands(v => !v)} className="text-[10px] font-bold text-primary">
              {showAllHands ? "Show less" : "View All"}
            </button>
          )}
        </div>
        {raisedHands.length === 0 ? (
          <div className="text-xs text-muted-foreground">No one has raised their hand</div>
        ) : (
          <div className="space-y-2">
            {visibleHands.map(l => (
              <div key={l.user_id} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                  {l.avatar_url ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" /> : (l.name?.[0] ?? "?")}
                </div>
                <span className="flex-1 text-xs font-bold truncate">{l.name}</span>
                <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => onPromote(l.user_id)}>Bring Up</Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => onDismissHand(l.user_id)}>Dismiss</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Room Controls */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Room Controls</div>
        <div className="grid grid-cols-3 gap-2">
          <RoomControlButton icon={VolumeX} label="Mute All" onClick={onMuteAll} />
          <RoomControlButton icon={Hand} label="Lower All" onClick={onLowerAll} />
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 p-3 text-center">
            <span className="text-sm font-black">{session.max_speakers}</span>
            <span className="text-[10px] font-bold leading-tight text-muted-foreground">Speaker Limit</span>
          </div>
          <RoomControlButton icon={Share2} label="Share Circle" onClick={onShare} />
          <RoomControlButton icon={UserPlus} label="Invite" onClick={onShare} />
          <RoomControlButton
            icon={Settings}
            label="Settings"
            onClick={() => toast({ title: "Room settings", description: "More room settings are coming soon." })}
          />
          <RoomControlButton
            icon={CircleIcon}
            label={recordingOn ? "Stop Recording" : "Start Recording"}
            onClick={onToggleRecording}
            disabled={recordingDisabled || !isHost}
            tone="record"
          />
          <RoomControlButton icon={PhoneOff} label="End Circle" onClick={onEndCircle} tone="danger" />
        </div>
      </div>

      {/* Host Controls — click a participant to select, then act */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Host Controls</div>
        {targetable.length === 0 ? (
          <div className="text-xs text-muted-foreground">No other participants yet</div>
        ) : (
          <>
            {/* Participant selector list */}
            <div className="space-y-1 mb-3 max-h-36 overflow-y-auto">
              {targetable.map(p => (
                <button
                  key={p.user_id}
                  onClick={() => setTargetId(prev => prev === p.user_id ? "" : p.user_id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl border text-left transition-colors ${
                    targetId === p.user_id
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                    {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : (p.name?.[0] ?? "?")}
                  </div>
                  <span className="flex-1 text-xs font-bold truncate">{p.name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {p.role === "co_host" ? "Co-host" : p.role === "speaker" ? "Speaker" : "Audience"}
                  </span>
                </button>
              ))}
            </div>
            {/* Action grid — enabled only when a participant is selected */}
            <div className="grid grid-cols-3 gap-2">
              <RoomControlButton
                icon={Shield}
                label="Make Co-Host"
                disabled={!target || !isHost || target.role === "co_host"}
                onClick={() => target && onAssignCohostUser(target.user_id)}
              />
              <RoomControlButton
                icon={UserMinus}
                label="Remove"
                disabled={!target}
                onClick={() => { if (target) { onKickUser(target.user_id); setTargetId(""); } }}
                tone="danger"
              />
              <RoomControlButton
                icon={Ban}
                label="Block"
                disabled={!target}
                onClick={() => { if (target) { onBlockUser(target.user_id); setTargetId(""); } }}
                tone="danger"
              />
              <RoomControlButton
                icon={AlertTriangle}
                label="Report"
                disabled={!target}
                onClick={() => target && onReportUser(target.user_id)}
              />
              <RoomControlButton
                icon={target?.muted ? Mic : MicOff}
                label={target?.muted ? "Unmute" : "Mute"}
                disabled={!target || target.role === "listener"}
                onClick={() => target && onMuteUser(target.user_id, !target.muted)}
              />
              <RoomControlButton
                icon={UserMinus}
                label="Move to Audience"
                disabled={!target || (target.role !== "speaker" && target.role !== "co_host")}
                onClick={() => { if (target) { onDemoteUser(target.user_id); setTargetId(""); } }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
