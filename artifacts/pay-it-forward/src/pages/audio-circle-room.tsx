import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Hand,
  Video,
  VideoOff,
  Users,
  PhoneOff,
  Circle as CircleIcon,
  ChevronDown,
  Crown,
  Upload,
  VolumeX,
  UserMinus,
  Flag,
  Volume2,
  Ban,
  AlertTriangle,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Share2,
  Shield,
  MoreVertical,
  ArrowLeft,
  MessageSquare,
  Settings,
  UserPlus,
  Send,
  X,
  PlayCircle,
  ExternalLink,
  Check,
  Search,
  Pause,
  Play,
  FileText,
  Clock,
  HardDrive,
  BarChart3,
  Monitor,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import type { WsEvent } from "@/lib/wsClient";
import {
  getAudioCircleMediaCapabilities,
  type AudioCircleMediaCapabilities,
} from "@/lib/circleMediaCapabilities";
import {
  type CircleMediaTransport,
  type MediaTransportCallbacks,
} from "@/lib/circleMediaTransport";
import {
  CircleRealtimeSessionManager,
  MediaTokenError,
  type ContinuityState,
} from "@/lib/circleRealtimeSessionManager";
import {
  acquireCircleDevice,
  classifyMediaError,
} from "@/lib/circleMediaReadiness";
import {
  CircleEnduranceCollector,
} from "@/lib/circleEnduranceMetrics";
import { canPublishCircleMedia } from "@/lib/circleMediaPolicy";
import { RecordingConsentBanner } from "@/components/RecordingConsentBanner";
import { SPIRALS_PATHS } from "@/lib/spirals";

// ── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  user_id: number;
  role: "host" | "co_host" | "speaker" | "listener";
  hand_raised: boolean;
  hand_raised_at?: string | null; // ISO timestamp — set by server when hand raised
  muted: boolean;
  name: string;
  avatar_url: string | null;
  joined_via?: "link" | "invite" | "direct"; // how this participant joined the circle
  invited_by?: string | null; // name of the person who sent the in-app invite
}

interface ChapterMarker {
  start: number;
  end?: number;
  title: string;
}

interface RecordingArchiveEntry {
  id: number;
  title: string;
  host_name: string | null;
  recording_url: string;
  recording_status: string;
  recording_duration_seconds: number | null;
  recording_size_bytes: number | null;
  ai_summary: string | null;
  chapter_markers: ChapterMarker[] | null;
  started_at: string;
  ended_at: string | null;
}

interface SessionInfo {
  id: number;
  circle_id: number;
  host_id: number;
  title: string;
  status: string;
  video_enabled: boolean;
  media_publish_policy?: "open" | "moderated";
  is_recording: boolean;
  recording_allowed?: boolean;
  max_speakers: number;
  topic?: string | null;
  description?: string | null;
  started_at?: string | null;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "lost";
type PreJoinStatus = "checking" | "ready" | "blocked";

const REACTION_EMOJIS = ["👏", "❤️", "😂", "😮", "🤔", "🔥", "💯"];

async function enumerateCircleDevices(
  kind: MediaDeviceKind,
): Promise<MediaDeviceInfo[]> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  )
    return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === kind);
  } catch {
    return [];
  }
}

interface ChatMessage {
  id: string;
  user_id: number;
  name: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

// ── Audio level bar visualizer ───────────────────────────────────────────────
// Renders 5 thin animated bars whose heights track the audio level (0–1).
// Used inside speaker/host tiles to give a real-time speaking indicator.
function AudioLevelBars({
  level,
  active,
}: {
  level: number;
  active?: boolean;
}) {
  const bars = 5;
  const color = active ? "bg-green-400" : "bg-primary";
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / (bars + 1); // 0.17, 0.33, 0.50, 0.67, 0.83
        const height = level >= threshold ? Math.min(100, 20 + level * 80) : 20;
        return (
          <div
            key={i}
            className={`w-0.5 rounded-full transition-all duration-75 ${color}`}
            style={{
              height: `${height}%`,
              opacity: level >= threshold ? 1 : 0.25,
            }}
          />
        );
      })}
    </div>
  );
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
    try {
      src?.disconnect();
    } catch {
      /* ignore */
    }
    if (ownsCtx) ctx?.close().catch(() => {});
  };
}

// ── IndexedDB recording recovery ─────────────────────────────────────────────
// Stores the recording blob before upload so a page refresh doesn't lose it.
// Key: `circle-rec-${sessionId}`, DB: "niakofa-circles", store: "recordings"
const IDB_NAME = "niakofa-circles";
const IDB_STORE = "recordings";

function openRecordingIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecordingToIdb(
  sessionId: number,
  blob: Blob,
): Promise<void> {
  try {
    const db = await openRecordingIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx
        .objectStore(IDB_STORE)
        .put(blob, `circle-rec-${sessionId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    /* IDB unavailable — best effort */
  }
}

async function loadRecordingFromIdb(sessionId: number): Promise<Blob | null> {
  try {
    const db = await openRecordingIdb();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(`circle-rec-${sessionId}`);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function clearRecordingFromIdb(sessionId: number): Promise<void> {
  try {
    const db = await openRecordingIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(`circle-rec-${sessionId}`);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    /* ignore */
  }
}

function mediaErrorMessage(
  error: unknown,
  device: "microphone" | "camera",
): string {
  return classifyMediaError(error, device).message;
}

function mediaTokenErrorMessage(error: unknown): string {
  if (!(error instanceof MediaTokenError)) {
    return error instanceof Error
      ? error.message
      : "Couldn't connect to Spiral media.";
  }

  switch (error.code) {
    case "reauthenticate":
      return "Your sign-in expired. Sign in again, then rejoin the Spiral.";
    case "not_authorized":
      return "You no longer have access to this Spiral.";
    case "session_ended":
      return "This Spiral has ended.";
    case "state_conflict":
      return "The Spiral changed while you were joining. Return to Spirals and try again.";
    case "rate_limited":
      return error.retryAfterSeconds
        ? `Spiral media is rate-limited. Try again in ${error.retryAfterSeconds} seconds.`
        : "Spiral media is rate-limited. Wait a moment, then try again.";
    case "not_configured":
      return "Live audio/video is not configured on the server yet. Please try again after the Spiral host enables media.";
    case "server_error":
      return "Spiral media is temporarily unavailable. Check your connection and try again.";
    default:
      return error.message;
  }
}

// ── Live "Xm Ys" tick hook ───────────────────────────────────────────────────
// Counts up from a timestamp; re-renders once per second while active.
function useElapsedLabel(isoTimestamp: string | null | undefined): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isoTimestamp) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isoTimestamp]);
  if (!isoTimestamp) return "";
  const elapsed = Math.max(0, Date.now() - new Date(isoTimestamp).getTime());
  const m = Math.floor(elapsed / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Recording timer ──────────────────────────────────────────────────────────
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function useRecordingTimer(running: boolean): [string, number] {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return [`${mm}:${ss}`, seconds];
}

// ── Host / Co-host hero broadcast tile ───────────────────────────────────────
interface HostHeroTileProps {
  participant: Participant;
  isMe: boolean;
  level: number;
  isActiveSpeaker?: boolean;
  isLoudest?: boolean;
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
  participant: p,
  isMe,
  level,
  isActiveSpeaker,
  isLoudest,
  videoStream,
  videoOn,
  size = "full",
  canMod,
  modMenuOpen,
  onOpenMod,
  onMute,
  onDemote,
  onKick,
  onBlock,
  onReport,
  onAssignCohost,
  onRemoveCohost,
}: HostHeroTileProps) {
  const isSpeaking = level > 0.08 || isActiveSpeaker || isLoudest;
  const hasVideo =
    videoStream && videoOn && videoStream.getVideoTracks().length > 0;
  const roleLabel = p.role === "host" ? "Host" : "Co-Host";
  const roleBg = p.role === "host" ? "bg-amber-500" : "bg-blue-500";
  // Green = server-confirmed active speaker, yellow = locally loudest, primary = generic speaking
  const ringColor = isActiveSpeaker
    ? "border-green-400"
    : isLoudest
      ? "border-yellow-400"
      : "border-primary";

  return (
    <div
      className={`relative ${size === "full" ? "w-full" : "flex-1"} rounded-2xl overflow-hidden`}
    >
      {/* Speaking ring — colour-coded by speaker status */}
      {isSpeaking && (
        <motion.div
          className={`absolute inset-0 rounded-2xl border-2 ${ringColor} z-10 pointer-events-none`}
          animate={{ opacity: [0.95, 0.25, 0.95] }}
          transition={{
            duration: isActiveSpeaker ? 0.6 : 0.9,
            repeat: Infinity,
          }}
        />
      )}
      {/* Extra outer pulse for server-confirmed active speaker */}
      {isActiveSpeaker && (
        <motion.div
          className="absolute -inset-0.5 rounded-2xl border border-green-400/40 z-10 pointer-events-none"
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}

      {/* Video or avatar area */}
      <div
        className={`relative ${size === "full" ? "aspect-[4/3]" : "aspect-[4/3]"} bg-zinc-900`}
      >
        {hasVideo ? (
          <video
            autoPlay
            playsInline
            muted={isMe}
            ref={(el) => {
              if (el && el.srcObject !== videoStream) {
                el.srcObject = videoStream!;
                el.play().catch(() => {});
              }
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className={`w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border-4 ${isSpeaking ? ringColor : p.role === "host" ? "border-amber-400/60" : "border-blue-400/60"}`}
            >
              {p.avatar_url ? (
                <img
                  src={p.avatar_url}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <span className="text-3xl font-black text-foreground">
                  {p.name?.[0] ?? "?"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Role badge top-left */}
        <div
          className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white ${roleBg}`}
        >
          {p.role === "host" ? (
            <Crown className="w-2.5 h-2.5" />
          ) : (
            <Shield className="w-2.5 h-2.5" />
          )}
          {roleLabel}
        </div>

        {/* Mic icon top-right */}
        <div className="absolute top-2 right-2">
          {p.muted ? (
            <div className="bg-red-500/80 rounded-full p-1">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          ) : (
            <div className="bg-black/50 rounded-full p-1">
              <Mic className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        {/* Name / level / mod button overlay at bottom */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-sm font-black truncate">
              {isMe ? "You" : p.name}
            </span>
            {!p.muted && level > 0.05 && (
              <AudioLevelBars level={level} active={isSpeaking} />
            )}
            {isActiveSpeaker && (
              <span className="text-[9px] font-black text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                Speaking
              </span>
            )}
            {isLoudest && !isActiveSpeaker && (
              <span className="text-[9px] font-black text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                Loudest
              </span>
            )}
          </div>
          {canMod && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenMod?.();
              }}
              className="p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors shrink-0"
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
            onClick={(e) => e.stopPropagation()}
          >
            {onMute && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
                onClick={onMute}
              >
                {p.muted ? (
                  <>
                    <Mic className="w-3 h-3" /> Unmute
                  </>
                ) : (
                  <>
                    <MicOff className="w-3 h-3" /> Mute
                  </>
                )}
              </button>
            )}
            {onDemote && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
                onClick={onDemote}
              >
                <UserMinus className="w-3 h-3" /> Move to Audience
              </button>
            )}
            {onAssignCohost && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400"
                onClick={onAssignCohost}
              >
                <Shield className="w-3 h-3" /> Make Co-host
              </button>
            )}
            {onRemoveCohost && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400"
                onClick={onRemoveCohost}
              >
                <Shield className="w-3 h-3" /> Remove Co-host
              </button>
            )}
            {onKick && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400"
                onClick={onKick}
              >
                <Flag className="w-3 h-3" /> Remove from Spiral
              </button>
            )}
            {onBlock && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
                onClick={onBlock}
              >
                <Ban className="w-3 h-3" /> Block user
              </button>
            )}
            {onReport && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
                onClick={onReport}
              >
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
function AudienceStrip({
  audience,
  canMod,
  onPromote,
}: {
  audience: Participant[];
  canMod: boolean;
  onPromote: (userId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Sort hand-raisers to the front of the strip so they're immediately visible
  const sorted = [...audience].sort(
    (a, b) => (b.hand_raised ? 1 : 0) - (a.hand_raised ? 1 : 0),
  );
  const visible = showAll ? sorted : sorted.slice(0, AUDIENCE_STRIP_MAX);
  const overflow = audience.length - AUDIENCE_STRIP_MAX;

  if (audience.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
        Audience ({audience.length})
      </div>
      <div className="flex items-start flex-wrap gap-3">
        {visible.map((l) => (
          <div key={l.user_id} className="flex flex-col items-center gap-1">
            <div className="relative">
              <div
                className={`w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${l.hand_raised ? "border-amber-400" : "border-transparent"}`}
              >
                {l.avatar_url ? (
                  <img
                    src={l.avatar_url}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                ) : (
                  <span className="text-sm font-black">
                    {l.name?.[0] ?? "?"}
                  </span>
                )}
              </div>
              {l.hand_raised && (
                <span className="absolute -top-1 -right-1 text-sm leading-none">
                  ✋
                </span>
              )}
            </div>
            <span className="text-[9px] truncate max-w-[48px] text-center text-muted-foreground">
              {l.name}
            </span>
            {canMod && l.hand_raised && (
              <button
                onClick={() => onPromote(l.user_id)}
                className="text-[9px] text-primary font-bold hover:underline"
              >
                bring up
              </button>
            )}
          </div>
        ))}
        {!showAll && overflow > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-muted/80 border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-xs font-black text-muted-foreground">
                +{overflow}
              </span>
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
    connected: {
      icon: SignalHigh,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      label: "Connected",
    },
    reconnecting: {
      icon: SignalMedium,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      label: "Reconnecting…",
    },
    lost: {
      icon: SignalLow,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      label: "Connection lost",
    },
    connecting: {
      icon: Signal,
      color: "text-muted-foreground",
      bg: "bg-muted",
      border: "border-border",
      label: "Connecting…",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${config.bg} ${config.border} border ${config.color}`}
    >
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
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [recordingConsented, setRecordingConsented] = useState(false);
  const [recordingPendingCount, setRecordingPendingCount] = useState(0);
  const [recordingConsentSubmitting, setRecordingConsentSubmitting] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<
    { id: string; emoji: string; x: number; drift: number }[]
  >([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(
    new Map(),
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [enduranceSampleCount, setEnduranceSampleCount] = useState(0);
  const connectionStatusRef = useRef<ConnectionStatus>("connecting");
  const [mediaCapabilities, setMediaCapabilities] =
    useState<AudioCircleMediaCapabilities | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<Map<number, number>>(
    new Map(),
  );
  const [localLevel, setLocalLevel] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [modMenuOpen, setModMenuOpen] = useState<number | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [preJoinChecked, setPreJoinChecked] = useState(false);
  const [_preJoinMicReady, setPreJoinMicReady] = useState(false);
  const [_preJoinCameraReady, setPreJoinCameraReady] = useState(false);
  const [preJoinStatus, setPreJoinStatus] = useState<PreJoinStatus>("checking");

  // ── New modal states ───────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTopic, setSettingsTopic] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsSpeakerLimit, setSettingsSpeakerLimit] = useState(13);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSpeakersAll, setShowSpeakersAll] = useState(false);

  // Room / Chat tabs + management panel (Raised Hands / Room Controls / Host Controls)
  const [activeTab, setActiveTab] = useState<"room" | "chat">("room");
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"people" | "reactions">(
    "people",
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reactionLog, setReactionLog] = useState<
    { id: string; emoji: string; name: string }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // ── Chat unread count ──────────────────────────────────────────────────────
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // ── Raised hand timestamps (userId → epoch ms when raised) ────────────────
  const handRaisedAtRef = useRef<Map<number, number>>(new Map());

  // ── Active speaker (from circle_active_speaker WS events) ─────────────────
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);

  // ── Recording archive ──────────────────────────────────────────────────────
  const [showRecordingArchive, setShowRecordingArchive] = useState(false);
  const [recordingArchive, setRecordingArchive] = useState<
    RecordingArchiveEntry[]
  >([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [selectedRecording, setSelectedRecording] =
    useState<RecordingArchiveEntry | null>(null);
  const [audioPlayerTime, setAudioPlayerTime] = useState(0);
  const [audioPlayerPlaying, setAudioPlayerPlaying] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // ── Host transfer modal ────────────────────────────────────────────────────
  const [showTransferModal, setShowTransferModal] = useState(false);

  // ── Desktop mod right-sidebar tab ─────────────────────────────────────────
  const [_desktopModTab, _setDesktopModTab] = useState<"controls" | "chat">(
    "controls",
  );

  // ── Creator Tools: Polls, Q&A, Screen share, Shared notes, Auto-remove ──
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [activePoll, setActivePoll] = useState<{
    id: string;
    question: string;
    options: { text: string; votes: number[] }[];
  } | null>(null);
  const [myPollVote, setMyPollVote] = useState<number | null>(null);
  const [showQAModal, setShowQAModal] = useState(false);
  const [qaQuestions, setQaQuestions] = useState<
    {
      id: string;
      user_id: number;
      name: string;
      question: string;
      answered: boolean;
      answer?: string;
    }[]
  >([]);
  const [qaInput, setQaInput] = useState("");
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharedNotes, setSharedNotes] = useState<string>("");
  const [_notesSaving, setNotesSaving] = useState(false);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState(false);
  const [autoRemoveIdleMs, _setAutoRemoveIdleMs] = useState(600000); // 10 min default

  // ── In-app invite user search ──────────────────────────────────────────────
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<
    { id: number; name: string; avatar_url: string | null }[]
  >([]);
  const [invitingSending, setInvitingSending] = useState<number | null>(null);

  // ── Pending recording recovery (blob saved to IDB before upload) ──────────
  const [pendingRecoveryBlob, setPendingRecoveryBlob] = useState<Blob | null>(
    null,
  );

  // ── Device picker (mic / camera selection) ─────────────────────────────────
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
    useState<string>("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] =
    useState<string>("");
  const [showMicPicker, setShowMicPicker] = useState(false);
  const [showCamPicker, setShowCamPicker] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const mediaTransportRef = useRef<CircleMediaTransport | null>(null);
  const sessionManagerRef = useRef<CircleRealtimeSessionManager | null>(null);
  const enduranceRef = useRef<CircleEnduranceCollector | null>(null);
  const enduranceStartedAtRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const isRecordingRef = useRef(false);
  const recordingElapsedSecondsRef = useRef(0);
  const analyserCleanupsRef = useRef<Map<string, () => void>>(new Map());
  const signalHandlerRef = useRef<((e: WsEvent) => void) | null>(null);
  // One shared AudioContext for ALL volume analysers in this session — avoids
  // hitting the browser's per-page AudioContext limit (Chrome: ~6 historically).
  const sharedAudioCtxRef = useRef<AudioContext | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const myUserId = currentUser?.id;
  const me = participants.find((p) => p.user_id === myUserId);
  const isHost = session?.host_id === myUserId;
  const isCohost = me?.role === "co_host";
  const canSpeak =
    me?.role === "host" || me?.role === "co_host" || me?.role === "speaker";
  const canPublishMedia = canPublishCircleMedia(
    me?.role,
    session?.media_publish_policy ?? "open",
  );
  const canMod = isHost || isCohost;
  const host = participants.find((p) => p.role === "host");
  const cohosts = participants.filter((p) => p.role === "co_host");
  const speakers = participants.filter((p) => p.role === "speaker");
  const audience = participants.filter((p) => p.role === "listener");

  // Guard: speaker slots currently filled vs limit. Backend also enforces this;
  // the frontend check gives instant UX feedback before the round-trip.
  const onStageCurrent = (host ? 1 : 0) + cohosts.length + speakers.length;

  // ── Loudest currently-speaking participant (for visual highlight) ──────────
  // Computed from local audio level analysis each render frame — gives instant
  // visual feedback to all speakers so they know who's talking over whom.
  const loudestSpeakerId = useMemo(() => {
    let loudestId: number | null = null;
    let loudestLevel = 0.18; // must cross threshold to count as "speaking"
    for (const [uid, level] of speakingLevels) {
      if (level > loudestLevel) {
        loudestLevel = level;
        loudestId = uid;
      }
    }
    if (localLevel > loudestLevel && myUserId && canSpeak) loudestId = myUserId;
    return loudestId;
  }, [speakingLevels, localLevel, myUserId, canSpeak]);
  const atSpeakerLimit = session
    ? onStageCurrent >= session.max_speakers
    : false;
  const nearSpeakerLimit = session
    ? onStageCurrent >= session.max_speakers - 1
    : false;

  useEffect(() => {
    setMediaCapabilities(getAudioCircleMediaCapabilities());
  }, []);
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  const [recordingTimer, recordingElapsedSeconds] = useRecordingTimer(
    !!session?.is_recording,
  );

  // Keep the ref in sync so uploadRecording can send the actual elapsed duration
  useEffect(() => {
    recordingElapsedSecondsRef.current = recordingElapsedSeconds;
  }, [recordingElapsedSeconds]);

  // Sync settings form when modal opens
  useEffect(() => {
    if (showSettingsModal && session) {
      setSettingsTopic(session.topic ?? "");
      setSettingsDesc(session.description ?? "");
      setSettingsSpeakerLimit(session.max_speakers);
    }
  }, [showSettingsModal, session]);

  // Timeout: if still "connecting" after 12 s (WebSocket never established),
  // flip to "lost" so the UI shows a recoverable error instead of a spinner.
  useEffect(() => {
    if (connectionStatus !== "connecting") return;
    const id = setTimeout(() => {
      setConnectionStatus((prev) => (prev === "connecting" ? "lost" : prev));
    }, 12000);
    return () => clearTimeout(id);
  }, [connectionStatus]);

  const resync = useCallback(async () => {
    try {
      const res = await fetch(
        `${base}/api/audio-circle-sessions/${sessionId}`,
        { headers: authHeaders() },
      );
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setParticipants(data.participants ?? []);
      // REST presence is not media health. The mesh owns connectionStatus and
      // will report connected only after a peer connection reaches that state.
      // A successful resync only means the room API is reachable.
    } catch {
      // Next reconnect will retry
    }
  }, [base, sessionId]);

  // Recording authorization is server-side state. Loading it after a
  // refresh ensures a participant cannot bypass the consent banner.
  useEffect(() => {
    if (!session?.id || !myUserId) return;
    fetch(`${base}/api/audio-circle-sessions/${session.id}/recording/current`, {
      headers: authHeaders(),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const current = data?.recording;
        if (!current) {
          setRecordingId(null);
          setRecordingConsented(false);
          setRecordingPendingCount(0);
          return;
        }
        setRecordingId(current.id);
        setRecordingConsented(Boolean(current.consented));
        setRecordingPendingCount(Number(current.missing_consent_count) || 0);
      })
      .catch(() => {});
  }, [base, myUserId, session]);

  useWebSocket("ws_reconnected", () => {
    void resync();
  });

  // ── Reconnect on tab becoming visible again ────────────────────────────────
  // If the user backgrounds the app for a while the WS may have gone quiet and
  // the participant list can be stale. Re-sync the moment the tab is foregrounded.
  useEffect(() => {
    if (!session?.id || !myUserId) return;
    const handler = () => {
      if (!document.hidden) {
        setConnectionStatus("reconnecting");
        void resync();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [myUserId, resync, session]);

  // Start browser-side certification sampling once the media session exists. This is
  // intentionally local-only: media stats never pass through the API.
  useEffect(() => {
    if (!session || !mediaReady || !mediaTransportRef.current) return;
    const collector = new CircleEnduranceCollector({
      sessionId,
      intervalMs: 5000,
      getPeerConnections: () =>
        mediaTransportRef.current?.getPeerConnections?.() ?? new Map(),
      getLocalStream: () =>
        mediaTransportRef.current?.getLocalStream?.() ?? null,
      getConnectionLabel: () => connectionStatusRef.current,
      getReconnectCount: () => reconnectCountRef.current,
      expectAudio: () => true,
      expectVideo: () => !!session.video_enabled && videoOn,
      onSample: () => setEnduranceSampleCount((count) => count + 1),
    });
    enduranceRef.current = collector;
    enduranceStartedAtRef.current = Date.now();
    setEnduranceSampleCount(0);
    collector.start();
    return () => {
      if (enduranceRef.current === collector) enduranceRef.current = null;
      collector.stop();
      enduranceStartedAtRef.current = null;
    };
    // Sampling should follow the room/mesh lifecycle, not every media toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, mediaReady]);

  // ── Load initial state + chat history ─────────────────────────────────────
  useEffect(() => {
    if (isNaN(sessionId)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Session info + join in sequence (join needs the session to exist)
        const res = await fetch(
          `${base}/api/audio-circle-sessions/${sessionId}`,
          { headers: authHeaders() },
        );
        if (!res.ok) {
          if (!cancelled)
            toast({
              title: "Spiral not found",
              description: "This room may have ended.",
              variant: "destructive",
            });
          setLocation(SPIRALS_PATHS.discovery);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.session.status !== "live") {
          toast({ title: "This Spiral has ended" });
          setLocation(SPIRALS_PATHS.discovery);
          return;
        }
        setSession(data.session);

        // Join + chat history in parallel — both are independent of each other
        const [joinRes, historyRes] = await Promise.all([
          fetch(`${base}/api/audio-circle-sessions/${sessionId}/join`, {
            method: "POST",
            headers: authHeaders(),
          }),
          fetch(`${base}/api/audio-circle-sessions/${sessionId}/chat`, {
            headers: authHeaders(),
          }),
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
        if (!cancelled)
          toast({ title: "Couldn't load the Spiral", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, base, setLocation]);

  // ── Media transport setup ──────────────────────────────────────────────────
  useEffect(() => {
    // The token route requires an active REST participant. Waiting for `me`
    // also prevents a race where the session GET finishes before join does.
    if (!session || !myUserId || !me) return;
    let cancelled = false;

    const callbacks: MediaTransportCallbacks = {
      onRemoteStream: (userId, stream) => {
        const numericUserId = Number(userId);
        if (!Number.isFinite(numericUserId)) return;
        setRemoteStreams((prev) => new Map(prev).set(numericUserId, stream));
      },
      onRemoteStreamEnded: (userId) => {
        const numericUserId = Number(userId);
        if (!Number.isFinite(numericUserId)) return;
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(numericUserId);
          return next;
        });
        setSpeakingLevels((prev) => {
          const next = new Map(prev);
          next.delete(numericUserId);
          return next;
        });
        const cleanup = analyserCleanupsRef.current.get(
          `remote:${numericUserId}`,
        );
        if (cleanup) {
          cleanup();
          analyserCleanupsRef.current.delete(`remote:${numericUserId}`);
        }
      },
      onLocalStream: (stream) => setLocalStream(stream),
    };

    const manager = new CircleRealtimeSessionManager({
      baseUrl: base,
      sessionId,
      selfUserId: myUserId,
      authHeaders,
      videoEnabled: session.video_enabled,
      onTransportChange: (transport) => {
        if (cancelled) return;
        mediaTransportRef.current = transport;
        setMediaReady(!!transport);
        if (!transport) {
          setRemoteStreams(new Map());
          setLocalStream(null);
          for (const cleanup of analyserCleanupsRef.current.values()) cleanup();
          analyserCleanupsRef.current.clear();
        }
      },
      onStateChange: (state: ContinuityState) => {
        if (cancelled) return;
        switch (state) {
          case "connecting":
            setConnectionStatus("connecting");
            break;
          case "live":
            setConnectionStatus("connected");
            setMediaError((prev) =>
              prev?.startsWith("Media connection") ? null : prev,
            );
            break;
          case "reconnecting":
          case "token_refresh":
            if (state === "reconnecting") reconnectCountRef.current += 1;
            setConnectionStatus("reconnecting");
            break;
          case "lost":
            setConnectionStatus("lost");
            setMediaError(
              "Media connection lost. Check your network or try rejoining the Spiral.",
            );
            break;
        }
      },
      onMediaError: (device, message) => {
        if (cancelled) return;
        if (device === "camera") setVideoOn(false);
        if (device === "microphone") setMicOn(false);
        setMediaError(message);
      },
      ...callbacks,
    });
    sessionManagerRef.current = manager;
    reconnectCountRef.current = 0;
    manager.start().catch((error) => {
      if (cancelled) return;
      setMediaReady(false);
      setConnectionStatus("lost");
      const description = mediaTokenErrorMessage(error);
      setMediaError(description);
      toast({
        title: "Media connection failed",
        description,
        variant: "destructive",
      });
    });

    const analyserCleanups = analyserCleanupsRef.current;
    return () => {
      cancelled = true;
      sessionManagerRef.current = null;
      manager.destroy();
      mediaTransportRef.current = null;
      setMediaReady(false);
      for (const cleanup of analyserCleanups.values()) cleanup();
      analyserCleanups.clear();
      // Close the shared AudioContext when the session ends
      sharedAudioCtxRef.current?.close().catch(() => {});
      sharedAudioCtxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session?.id,
    session?.video_enabled,
    myUserId,
    me?.role,
    session?.media_publish_policy,
  ]);

  useWebSocket("circle_signal", (e) => signalHandlerRef.current?.(e));

  // Lazily create the shared AudioContext for all volume analysers in this session.
  // Must be done inside a user-gesture-adjacent path or after first interaction;
  // browsers may auto-suspend it but that just means level readings pause — no crash.
  const getSharedAudioCtx = (): AudioContext | null => {
    if (
      !sharedAudioCtxRef.current ||
      sharedAudioCtxRef.current.state === "closed"
    ) {
      try {
        sharedAudioCtxRef.current = new AudioContext();
      } catch {
        return null;
      }
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
      const cleanup = startVolumeAnalyser(
        stream,
        (level) => {
          setSpeakingLevels((prev) => new Map(prev).set(userId, level));
        },
        getSharedAudioCtx(),
      );
      analyserCleanupsRef.current.set(key, cleanup);
    }
  }, [remoteStreams]);

  // Publish mic when promoted to speaker. LiveKit subscribes to room
  // publications itself; the page never manually creates peer connections.
  useEffect(() => {
    const manager = sessionManagerRef.current;
    if (!manager) return;
    // Open Spirals allow listeners to intentionally publish video. They do
    // not auto-publish a microphone, and their camera must not be torn down.
    if (!canSpeak && !canPublishMedia) {
      manager.stopLocalMedia();
      setLocalStream(null);
      setMicOn(false);
      setVideoOn(false);
      const cleanup = analyserCleanupsRef.current.get("local");
      if (cleanup) {
        cleanup();
        analyserCleanupsRef.current.delete("local");
      }
      return;
    }
    if (!canSpeak) return;

    const startMuted = me?.muted ?? false;
    manager
      .ensureMicrophone()
      .then((stream) => {
        if (startMuted) {
          manager.setMicEnabled(false);
          setMicOn(false);
        } else {
          setMicOn(true);
        }
        setLocalStream(stream);
        const key = "local";
        const existing = analyserCleanupsRef.current.get(key);
        if (existing) existing();
        const cleanup = startVolumeAnalyser(
          stream,
          setLocalLevel,
          getSharedAudioCtx(),
        );
        analyserCleanupsRef.current.set(key, cleanup);
      })
      .catch((error) => {
        setMicOn(false);
        setMediaError(mediaErrorMessage(error, "microphone"));
        toast({
          title: "Microphone unavailable",
          description: mediaErrorMessage(error, "microphone"),
          variant: "destructive",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak, canPublishMedia, mediaReady]);

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
        sessionManagerRef.current?.markRtcRendering("audio");
      }
    }
    for (const [userId] of Array.from(audioElsRef.current)) {
      if (!remoteStreams.has(userId)) {
        const el = audioElsRef.current.get(userId);
        if (el) {
          el.pause();
          el.srcObject = null;
        }
        audioElsRef.current.delete(userId);
      }
    }
  }, [remoteStreams]);

  useEffect(() => {
    if (localStream?.getVideoTracks().length) {
      sessionManagerRef.current?.markRtcRendering("video");
    }
    for (const stream of remoteStreams.values()) {
      if (stream.getVideoTracks().length) {
        sessionManagerRef.current?.markRtcRendering("video");
      }
    }
  }, [localStream, remoteStreams]);

  // ── Upload recording blob (with retry + IndexedDB recovery) ─────────────
  const uploadRecording = useCallback(
    async (blob: Blob, elapsedSeconds?: number) => {
      if (!isHost) return;
      // Persist to IDB first — if the upload fails, the blob is recoverable
      // after a page reload (see the on-mount recovery check below).
      await saveRecordingToIdb(sessionId, blob);
      setUploading(true);
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const token = getToken();
          const duration = elapsedSeconds ?? recordingElapsedSecondsRef.current;
          const uploadUrl = recordingId
            ? `${base}/api/audio-circle-sessions/${sessionId}/recording/${recordingId}/finalize${duration > 0 ? `?duration=${duration}` : ""}`
            : `${base}/api/audio-circle-sessions/${sessionId}/recording-upload${duration > 0 ? `?duration=${duration}` : ""}`;
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Type": blob.type || "audio/webm",
              Authorization: token ? `Bearer ${token}` : "",
            },
            body: blob,
          });
          if (res.ok) {
            await clearRecordingFromIdb(sessionId);
            toast({
              title: "Recording saved",
              description:
                "The Spiral recording is now available in past recordings.",
            });
            // Send metadata (duration + size) to the backend so the archive
            // can show it even before AI processing completes.
            if (duration > 0 && !recordingId) {
              try {
                await fetch(
                  `${base}/api/audio-circle-sessions/${sessionId}/recording-metadata`,
                  {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      ...authHeaders(),
                    },
                    body: JSON.stringify({
                      recording_duration_seconds: duration,
                      recording_size_bytes: blob.size,
                    }),
                  },
                );
              } catch {
                /* best-effort — metadata is nice-to-have */
              }
            }
            setUploading(false);
            return;
          }
          const errData = await res.json().catch(() => ({}));
          if (attempt === MAX_ATTEMPTS) {
            toast({
              title: "Recording upload failed",
              description:
                (errData.error ?? "Check your connection.") +
                " Recording saved locally — reload to retry.",
              variant: "destructive",
            });
          }
        } catch {
          if (attempt === MAX_ATTEMPTS) {
            toast({
              title: "Recording upload failed",
              description:
                "Recording saved locally — reload the page to retry uploading.",
              variant: "destructive",
            });
          }
        }
        // Exponential backoff: 2 s, 4 s
        if (attempt < MAX_ATTEMPTS)
          await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      setUploading(false);
    },
    [base, sessionId, isHost, recordingId],
  );

  // ── Leave / cleanup ────────────────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    if (isNaN(sessionId)) return;
    const url = `${base}/api/audio-circle-sessions/${sessionId}/leave`;
    const token = getToken();
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
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
    const p = e.payload as {
      session_id: number;
      user_id: number;
      name?: string;
      avatar_url?: string | null;
      role?: string;
      join_path?: string;
      invited_by?: string | null;
    };
    if (p.session_id !== sessionId) return;
    const joinedVia: Participant["joined_via"] =
      p.join_path === "link" ? "link" : p.invited_by ? "invite" : "direct";
    setParticipants((prev) =>
      prev.some((x) => x.user_id === p.user_id)
        ? prev
        : [
            ...prev,
            {
              user_id: p.user_id,
              role: (p.role as Participant["role"]) ?? "listener",
              hand_raised: false,
              muted: false,
              name: p.name ?? "Someone",
              avatar_url: p.avatar_url ?? null,
              joined_via: joinedVia,
              invited_by: p.invited_by ?? null,
            },
          ],
    );
  });

  useWebSocket("circle_participant_left", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) => prev.filter((x) => x.user_id !== p.user_id));
    handRaisedAtRef.current.delete(p.user_id);
  });

  useWebSocket("circle_hand_raised", (e) => {
    const p = e.payload as {
      session_id: number;
      user_id: number;
      raised: boolean;
    };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) =>
      prev.map((x) =>
        x.user_id === p.user_id ? { ...x, hand_raised: p.raised } : x,
      ),
    );
    if (p.raised) {
      handRaisedAtRef.current.set(p.user_id, Date.now());
    } else {
      handRaisedAtRef.current.delete(p.user_id);
    }
  });

  useWebSocket("circle_role_changed", (e) => {
    const p = e.payload as {
      session_id: number;
      user_id: number;
      role: Participant["role"];
    };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) =>
      prev.map((x) =>
        x.user_id === p.user_id
          ? { ...x, role: p.role, hand_raised: false }
          : x,
      ),
    );
  });

  useWebSocket("circle_cohost_assigned", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) =>
      prev.map((x) =>
        x.user_id === p.user_id
          ? { ...x, role: "co_host" as const, hand_raised: false }
          : x,
      ),
    );
    if (p.user_id === myUserId)
      toast({
        title: "You are now a co-host",
        description: "You can promote, demote, mute, and remove participants.",
      });
  });

  useWebSocket("circle_cohost_removed", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) =>
      prev.map((x) =>
        x.user_id === p.user_id ? { ...x, role: "listener" as const } : x,
      ),
    );
    if (p.user_id === myUserId) toast({ title: "You are no longer a co-host" });
  });

  useWebSocket("circle_muted", (e) => {
    const p = e.payload as {
      session_id: number;
      user_id: number | null;
      muted: boolean;
      all?: boolean;
    };
    if (p.session_id !== sessionId) return;
    if (p.all) {
      setParticipants((prev) =>
        prev.map((x) => (x.role === "speaker" ? { ...x, muted: true } : x)),
      );
      if (me?.role === "speaker") {
        setMicOn(false);
        sessionManagerRef.current?.setMicEnabled(false);
        toast({ title: "The host muted everyone" });
      }
    } else if (p.user_id !== null) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === p.user_id ? { ...x, muted: p.muted } : x,
        ),
      );
      if (p.user_id === myUserId) {
        setMicOn(!p.muted);
        sessionManagerRef.current?.setMicEnabled(!p.muted);
        toast({
          title: p.muted ? "The host muted you" : "The host unmuted you",
        });
      }
    }
  });

  useWebSocket("circle_kicked", (e) => {
    const p = e.payload as { session_id: number; user_id: number };
    if (p.session_id !== sessionId) return;
    if (p.user_id === myUserId) {
      toast({
        title: "You were removed from this Spiral",
        variant: "destructive",
      });
      setLocation(SPIRALS_PATHS.discovery);
      return;
    }
    setParticipants((prev) => prev.filter((x) => x.user_id !== p.user_id));
  });

  useWebSocket("circle_reaction", (e) => {
    const p = e.payload as {
      session_id: number;
      emoji: string;
      user_id?: number;
    };
    if (p.session_id !== sessionId) return;
    // Skip: sender already saw an optimistic reaction via react()
    if (p.user_id === myUserId) return;
    const id = `ws-${Date.now()}-${Math.random()}`;
    const x = (Math.random() - 0.5) * 160; // horizontal spread ±80 px
    const drift = (Math.random() - 0.5) * 40; // pre-computed lateral drift
    setFloatingReactions((prev) => [...prev, { id, emoji: p.emoji, x, drift }]);
    setTimeout(
      () => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)),
      2400,
    );
    const senderName =
      participants.find((x) => x.user_id === p.user_id)?.name ?? "Someone";
    setReactionLog((prev) => [
      ...prev.slice(-19),
      { id, emoji: p.emoji, name: senderName },
    ]);
  });

  useWebSocket("circle_chat_message", (e) => {
    const p = e.payload as ChatMessage & { session_id: number };
    if (p.session_id !== sessionId) return;
    // Deduplicate by id — prevents double-append when history was already
    // loaded on mount (the sender receives the WS event AND may have fetched
    // history that includes the same message if they reconnected quickly).
    setChatMessages((prev) => {
      if (prev.some((m) => m.id === p.id)) return prev;
      return [
        ...prev,
        {
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          avatar_url: p.avatar_url,
          body: p.body,
          created_at: p.created_at,
        },
      ];
    });
    // Increment unread badge when the user is on the Room tab
    if (activeTabRef.current !== "chat") {
      setUnreadChatCount((c) => c + 1);
    }
  });

  useWebSocket("circle_hands_lowered", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    setParticipants((prev) => prev.map((x) => ({ ...x, hand_raised: false })));
  });

  useWebSocket("circle_recording_changed", (e) => {
    const p = e.payload as {
      session_id: number;
      recording_id?: number;
      is_recording: boolean;
    };
    if (p.session_id !== sessionId) return;
    if (p.recording_id) setRecordingId(p.recording_id);
    const wasRecording = isRecordingRef.current;
    isRecordingRef.current = p.is_recording;
    setSession((prev) =>
      prev ? { ...prev, is_recording: p.is_recording } : prev,
    );
    if (isHost) {
      if (p.is_recording && !wasRecording) {
        recordingElapsedSecondsRef.current = 0;
        try {
          sessionManagerRef.current?.startRecording();
        } catch {
          isRecordingRef.current = false;
          setSession((prev) =>
            prev ? { ...prev, is_recording: false } : prev,
          );
          toast({
            title: "Couldn't start recording",
            description: "Your media connection does not support recording.",
            variant: "destructive",
          });
          void post("/recording", { is_recording: false });
        }
      } else if (!p.is_recording && wasRecording) {
        const elapsed = recordingElapsedSecondsRef.current;
        const stopPromise = sessionManagerRef.current?.stopRecording();
        if (stopPromise) {
          void stopPromise
            .then((blob) => {
              if (blob && blob.size > 0) void uploadRecording(blob, elapsed);
            })
            .catch(() => {
              toast({
                title: "Recording could not be finalized",
                description:
                  "The Spiral has stopped recording, but no audio file was produced.",
                variant: "destructive",
              });
            });
        }
      }
    }
  });

  useWebSocket("circle_recording_authorized", (e) => {
    const p = e.payload as { session_id: number; recording_id: number };
    if (p.session_id !== sessionId) return;
    setRecordingId(p.recording_id);
    setRecordingConsented(false);
    setRecordingPendingCount(participants.length);
    toast({
      title: "Recording consent requested",
      description: "Acknowledge below if you agree to this Spiral being recorded.",
    });
  });

  useWebSocket("circle_recording_consent_updated", (e) => {
    const p = e.payload as {
      session_id: number;
      recording_id: number;
      missing_consent_count: number;
    };
    if (p.session_id !== sessionId || p.recording_id !== recordingId) return;
    setRecordingPendingCount(p.missing_consent_count);
  });

  useEffect(() => {
    if (
      !isHost ||
      !session?.is_recording ||
      !sessionManagerRef.current ||
      isRecordingRef.current
    )
      return;
    isRecordingRef.current = true;
    try {
      sessionManagerRef.current?.startRecording();
    } catch {
      isRecordingRef.current = false;
      setSession((prev) => (prev ? { ...prev, is_recording: false } : prev));
      setMediaError("Recording is unavailable on this media connection.");
      void post("/recording", { is_recording: false });
    }
    // `post` is declared in the actions section below; this effect is keyed to
    // the room/media lifecycle so it must not rerun on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, session?.is_recording, session?.id, mediaReady]);

  useWebSocket("circle_recording_available", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    if (!isHost)
      toast({
        title: "Recording available",
        description: "Check Past Recordings.",
      });
  });

  useWebSocket("circle_recording_status_updated", (e) => {
    const p = e.payload as { session_id: number; recording_status: string };
    if (p.session_id !== sessionId) return;
    // Refresh the archive if it's open so the new status/summary appears.
    if (showRecordingArchive) {
      setRecordingArchive((prev) =>
        prev.map((r) =>
          r.id === p.session_id
            ? { ...r, recording_status: p.recording_status }
            : r,
        ),
      );
    }
    if (p.recording_status === "ready") {
      toast({
        title: "Recording processed",
        description: "AI summary and chapters are ready.",
      });
    } else if (p.recording_status === "failed") {
      toast({
        title: "AI processing failed",
        description: "The recording is still available without a summary.",
        variant: "destructive",
      });
    }
  });

  useWebSocket("circle_session_ended", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    toast({ title: "The host ended this Spiral" });
    setLocation(SPIRALS_PATHS.discovery);
  });

  useWebSocket("circle_settings_updated", (e) => {
    const p = e.payload as {
      session_id: number;
      topic: string | null;
      description: string | null;
      max_speakers: number;
    };
    if (p.session_id !== sessionId) return;
    setSession((prev) =>
      prev
        ? {
            ...prev,
            topic: p.topic,
            description: p.description,
            max_speakers: p.max_speakers,
          }
        : prev,
    );
  });

  useWebSocket("circle_host_disconnected", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    setConnectionStatus("reconnecting");
    toast({
      title: "Host reconnecting…",
      description: "The Spiral is still open — hang tight.",
    });
  });

  useWebSocket("circle_host_reconnected", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    // Host presence recovery does not prove that this browser's WebRTC peers
    // recovered. Keep the media indicator honest until the mesh reports it.
    setConnectionStatus("reconnecting");
    toast({ title: "Host is back" });
  });

  useWebSocket("circle_invite", (e) => {
    const p = e.payload as {
      session_id: number;
      circle_title: string;
      topic?: string | null;
      invited_by: string;
    };
    // This event is sent directly to the invited user. Show a persistent
    // (5s) toast with a join button so they can enter the room with one tap.
    const joinPath = SPIRALS_PATHS.room(p.session_id);
    toast({
      title: `You've been invited to "${p.circle_title}"`,
      description: `${p.invited_by} invited you${p.topic ? ` · ${p.topic}` : ""}`,
      duration: 10000, // 10s — enough time to read and decide
    });
    // Also show a secondary action toast so they can navigate immediately.
    // Using two toasts avoids needing a ToastAction element import.
    setTimeout(() => {
      toast({
        title: "Tap to join the Spiral",
        description: p.circle_title,
        duration: 9000,
        action: (
          <button
            onClick={() => setLocation(joinPath)}
            className="text-xs font-bold text-primary hover:underline"
          >
            Join Now
          </button>
        ) as unknown as undefined,
      });
    }, 200);
  });

  useWebSocket("circle_active_speaker", (e) => {
    const p = e.payload as {
      session_id: number;
      user_id: number;
      reporter_id: number;
    };
    if (p.session_id !== sessionId) return;
    setActiveSpeakerId(p.user_id);
    // Auto-clear after 3s if no fresh event arrives (speaker went quiet).
    setTimeout(
      () => setActiveSpeakerId((prev) => (prev === p.user_id ? null : prev)),
      3000,
    );
  });

  useWebSocket("circle_host_transfer", (e) => {
    const p = e.payload as {
      session_id: number;
      new_host_id: number;
      former_host_id: number;
    };
    if (p.session_id !== sessionId) return;
    // Swap roles in local state
    setParticipants((prev) =>
      prev.map((x) => {
        if (x.user_id === p.new_host_id) return { ...x, role: "host" as const };
        if (x.user_id === p.former_host_id)
          return { ...x, role: "co_host" as const };
        return x;
      }),
    );
    if (p.new_host_id === myUserId) {
      toast({ title: "You are now the host of this Spiral!" });
    } else if (p.former_host_id === myUserId) {
      toast({
        title: "Host role transferred",
        description: "You are now a co-host.",
      });
    }
  });

  // ── Creator Tools WebSocket handlers ──────────────────────────────────────
  useWebSocket("circle_poll_created", (e) => {
    const p = e.payload as {
      session_id: number;
      poll_id: string;
      question: string;
      options: string[];
    };
    if (p.session_id !== sessionId) return;
    setActivePoll({
      id: p.poll_id,
      question: p.question,
      options: p.options.map((text) => ({ text, votes: [] })),
    });
    setMyPollVote(null);
    toast({ title: "New poll started", description: p.question });
  });

  useWebSocket("circle_poll_vote", (e) => {
    const p = e.payload as {
      session_id: number;
      poll_id: string;
      option_index: number;
      user_id: number;
    };
    if (
      p.session_id !== sessionId ||
      !activePoll ||
      activePoll.id !== p.poll_id
    )
      return;
    setActivePoll((prev) =>
      prev
        ? {
            ...prev,
            options: prev.options.map((opt, i) => ({
              ...opt,
              votes:
                i === p.option_index
                  ? [...opt.votes, p.user_id]
                  : opt.votes.filter((v) => v !== p.user_id),
            })),
          }
        : prev,
    );
  });

  useWebSocket("circle_poll_closed", (e) => {
    const p = e.payload as { session_id: number; poll_id: string };
    if (p.session_id !== sessionId) return;
    setActivePoll(null);
    setMyPollVote(null);
  });

  useWebSocket("circle_qa_question", (e) => {
    const p = e.payload as {
      session_id: number;
      question_id: string;
      user_id: number;
      name: string;
      question: string;
    };
    if (p.session_id !== sessionId) return;
    setQaQuestions((prev) => [
      ...prev,
      {
        id: p.question_id,
        user_id: p.user_id,
        name: p.name,
        question: p.question,
        answered: false,
      },
    ]);
  });

  useWebSocket("circle_qa_answered", (e) => {
    const p = e.payload as {
      session_id: number;
      question_id: string;
      answer: string;
    };
    if (p.session_id !== sessionId) return;
    setQaQuestions((prev) =>
      prev.map((q) =>
        q.id === p.question_id ? { ...q, answered: true, answer: p.answer } : q,
      ),
    );
  });

  useWebSocket("circle_notes_updated", (e) => {
    const p = e.payload as { session_id: number; notes: string };
    if (p.session_id !== sessionId) return;
    setSharedNotes(p.notes);
  });

  useWebSocket("circle_auto_remove", (e) => {
    const p = e.payload as {
      session_id: number;
      user_id: number;
      reason: string;
    };
    if (p.session_id !== sessionId) return;
    if (p.user_id === myUserId) {
      toast({
        title: "You were removed",
        description: p.reason,
        variant: "destructive",
      });
      setLocation(SPIRALS_PATHS.discovery);
    }
  });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const post = async (path: string, body?: object) => {
    try {
      const res = await fetch(
        `${base}/api/audio-circle-sessions/${sessionId}${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body ?? {}),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Action failed",
          description: data.error ?? "Try again.",
          variant: "destructive",
        });
      }
      return res.ok;
    } catch {
      toast({
        title: "Connection issue",
        description:
          "Couldn't reach the server — check your connection and try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const acknowledgeRecording = async () => {
    if (!recordingId) return;
    setRecordingConsentSubmitting(true);
    try {
      const consentResponse = await fetch(
        `${base}/api/audio-circle-sessions/${sessionId}/recording/${recordingId}/consent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: "{}",
        },
      );
      const consentData = await consentResponse.json().catch(() => ({}));
      if (!consentResponse.ok) {
        throw new Error(consentData.error ?? "Could not save consent");
      }
      setRecordingConsented(true);

      if (isHost) {
        const startResponse = await fetch(
          `${base}/api/audio-circle-sessions/${sessionId}/recording/${recordingId}/start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: "{}",
          },
        );
        const startData = await startResponse.json().catch(() => ({}));
        if (!startResponse.ok && startResponse.status !== 409) {
          throw new Error(startData.error ?? "Could not start recording");
        }
        if (startResponse.status === 409) {
          // Keep the host's consent banner actionable so they can retry after
          // the remaining participants acknowledge.
          setRecordingConsented(false);
          setRecordingPendingCount(Number(startData.missing_consent_count) || 0);
          toast({ title: "Waiting for consent", description: startData.error });
        }
      }
    } catch (error) {
      toast({
        title: "Consent was not saved",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRecordingConsentSubmitting(false);
    }
  };

  const patchSession = async (body: object) => {
    try {
      const res = await fetch(
        `${base}/api/audio-circle-sessions/${sessionId}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Update failed",
          description: data.error ?? "Try again.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch {
      toast({
        title: "Connection issue",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const toggleHand = async () => {
    const raised = !me?.hand_raised;
    if (await post("/hand", { raised })) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === myUserId ? { ...x, hand_raised: raised } : x,
        ),
      );
    }
  };
  const promote = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/promote", { user_id: userId })) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === userId
            ? { ...x, role: "speaker" as const, hand_raised: false }
            : x,
        ),
      );
    }
  };
  const assignCohost = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/assign-cohost", { user_id: userId })) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === userId
            ? { ...x, role: "co_host" as const, hand_raised: false }
            : x,
        ),
      );
      toast({ title: "Co-host assigned" });
    }
  };
  const removeCohost = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/remove-cohost", { user_id: userId })) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === userId ? { ...x, role: "listener" as const } : x,
        ),
      );
      toast({ title: "Co-host removed" });
    }
  };
  const demote = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/demote", { user_id: userId })) {
      setParticipants((prev) =>
        prev.map((x) =>
          x.user_id === userId
            ? { ...x, role: "listener" as const, hand_raised: false }
            : x,
        ),
      );
    }
  };
  const muteUser = async (userId: number, muted: boolean) => {
    setModMenuOpen(null);
    if (await post("/mute", { user_id: userId, muted })) {
      setParticipants((prev) =>
        prev.map((x) => (x.user_id === userId ? { ...x, muted } : x)),
      );
    }
  };
  const muteAll = async () => {
    if (await post("/mute-all")) {
      setParticipants((prev) =>
        prev.map((x) => (x.role === "speaker" ? { ...x, muted: true } : x)),
      );
    }
  };
  const kickUser = async (userId: number) => {
    setModMenuOpen(null);
    if (await post("/kick", { user_id: userId })) {
      setParticipants((prev) => prev.filter((x) => x.user_id !== userId));
    }
  };
  const blockUser = async (userId: number) => {
    setShowBlockConfirm(null);
    if (await post("/block", { user_id: userId })) {
      setParticipants((prev) => prev.filter((x) => x.user_id !== userId));
      toast({
        title: "User blocked",
        description:
          "They have been removed from this Spiral and blocked from rejoining.",
      });
    }
  };
  const reportUser = async (userId: number) => {
    if (!reportReason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }
    setShowReportModal(null);
    if (await post("/report", { user_id: userId, reason: reportReason })) {
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe.",
      });
      setReportReason("");
    }
  };
  const react = (emoji: string) => {
    // Optimistic: sender sees reaction immediately without waiting for the WS round-trip.
    const id = `opt-${Date.now()}-${Math.random()}`;
    const x = (Math.random() - 0.5) * 160;
    const drift = (Math.random() - 0.5) * 40;
    setFloatingReactions((prev) => [...prev, { id, emoji, x, drift }]);
    setTimeout(
      () => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)),
      2400,
    );
    const myName =
      participants.find((p) => p.user_id === myUserId)?.name ?? "You";
    setReactionLog((prev) => [...prev.slice(-19), { id, emoji, name: myName }]);
    return post("/react", { emoji });
  };

  const sendChat = async () => {
    const body = chatInput.trim();
    if (!body) return;
    setChatInput("");
    await post("/chat", { body });
  };

  const lowerAllHands = async () => {
    if (await post("/lower-all-hands")) {
      setParticipants((prev) =>
        prev.map((x) => ({ ...x, hand_raised: false })),
      );
    }
  };

  const dismissHand = async (userId: number) => {
    setParticipants((prev) =>
      prev.map((x) =>
        x.user_id === userId ? { ...x, hand_raised: false } : x,
      ),
    );
    handRaisedAtRef.current.delete(userId);
    await post("/hand", { raised: false, user_id: userId });
  };

  const updateSettings = async () => {
    if (!session) return;
    setSavingSettings(true);
    const body: Record<string, unknown> = {};
    if (settingsTopic !== (session.topic ?? "")) body.topic = settingsTopic;
    if (settingsDesc !== (session.description ?? ""))
      body.description = settingsDesc;
    if (settingsSpeakerLimit !== session.max_speakers)
      body.max_speakers = settingsSpeakerLimit;
    if (Object.keys(body).length === 0) {
      setShowSettingsModal(false);
      setSavingSettings(false);
      return;
    }
    const ok = await patchSession(body);
    setSavingSettings(false);
    if (ok) {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              topic:
                body.topic !== undefined
                  ? (body.topic as string) || null
                  : prev.topic,
              description:
                body.description !== undefined
                  ? (body.description as string) || null
                  : prev.description,
              max_speakers:
                body.max_speakers !== undefined
                  ? (body.max_speakers as number)
                  : prev.max_speakers,
            }
          : prev,
      );
      setShowSettingsModal(false);
      toast({ title: "Settings updated" });
    }
  };

  // ── Recording archive custom-event listener ──────────────────────────────
  // The "Past Recordings" button lives inside ManagementPanelBody which
  // can't close over this component's state setters directly — it uses a
  // CustomEvent so the room component can handle it.
  useEffect(() => {
    const handler = () => loadRecordingArchive();
    window.addEventListener("circle:open-archive", handler);
    return () => window.removeEventListener("circle:open-archive", handler);
  }, [session?.circle_id]);

  // ── Device enumeration — runs once after mic permission is granted ─────────
  // After getUserMedia succeeds (localStream is set), enumerate devices so
  // the labels are populated (browsers hide labels until permission is granted).
  // Also re-enumerate when the OS reports a devicechange (plug/unplug).
  useEffect(() => {
    if (!canPublishMedia || !localStream) return;
    const refresh = () => {
      enumerateCircleDevices("audioinput").then((devices) => {
        setAudioDevices(devices);
        const currentId =
          localStream.getAudioTracks()[0]?.getSettings().deviceId ?? "";
        setSelectedAudioDeviceId((id) => id || currentId);
      });
      if (session?.video_enabled) {
        enumerateCircleDevices("videoinput").then((devices) => {
          setVideoDevices(devices);
          const currentId =
            localStream.getVideoTracks()[0]?.getSettings().deviceId ?? "";
          setSelectedVideoDeviceId((id) => id || currentId);
        });
      }
    };
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublishMedia, !!localStream, session?.video_enabled]);

  // ── Presence heartbeat ────────────────────────────────────────────────────
  // Pings /heartbeat every 30s with the current loudest speaker so the server
  // can (a) keep last_seen_at fresh for ghost-participant sweeps and (b) fan
  // out circle_active_speaker events without each client running full audio
  // analysis on every remote stream independently.
  useEffect(() => {
    if (!session || !myUserId) return;
    const sendHeartbeat = () => {
      // Find the loudest currently-speaking remote peer.
      let loudestId: number | null = null;
      let loudestLevel = 0.1; // threshold — must be actually speaking
      for (const [uid, level] of speakingLevels) {
        if (level > loudestLevel) {
          loudestLevel = level;
          loudestId = uid;
        }
      }
      // Also consider local mic (for speakers broadcasting their own volume).
      if (localLevel > loudestLevel && myUserId && canSpeak)
        loudestId = myUserId;
      const token = getToken();
      fetch(`${base}/api/audio-circle-sessions/${sessionId}/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ active_speaker_id: loudestId }),
        keepalive: true,
      }).catch(() => {});
    };
    sendHeartbeat(); // fire immediately on join
    // 10 s interval (was 30 s) — more frequent reports means active-speaker
    // highlights update in ~10 s rather than ~30 s across all clients.
    const id = setInterval(sendHeartbeat, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, myUserId]);

  // ── Recording archive loader ───────────────────────────────────────────────
  useEffect(() => {
    if (!showRecordingArchive || !session) return;
    setLoadingArchive(true);
    fetch(`${base}/api/audio-circles/${session.circle_id}/recordings`, {
      headers: authHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setRecordingArchive(data.recordings ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingArchive(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecordingArchive, session?.circle_id]);

  // ── Pending recording recovery (on-mount IDB check) ──────────────────────
  useEffect(() => {
    if (!isHost || !session) return;
    loadRecordingFromIdb(sessionId)
      .then((blob) => {
        if (blob && blob.size > 0) setPendingRecoveryBlob(blob);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, session?.id]);

  // ── Invite user search ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showInviteModal) {
      setInviteResults([]);
      setInviteSearch("");
      return;
    }
    const q = inviteSearch.trim();
    if (q.length < 2) {
      setInviteResults([]);
      return;
    }
    const controller = new AbortController();
    fetch(`${base}/api/users?q=${encodeURIComponent(q)}&limit=8`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const results = (data.users ?? []) as {
          id: number;
          name: string;
          avatar_url: string | null;
        }[];
        // Filter out users already in the room
        const inRoom = new Set(participants.map((p) => p.user_id));
        setInviteResults(results.filter((u) => !inRoom.has(u.id)));
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteSearch, showInviteModal]);

  const sendInvite = async (userId: number) => {
    setInvitingSending(userId);
    try {
      const res = await fetch(
        `${base}/api/audio-circle-sessions/${sessionId}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      if (res.ok) {
        const name = inviteResults.find((u) => u.id === userId)?.name ?? "them";
        toast({
          title: "Invite sent!",
          description: `Sent a notification to ${name}.`,
        });
        setInviteResults((prev) => prev.filter((u) => u.id !== userId));
      } else {
        const d = await res.json().catch(() => ({}));
        toast({
          title: "Couldn't send invite",
          description: d.error ?? "Try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection issue",
        description: "Couldn't send invite.",
        variant: "destructive",
      });
    } finally {
      setInvitingSending(null);
    }
  };

  const transferHost = async (userId: number) => {
    setShowTransferModal(false);
    const ok = await (async () => {
      try {
        const res = await fetch(
          `${base}/api/audio-circle-sessions/${sessionId}/transfer-host`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ user_id: userId }),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast({
            title: "Transfer failed",
            description: d.error ?? "Try again.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      } catch {
        toast({ title: "Connection issue", variant: "destructive" });
        return false;
      }
    })();
    if (ok) toast({ title: "Host role transferred" });
  };

  const loadRecordingArchive = async () => {
    setShowRecordingArchive(true);
  };

  // ── Device switching ─────────────────────────────────────────────────────────
  const switchAudioDevice = async (deviceId: string) => {
    const manager = sessionManagerRef.current;
    if (!manager) return;
    try {
      const stream = await manager.switchAudioDevice(deviceId);
      setLocalStream(stream);
      setSelectedAudioDeviceId(deviceId);
      setShowMicPicker(false);
      // Re-wire volume analyser to the new track
      const existing = analyserCleanupsRef.current.get("local");
      if (existing) existing();
      analyserCleanupsRef.current.set(
        "local",
        startVolumeAnalyser(stream, setLocalLevel, getSharedAudioCtx()),
      );
    } catch (error) {
      toast({
        title: "Couldn't switch microphone",
        description: mediaErrorMessage(error, "microphone"),
        variant: "destructive",
      });
    }
  };

  const switchVideoDevice = async (deviceId: string) => {
    const manager = sessionManagerRef.current;
    if (!manager) return;
    try {
      const stream = await manager.switchVideoDevice(deviceId);
      setLocalStream(stream);
      setSelectedVideoDeviceId(deviceId);
      setShowCamPicker(false);
    } catch (error) {
      toast({
        title: "Couldn't switch camera",
        description: mediaErrorMessage(error, "camera"),
        variant: "destructive",
      });
    }
  };

  const shareCircle = () => {
    const url = `${window.location.origin}${SPIRALS_PATHS.room(sessionId)}`;
    if (navigator.share) {
      navigator.share({ title: session?.title, url }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          toast({
            title: "Link copied!",
            description: "Share it with your neighbors.",
          });
        })
        .catch(() => {});
    }
  };

  const exportEnduranceReport = () => {
    const collector = enduranceRef.current;
    const rtcDiagnostics = sessionManagerRef.current?.exportRtcDiagnostics();
    if (!collector && !rtcDiagnostics) {
      toast({
        title: "Diagnostics not ready",
        description: "Media sampling starts when the Spiral connects.",
      });
      return;
    }
    const report = collector?.stop();
    enduranceRef.current = null;
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionId,
      ...(report ? { endurance: report } : {}),
      ...(rtcDiagnostics ? { rtc: JSON.parse(rtcDiagnostics) } : {}),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `circle-${sessionId}-webrtc-diagnostics.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Diagnostics exported",
      description: report
        ? `${report.sampleCount} samples over ${report.durationSec}s plus RTC milestones.`
        : "RTC milestones and connection state saved as JSON.",
    });
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}${SPIRALS_PATHS.room(sessionId)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast({
          title: "Invite link copied!",
          description: "Paste it anywhere to invite people.",
        });
      })
      .catch(() => {
        toast({
          title: "Copy failed",
          description: url,
          variant: "destructive",
        });
      });
  };

  const endSession = async () => {
    if (isRecordingRef.current) await toggleRecording();
    await post("/end");
    setLocation(SPIRALS_PATHS.discovery);
  };

  const leaveAndExit = async () => {
    if (isHost && isRecordingRef.current) await toggleRecording();
    leaveRoom();
    setLocation(SPIRALS_PATHS.discovery);
  };

  const toggleMic = () => {
    const next = !micOn;
    if (next && me?.muted) {
      toast({
        title: "Microphone muted by host",
        description: "The host must unmute you before you can speak.",
      });
      return;
    }
    if (!next) {
      sessionManagerRef.current?.setMicEnabled(false);
      setMicOn(false);
      return;
    }
    if (localStream?.getAudioTracks().length) {
      sessionManagerRef.current?.setMicEnabled(true);
      setMicOn(true);
      return;
    }
    sessionManagerRef.current
      ?.ensureMicrophone()
      .then((stream) => {
        setLocalStream(stream);
        setMicOn(true);
        setMediaError(null);
        const existing = analyserCleanupsRef.current.get("local");
        if (existing) existing();
        analyserCleanupsRef.current.set(
          "local",
          startVolumeAnalyser(stream, setLocalLevel, getSharedAudioCtx()),
        );
      })
      .catch((error) => {
        setMicOn(false);
        setMediaError(mediaErrorMessage(error, "microphone"));
        toast({
          title: "Microphone unavailable",
          description: mediaErrorMessage(error, "microphone"),
          variant: "destructive",
        });
      });
  };

  const toggleVideo = async () => {
    const manager = sessionManagerRef.current;
    if (!manager || !session?.video_enabled) return;
    const next = !videoOn;
    if (next) {
      try {
        const stream = await manager.enableCamera();
        setLocalStream(stream);
        setVideoOn(true);
        setMediaError(null);
      } catch (error) {
        const description = mediaErrorMessage(error, "camera");
        setMediaError(description);
        toast({
          title: "Camera unavailable",
          description,
          variant: "destructive",
        });
      }
    } else {
      manager.disableCamera();
      setLocalStream((prev) => {
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
          description:
            "Use a current Safari, Chrome, or Firefox browser to record this Spiral.",
          variant: "destructive",
        });
        return;
      }
      if (!session?.recording_allowed) {
        toast({
          title: "Recording is off",
          description: "Recording was not enabled when this Spiral was created.",
          variant: "destructive",
        });
        return;
      }
      try {
        const response = await fetch(
          `${base}/api/audio-circle-sessions/${sessionId}/recording/authorize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: "{}",
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not request recording consent");
        setRecordingId(data.recording_id);
        setRecordingConsented(false);
        setRecordingPendingCount(participants.length);
        toast({
          title: "Consent requested",
          description: "Everyone must acknowledge before recording begins.",
        });
      } catch (error) {
        toast({
          title: "Couldn't request recording",
          description: error instanceof Error ? error.message : "Try again.",
          variant: "destructive",
        });
      }
      return;
    }
    isRecordingRef.current = false;
    setSession((prev) => (prev ? { ...prev, is_recording: false } : prev));
    const ok = await post("/recording", { is_recording: false });
    if (!ok) {
      isRecordingRef.current = true;
      setSession((prev) => (prev ? { ...prev, is_recording: true } : prev));
      return;
    }
    const blob = await sessionManagerRef.current?.stopRecording();
    if (blob && blob.size > 0)
      await uploadRecording(blob, recordingElapsedSecondsRef.current);
  };

  // ── Pre-join device check ──────────────────────────────────────────────────
  // IMPORTANT: setPreJoinChecked(true) must be called first so the effect
  // guard prevents this from re-running on every re-render.
  const checkPreJoinDevices = async () => {
    setPreJoinChecked(true); // guard must be set before the async ops
    setPreJoinStatus("checking");
    setMediaError(null);
    // Participants who cannot publish media only receive remote tracks and do
    // not need to request local device permissions.
    if (!canPublishMedia) {
      setPreJoinStatus("ready");
      return;
    }
    // Establish the LiveKit room before asking the browser for a local device.
    // Otherwise the permission prompt can succeed while token minting or
    // room.connect is still failing, producing the misleading "microphone
    // opened, but the live connection failed" state.
    const manager = sessionManagerRef.current;
    if (!manager) {
      setPreJoinStatus("blocked");
      setMediaError("Spiral media is still starting. Try checking again in a moment.");
      return;
    }
    try {
      await manager.start();
    } catch {
      setPreJoinStatus("blocked");
      return;
    }
    let blocked = false;
    // Listeners can join and enable their camera without granting microphone
    // access. A speaker's microphone remains the only required device.
    if (canSpeak) {
      const microphone = await acquireCircleDevice("microphone");
      if (microphone.ok) {
        microphone.stream.getTracks().forEach((t) => t.stop());
        setPreJoinMicReady(true);
      } else {
        setPreJoinMicReady(false);
        blocked = true;
        setMediaError(microphone.message);
      }
    } else {
      setPreJoinMicReady(true);
    }
    if (session?.video_enabled) {
      const camera = await acquireCircleDevice("camera");
      if (camera.ok) {
        camera.stream.getTracks().forEach((t) => t.stop());
        setPreJoinCameraReady(true);
      } else {
        setPreJoinCameraReady(false);
        // Camera is an optional publication. Keep the Circle join/audio path
        // available and report the actionable camera-only error instead.
        setMediaError(camera.message);
      }
    }
    setPreJoinStatus(blocked ? "blocked" : "ready");
  };

  useEffect(() => {
    if (!loading && session && !preJoinChecked) {
      void checkPreJoinDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.id, preJoinChecked, canSpeak]);

  useEffect(() => {
    if (activeTab === "chat")
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeTab]);

  // ── Creator Tools actions ──────────────────────────────────────────────────
  const createPoll = async () => {
    const validOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim() || validOptions.length < 2) {
      toast({
        title: "Need a question and at least 2 options",
        variant: "destructive",
      });
      return;
    }
    setShowPollModal(false);
    const pollId = `poll-${Date.now()}`;
    setActivePoll({
      id: pollId,
      question: pollQuestion.trim(),
      options: validOptions.map((text) => ({ text, votes: [] })),
    });
    setPollQuestion("");
    setPollOptions(["", ""]);
    await post("/react", { emoji: "📊" }); // piggyback on existing WS infra for now
    toast({
      title: "Poll started!",
      description: "Participants can now vote.",
    });
  };

  const _votePoll = async (optionIndex: number) => {
    if (!activePoll || myPollVote !== null) return;
    setMyPollVote(optionIndex);
    setActivePoll((prev) =>
      prev
        ? {
            ...prev,
            options: prev.options.map((opt, i) => ({
              ...opt,
              votes: i === optionIndex ? [...opt.votes, myUserId!] : opt.votes,
            })),
          }
        : prev,
    );
  };

  const closePoll = () => {
    setActivePoll(null);
    setMyPollVote(null);
    toast({ title: "Poll closed" });
  };

  const submitQAQuestion = async () => {
    if (!qaInput.trim()) return;
    const qId = `qa-${Date.now()}`;
    const myName =
      participants.find((p) => p.user_id === myUserId)?.name ?? "You";
    setQaQuestions((prev) => [
      ...prev,
      {
        id: qId,
        user_id: myUserId!,
        name: myName,
        question: qaInput.trim(),
        answered: false,
      },
    ]);
    setQaInput("");
  };

  const answerQAQuestion = async (qId: string, answer: string) => {
    setQaQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, answered: true, answer } : q)),
    );
    toast({ title: "Answer posted" });
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStream?.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      setScreenStream(stream);
      setScreenSharing(true);
      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        setScreenStream(null);
      };
      toast({
        title: "Screen sharing started",
        description: "Others can see your screen.",
      });
    } catch (_error) {
      toast({
        title: "Screen share failed",
        description: "Couldn't access screen.",
        variant: "destructive",
      });
    }
  };

  const _saveSharedNotes = async () => {
    setNotesSaving(true);
    try {
      await post("/chat", { body: `📋 Shared Notes: ${sharedNotes}` });
      toast({ title: "Notes saved to chat" });
    } catch {
      toast({ title: "Couldn't save notes", variant: "destructive" });
    }
    setNotesSaving(false);
  };

  const toggleAutoRemove = () => {
    setAutoRemoveEnabled((prev) => !prev);
    if (!autoRemoveEnabled) {
      toast({
        title: "Auto-remove enabled",
        description: `Idle listeners will be removed after ${autoRemoveIdleMs / 60000} min.`,
      });
    } else {
      toast({ title: "Auto-remove disabled" });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Loading Spiral…
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background pb-40 relative overflow-hidden"
      onClick={() => {
        setModMenuOpen(null);
        setShowBlockConfirm(null);
        setShowMicPicker(false);
        setShowCamPicker(false);
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <button
          onClick={leaveAndExit}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-2 lg:hidden"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Spirals
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-black text-sm truncate">{session.title}</div>
              {session.topic && (
                <div className="text-[10px] font-bold text-primary/80 truncate">
                  {session.topic}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-bold text-green-400">LIVE</span>
                {session.is_recording && (
                  <span className="inline-flex items-center gap-1 text-red-400 font-bold">
                    <CircleIcon className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />
                    {recordingTimer}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {participants.length} in room
                </span>
                <span className="flex items-center gap-1">
                  <Mic className="w-3 h-3" />{" "}
                  {speakers.length + cohosts.length + (host ? 1 : 0)} on stage
                </span>
                <ConnectionQualityIndicator status={connectionStatus} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={shareCircle}
              className="p-2 rounded-full hover:bg-muted"
              title="Share this Spiral"
              aria-label="Share this Spiral"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                exportEnduranceReport();
              }}
              className="p-2 rounded-full hover:bg-muted"
              title={`Export WebRTC diagnostics${enduranceSampleCount ? ` (${enduranceSampleCount} samples)` : ""}`}
              aria-label="Export WebRTC diagnostics"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            {canMod && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowManagePanel(true);
                }}
                className="p-2 rounded-full hover:bg-muted"
                title="Manage Spiral"
                aria-label="Manage Spiral"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={leaveAndExit}
              className="p-2 rounded-full hover:bg-muted hidden lg:inline-flex"
              title="Back to Spirals"
              aria-label="Back to Spirals"
            >
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
            onClick={() => {
              setActiveTab("chat");
              setUnreadChatCount(0);
            }}
            className={`pb-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === "chat" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Chat
            {unreadChatCount > 0 && activeTab !== "chat" && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] font-black text-primary-foreground leading-none">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </button>
        </div>

        {/* Pending recording recovery banner */}
        {pendingRecoveryBlob && isHost && (
          <div className="mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5">
            <Upload className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300 flex-1">
              Unsent recording from last session found.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 text-amber-400 border-amber-400/40"
              onClick={() => {
                void uploadRecording(pendingRecoveryBlob);
                setPendingRecoveryBlob(null);
              }}
            >
              Upload
            </Button>
            <button
              onClick={() => {
                void clearRecordingFromIdb(sessionId);
                setPendingRecoveryBlob(null);
              }}
              className="p-0.5 text-amber-400/60 hover:text-amber-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="mt-2">
          <RecordingConsentBanner
            isVisible={Boolean(recordingId && !recordingConsented && !session.is_recording)}
            pendingCount={recordingPendingCount}
            onAcknowledge={() => void acknowledgeRecording()}
            isSubmitting={recordingConsentSubmitting}
          />
        </div>

        {/* Recording bar */}
        {session.is_recording && (
          <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-1.5">
            <CircleIcon className="w-3 h-3 text-red-500 fill-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-400 font-bold flex-1">
              This Spiral is being recorded
            </span>
            {isHost && (
              <span className="text-xs text-red-400 font-mono">
                {recordingTimer}
              </span>
            )}
            {uploading && (
              <Upload className="w-3 h-3 text-amber-400 animate-bounce" />
            )}
          </div>
        )}

        {/* Media status warning */}
        {mediaCapabilities &&
          (preJoinStatus !== "ready" ||
            !mediaCapabilities.microphone ||
            (isHost && !mediaCapabilities.recording) ||
            mediaError) && (
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <div className="flex items-center gap-2">
                <div className="font-bold">
                  {preJoinStatus === "checking"
                    ? "Checking media…"
                    : preJoinStatus === "blocked"
                      ? "Media setup needed"
                      : "Media status"}
                </div>
                {preJoinStatus !== "ready" && canPublishMedia && (
                  <button
                    type="button"
                    onClick={() => {
                      void checkPreJoinDevices();
                    }}
                    className="ml-auto rounded-lg border border-amber-400/40 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-400/10"
                  >
                    Check again
                  </button>
                )}
                {connectionStatus === "lost" && (
                  <button
                    type="button"
                    onClick={() => {
                      void sessionManagerRef.current?.retry("manual-rejoin");
                    }}
                    className={`${preJoinStatus !== "ready" && canPublishMedia ? "" : "ml-auto"} rounded-lg border border-amber-400/40 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-400/10`}
                  >
                    Rejoin media
                  </button>
                )}
              </div>
              <div className="mt-0.5 text-amber-200/80">
                {!mediaCapabilities.microphone &&
                  "This browser cannot access a microphone. "}
                {isHost &&
                  !mediaCapabilities.recording &&
                  "Recording is unavailable in this browser. "}
                {mediaError}
              </div>
            </div>
          )}
      </div>

      {/* ── Floating reactions ──────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-48 flex justify-center z-20">
        <AnimatePresence>
          {floatingReactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0, x: r.x, scale: 1 }}
              animate={{ opacity: 0, y: -220, x: r.x + r.drift, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: "easeOut" }}
              className="absolute text-3xl select-none"
              style={{ left: "50%" }}
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
            onClick={(e) => {
              e.stopPropagation();
              setShowEndConfirm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-base font-black">End this Spiral?</div>
              <div className="text-sm text-muted-foreground">
                This will end the Spiral for everyone in the room.
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowEndConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    setShowEndConfirm(false);
                    endSession();
                  }}
                >
                  End Spiral
                </Button>
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
            onClick={(e) => {
              e.stopPropagation();
              setShowBlockConfirm(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-base font-black text-red-400">
                <Ban className="w-5 h-5" /> Block this user?
              </div>
              <div className="text-sm text-muted-foreground">
                They will be removed from this Spiral and blocked from rejoining
                any of your future Spirals.
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowBlockConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => blockUser(showBlockConfirm!)}
                >
                  Block
                </Button>
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
            onClick={(e) => {
              e.stopPropagation();
              setShowReportModal(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-base font-black text-amber-400">
                <AlertTriangle className="w-5 h-5" /> Report user
              </div>
              <div className="text-sm text-muted-foreground">
                Please describe why you're reporting this user. This helps us
                keep the community safe.
              </div>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm min-h-[80px] resize-none focus:outline-none focus:border-primary"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowReportModal(null);
                    setReportReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => reportUser(showReportModal!)}
                >
                  Submit Report
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recording Archive Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showRecordingArchive && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowRecordingArchive(false);
              setSelectedRecording(null);
            }}
          >
            <motion.div
              className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-primary" />
                  <span className="font-black text-sm">Past Recordings</span>
                </div>
                <button
                  onClick={() => {
                    setShowRecordingArchive(false);
                    setSelectedRecording(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Hidden audio element for in-app playback */}
              <audio
                ref={audioPlayerRef}
                src={selectedRecording?.recording_url ?? undefined}
                onTimeUpdate={(e) =>
                  setAudioPlayerTime((e.target as HTMLAudioElement).currentTime)
                }
                onPlay={() => setAudioPlayerPlaying(true)}
                onPause={() => setAudioPlayerPlaying(false)}
                onEnded={() => setAudioPlayerPlaying(false)}
              />

              {/* In-app player bar (shown when a recording is selected) */}
              {selectedRecording && (
                <div className="px-4 py-3 border-b border-border bg-muted/30 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (audioPlayerPlaying) audioPlayerRef.current?.pause();
                        else audioPlayerRef.current?.play();
                      }}
                      className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:opacity-90"
                    >
                      {audioPlayerPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">
                        {selectedRecording.title || "Spiral Recording"}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {formatDuration(
                          selectedRecording.recording_duration_seconds,
                        )}
                        {selectedRecording.recording_size_bytes && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {formatFileSize(
                              selectedRecording.recording_size_bytes,
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <a
                      href={selectedRecording.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  {/* Seek bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                      {formatSeconds(audioPlayerTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={selectedRecording.recording_duration_seconds ?? 0}
                      value={audioPlayerTime}
                      onChange={(e) => {
                        const t = parseFloat(e.target.value);
                        if (audioPlayerRef.current)
                          audioPlayerRef.current.currentTime = t;
                        setAudioPlayerTime(t);
                      }}
                      className="flex-1 h-1.5 accent-primary cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground font-mono w-8">
                      {formatDuration(
                        selectedRecording.recording_duration_seconds,
                      )}
                    </span>
                  </div>

                  {/* AI Summary */}
                  {selectedRecording.ai_summary && (
                    <div className="mt-3 bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-black text-primary">
                          AI Summary
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {selectedRecording.ai_summary}
                      </p>
                    </div>
                  )}

                  {/* Chapter Markers */}
                  {selectedRecording.chapter_markers &&
                    selectedRecording.chapter_markers.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                          Chapters
                        </div>
                        {selectedRecording.chapter_markers.map((ch, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (audioPlayerRef.current) {
                                audioPlayerRef.current.currentTime = ch.start;
                                audioPlayerRef.current.play();
                              }
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-left text-xs transition-colors"
                          >
                            <span className="text-[10px] font-mono text-primary shrink-0 w-10">
                              {formatSeconds(ch.start)}
                            </span>
                            <span className="font-bold truncate flex-1">
                              {ch.title}
                            </span>
                            {audioPlayerTime >= ch.start &&
                              (!ch.end || audioPlayerTime < ch.end) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                              )}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {/* Search bar */}
              <div className="px-4 py-2 border-b border-border shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search recordings…"
                    className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Recording list */}
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {loadingArchive ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Loading recordings…
                  </div>
                ) : (
                  (() => {
                    const filtered = archiveSearch.trim()
                      ? recordingArchive.filter(
                          (r) =>
                            (r.title || "")
                              .toLowerCase()
                              .includes(archiveSearch.toLowerCase()) ||
                            (r.host_name || "")
                              .toLowerCase()
                              .includes(archiveSearch.toLowerCase()),
                        )
                      : recordingArchive;
                    if (filtered.length === 0) {
                      return (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          <PlayCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          {archiveSearch
                            ? "No recordings match your search."
                            : "No recordings yet for this Spiral."}
                        </div>
                      );
                    }
                    return filtered.map((rec) => {
                      const startedAt = rec.started_at
                        ? new Date(rec.started_at).toLocaleString()
                        : "Unknown date";
                      const isSelected = selectedRecording?.id === rec.id;
                      return (
                        <div
                          key={rec.id}
                          onClick={() => {
                            setSelectedRecording(rec);
                            setAudioPlayerTime(0);
                          }}
                          className={`bg-muted/40 border rounded-xl p-3 flex items-start gap-3 cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"}`}
                        >
                          <div
                            className={`rounded-xl p-2 shrink-0 ${isSelected ? "bg-primary/20" : "bg-primary/10"}`}
                          >
                            <PlayCircle className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">
                              {rec.title || "Spiral Recording"}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span>{startedAt}</span>
                              {rec.recording_duration_seconds && (
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatDuration(
                                    rec.recording_duration_seconds,
                                  )}
                                </span>
                              )}
                            </div>
                            {rec.host_name && (
                              <div className="text-[11px] text-muted-foreground">
                                Hosted by {rec.host_name}
                              </div>
                            )}
                            {/* Status badge */}
                            {rec.recording_status &&
                              rec.recording_status !== "ready" &&
                              rec.recording_status !== "none" && (
                                <span
                                  className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    rec.recording_status === "processing"
                                      ? "bg-amber-500/20 text-amber-400"
                                      : rec.recording_status === "failed"
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-blue-500/20 text-blue-400"
                                  }`}
                                >
                                  {rec.recording_status === "processing" && (
                                    <Upload className="w-2.5 h-2.5 animate-bounce" />
                                  )}
                                  {rec.recording_status === "recording" && (
                                    <CircleIcon className="w-2.5 h-2.5 animate-pulse" />
                                  )}
                                  {rec.recording_status === "failed" && (
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                  )}
                                  {rec.recording_status
                                    .charAt(0)
                                    .toUpperCase() +
                                    rec.recording_status.slice(1)}
                                </span>
                              )}
                            {/* AI summary indicator */}
                            {rec.ai_summary && (
                              <div className="inline-flex items-center gap-1 mt-1 ml-1 text-[9px] text-primary font-bold">
                                <FileText className="w-2.5 h-2.5" /> AI Summary
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:flex lg:items-stretch lg:gap-4 lg:px-4 lg:pt-4 lg:h-[calc(100vh-3.5rem)]">
        {/* ── Desktop-only left sidebar: People / Reactions ────────────────────── */}
        <DesktopPeopleRail
          sidebarTab={sidebarTab}
          onTabChange={setSidebarTab}
          host={host}
          cohosts={cohosts}
          speakers={speakers}
          audience={audience}
          myUserId={myUserId}
          canMod={canMod}
          reactionLog={reactionLog}
          onPromote={promote}
          speakingLevels={speakingLevels}
          localLevel={localLevel}
          activeSpeakerId={activeSpeakerId}
          videoEnabled={!!session.video_enabled}
          remoteStreams={remoteStreams}
          videoOn={videoOn}
          localStream={localStream}
        />

        {/* ── Center: Room or Chat content ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 lg:overflow-y-auto lg:max-h-[calc(100vh-3.5rem)] lg:pb-2">
          {activeTab === "chat" ? (
            <div
              className="p-4 lg:p-0 flex flex-col"
              style={{ minHeight: "50vh" }}
            >
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[60vh]">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No messages yet — say hello 👋
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2 ${m.user_id === myUserId ? "flex-row-reverse" : ""}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                        {m.avatar_url ? (
                          <img
                            src={m.avatar_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          (m.name?.[0] ?? "?")
                        )}
                      </div>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.user_id === myUserId ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        {m.user_id !== myUserId && (
                          <div className="text-[10px] font-black mb-0.5 opacity-70">
                            {m.name}
                          </div>
                        )}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendChat();
                  }}
                  placeholder="Message the room…"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-full text-sm focus:outline-none focus:border-primary"
                />
                <Button
                  size="icon"
                  onClick={sendChat}
                  disabled={!chatInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-5 lg:p-0">
              {/* Video is now embedded in the hero tiles (host/co-host) and speaker tiles — no separate grid */}

              {/* ── Stage: HOST + CO-HOST equal hero tiles (side-by-side) ─────────────── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Stage · Host{cohosts.length > 0 ? " + Co-Host" : ""}
                  </div>
                </div>
                <div
                  className="grid grid-cols-1 lg:grid-cols-2 gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Host hero */}
                  {host ? (
                    <HostHeroTile
                      participant={host}
                      isMe={host.user_id === myUserId}
                      level={
                        host.user_id === myUserId
                          ? localLevel
                          : (speakingLevels.get(host.user_id) ?? 0)
                      }
                      isActiveSpeaker={activeSpeakerId === host.user_id}
                      isLoudest={
                        loudestSpeakerId === host.user_id &&
                        loudestSpeakerId !== activeSpeakerId
                      }
                      videoStream={
                        host.user_id === myUserId
                          ? localStream
                          : (remoteStreams.get(host.user_id) ?? null)
                      }
                      videoOn={
                        host.user_id === myUserId
                          ? videoOn
                          : (remoteStreams.get(host.user_id)?.getVideoTracks()
                              .length ?? 0) > 0
                      }
                      size="full"
                      canMod={false}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground py-3">
                      Host has left — hanging tight…
                    </div>
                  )}
                  {/* First co-host as equal second hero */}
                  {cohosts[0] && (
                    <HostHeroTile
                      participant={cohosts[0]}
                      isMe={cohosts[0].user_id === myUserId}
                      level={
                        cohosts[0].user_id === myUserId
                          ? localLevel
                          : (speakingLevels.get(cohosts[0].user_id) ?? 0)
                      }
                      isActiveSpeaker={activeSpeakerId === cohosts[0].user_id}
                      isLoudest={
                        loudestSpeakerId === cohosts[0].user_id &&
                        loudestSpeakerId !== activeSpeakerId
                      }
                      videoStream={
                        cohosts[0].user_id === myUserId
                          ? localStream
                          : (remoteStreams.get(cohosts[0].user_id) ?? null)
                      }
                      videoOn={
                        cohosts[0].user_id === myUserId
                          ? videoOn
                          : (remoteStreams
                              .get(cohosts[0].user_id)
                              ?.getVideoTracks().length ?? 0) > 0
                      }
                      size="full"
                      canMod={canMod && cohosts[0].user_id !== myUserId}
                      modMenuOpen={modMenuOpen === cohosts[0].user_id}
                      onOpenMod={() =>
                        setModMenuOpen((prev) =>
                          prev === cohosts[0].user_id
                            ? null
                            : cohosts[0].user_id,
                        )
                      }
                      onMute={() =>
                        muteUser(cohosts[0].user_id, !cohosts[0].muted)
                      }
                      onDemote={() => demote(cohosts[0].user_id)}
                      onKick={() => kickUser(cohosts[0].user_id)}
                      onBlock={() => setShowBlockConfirm(cohosts[0].user_id)}
                      onReport={() => setShowReportModal(cohosts[0].user_id)}
                      onRemoveCohost={
                        isHost
                          ? () => removeCohost(cohosts[0].user_id)
                          : undefined
                      }
                    />
                  )}
                </div>
                {/* Additional co-hosts (3rd+) in a compact row below the heroes */}
                {cohosts.length > 1 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Shield className="w-3 h-3 text-blue-400" />
                      <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                        Co-Hosts ({cohosts.length - 1})
                      </div>
                    </div>
                    <div
                      className="flex gap-2 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cohosts.slice(1).map((c) => (
                        <HostHeroTile
                          key={c.user_id}
                          participant={c}
                          isMe={c.user_id === myUserId}
                          level={
                            c.user_id === myUserId
                              ? localLevel
                              : (speakingLevels.get(c.user_id) ?? 0)
                          }
                          isActiveSpeaker={activeSpeakerId === c.user_id}
                          isLoudest={
                            loudestSpeakerId === c.user_id &&
                            loudestSpeakerId !== activeSpeakerId
                          }
                          videoStream={
                            c.user_id === myUserId
                              ? localStream
                              : (remoteStreams.get(c.user_id) ?? null)
                          }
                          videoOn={
                            c.user_id === myUserId
                              ? videoOn
                              : (remoteStreams.get(c.user_id)?.getVideoTracks()
                                  .length ?? 0) > 0
                          }
                          size="half"
                          canMod={canMod && c.user_id !== myUserId}
                          modMenuOpen={modMenuOpen === c.user_id}
                          onOpenMod={() =>
                            setModMenuOpen((prev) =>
                              prev === c.user_id ? null : c.user_id,
                            )
                          }
                          onMute={() => muteUser(c.user_id, !c.muted)}
                          onDemote={() => demote(c.user_id)}
                          onKick={() => kickUser(c.user_id)}
                          onBlock={() => setShowBlockConfirm(c.user_id)}
                          onReport={() => setShowReportModal(c.user_id)}
                          onRemoveCohost={
                            isHost ? () => removeCohost(c.user_id) : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Speaker limit warning ────────────────────────────────────────────── */}
              {canMod &&
                nearSpeakerLimit &&
                audience.some((l) => l.hand_raised) && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs text-amber-300">
                      {atSpeakerLimit
                        ? `Speaker limit reached (${session.max_speakers}). Lower the limit in Settings or demote a speaker to bring up more hands.`
                        : `Almost at the speaker limit (${onStageCurrent}/${session.max_speakers}).`}
                    </span>
                  </div>
                )}

              {/* ── Stage: SPEAKERS ─────────────────────────────────────────────────── */}
              {(speakers.length > 0 || canMod) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Speakers ({speakers.length})
                    </div>
                    <div className="flex items-center gap-3">
                      {speakers.length > 4 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSpeakersAll((v) => !v);
                          }}
                          className="text-[10px] font-bold text-primary hover:opacity-70"
                        >
                          {showSpeakersAll
                            ? "Show less"
                            : `View All (${speakers.length})`}
                        </button>
                      )}
                      {canMod && speakers.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            muteAll();
                          }}
                          className="text-[10px] font-bold text-amber-400 flex items-center gap-1 hover:opacity-70"
                        >
                          <VolumeX className="w-3 h-3" /> Mute all
                        </button>
                      )}
                    </div>
                  </div>
                  {speakers.length === 0 ? (
                    <div className="text-xs text-muted-foreground/60 italic">
                      No speakers yet — bring up a hand-raiser above
                    </div>
                  ) : (
                    (() => {
                      // Sort: active speaker first, then by speaking level (loudest first)
                      const sortedSpeakers = [...speakers].sort((a, b) => {
                        if (a.user_id === activeSpeakerId) return -1;
                        if (b.user_id === activeSpeakerId) return 1;
                        const la =
                          a.user_id === myUserId
                            ? localLevel
                            : (speakingLevels.get(a.user_id) ?? 0);
                        const lb =
                          b.user_id === myUserId
                            ? localLevel
                            : (speakingLevels.get(b.user_id) ?? 0);
                        return lb - la;
                      });
                      const SPEAKER_CAP = 4;
                      const visible = showSpeakersAll
                        ? sortedSpeakers
                        : sortedSpeakers.slice(0, SPEAKER_CAP);
                      const overflow = sortedSpeakers.length - SPEAKER_CAP;
                      return (
                        <>
                          {/* Desktop: 3-column video tiles */}
                          <div
                            className="hidden lg:grid lg:grid-cols-3 gap-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {visible.map((s) => (
                              <DesktopSpeakerVideoTile
                                key={s.user_id}
                                participant={s}
                                isMe={s.user_id === myUserId}
                                level={
                                  s.user_id === myUserId
                                    ? localLevel
                                    : (speakingLevels.get(s.user_id) ?? 0)
                                }
                                isActiveSpeaker={activeSpeakerId === s.user_id}
                                isLoudest={
                                  loudestSpeakerId === s.user_id &&
                                  loudestSpeakerId !== activeSpeakerId
                                }
                                videoStream={
                                  s.user_id === myUserId
                                    ? localStream
                                    : (remoteStreams.get(s.user_id) ?? null)
                                }
                                videoOn={
                                  s.user_id === myUserId
                                    ? videoOn
                                    : (remoteStreams
                                        .get(s.user_id)
                                        ?.getVideoTracks().length ?? 0) > 0
                                }
                                canMod={canMod && s.user_id !== myUserId}
                                modMenuOpen={modMenuOpen === s.user_id}
                                onOpenMod={() =>
                                  setModMenuOpen((prev) =>
                                    prev === s.user_id ? null : s.user_id,
                                  )
                                }
                                onMute={() => muteUser(s.user_id, !s.muted)}
                                onDemote={() => demote(s.user_id)}
                                onKick={() => kickUser(s.user_id)}
                                onBlock={() => setShowBlockConfirm(s.user_id)}
                                onReport={() => setShowReportModal(s.user_id)}
                                onAssignCohost={
                                  isHost
                                    ? () => assignCohost(s.user_id)
                                    : undefined
                                }
                              />
                            ))}
                            {!showSpeakersAll && overflow > 0 && (
                              <button
                                className="aspect-[4/3] rounded-xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowSpeakersAll(true);
                                }}
                              >
                                <div className="text-center">
                                  <span className="block text-xl font-black text-muted-foreground">
                                    +{overflow}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    More
                                  </span>
                                </div>
                              </button>
                            )}
                          </div>
                          {/* Mobile: compact circle tiles */}
                          <div
                            className="grid grid-cols-4 gap-3 lg:hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {visible.map((s) => (
                              <SpeakerTile
                                key={s.user_id}
                                participant={s}
                                isMe={s.user_id === myUserId}
                                level={
                                  s.user_id === myUserId
                                    ? localLevel
                                    : (speakingLevels.get(s.user_id) ?? 0)
                                }
                                isActiveSpeaker={activeSpeakerId === s.user_id}
                                isLoudest={
                                  loudestSpeakerId === s.user_id &&
                                  loudestSpeakerId !== activeSpeakerId
                                }
                                canMod={canMod && s.user_id !== myUserId}
                                modMenuOpen={modMenuOpen === s.user_id}
                                onOpenMod={() =>
                                  setModMenuOpen((prev) =>
                                    prev === s.user_id ? null : s.user_id,
                                  )
                                }
                                onMute={() => muteUser(s.user_id, !s.muted)}
                                onDemote={() => demote(s.user_id)}
                                onKick={() => kickUser(s.user_id)}
                                onBlock={() => setShowBlockConfirm(s.user_id)}
                                onReport={() => setShowReportModal(s.user_id)}
                                onAssignCohost={
                                  isHost
                                    ? () => assignCohost(s.user_id)
                                    : undefined
                                }
                              />
                            ))}
                            {!showSpeakersAll && overflow > 0 && (
                              <button
                                className="flex flex-col items-center gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowSpeakersAll(true);
                                }}
                              >
                                <div className="w-14 h-14 rounded-full bg-muted/80 border-2 border-dashed border-border flex items-center justify-center">
                                  <span className="text-xs font-black text-muted-foreground">
                                    +{overflow}
                                  </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  More
                                </span>
                              </button>
                            )}
                          </div>
                        </>
                      );
                    })()
                  )}
                </div>
              )}

              {/* ── Raised hands (host-only) — queue sorted by wait time ────────────── */}
              {canMod &&
                audience.some((l) => l.hand_raised) &&
                (() => {
                  // Sort oldest (longest waiting) first using server-side hand_raised_at,
                  // falling back to client-side tracking for recently raised hands.
                  const raised = audience
                    .filter((l) => l.hand_raised)
                    .sort((a, b) => {
                      const ta = a.hand_raised_at
                        ? new Date(a.hand_raised_at).getTime()
                        : (handRaisedAtRef.current.get(a.user_id) ??
                          Date.now());
                      const tb = b.hand_raised_at
                        ? new Date(b.hand_raised_at).getTime()
                        : (handRaisedAtRef.current.get(b.user_id) ??
                          Date.now());
                      return ta - tb;
                    });
                  return (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          ✋ Raised Hands ({raised.length})
                        </div>
                        {atSpeakerLimit ? (
                          <span className="text-[10px] text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                            Stage full
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400/70">
                            Oldest first
                          </span>
                        )}
                      </div>
                      {raised.map((l, idx) => (
                        <RaisedHandRow
                          key={l.user_id}
                          participant={l}
                          idx={idx}
                          isHost={isHost}
                          atSpeakerLimit={atSpeakerLimit}
                          handRaisedAtRef={handRaisedAtRef}
                          onPromote={() => promote(l.user_id)}
                          onAssignCohost={() => assignCohost(l.user_id)}
                          onDismiss={() => dismissHand(l.user_id)}
                        />
                      ))}
                    </div>
                  );
                })()}

              {/* ── Audience strip with overflow — hidden on desktop (shown in left rail) */}
              <div className="lg:hidden">
                <AudienceStrip
                  audience={audience}
                  canMod={canMod}
                  onPromote={promote}
                />
              </div>

              {/* ── Desktop inline reactions strip ────────────────────────────────────── */}
              <div className="hidden lg:flex items-center gap-2 pt-2 border-t border-border">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
                  Reactions
                </span>
                <div className="flex items-center gap-1.5">
                  {REACTION_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => react(e)}
                      className="text-lg hover:scale-125 transition-transform px-0.5"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Desktop-only right sidebar: Chat (all) + Management (mods) ─────── */}
        {/* Non-mods: chat only */}
        {!canMod && (
          <div className="hidden lg:flex lg:flex-col lg:w-80 shrink-0 lg:max-h-[calc(100vh-3.5rem)]">
            <DesktopChatPanel
              chatMessages={chatMessages}
              chatInput={chatInput}
              myUserId={myUserId}
              unreadChatCount={unreadChatCount}
              activeTab={activeTab}
              chatEndRef={chatEndRef}
              onInputChange={(v) => {
                setChatInput(v);
                setUnreadChatCount(0);
              }}
              onSend={() => {
                sendChat();
                setUnreadChatCount(0);
              }}
            />
          </div>
        )}
        {/* Mods: persistent right console — controls on top, chat below (always visible) */}
        {canMod && (
          <div className="hidden lg:flex lg:flex-col lg:w-80 shrink-0 lg:max-h-[calc(100vh-3.5rem)] gap-2">
            {/* Host Console — always visible */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col shrink-0 max-h-[55%]">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest">
                  Host Console
                </span>
              </div>
              <div className="overflow-y-auto flex-1 p-3">
                <ManagementPanelBody
                  audience={audience}
                  isHost={isHost}
                  session={session}
                  onPromote={promote}
                  onAssignCohost={assignCohost}
                  onDismissHand={dismissHand}
                  onMuteAll={muteAll}
                  onLowerAll={lowerAllHands}
                  onShare={shareCircle}
                  onOpenInvite={() => setShowInviteModal(true)}
                  onOpenSettings={() => setShowSettingsModal(true)}
                  onToggleRecording={toggleRecording}
                  recordingOn={!!session.is_recording}
                  recordingDisabled={
                    uploading || mediaCapabilities?.recording === false
                  }
                  onEndCircle={() => setShowEndConfirm(true)}
                  speakerCount={
                    (host ? 1 : 0) + cohosts.length + speakers.length
                  }
                  onlineParticipants={participants}
                  myUserId={myUserId}
                  onMuteUser={muteUser}
                  onDemoteUser={demote}
                  onKickUser={kickUser}
                  onBlockUser={(userId) => setShowBlockConfirm(userId)}
                  onReportUser={(userId) => setShowReportModal(userId)}
                  onAssignCohostUser={assignCohost}
                  onOpenTransfer={
                    isHost ? () => setShowTransferModal(true) : undefined
                  }
                  onOpenPoll={() => setShowPollModal(true)}
                  onOpenQA={() => setShowQAModal(true)}
                  onToggleScreenShare={toggleScreenShare}
                  onOpenNotes={() => setActiveTab("chat")}
                  onToggleAutoRemove={toggleAutoRemove}
                  autoRemoveEnabled={autoRemoveEnabled}
                  activePoll={activePoll}
                  onClosePoll={closePoll}
                  qaCount={qaQuestions.filter((q) => !q.answered).length}
                />
              </div>
            </div>
            {/* Chat — always visible below console */}
            <div className="flex-1 min-h-0">
              <DesktopChatPanel
                chatMessages={chatMessages}
                chatInput={chatInput}
                myUserId={myUserId}
                unreadChatCount={unreadChatCount}
                activeTab={activeTab}
                chatEndRef={chatEndRef}
                onInputChange={(v) => {
                  setChatInput(v);
                  setUnreadChatCount(0);
                }}
                onSend={() => {
                  sendChat();
                  setUnreadChatCount(0);
                }}
              />
            </div>
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
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1.5 bg-muted rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <div className="font-black text-base">Manage Spiral</div>
                <button
                  onClick={() => setShowManagePanel(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ManagementPanelBody
                audience={audience}
                isHost={isHost}
                session={session}
                onPromote={promote}
                onAssignCohost={assignCohost}
                onDismissHand={dismissHand}
                onMuteAll={muteAll}
                onLowerAll={lowerAllHands}
                onShare={shareCircle}
                onOpenInvite={() => {
                  setShowManagePanel(false);
                  setShowInviteModal(true);
                }}
                onOpenSettings={() => {
                  setShowManagePanel(false);
                  setShowSettingsModal(true);
                }}
                onToggleRecording={toggleRecording}
                recordingOn={!!session.is_recording}
                recordingDisabled={
                  uploading || mediaCapabilities?.recording === false
                }
                onEndCircle={() => {
                  setShowManagePanel(false);
                  setShowEndConfirm(true);
                }}
                speakerCount={(host ? 1 : 0) + cohosts.length + speakers.length}
                onlineParticipants={participants}
                myUserId={myUserId}
                onMuteUser={muteUser}
                onDemoteUser={demote}
                onKickUser={kickUser}
                onBlockUser={(userId) => setShowBlockConfirm(userId)}
                onReportUser={(userId) => setShowReportModal(userId)}
                onAssignCohostUser={assignCohost}
                onOpenTransfer={
                  isHost
                    ? () => {
                        setShowManagePanel(false);
                        setShowTransferModal(true);
                      }
                    : undefined
                }
                onOpenPoll={() => {
                  setShowManagePanel(false);
                  setShowPollModal(true);
                }}
                onOpenQA={() => {
                  setShowManagePanel(false);
                  setShowQAModal(true);
                }}
                onToggleScreenShare={toggleScreenShare}
                onOpenNotes={() => {
                  toast({ title: "Shared notes coming soon" });
                }}
                onToggleAutoRemove={toggleAutoRemove}
                autoRemoveEnabled={autoRemoveEnabled}
                activePoll={activePoll}
                onClosePoll={closePoll}
                qaCount={qaQuestions.filter((q) => !q.answered).length}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Invite modal (invite depth: link share vs in-app invite graph) ───────── */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full space-y-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="text-base font-black flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" /> Invite to Spiral
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── SECTION 1: In-app invite (direct notification) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <UserPlus className="w-2.5 h-2.5 text-primary" />
                  </div>
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Notify a Member
                  </label>
                  <span className="ml-auto text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    In-app
                  </span>
                </div>
                <input
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search community members…"
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                  style={{ fontSize: "16px" }}
                />
                {inviteResults.length > 0 && (
                  <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                    {inviteResults.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted"
                      >
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            (u.name?.[0] ?? "?")
                          )}
                        </div>
                        <span className="flex-1 text-sm font-bold truncate">
                          {u.name}
                        </span>
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3"
                          disabled={invitingSending === u.id}
                          onClick={() => sendInvite(u.id)}
                        >
                          {invitingSending === u.id ? "Sending…" : "Invite"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {inviteSearch.length >= 2 &&
                  inviteResults.length === 0 &&
                  invitingSending === null && (
                    <div className="text-xs text-muted-foreground">
                      No community members found
                    </div>
                  )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  or
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* ── SECTION 2: Share link (open join path) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
                    <Share2 className="w-2.5 h-2.5 text-amber-400" />
                  </div>
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Share a Link
                  </label>
                  <span className="ml-auto text-[10px] font-bold bg-amber-400/10 text-amber-400 rounded-full px-2 py-0.5">
                    Open join
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 border border-border">
                  <span className="flex-1 text-xs font-mono truncate text-muted-foreground select-all">
                    {window.location.origin}{SPIRALS_PATHS.room(sessionId)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={copyInviteLink}>
                    Copy Link
                  </Button>
                  {typeof navigator.share === "function" && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={shareCircle}
                    >
                      Share
                    </Button>
                  )}
                </div>
              </div>

              {/* ── SECTION 3: Invite graph — who joined via what path */}
              {participants.some(
                (p) => p.joined_via === "invite" || p.joined_via === "link",
              ) && (
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Who's Here &amp; How They
                    Joined
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {participants
                      .filter((p) => p.joined_via)
                      .map((p) => (
                        <div
                          key={p.user_id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[9px] font-black">
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            ) : (
                              (p.name?.[0] ?? "?")
                            )}
                          </div>
                          <span className="flex-1 font-medium truncate">
                            {p.name}
                          </span>
                          {p.joined_via === "invite" ? (
                            <div className="flex items-center gap-0.5 text-[9px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">
                              <UserPlus className="w-2.5 h-2.5" />
                              {p.invited_by ? `by ${p.invited_by}` : "Invited"}
                            </div>
                          ) : p.joined_via === "link" ? (
                            <div className="flex items-center gap-0.5 text-[9px] font-bold text-amber-400 bg-amber-400/10 rounded-full px-1.5 py-0.5 shrink-0">
                              <Share2 className="w-2.5 h-2.5" />
                              Via link
                            </div>
                          ) : (
                            <div className="text-[9px] text-muted-foreground shrink-0">
                              Direct
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Host transfer modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTransferModal && isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={() => setShowTransferModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-black flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" /> Transfer Host
                  Role
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-muted-foreground">
                Choose a co-host to become the new host. You will become a
                co-host.
              </div>
              {cohosts.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No co-hosts yet. Assign a co-host first.
                </div>
              ) : (
                <div className="space-y-2">
                  {cohosts.map((c) => (
                    <div
                      key={c.user_id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted"
                    >
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-sm font-black">
                        {c.avatar_url ? (
                          <img
                            src={c.avatar_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          (c.name?.[0] ?? "?")
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-blue-400">Co-Host</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs px-3 text-amber-400 border-amber-400/40"
                        onClick={() => transferHost(c.user_id)}
                      >
                        Make Host
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-black flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Room Settings
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
                    Topic
                  </label>
                  <input
                    value={settingsTopic}
                    onChange={(e) => setSettingsTopic(e.target.value)}
                    maxLength={100}
                    placeholder="What's today's topic?"
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
                    Description
                  </label>
                  <textarea
                    value={settingsDesc}
                    onChange={(e) => setSettingsDesc(e.target.value)}
                    maxLength={500}
                    placeholder="Tell people what this Spiral is about…"
                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm min-h-[72px] resize-none focus:outline-none focus:border-primary"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
                    Speaker Limit (currently {session?.max_speakers})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[4, 8, 12, 13, 18, 24].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSettingsSpeakerLimit(n)}
                        className={`w-10 h-10 rounded-xl border text-sm font-black transition-colors ${
                          settingsSpeakerLimit === n
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-border bg-muted/40 hover:bg-muted"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowSettingsModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={savingSettings}
                  onClick={updateSettings}
                >
                  {savingSettings ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Poll modal ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPollModal && isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
            onClick={() => setShowPollModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-black flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Start a Poll
                </div>
                <button
                  onClick={() => setShowPollModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
                  Question
                </label>
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  maxLength={200}
                  placeholder="Ask a question…"
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                  style={{ fontSize: "16px" }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block">
                  Options
                </label>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((o, j) => (j === i ? e.target.value : o)),
                        )
                      }
                      maxLength={100}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                      style={{ fontSize: "16px" }}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        onClick={() =>
                          setPollOptions((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
                        }
                        className="p-2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button
                    onClick={() => setPollOptions((prev) => [...prev, ""])}
                    className="text-xs font-bold text-primary hover:opacity-70"
                  >
                    + Add option
                  </button>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPollModal(false)}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={createPoll}>
                  Start Poll
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Q&A modal ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQAModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowQAModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              className="bg-card border border-border rounded-2xl p-5 max-w-md w-full space-y-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-black flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> Q&A
                </div>
                <button
                  onClick={() => setShowQAModal(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Ask a question */}
              <div className="flex items-center gap-2">
                <input
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitQAQuestion();
                  }}
                  placeholder="Ask a question…"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                  style={{ fontSize: "16px" }}
                />
                <Button
                  size="sm"
                  onClick={submitQAQuestion}
                  disabled={!qaInput.trim()}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
              {/* Questions list */}
              <div className="space-y-2">
                {qaQuestions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No questions yet — ask one above!
                  </div>
                ) : (
                  qaQuestions.map((q) => (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3 ${q.answered ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/40 border-border"}`}
                    >
                      <div className="text-sm font-bold">{q.question}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        — {q.name}
                      </div>
                      {q.answered && q.answer && (
                        <div className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-2 py-1.5">
                          {q.answer}
                        </div>
                      )}
                      {!q.answered && canMod && (
                        <input
                          placeholder="Type an answer…"
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              e.currentTarget.value.trim()
                            ) {
                              answerQAQuestion(
                                q.id,
                                e.currentTarget.value.trim(),
                              );
                              e.currentTarget.value = "";
                            }
                          }}
                          className="mt-2 w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:border-primary"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Screen share indicator ─────────────────────────────────────────────── */}
      {screenSharing && (
        <div className="fixed top-16 right-4 z-40 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span className="text-xs font-bold text-primary">Screen sharing</span>
          <button
            onClick={toggleScreenShare}
            className="text-xs text-muted-foreground hover:text-foreground ml-1"
          >
            Stop
          </button>
        </div>
      )}

      {/* ── Bottom controls ───────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4 space-y-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {/* Reactions — hidden on desktop (reactions tab in left sidebar) */}
        <div className="flex items-center justify-center gap-2 lg:hidden">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => react(e)}
              className="text-xl px-1 hover:scale-125 transition-transform"
            >
              {e}
            </button>
          ))}
        </div>

        {/* "Want to speak?" CTA card — listeners who haven't raised their hand */}
        {!canSpeak && !me?.hand_raised && (
          <div className="bg-muted/60 border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
            <Hand className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black">Want to speak?</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Raise your hand and the host can bring you on stage.
              </div>
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
              <div className="text-sm font-black text-amber-400">
                Hand raised!
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Waiting for the host to bring you on stage…
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleHand}
              className="shrink-0 text-amber-400 border-amber-400/40"
            >
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
            <div className="relative">
              {/* Mic toggle + device-picker chevron */}
              <div
                className={`flex items-stretch rounded-xl border transition-all ${
                  micOn
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                } ${mediaCapabilities?.microphone === false ? "opacity-40" : ""}`}
              >
                <button
                  onClick={toggleMic}
                  disabled={mediaCapabilities?.microphone === false}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[48px] disabled:cursor-not-allowed"
                >
                  {micOn ? (
                    <Mic className="w-5 h-5" />
                  ) : (
                    <MicOff className="w-5 h-5" />
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                    {micOn ? "Mute" : "Unmute"}
                  </span>
                </button>
                {/* Chevron — only shown when multiple mics are available */}
                {audioDevices.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMicPicker((v) => !v);
                      setShowCamPicker(false);
                    }}
                    className="flex items-center px-1 border-l border-current/20 hover:bg-primary/5 rounded-r-xl"
                    title="Choose microphone"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showMicPicker ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
              {/* Mic device picker dropdown */}
              {showMicPicker && audioDevices.length > 0 && (
                <DevicePickerDropdown
                  devices={audioDevices}
                  selectedId={selectedAudioDeviceId}
                  onSelect={switchAudioDevice}
                  onClose={() => setShowMicPicker(false)}
                />
              )}
            </div>
          )}
          {canPublishMedia && session.video_enabled && (
            <div className="relative">
              {/* Camera toggle + device-picker chevron */}
              <div
                className={`flex items-stretch rounded-xl border transition-all ${
                  videoOn
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                } ${mediaCapabilities?.camera === false ? "opacity-40" : ""}`}
              >
                <button
                  onClick={toggleVideo}
                  disabled={mediaCapabilities?.camera === false}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[48px] disabled:cursor-not-allowed"
                >
                  {videoOn ? (
                    <Video className="w-5 h-5" />
                  ) : (
                    <VideoOff className="w-5 h-5" />
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                    {videoOn ? "Cam Off" : "Camera"}
                  </span>
                </button>
                {/* Chevron — only shown when multiple cameras are available */}
                {videoDevices.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCamPicker((v) => !v);
                      setShowMicPicker(false);
                    }}
                    className="flex items-center px-1 border-l border-current/20 hover:bg-primary/5 rounded-r-xl"
                    title="Choose camera"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showCamPicker ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
              {/* Camera device picker dropdown */}
              {showCamPicker && videoDevices.length > 0 && (
                <DevicePickerDropdown
                  devices={videoDevices}
                  selectedId={selectedVideoDeviceId}
                  onSelect={switchVideoDevice}
                  onClose={() => setShowCamPicker(false)}
                />
              )}
            </div>
          )}
          {(me?.role === "speaker" || me?.role === "co_host") && (
            <button
              onClick={() => demote(myUserId!)}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border border-border text-muted-foreground hover:border-amber-400/40 hover:text-amber-400 transition-all min-w-[56px]"
            >
              <UserMinus className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wide leading-none mt-0.5">
                Leave Stage
              </span>
            </button>
          )}
          {isHost && (
            <button
              onClick={toggleRecording}
              disabled={
                uploading || (isHost && mediaCapabilities?.recording === false)
              }
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-all min-w-[56px] disabled:opacity-40 ${
                session.is_recording
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-border text-muted-foreground hover:border-red-400/40"
              }`}
            >
              <CircleIcon
                className={`w-5 h-5 ${session.is_recording ? "fill-red-500 text-red-500" : ""}`}
              />
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
              {isHost ? "End Spiral" : "Leave Room"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Device label cleaner ──────────────────────────────────────────────────────
// Browsers expose raw OS labels like "Default - Microphone (Built-in)" or
// "Communications - Microphone (USB Audio Device)" which are confusing to
// end users who just want to pick the right mic or camera. This strips the
// noisy prefixes and parenthetical suffixes so only the human-readable name
// remains. Falls back to a numbered generic name when nothing useful is left.
function cleanDeviceLabel(
  label: string,
  index: number,
  kind: MediaDeviceKind,
): string {
  if (!label) {
    return kind === "audioinput"
      ? `Microphone ${index + 1}`
      : `Camera ${index + 1}`;
  }
  const cleaned = label
    .replace(/^Default\s*[-–]\s*/i, "") // "Default - " prefix
    .replace(/^Communications\s*[-–]\s*/i, "") // "Communications - " prefix
    .replace(/\(Built-?in\)/gi, "") // "(Built-in)" suffix
    .replace(/\(default\)/gi, "") // "(default)" suffix
    .replace(/\s+/g, " ")
    .trim();
  // If we're left with something too generic ("Microphone", "Camera", "Device"),
  // append the 1-based index so multiple generics are still distinguishable.
  if (/^(microphone|camera|speaker|device)\s*\d*$/i.test(cleaned)) {
    return `${cleaned || (kind === "audioinput" ? "Microphone" : "Camera")} ${index + 1}`;
  }
  return (
    cleaned ||
    (kind === "audioinput" ? `Microphone ${index + 1}` : `Camera ${index + 1}`)
  );
}

// ── Desktop chat panel ────────────────────────────────────────────────────────
// Extracted so both the non-mod sidebar and the mod's tabbed sidebar can
// render the same chat UI without duplicating JSX.
function DesktopChatPanel({
  chatMessages,
  chatInput,
  myUserId,
  unreadChatCount,
  activeTab,
  chatEndRef,
  onInputChange,
  onSend,
  noBorder,
}: {
  chatMessages: ChatMessage[];
  chatInput: string;
  myUserId?: number;
  unreadChatCount: number;
  activeTab: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
  noBorder?: boolean;
}) {
  return (
    <div
      className={`flex flex-col flex-1 overflow-hidden ${noBorder ? "" : "bg-card border border-border rounded-2xl"}`}
    >
      {!noBorder && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-black">Chat</span>
          {unreadChatCount > 0 && activeTab !== "chat" && (
            <span className="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] font-black text-primary-foreground">
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {chatMessages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            No messages yet
          </div>
        ) : (
          chatMessages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-1.5 ${m.user_id === myUserId ? "flex-row-reverse" : ""}`}
            >
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[9px] font-black">
                {m.avatar_url ? (
                  <img
                    src={m.avatar_url}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                ) : (
                  (m.name?.[0] ?? "?")
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-xs ${m.user_id === myUserId ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {m.user_id !== myUserId && (
                  <div className="text-[9px] font-black mb-0.5 opacity-70">
                    {m.name}
                  </div>
                )}
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="flex items-center gap-1.5 px-2 py-2 border-t border-border shrink-0">
        <input
          value={chatInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder="Message…"
          className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-full text-xs focus:outline-none focus:border-primary"
          style={{ fontSize: "16px" }}
        />
        <Button
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onSend}
          disabled={!chatInput.trim()}
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Device picker dropdown ───────────────────────────────────────────────────
// Floats above the control bar; renders a list of MediaDeviceInfo choices and
// calls onSelect with the chosen deviceId.  Closes on outside click via the
// main screen's onClick handler (which calls setModMenuOpen(null) etc.).
function DevicePickerDropdown({
  devices,
  selectedId,
  onSelect,
  onClose,
}: {
  devices: MediaDeviceInfo[];
  selectedId: string;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.12 }}
      className="absolute bottom-full mb-2 left-0 z-50 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[200px] max-w-[280px]"
      onClick={(e) => e.stopPropagation()}
    >
      {devices.map((d, i) => {
        const isSelected = d.deviceId === selectedId;
        const label = cleanDeviceLabel(d.label, i, d.kind);
        return (
          <button
            key={d.deviceId}
            onClick={() => onSelect(d.deviceId)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors hover:bg-muted ${
              isSelected ? "text-primary" : "text-foreground"
            }`}
          >
            {isSelected ? (
              <Check className="w-3 h-3 shrink-0 text-primary" />
            ) : (
              <span className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </button>
        );
      })}
      <div className="border-t border-border mt-1 pt-1">
        <button
          onClick={onClose}
          className="w-full text-center text-[10px] text-muted-foreground py-1.5 hover:bg-muted rounded-b-xl"
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}

// ── Desktop PEOPLE left rail ──────────────────────────────────────────────────
// Full-height scrollable 3-section sidebar: ON STAGE | AUDIENCE | Reactions log.
// Role badge colours: amber=host, blue=co_host, emerald=speaker.
function DesktopPeopleRail({
  sidebarTab,
  onTabChange,
  host,
  cohosts,
  speakers,
  audience,
  myUserId,
  canMod,
  reactionLog,
  onPromote,
  speakingLevels,
  localLevel,
  activeSpeakerId,
  videoEnabled,
  remoteStreams,
  videoOn,
  localStream,
}: {
  sidebarTab: "people" | "reactions";
  onTabChange: (t: "people" | "reactions") => void;
  host: Participant | undefined;
  cohosts: Participant[];
  speakers: Participant[];
  audience: Participant[];
  myUserId?: number;
  canMod: boolean;
  reactionLog: { id: string; emoji: string; name: string }[];
  onPromote: (id: number) => void;
  speakingLevels: Map<number, number>;
  localLevel: number;
  activeSpeakerId: number | null;
  videoEnabled: boolean;
  remoteStreams: Map<number, MediaStream>;
  videoOn: boolean;
  localStream: MediaStream | null;
}) {
  const [showAllAudience, setShowAllAudience] = useState(false);
  const onStage = [...(host ? [host] : []), ...cohosts, ...speakers];
  const AUDIENCE_VISIBLE = 12;
  const visibleAudience = showAllAudience
    ? audience
    : audience.slice(0, AUDIENCE_VISIBLE);
  const audienceOverflow = audience.length - AUDIENCE_VISIBLE;

  const roleBadge = (role: Participant["role"]) => {
    if (role === "host")
      return (
        <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 rounded-full px-1.5 py-0.5 shrink-0">
          Host
        </span>
      );
    if (role === "co_host")
      return (
        <span className="text-[9px] font-black text-blue-400 bg-blue-400/10 rounded-full px-1.5 py-0.5 shrink-0">
          Co-Host
        </span>
      );
    return (
      <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 rounded-full px-1.5 py-0.5 shrink-0">
        Speaker
      </span>
    );
  };

  return (
    <div className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 lg:max-h-[calc(100vh-3.5rem)]">
      <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden h-full">
        {/* Tabs */}
        <div className="flex items-center gap-4 px-3 pt-3 border-b border-border shrink-0">
          <button
            onClick={() => onTabChange("people")}
            className={`pb-2 text-xs font-black border-b-2 transition-colors uppercase tracking-widest ${sidebarTab === "people" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            People
          </button>
          <button
            onClick={() => onTabChange("reactions")}
            className={`pb-2 text-xs font-black border-b-2 transition-colors uppercase tracking-widest ${sidebarTab === "reactions" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            Reactions
          </button>
        </div>

        {sidebarTab === "people" ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* ON STAGE */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                On Stage ({onStage.length})
              </div>
              <div className="space-y-1">
                {onStage.map((p) => {
                  const lvl =
                    p.user_id === myUserId
                      ? localLevel
                      : (speakingLevels.get(p.user_id) ?? 0);
                  const isActive = activeSpeakerId === p.user_id;
                  const isSpeaking = lvl > 0.08 || isActive;
                  const hasVideoStream =
                    videoEnabled &&
                    (p.user_id === myUserId
                      ? localStream &&
                        videoOn &&
                        localStream.getVideoTracks().length > 0
                      : (remoteStreams.get(p.user_id)?.getVideoTracks()
                          .length ?? 0) > 0);
                  return (
                    <div
                      key={p.user_id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${isSpeaking ? "bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <div
                        className={`relative w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black border-2 ${isSpeaking ? "border-primary" : "border-transparent"}`}
                      >
                        {p.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        ) : (
                          (p.name?.[0] ?? "?")
                        )}
                        {isActive && (
                          <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-pulse pointer-events-none" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate leading-tight">
                          {p.user_id === myUserId ? "You" : p.name}
                        </div>
                        {roleBadge(p.role)}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {videoEnabled &&
                          (hasVideoStream ? (
                            <Video className="w-3 h-3 text-primary" />
                          ) : (
                            <VideoOff className="w-3 h-3 text-muted-foreground/40" />
                          ))}
                        {p.muted ? (
                          <MicOff className="w-3 h-3 text-red-400" />
                        ) : (
                          <Mic
                            className={`w-3 h-3 ${isSpeaking ? "text-green-400" : "text-muted-foreground"}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                {onStage.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 italic px-2">
                    No one on stage yet
                  </div>
                )}
              </div>
            </div>

            {/* AUDIENCE */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                Audience ({audience.length})
              </div>
              <div className="space-y-1">
                {visibleAudience.map((p) => (
                  <div
                    key={p.user_id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors ${p.hand_raised ? "bg-amber-500/5" : ""}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[9px] font-black border-2 ${p.hand_raised ? "border-amber-400" : "border-transparent"}`}
                    >
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        (p.name?.[0] ?? "?")
                      )}
                    </div>
                    <span className="flex-1 text-xs font-bold truncate">
                      {p.user_id === myUserId ? "You" : p.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.hand_raised && (
                        <>
                          <span className="text-xs leading-none">✋</span>
                          {canMod && (
                            <button
                              onClick={() => onPromote(p.user_id)}
                              className="text-[9px] font-black text-primary bg-primary/10 rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors"
                            >
                              Bring up
                            </button>
                          )}
                        </>
                      )}
                      <MicOff className="w-3 h-3 text-muted-foreground/40" />
                    </div>
                  </div>
                ))}
                {!showAllAudience && audienceOverflow > 0 && (
                  <button
                    onClick={() => setShowAllAudience(true)}
                    className="w-full text-center text-xs font-bold text-primary py-1.5 hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    See all ({audienceOverflow} more)
                  </button>
                )}
                {showAllAudience && audience.length > AUDIENCE_VISIBLE && (
                  <button
                    onClick={() => setShowAllAudience(false)}
                    className="w-full text-center text-xs font-bold text-muted-foreground py-1.5 hover:bg-muted rounded-lg transition-colors"
                  >
                    Show less
                  </button>
                )}
                {audience.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 italic px-2">
                    No audience yet
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {reactionLog.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No reactions yet
              </div>
            ) : (
              [...reactionLog].reverse().map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 text-xs px-1"
                >
                  <span className="text-base leading-none">{r.emoji}</span>
                  <span className="font-bold truncate text-xs">{r.name}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Desktop speaker video tile ───────────────────────────────────────────────
// On lg+ viewports speakers are shown as rectangular video/avatar tiles (3-per-row)
// that match the HostHeroTile visual language. On mobile they stay as the compact circle.
function DesktopSpeakerVideoTile({
  participant: s,
  isMe,
  level,
  isActiveSpeaker,
  isLoudest,
  videoStream,
  videoOn,
  canMod,
  modMenuOpen,
  onOpenMod,
  onMute,
  onDemote,
  onKick,
  onBlock,
  onReport,
  onAssignCohost,
}: {
  participant: Participant;
  isMe: boolean;
  level: number;
  isActiveSpeaker?: boolean;
  isLoudest?: boolean;
  videoStream?: MediaStream | null;
  videoOn?: boolean;
  canMod: boolean;
  modMenuOpen: boolean;
  onOpenMod: () => void;
  onMute: () => void;
  onDemote: () => void;
  onKick: () => void;
  onBlock: () => void;
  onReport: () => void;
  onAssignCohost?: () => void;
}) {
  const isSpeaking = level > 0.08 || isActiveSpeaker || isLoudest;
  const hasVideo =
    videoStream && videoOn && videoStream.getVideoTracks().length > 0;
  const ringColor = isActiveSpeaker
    ? "border-green-400"
    : isLoudest
      ? "border-yellow-400"
      : "border-primary";

  return (
    <div className="relative rounded-xl overflow-hidden">
      {isSpeaking && (
        <motion.div
          className={`absolute inset-0 rounded-xl border-2 ${ringColor} z-10 pointer-events-none`}
          animate={{ opacity: [0.95, 0.25, 0.95] }}
          transition={{
            duration: isActiveSpeaker ? 0.6 : 0.9,
            repeat: Infinity,
          }}
        />
      )}
      <div className="relative aspect-[4/3] bg-zinc-900">
        {hasVideo ? (
          <video
            autoPlay
            playsInline
            muted={isMe}
            ref={(el) => {
              if (el && el.srcObject !== videoStream) {
                el.srcObject = videoStream!;
                el.play().catch(() => {});
              }
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${isSpeaking ? ringColor : "border-primary/30"}`}
            >
              {s.avatar_url ? (
                <img
                  src={s.avatar_url}
                  className="w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <span className="text-2xl font-black text-foreground">
                  {s.name?.[0] ?? "?"}
                </span>
              )}
            </div>
          </div>
        )}
        {/* Mic status */}
        <div className="absolute top-1.5 right-1.5">
          {s.muted ? (
            <div className="bg-red-500/80 rounded-full p-1">
              <MicOff className="w-2.5 h-2.5 text-white" />
            </div>
          ) : (
            isSpeaking && (
              <div className="bg-black/50 rounded-full p-1">
                <Mic className="w-2.5 h-2.5 text-white" />
              </div>
            )
          )}
        </div>
        {/* Name overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1.5 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-white text-xs font-black truncate">
              {isMe ? "You" : s.name}
            </span>
            {!s.muted && level > 0.05 && (
              <AudioLevelBars level={level} active={isSpeaking} />
            )}
            {isActiveSpeaker && (
              <span className="text-[9px] font-black text-green-400 shrink-0">
                Speaking
              </span>
            )}
          </div>
          {canMod && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenMod();
              }}
              className="p-0.5 rounded-full bg-white/10 hover:bg-white/20 shrink-0"
            >
              <MoreVertical className="w-3 h-3 text-white" />
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
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onMute}
            >
              {s.muted ? (
                <>
                  <Mic className="w-3 h-3" /> Unmute
                </>
              ) : (
                <>
                  <MicOff className="w-3 h-3" /> Mute
                </>
              )}
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onDemote}
            >
              <UserMinus className="w-3 h-3" /> Move to Audience
            </button>
            {onAssignCohost && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400"
                onClick={onAssignCohost}
              >
                <Shield className="w-3 h-3" /> Make Co-host
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400"
              onClick={onKick}
            >
              <Flag className="w-3 h-3" /> Remove
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
              onClick={onBlock}
            >
              <Ban className="w-3 h-3" /> Block
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
              onClick={onReport}
            >
              <AlertTriangle className="w-3 h-3" /> Report
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Speaker tile ───────────────────────────────────────────────────────────────
// ── RaisedHandRow ─────────────────────────────────────────────────────────────
// Displays a single entry in the raised-hand queue with a live "Xm Ys" wait
// timer sourced from the server-side hand_raised_at timestamp (falls back to
// the client-side ref when the server stamp isn't available yet).
interface RaisedHandRowProps {
  participant: Participant;
  idx: number;
  isHost: boolean;
  atSpeakerLimit: boolean;
  handRaisedAtRef: React.MutableRefObject<Map<number, number>>;
  onPromote: () => void;
  onAssignCohost: () => void;
  onDismiss: () => void;
}
function RaisedHandRow({
  participant: l,
  idx,
  isHost,
  atSpeakerLimit,
  handRaisedAtRef,
  onPromote,
  onAssignCohost,
  onDismiss,
}: RaisedHandRowProps) {
  // Server timestamp takes priority; fall back to client-side tracking.
  const serverTs = l.hand_raised_at ?? null;
  const clientTs = handRaisedAtRef.current.get(l.user_id);
  const isoTs =
    serverTs ?? (clientTs ? new Date(clientTs).toISOString() : null);
  const waitLabel = useElapsedLabel(isoTs);

  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-black text-amber-400">{idx + 1}</span>
      </div>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-black overflow-hidden shrink-0">
        {l.avatar_url ? (
          <img
            src={l.avatar_url}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : (
          (l.name?.[0] ?? "?")
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{l.name}</div>
        <div className="text-[10px] text-amber-400/80">
          Wants to speak{waitLabel ? ` · ${waitLabel}` : ""}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {isHost && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2 text-blue-400 border-blue-400/40"
            onClick={onAssignCohost}
          >
            <Shield className="w-3 h-3" /> Co-host
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 text-xs px-2"
          disabled={atSpeakerLimit}
          onClick={onPromote}
        >
          Bring up
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── ManagementHandRow ─────────────────────────────────────────────────────────
// Same as RaisedHandRow but compact, used in the management panel sidebar.
function ManagementHandRow({
  participant: l,
  onPromote,
  onDismiss,
}: {
  participant: Participant;
  onPromote: () => void;
  onDismiss: () => void;
}) {
  const isoTs = l.hand_raised_at ?? null;
  const waitLabel = useElapsedLabel(isoTs);
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
        {l.avatar_url ? (
          <img
            src={l.avatar_url}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : (
          (l.name?.[0] ?? "?")
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold truncate">{l.name}</div>
        <div className="text-[9px] text-amber-400/80">
          Wants to speak{waitLabel ? ` · ${waitLabel}` : ""}
        </div>
      </div>
      <Button size="sm" className="h-6 text-[10px] px-2" onClick={onPromote}>
        Bring Up
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  );
}

interface SpeakerTileProps {
  participant: Participant;
  isMe: boolean;
  level: number;
  isActiveSpeaker?: boolean;
  /** Locally-detected loudest speaker — gives instant visual feedback */
  isLoudest?: boolean;
  canMod: boolean;
  modMenuOpen: boolean;
  onOpenMod: () => void;
  onMute: () => void;
  onDemote: () => void;
  onKick: () => void;
  onBlock: () => void;
  onReport: () => void;
  onAssignCohost?: () => void;
}

function SpeakerTile({
  participant: s,
  isMe,
  level,
  isActiveSpeaker,
  isLoudest,
  canMod,
  modMenuOpen,
  onOpenMod,
  onMute,
  onDemote,
  onKick,
  onBlock,
  onReport,
  onAssignCohost,
}: SpeakerTileProps) {
  const isSpeaking = level > 0.12 || isActiveSpeaker;
  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div className="relative">
        {/* Animated speaking ring — pulsing when speaking, glowing when active speaker */}
        {isSpeaking && (
          <motion.div
            className={`absolute inset-0 rounded-full border-2 ${isActiveSpeaker ? "border-green-400" : "border-primary"}`}
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.3, 0.8] }}
            transition={{
              duration: isActiveSpeaker ? 0.6 : 0.8,
              repeat: Infinity,
            }}
          />
        )}
        {/* Extra outer glow for the active speaker — highest-energy state */}
        {(isActiveSpeaker || isLoudest) && (
          <motion.div
            className={`absolute -inset-1 rounded-full border ${isLoudest ? "border-yellow-400/50" : "border-green-400/40"}`}
            animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        <button
          className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${
            isActiveSpeaker
              ? "border-green-400"
              : isSpeaking
                ? "border-primary"
                : s.role === "host"
                  ? "border-amber-400/60"
                  : s.role === "co_host"
                    ? "border-blue-400/60"
                    : "border-primary/30"
          } ${canMod ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""}`}
          onClick={canMod ? onOpenMod : undefined}
        >
          {s.avatar_url ? (
            <img
              src={s.avatar_url}
              className="w-full h-full object-cover"
              alt=""
            />
          ) : (
            <span className="text-lg font-black">{s.name?.[0] ?? "?"}</span>
          )}
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
          <Volume2
            className={`w-3 h-3 ${isActiveSpeaker ? "text-green-400" : "text-primary"} absolute -bottom-0.5 -left-0.5 bg-background rounded-full p-0.5`}
          />
        )}
      </div>
      <span
        className={`text-[10px] font-bold truncate max-w-[64px] ${s.role === "co_host" ? "text-blue-400" : isActiveSpeaker ? "text-green-400" : ""}`}
      >
        {isMe ? "You" : s.name}
      </span>
      {s.role === "co_host" && (
        <span className="text-[8px] font-bold text-blue-400/80 uppercase tracking-wide">
          Co-host
        </span>
      )}
      {isLoudest && !isActiveSpeaker && (
        <div className="flex items-center gap-1">
          <AudioLevelBars level={level} active />
          <span className="text-[8px] font-bold text-yellow-400/90 uppercase tracking-wide">
            Loudest
          </span>
        </div>
      )}
      {isActiveSpeaker && (
        <div className="flex items-center gap-1">
          <AudioLevelBars level={level} active />
          <span className="text-[8px] font-bold text-green-400/80 uppercase tracking-wide">
            Speaking
          </span>
        </div>
      )}
      {!isActiveSpeaker && !s.muted && level > 0.08 && (
        <AudioLevelBars level={level} />
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
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onMute}
            >
              {s.muted ? (
                <>
                  <Mic className="w-3 h-3" /> Unmute
                </>
              ) : (
                <>
                  <MicOff className="w-3 h-3" /> Mute
                </>
              )}
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onDemote}
            >
              <UserMinus className="w-3 h-3" /> Move to Audience
            </button>
            {onAssignCohost && (
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-blue-400"
                onClick={onAssignCohost}
              >
                <Shield className="w-3 h-3" /> Make Co-host
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400"
              onClick={onKick}
            >
              <Flag className="w-3 h-3" /> Remove from Spiral
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
              onClick={onBlock}
            >
              <Ban className="w-3 h-3" /> Block user
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-amber-400"
              onClick={onReport}
            >
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
  onOpenInvite: () => void;
  onOpenSettings: () => void;
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
  onOpenTransfer?: () => void;
  // Creator Tools
  onOpenPoll?: () => void;
  onOpenQA?: () => void;
  onToggleScreenShare?: () => void;
  onOpenNotes?: () => void;
  onToggleAutoRemove?: () => void;
  autoRemoveEnabled?: boolean;
  activePoll?: {
    id: string;
    question: string;
    options: { text: string; votes: number[] }[];
  } | null;
  onClosePoll?: () => void;
  qaCount?: number;
}

function RoomControlButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger" | "record";
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
  audience,
  isHost,
  session,
  onPromote,
  onAssignCohost: _onAssignCohost,
  onDismissHand,
  onMuteAll,
  onLowerAll,
  onShare,
  onOpenInvite,
  onOpenSettings,
  onToggleRecording,
  recordingOn,
  recordingDisabled,
  onEndCircle,
  speakerCount: _speakerCount,
  onlineParticipants,
  myUserId,
  onMuteUser,
  onDemoteUser,
  onKickUser,
  onBlockUser,
  onReportUser,
  onAssignCohostUser,
  onOpenTransfer,
  onOpenPoll,
  onOpenQA,
  onToggleScreenShare,
  onOpenNotes,
  onToggleAutoRemove,
  autoRemoveEnabled,
  activePoll,
  onClosePoll,
  qaCount,
}: ManagementPanelBodyProps) {
  const raisedHands = audience.filter((l) => l.hand_raised);
  const [showAllHands, setShowAllHands] = useState(false);
  const visibleHands = showAllHands ? raisedHands : raisedHands.slice(0, 5);
  const [targetId, setTargetId] = useState<number | "">("");
  const targetable = onlineParticipants.filter(
    (p) => p.user_id !== myUserId && p.role !== "host",
  );
  const target = onlineParticipants.find((p) => p.user_id === targetId);

  return (
    <div className="space-y-4">
      {/* Raised Hands */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Raised Hands ({raisedHands.length})
          </div>
          {raisedHands.length > 5 && (
            <button
              onClick={() => setShowAllHands((v) => !v)}
              className="text-[10px] font-bold text-primary"
            >
              {showAllHands ? "Show less" : "View All"}
            </button>
          )}
        </div>
        {raisedHands.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No one has raised their hand
          </div>
        ) : (
          <div className="space-y-2">
            {visibleHands.map((l) => (
              <ManagementHandRow
                key={l.user_id}
                participant={l}
                onPromote={() => onPromote(l.user_id)}
                onDismiss={() => onDismissHand(l.user_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Room Controls */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Room Controls
        </div>
        {/* 3-column grid for utility buttons */}
        <div className="grid grid-cols-3 gap-2">
          <RoomControlButton
            icon={VolumeX}
            label="Mute All"
            onClick={onMuteAll}
          />
          <RoomControlButton
            icon={Hand}
            label="Lower All"
            onClick={onLowerAll}
          />
          {isHost ? (
            <button
              onClick={onOpenSettings}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 p-3 text-center hover:bg-muted transition-colors"
              title="Edit in Settings"
            >
              <span className="text-sm font-black">{session.max_speakers}</span>
              <span className="text-[10px] font-bold leading-tight text-muted-foreground">
                Speaker Limit
              </span>
            </button>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 p-3 text-center">
              <span className="text-sm font-black">{session.max_speakers}</span>
              <span className="text-[10px] font-bold leading-tight text-muted-foreground">
                Speaker Limit
              </span>
            </div>
          )}
          <RoomControlButton
            icon={Share2}
            label="Share Spiral"
            onClick={onShare}
          />
          <RoomControlButton
            icon={UserPlus}
            label="Invite"
            onClick={onOpenInvite}
          />
          <RoomControlButton
            icon={Settings}
            label="Settings"
            onClick={onOpenSettings}
          />
          {isHost && onOpenTransfer && (
            <RoomControlButton
              icon={Crown}
              label="Transfer Host"
              onClick={onOpenTransfer}
            />
          )}
          <RoomControlButton
            icon={PlayCircle}
            label="Past Recordings"
            onClick={() => {
              // Bubble up via a custom event so the room component (which owns
              // the archive state) can handle it without prop-drilling.
              window.dispatchEvent(new CustomEvent("circle:open-archive"));
            }}
          />
        </div>
        {/* Full-width primary action buttons */}
        <div className="mt-2 space-y-2">
          {isHost && (
            <button
              onClick={onToggleRecording}
              disabled={recordingDisabled}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition-colors disabled:opacity-40 ${
                recordingOn
                  ? "border-red-500/40 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              }`}
            >
              <CircleIcon
                className={`w-4 h-4 ${recordingOn ? "fill-red-500 text-red-500 animate-pulse" : ""}`}
              />
              {recordingOn ? "Stop Recording" : "Start Recording"}
            </button>
          )}
          <button
            onClick={onEndCircle}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            End Spiral
          </button>
        </div>
      </div>

      {/* Creator Tools */}
      {isHost &&
        (onOpenPoll ||
          onOpenQA ||
          onToggleScreenShare ||
          onOpenNotes ||
          onToggleAutoRemove) && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Creator Tools
            </div>
            <div className="grid grid-cols-3 gap-2">
              {onOpenPoll && (
                <RoomControlButton
                  icon={BarChart3}
                  label="Poll"
                  onClick={onOpenPoll}
                />
              )}
              {onOpenQA && (
                <RoomControlButton
                  icon={MessageSquare}
                  label={`Q&A${qaCount ? ` (${qaCount})` : ""}`}
                  onClick={onOpenQA}
                />
              )}
              {onToggleScreenShare && (
                <RoomControlButton
                  icon={Monitor}
                  label="Screen Share"
                  onClick={onToggleScreenShare}
                />
              )}
              {onOpenNotes && (
                <RoomControlButton
                  icon={FileText}
                  label="Notes"
                  onClick={onOpenNotes}
                />
              )}
              {onToggleAutoRemove && (
                <RoomControlButton
                  icon={Clock}
                  label={autoRemoveEnabled ? "Auto-Remove On" : "Auto-Remove"}
                  onClick={onToggleAutoRemove}
                />
              )}
            </div>
            {/* Active poll display */}
            {activePoll && (
              <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3 text-primary" />{" "}
                    {activePoll.question}
                  </div>
                  {onClosePoll && (
                    <button
                      onClick={onClosePoll}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                  )}
                </div>
                {activePoll.options.map((opt, i) => {
                  const totalVotes = activePoll.options.reduce(
                    (sum, o) => sum + o.votes.length,
                    0,
                  );
                  const pct =
                    totalVotes > 0 ? (opt.votes.length / totalVotes) * 100 : 0;
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold">{opt.text}</span>
                        <span className="text-muted-foreground">
                          {opt.votes.length} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* Host Controls — select participant then act */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Host Controls
        </div>
        {targetable.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No other participants yet
          </div>
        ) : (
          <>
            {/* Participant selector with avatar row */}
            <div className="mb-3">
              {target ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black">
                    {target.avatar_url ? (
                      <img
                        src={target.avatar_url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      (target.name?.[0] ?? "?")
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      {target.name}
                    </div>
                    <div className="text-[9px] text-muted-foreground capitalize">
                      {target.role.replace("_", "-")}
                    </div>
                  </div>
                  <button
                    onClick={() => setTargetId("")}
                    className="p-1 rounded-full hover:bg-muted/80 text-muted-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground mb-2 italic">
                  Select a participant to act on
                </div>
              )}
              <div className="space-y-0.5 max-h-32 overflow-y-auto mt-1">
                {targetable.map((p) => (
                  <button
                    key={p.user_id}
                    onClick={() =>
                      setTargetId((prev) =>
                        prev === p.user_id ? "" : p.user_id,
                      )
                    }
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                      targetId === p.user_id
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-[9px] font-black border ${p.role === "co_host" ? "border-blue-400/40" : p.role === "speaker" ? "border-primary/40" : "border-transparent"}`}
                    >
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        (p.name?.[0] ?? "?")
                      )}
                    </div>
                    <span className="flex-1 text-xs font-bold truncate">
                      {p.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.hand_raised && <span className="text-[10px]">✋</span>}
                      <span
                        className={`text-[9px] font-bold ${p.role === "co_host" ? "text-blue-400" : p.role === "speaker" ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {p.role === "co_host"
                          ? "Co-host"
                          : p.role === "speaker"
                            ? "Speaker"
                            : "Audience"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Action grid — 3×2 matching the design */}
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
                onClick={() => {
                  if (target) {
                    onKickUser(target.user_id);
                    setTargetId("");
                  }
                }}
                tone="danger"
              />
              <RoomControlButton
                icon={Ban}
                label="Block"
                disabled={!target}
                onClick={() => {
                  if (target) {
                    onBlockUser(target.user_id);
                    setTargetId("");
                  }
                }}
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
                onClick={() =>
                  target && onMuteUser(target.user_id, !target.muted)
                }
              />
              <RoomControlButton
                icon={UserMinus}
                label="Move to Audience"
                disabled={
                  !target ||
                  (target.role !== "speaker" && target.role !== "co_host")
                }
                onClick={() => {
                  if (target) {
                    onDemoteUser(target.user_id);
                    setTargetId("");
                  }
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
