import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Hand, Video, VideoOff, Radio, Users, PhoneOff,
  Circle as CircleIcon, ChevronDown, Crown, Upload, Wifi, WifiOff,
  VolumeX, UserMinus, Flag, Volume2,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsSend } from "@/lib/wsClient";
import type { WsEvent } from "@/lib/wsClient";
import {
  AudioCircleMesh,
  fetchIceServers,
  getAudioCircleMediaCapabilities,
  type AudioCircleMediaCapabilities,
  type RemoteStreamHandle,
} from "@/lib/audioCircleWebRTC";

interface Participant {
  user_id: number;
  role: "host" | "speaker" | "listener";
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
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "lost";

const REACTION_EMOJIS = ["👏", "🔥", "❤️", "😂", "🙌"];

// ── Speaking volume analyser ─────────────────────────────────────────────────
// Returns a cleanup function. Calls onLevel(0–1) at ~30fps.
function startVolumeAnalyser(stream: MediaStream, onLevel: (v: number) => void): () => void {
  let ctx: AudioContext | null = null;
  let animId = 0;
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      onLevel(Math.min(1, avg / 80));
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
  } catch {
    // AudioContext unavailable in some environments — fail silently
  }
  return () => {
    cancelAnimationFrame(animId);
    ctx?.close().catch(() => {});
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

export default function AudioCircleRoomScreen() {
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id ?? "", 10);
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

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
  // userId → 0–1 speaking volume
  const [speakingLevels, setSpeakingLevels] = useState<Map<number, number>>(new Map());
  const [localLevel, setLocalLevel] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // moderation menu open for which speaker userId
  const [modMenuOpen, setModMenuOpen] = useState<number | null>(null);

  const meshRef = useRef<AudioCircleMesh | null>(null);
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const isRecordingRef = useRef(false);
  // volume analyser cleanups keyed by userId ("local" for own mic)
  const analyserCleanupsRef = useRef<Map<string, () => void>>(new Map());

  const myUserId = currentUser?.id;
  const me = participants.find(p => p.user_id === myUserId);
  const isHost = session?.host_id === myUserId;
  const canSpeak = me?.role === "host" || me?.role === "speaker";
  const host = participants.find(p => p.role === "host");
  const speakers = participants.filter(p => p.role === "speaker");
  const audience = participants.filter(p => p.role === "listener");

  useEffect(() => {
    setMediaCapabilities(getAudioCircleMediaCapabilities());
  }, []);

  const recordingTimer = useRecordingTimer(!!session?.is_recording);

  // ── Connection status from WS + WebRTC states ────────────────────────────
  // We derive overall status: if the WS is alive and we loaded, "connected";
  // if circle_host_disconnected or a peer fails, "reconnecting".
  useEffect(() => {
    if (!loading && session) setConnectionStatus("connected");
  }, [loading, session]);

  // Re-fetch session state after a WS reconnect. Controls and participant
  // roles are normally kept current by broadcasts, but a reconnect can miss
  // events that arrived while the socket was down.
  const resync = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setParticipants(data.participants ?? []);
      setConnectionStatus("connected");
    } catch {
      // The next reconnect will retry; keep the last known state visible.
    }
  }, [base, sessionId]);

  useWebSocket("ws_reconnected", () => {
    void resync();
  });

  // ── Load initial state ───────────────────────────────────────────────────
  useEffect(() => {
    if (isNaN(sessionId)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
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

        const joinRes = await fetch(`${base}/api/audio-circle-sessions/${sessionId}/join`, {
          method: "POST", headers: authHeaders(),
        });
        const joinData = await joinRes.json();
        if (!cancelled && joinRes.ok) setParticipants(joinData.participants ?? []);
      } catch {
        if (!cancelled) toast({ title: "Couldn't load the circle", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, base, setLocation]);

  // ── WebRTC mesh setup ────────────────────────────────────────────────────
  // ICE servers (STUN + a short-lived TURN credential, if configured) are
  // fetched fresh per room join rather than baked into the client bundle —
  // see fetchIceServers() in audioCircleWebRTC.ts. This makes construction
  // async, so we guard against the effect having been cleaned up (session
  // changed, component unmounted) before the fetch resolves.
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
      // tear down all analysers
      for (const cleanup of analyserCleanupsRef.current.values()) cleanup();
      analyserCleanupsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, myUserId]);

  function subscribeRaw(type: string, handler: (e: WsEvent) => void): () => void {
    signalHandlerRef.current = handler;
    return () => { signalHandlerRef.current = null; };
  }
  const signalHandlerRef = useRef<((e: WsEvent) => void) | null>(null);
  useWebSocket("circle_signal", (e) => signalHandlerRef.current?.(e));

  // Wire volume analysers for remote streams as they arrive
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const key = `remote:${userId}`;
      if (analyserCleanupsRef.current.has(key)) continue;
      const cleanup = startVolumeAnalyser(stream, (level) => {
        setSpeakingLevels(prev => new Map(prev).set(userId, level));
      });
      analyserCleanupsRef.current.set(key, cleanup);
    }
  }, [remoteStreams]);

  // Connect the mesh to peers
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !myUserId) return;
    if (canSpeak) {
      for (const p of participants) {
        if (p.user_id !== myUserId) mesh.connectToPeer(p.user_id);
      }
    } else {
      const stageUsers = participants.filter(p => p.role === "host" || p.role === "speaker");
      for (const s of stageUsers) {
        if (s.user_id !== myUserId) mesh.connectToPeer(s.user_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.map(p => p.user_id).join(","), myUserId, canSpeak]);

  // Publish mic when promoted to speaker.
  // Critically: honour the DB-persisted muted flag so a page-refresh by a
  // host-muted speaker cannot silently bypass the mute — we disable the mic
  // track immediately after getUserMedia rather than waiting for a new WS event.
  useEffect(() => {
    if (!meshRef.current) return;
    if (!canSpeak) {
      // Demotion must stop the actual tracks, not only hide the controls.
      // Otherwise a speaker can remain live after leaving the stage.
      meshRef.current.stopLocalMedia();
      setLocalStream(null);
      setMicOn(false);
      setVideoOn(false);
      const cleanup = analyserCleanupsRef.current.get("local");
      if (cleanup) { cleanup(); analyserCleanupsRef.current.delete("local"); }
      return;
    }
    // Capture muted state at the moment of promotion so the closure is stable.
    const startMuted = me?.muted ?? false;
    meshRef.current.publishLocalMedia({ video: !!session?.video_enabled && videoOn })
      .then((stream) => {
        setMediaError(null);
        if (startMuted) {
          // Host had previously muted this speaker. Keep mic disabled so the
          // refresh doesn't give them an open mic until the host unmutes again.
          meshRef.current?.setMicEnabled(false);
          setMicOn(false);
        } else {
          setMicOn(true);
        }
        setLocalStream(stream);
        // Start local volume analyser (only meaningful when unmuted, but cheap to run)
        const key = "local";
        const existing = analyserCleanupsRef.current.get(key);
        if (existing) existing();
        const cleanup = startVolumeAnalyser(stream, setLocalLevel);
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

  // ── Leave / cleanup ──────────────────────────────────────────────────────
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

  // ── Realtime room events ─────────────────────────────────────────────────
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

  useWebSocket("circle_muted", (e) => {
    const p = e.payload as { session_id: number; user_id: number | null; muted: boolean; all?: boolean };
    if (p.session_id !== sessionId) return;
    if (p.all) {
      // Mute all speakers
      setParticipants(prev => prev.map(x => x.role === "speaker" ? { ...x, muted: true } : x));
      // If I'm a speaker, mute my own mic
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
    const p = e.payload as { session_id: number; emoji: string };
    if (p.session_id !== sessionId) return;
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions(prev => [...prev, { id, emoji: p.emoji }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2000);
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

  // ── Actions ──────────────────────────────────────────────────────────────
  // Always surface network failures. Without this guard, a dropped
  // connection made controls appear to do nothing.
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

  // Update the initiating user's view after the REST mutation succeeds rather
  // than waiting for its WS echo. The broadcast still reconciles other tabs.
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
  const react = (emoji: string) => post("/react", { emoji });

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
    // A denied permission can be corrected in browser settings while the
    // room remains open; retry getUserMedia instead of making the button look
    // like it worked when no audio track exists.
    meshRef.current?.publishLocalMedia({ video: !!session?.video_enabled && videoOn })
      .then((stream) => {
        setLocalStream(stream);
        setMicOn(true);
        setMediaError(null);
        const existing = analyserCleanupsRef.current.get("local");
        if (existing) existing();
        analyserCleanupsRef.current.set("local", startVolumeAnalyser(stream, setLocalLevel));
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
        const stream = await meshRef.current.publishLocalMedia({ video: true });
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

  if (loading || !session) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading circle…</div>;
  }

  const remoteVideoStreams = [...remoteStreams.entries()].filter(
    ([, s]) => s.getVideoTracks().length > 0
  );

  // Connection status dot
  const connDot = connectionStatus === "connected"
    ? <span className="flex items-center gap-1 text-green-400 text-[10px]"><Wifi className="w-3 h-3" /> Connected</span>
    : connectionStatus === "reconnecting"
      ? <span className="flex items-center gap-1 text-amber-400 text-[10px] animate-pulse"><WifiOff className="w-3 h-3" /> Reconnecting…</span>
      : connectionStatus === "lost"
        ? <span className="flex items-center gap-1 text-red-400 text-[10px]"><WifiOff className="w-3 h-3" /> Connection lost</span>
        : <span className="flex items-center gap-1 text-muted-foreground text-[10px]"><Wifi className="w-3 h-3" /> Connecting…</span>;

  return (
    <div className="min-h-screen bg-background pb-40 relative overflow-hidden" onClick={() => setModMenuOpen(null)}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="font-black text-sm truncate">{session.title}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {participants.length} here</span>
                {connDot}
              </div>
            </div>
          </div>
          <button onClick={leaveAndExit} className="p-2 rounded-full hover:bg-muted shrink-0">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Recording bar — visible to everyone */}
        {session.is_recording && (
          <div className="mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-1.5">
            <CircleIcon className="w-3 h-3 text-red-500 fill-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-400 font-bold flex-1">This Circle is being recorded</span>
            {isHost && <span className="text-xs text-red-400 font-mono">{recordingTimer}</span>}
            {uploading && <Upload className="w-3 h-3 text-amber-400 animate-bounce" />}
          </div>
        )}
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

      {/* ── Floating reactions ───────────────────────────────────────────────── */}
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

      {/* ── End confirmation overlay ─────────────────────────────────────────── */}
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

      <div className="p-4 space-y-5">

        {/* ── Video grid ──────────────────────────────────────────────────────── */}
        {session.video_enabled && (remoteVideoStreams.length > 0 || (localStream && localStream.getVideoTracks().length > 0 && videoOn)) && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Video</div>
            <div className="grid grid-cols-2 gap-2">
              {localStream && localStream.getVideoTracks().length > 0 && videoOn && (
                <div className={`relative aspect-video bg-black rounded-xl overflow-hidden ${localLevel > 0.15 ? "ring-2 ring-primary" : ""}`}>
                  <video
                    autoPlay muted playsInline
                    ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">You</div>
                </div>
              )}
              {remoteVideoStreams.map(([userId, stream]) => {
                const p = participants.find(x => x.user_id === userId);
                const level = speakingLevels.get(userId) ?? 0;
                return (
                  <div key={userId} className={`relative aspect-video bg-black rounded-xl overflow-hidden ${level > 0.15 ? "ring-2 ring-primary" : ""}`}>
                    <video
                      autoPlay playsInline
                      ref={(el) => { if (el && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}); } }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded truncate max-w-[80%]">
                      {p?.name ?? "Speaker"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stage: HOST ──────────────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Host</div>
          {host ? (
            <SpeakerTile
              participant={host}
              isMe={host.user_id === myUserId}
              level={host.user_id === myUserId ? localLevel : (speakingLevels.get(host.user_id) ?? 0)}
              isHost={isHost}
              canMod={false}
              modMenuOpen={false}
              onOpenMod={() => {}}
              onMute={() => {}}
              onDemote={() => {}}
              onKick={() => {}}
            />
          ) : (
            <div className="text-xs text-muted-foreground">Host has left</div>
          )}
        </div>

        {/* ── Stage: SPEAKERS ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Speakers ({speakers.length})
            </div>
            {isHost && speakers.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); muteAll(); }}
                className="text-[10px] font-bold text-amber-400 flex items-center gap-1 hover:opacity-70"
              >
                <VolumeX className="w-3 h-3" /> Mute all
              </button>
            )}
          </div>
          {speakers.length === 0 ? (
            <div className="text-xs text-muted-foreground">No speakers yet</div>
          ) : (
            <div className="grid grid-cols-4 gap-3" onClick={e => e.stopPropagation()}>
              {speakers.map(s => (
                <SpeakerTile
                  key={s.user_id}
                  participant={s}
                  isMe={s.user_id === myUserId}
                  level={s.user_id === myUserId ? localLevel : (speakingLevels.get(s.user_id) ?? 0)}
                  isHost={isHost}
                  canMod={isHost && s.user_id !== myUserId}
                  modMenuOpen={modMenuOpen === s.user_id}
                  onOpenMod={() => setModMenuOpen(prev => prev === s.user_id ? null : s.user_id)}
                  onMute={() => muteUser(s.user_id, !s.muted)}
                  onDemote={() => demote(s.user_id)}
                  onKick={() => kickUser(s.user_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Raised hands (host-only) ─────────────────────────────────────────── */}
        {isHost && audience.some(l => l.hand_raised) && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Raised Hands</div>
            {audience.filter(l => l.hand_raised).map(l => (
              <div key={l.user_id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-black overflow-hidden shrink-0">
                  {l.avatar_url ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" /> : l.name?.[0] ?? "?"}
                </div>
                <span className="flex-1 text-sm font-bold truncate">{l.name}</span>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-xs px-2" onClick={() => promote(l.user_id)}>Bring up</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => post("/hand", { raised: false, user_id: l.user_id })}>Dismiss</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Audience ─────────────────────────────────────────────────────────── */}
        {audience.length > 0 && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Audience ({audience.length})
            </div>
            <div className="grid grid-cols-5 gap-3">
              {audience.map(l => (
                <div key={l.user_id} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {l.avatar_url ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-sm font-black">{l.name?.[0] ?? "?"}</span>}
                    </div>
                    {l.hand_raised && (
                      <span className="absolute -top-1 -right-1 text-base leading-none">✋</span>
                    )}
                  </div>
                  <span className="text-[9px] truncate max-w-[52px] text-center">{l.name}</span>
                  {isHost && l.hand_raised && (
                    <button onClick={() => promote(l.user_id)} className="text-[9px] text-primary font-bold underline">bring up</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls ───────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-4 space-y-3">
        {/* Reactions */}
        <div className="flex items-center justify-center gap-2">
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => react(e)} className="text-xl px-1 hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-center gap-2.5">
          {!canSpeak && (
            <Button variant={me?.hand_raised ? "default" : "outline"} onClick={toggleHand} className="gap-2">
              <Hand className="w-4 h-4" />
              {me?.hand_raised ? "Hand raised" : "Raise hand"}
            </Button>
          )}
          {canSpeak && (
            <Button
              variant={micOn ? "default" : "outline"}
              size="icon"
              onClick={toggleMic}
              disabled={mediaCapabilities?.microphone === false}
              title={micOn ? "Mute" : "Unmute"}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
          )}
          {canSpeak && session.video_enabled && (
            <Button
              variant={videoOn ? "default" : "outline"}
              size="icon"
              onClick={toggleVideo}
              disabled={mediaCapabilities?.camera === false}
              title={videoOn ? "Turn off camera" : "Turn on camera"}
            >
              {videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
          )}
          {/* Speaker can leave stage themselves */}
          {me?.role === "speaker" && (
            <Button variant="outline" size="icon" onClick={() => demote(myUserId!)} title="Leave stage">
              <UserMinus className="w-4 h-4" />
            </Button>
          )}
          {isHost && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleRecording}
              disabled={uploading || mediaCapabilities?.recording === false}
              title={session.is_recording ? "Stop recording" : "Start recording"}
            >
              <CircleIcon className={`w-4 h-4 ${session.is_recording ? "text-red-500 fill-red-500" : ""}`} />
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            onClick={isHost ? () => setShowEndConfirm(true) : leaveAndExit}
            title={isHost ? "End Circle" : "Leave"}
          >
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Speaker tile (used for both Host and Speakers sections) ────────────────────
interface SpeakerTileProps {
  participant: Participant;
  isMe: boolean;
  level: number; // 0–1 speaking volume
  isHost: boolean;
  canMod: boolean;
  modMenuOpen: boolean;
  onOpenMod: () => void;
  onMute: () => void;
  onDemote: () => void;
  onKick: () => void;
}

function SpeakerTile({ participant: s, isMe, level, canMod, modMenuOpen, onOpenMod, onMute, onDemote, onKick }: SpeakerTileProps) {
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
            isSpeaking ? "border-primary" : s.role === "host" ? "border-amber-400/60" : "border-primary/30"
          }`}
          onClick={canMod ? onOpenMod : undefined}
        >
          {s.avatar_url
            ? <img src={s.avatar_url} className="w-full h-full object-cover" alt="" />
            : <span className="text-lg font-black">{s.name?.[0] ?? "?"}</span>}
        </button>
        {s.role === "host" && (
          <Crown className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1 drop-shadow" />
        )}
        {s.muted && (
          <MicOff className="w-3 h-3 text-red-400 absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5" />
        )}
        {isSpeaking && !s.muted && (
          <Volume2 className="w-3 h-3 text-primary absolute -bottom-0.5 -left-0.5 bg-background rounded-full p-0.5" />
        )}
      </div>
      <span className="text-[10px] font-bold truncate max-w-[64px]">{isMe ? "You" : s.name}</span>

      {/* Host moderation dropdown */}
      <AnimatePresence>
        {modMenuOpen && canMod && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[140px]"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onMute}
            >
              {s.muted ? <><Mic className="w-3 h-3" /> Unmute</> : <><MicOff className="w-3 h-3" /> Mute</>}
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted"
              onClick={onDemote}
            >
              <UserMinus className="w-3 h-3" /> Move to Audience
            </button>
            <button
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted text-red-400"
              onClick={onKick}
            >
              <Flag className="w-3 h-3" /> Remove from Circle
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
