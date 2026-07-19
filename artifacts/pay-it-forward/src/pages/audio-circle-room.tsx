import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Hand, Video, VideoOff, Radio, Users, X, PhoneOff,
  Circle as CircleIcon, ChevronDown, Crown, Download, AlertCircle,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/useWebSocket";
import { wsSend } from "@/lib/wsClient";
import type { WsEvent } from "@/lib/wsClient";
import { AudioCircleMesh, type RemoteStreamHandle } from "@/lib/audioCircleWebRTC";

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

const REACTION_EMOJIS = ["👏", "🔥", "❤️", "😂", "🙌"];

export default function AudioCircleRoomScreen() {
  const params = useParams<{ id: string }>();
  const sessionId = parseInt(params.id ?? "", 10);
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  // Remote streams: one MediaStream per remote user_id (carries both audio+video tracks)
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  // Local camera stream (shown only when this user is a speaker/host with video on)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Pending recording blob ready to download
  const [pendingRecordingBlob, setPendingRecordingBlob] = useState<Blob | null>(null);

  const meshRef = useRef<AudioCircleMesh | null>(null);
  // Audio elements keyed by userId — programmatic, never rendered in JSX
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  // Local video preview element
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  // Remote video elements by userId
  const remoteVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const myUserId = currentUser?.id;
  const me = participants.find(p => p.user_id === myUserId);
  const isHost = session?.host_id === myUserId;
  const canSpeak = me?.role === "host" || me?.role === "speaker";
  const speakers = participants.filter(p => p.role === "host" || p.role === "speaker");
  const listeners = participants.filter(p => p.role === "listener");

  // ── WS signal relay ──────────────────────────────────────────────────────────
  // The mesh is a plain class — it can't use React hooks directly. We bridge it
  // via a stable ref-based subscription pattern: a single useWebSocket call
  // forwards every circle_signal event into the mesh's handler.
  const signalHandlerRef = useRef<((e: WsEvent) => void) | null>(null);
  useWebSocket("circle_signal", (e) => signalHandlerRef.current?.(e));

  function subscribeToCircleSignal(handler: (e: WsEvent) => void): () => void {
    signalHandlerRef.current = handler;
    return () => { signalHandlerRef.current = null; };
  }

  // ── Load initial state & join session ─────────────────────────────────────
  useEffect(() => {
    if (isNaN(sessionId)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}`, { headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          if (!cancelled) {
            toast({ title: "Circle not found", description: data.error ?? "This room may have ended.", variant: "destructive" });
            setLocation("/audio-circles");
          }
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
        if (!cancelled && !joinRes.ok) {
          toast({ title: "Couldn't join", description: joinData.error ?? "Try refreshing.", variant: "destructive" });
        }
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't reach the server. Check your connection.");
          toast({ title: "Connection error", description: "Couldn't load the circle.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, base, setLocation]);

  // ── WebRTC mesh lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !myUserId) return;
    const mesh = new AudioCircleMesh({
      sessionId,
      selfUserId: myUserId,
      videoEnabled: session.video_enabled,
      onRemoteStream: (handle: RemoteStreamHandle) => {
        setRemoteStreams(prev => new Map(prev).set(handle.userId, handle.stream));
      },
      onRemoteStreamEnded: (userId: number) => {
        setRemoteStreams(prev => { const n = new Map(prev); n.delete(userId); return n; });
      },
      onLocalStream: (stream) => {
        setLocalStream(stream);
      },
      subscribeToCircleSignal,
    });
    meshRef.current = mesh;
    return () => {
      mesh.destroy();
      meshRef.current = null;
      setLocalStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, myUserId]);

  // ── Connect to peers when participant list changes ─────────────────────────
  // Speakers connect to everyone; listeners only connect to speakers.
  // Re-runs whenever the set of participants or our role changes.
  const participantIds = participants.map(p => p.user_id).join(",");
  const speakerIds = speakers.map(s => s.user_id).join(",");
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !myUserId) return;
    if (canSpeak) {
      for (const p of participants) {
        if (p.user_id !== myUserId) mesh.connectToPeer(p.user_id);
      }
    } else {
      for (const s of speakers) {
        if (s.user_id !== myUserId) mesh.connectToPeer(s.user_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantIds, speakerIds, myUserId, canSpeak]);

  // ── Publish local media when promoted to speaker ──────────────────────────
  useEffect(() => {
    if (!canSpeak || !meshRef.current) return;
    const videoWanted = !!session?.video_enabled && videoOn;
    meshRef.current.publishLocalMedia({ video: videoWanted })
      .then(() => setMicOn(true))
      .catch((err) => {
        console.error("[CircleRoom] getUserMedia failed", err);
        toast({
          title: "Microphone access denied",
          description: "Check your browser's permission settings — mic/camera access is required to speak.",
          variant: "destructive",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak]);

  // ── Wire up remote audio elements (programmatic, outside JSX) ───────────
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) continue;
      let el = audioElsRef.current.get(userId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        audioElsRef.current.set(userId, el);
      }
      if (el.srcObject !== stream) el.srcObject = stream;
    }
    // Clean up removed streams
    for (const [userId, el] of audioElsRef.current) {
      if (!remoteStreams.has(userId)) {
        el.srcObject = null;
        el.pause();
        audioElsRef.current.delete(userId);
      }
    }
  }, [remoteStreams]);

  // ── Wire up local video preview ───────────────────────────────────────────
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (localStream && session?.video_enabled && videoOn) {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
        el.play().catch(() => {});
      }
    } else {
      el.srcObject = null;
    }
  }, [localStream, session?.video_enabled, videoOn]);

  // ── Wire up remote video elements ─────────────────────────────────────────
  const wireRemoteVideo = useCallback((userId: number, el: HTMLVideoElement | null) => {
    if (!el) { remoteVideoRefs.current.delete(userId); return; }
    remoteVideoRefs.current.set(userId, el);
    const stream = remoteStreams.get(userId);
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [remoteStreams]);

  // Update video elements when streams change
  useEffect(() => {
    for (const [userId, el] of remoteVideoRefs.current) {
      const stream = remoteStreams.get(userId);
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    }
  }, [remoteStreams]);

  // ── Leave on unmount / tab close ──────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    if (isNaN(sessionId)) return;
    const url = `${base}/api/audio-circle-sessions/${sessionId}/leave`;
    const token = getToken();
    // keepalive: true survives page unload like sendBeacon but can carry
    // Authorization headers — sendBeacon cannot.
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

  // ── Realtime room events ──────────────────────────────────────────────────
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
    // When a user is demoted, tear down our send connection to them
    if (p.user_id !== myUserId && p.role === "listener") meshRef.current?.disconnectFromPeer(p.user_id);
  });
  useWebSocket("circle_muted_changed", (e) => {
    const p = e.payload as { session_id: number; user_id: number; muted: boolean };
    if (p.session_id !== sessionId) return;
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, muted: p.muted } : x));
  });
  useWebSocket("circle_reaction", (e) => {
    const p = e.payload as { session_id: number; emoji: string };
    if (p.session_id !== sessionId) return;
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions(prev => [...prev, { id, emoji: p.emoji }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2200);
  });
  useWebSocket("circle_recording_changed", (e) => {
    const p = e.payload as { session_id: number; is_recording: boolean };
    if (p.session_id !== sessionId) return;
    setSession(prev => prev ? { ...prev, is_recording: p.is_recording } : prev);
    if (isHost) {
      // Wire up actual recording on the mesh for the host's client
      const blob = meshRef.current?.setRecording(p.is_recording) ?? null;
      if (blob && !p.is_recording) {
        setPendingRecordingBlob(blob);
        toast({ title: "Recording ready", description: "Click \"Save Recording\" to download." });
      }
    }
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
    toast({ title: "Host reconnecting…", description: "The circle is still open — hang tight." });
  });
  useWebSocket("circle_host_reconnected", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    toast({ title: "Host is back" });
  });

  // ── Actions ──────────────────────────────────────────────────────────────────
  const post = useCallback(async (path: string, body?: object) => {
    try {
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Action failed", description: data.error ?? "Try again.", variant: "destructive" });
      }
      return res.ok;
    } catch {
      toast({ title: "Connection error", description: "Check your network.", variant: "destructive" });
      return false;
    }
  }, [base, sessionId]);

  const toggleHand = () => post("/hand", { raised: !me?.hand_raised });
  const promote = (userId: number) => post("/promote", { user_id: userId });
  const demote = (userId: number) => post("/demote", { user_id: userId });
  const react = (emoji: string) => post("/react", { emoji });
  const endSession = async () => {
    await post("/end");
    setLocation("/audio-circles");
  };
  const leaveAndExit = () => {
    leaveRoom();
    setLocation("/audio-circles");
  };

  const toggleMic = () => {
    const next = !micOn;
    meshRef.current?.setMicEnabled(next);
    setMicOn(next);
    // Sync mute state to server so other participants see the correct indicator
    post("/mute", { muted: !next }).catch(() => {});
  };

  const toggleVideo = () => {
    const next = !videoOn;
    setVideoOn(next);
    meshRef.current?.setVideoEnabled(next);
  };

  const toggleRecording = async () => {
    const nextIsRecording = !session?.is_recording;
    const ok = await post("/recording", { is_recording: nextIsRecording });
    if (!ok) return;
    // The actual start/stop happens in the circle_recording_changed WS handler
    // so ALL clients (not just the host) see the updated state consistently.
  };

  const downloadRecording = () => {
    if (!pendingRecordingBlob) return;
    const url = URL.createObjectURL(pendingRecordingBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `circle-recording-${sessionId}-${Date.now()}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setPendingRecordingBlob(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Radio className="w-8 h-8 text-primary animate-pulse" />
        <div className="text-sm text-muted-foreground">Joining the circle…</div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <div className="text-sm text-muted-foreground">{loadError ?? "This circle is no longer available."}</div>
        <Button variant="outline" onClick={() => setLocation("/audio-circles")}>Back to Circles</Button>
      </div>
    );
  }

  const videoSpeakers = session.video_enabled
    ? speakers.filter(s => remoteStreams.get(s.user_id)?.getVideoTracks().length ?? 0 > 0)
    : [];

  return (
    <div className="min-h-screen bg-background pb-40 relative overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <div className="font-black text-sm truncate">{session.title}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {participants.length}
              {session.is_recording && (
                <span className="text-red-400 flex items-center gap-0.5 ml-1">
                  <CircleIcon className="w-2 h-2 fill-current" /> REC
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={leaveAndExit} className="p-2 rounded-full hover:bg-muted">
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Floating reactions */}
      <div className="pointer-events-none fixed inset-x-0 bottom-44 flex justify-center z-20">
        <AnimatePresence>
          {floatingReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -100, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className="absolute text-3xl"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="p-4 space-y-5">
        {/* Video grid — shown when video is enabled and at least one speaker has it on */}
        {session.video_enabled && (
          <div className="space-y-3">
            {/* Local video preview */}
            {canSpeak && videoOn && (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border/50">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]" // mirror for selfie view
                />
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  You (host/speaker)
                </div>
                {!micOn && (
                  <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                    <MicOff className="w-3 h-3 text-red-400" />
                  </div>
                )}
              </div>
            )}

            {/* Remote video streams */}
            {videoSpeakers.length > 0 && (
              <div className={`grid gap-2 ${videoSpeakers.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {videoSpeakers.map(s => (
                  <div key={s.user_id} className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border/50">
                    <video
                      ref={el => wireRemoteVideo(s.user_id, el)}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      {s.role === "host" && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                      {s.name}
                    </div>
                    {s.muted && (
                      <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                        <MicOff className="w-3 h-3 text-red-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Speakers row */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            Speaking ({speakers.length}/13)
          </div>
          <div className="grid grid-cols-4 gap-3">
            {speakers.map(s => (
              <div key={s.user_id} className="flex flex-col items-center gap-1">
                <div className="relative">
                  {/* Subtle speaking ring animation for active (unmuted) speakers */}
                  {!s.muted && (
                    <div className="absolute inset-0 rounded-full border-2 border-primary/60 animate-ping opacity-40 scale-110" />
                  )}
                  <div className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 ${s.user_id === myUserId && micOn ? "border-primary" : "border-border"}`}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} className="w-full h-full object-cover" alt="" />
                      : <span className="text-lg font-black">{s.name?.[0] ?? "?"}</span>
                    }
                  </div>
                  {s.role === "host" && (
                    <Crown className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1 drop-shadow" />
                  )}
                  {s.muted && (
                    <MicOff className="w-3 h-3 text-red-400 absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5" />
                  )}
                </div>
                <span className="text-[10px] font-bold truncate max-w-[64px] text-center">{s.name}</span>
                {isHost && s.user_id !== myUserId && (
                  <button
                    onClick={() => demote(s.user_id)}
                    className="text-[9px] text-muted-foreground underline hover:text-foreground"
                  >
                    move down
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Listeners row */}
        {listeners.length > 0 && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Listening ({listeners.length})
            </div>
            <div className="grid grid-cols-5 gap-3">
              {listeners.map(l => (
                <div key={l.user_id} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {l.avatar_url
                        ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <span className="text-sm font-black">{l.name?.[0] ?? "?"}</span>
                      }
                    </div>
                    {l.hand_raised && (
                      <Hand className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1 drop-shadow" />
                    )}
                  </div>
                  <span className="text-[9px] truncate max-w-[52px] text-center">{l.name}</span>
                  {isHost && l.hand_raised && (
                    <button
                      onClick={() => promote(l.user_id)}
                      className="text-[9px] text-primary font-bold underline hover:text-primary/80"
                    >
                      bring up
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recording ready download */}
        {pendingRecordingBlob && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-bold text-green-400">Recording ready</div>
              <div className="text-xs text-muted-foreground">
                {(pendingRecordingBlob.size / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <Button size="sm" onClick={downloadRecording} className="gap-2 shrink-0">
              <Download className="w-3 h-3" /> Save
            </Button>
          </motion.div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="fixed bottom-0 inset-x-0 bg-background/97 backdrop-blur border-t border-border p-4 space-y-3">
        {/* Reaction bar */}
        <div className="flex items-center justify-center gap-2">
          {REACTION_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => react(e)}
              className="text-xl px-1.5 py-1 rounded-lg hover:bg-muted active:scale-90 transition-transform"
            >
              {e}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {!canSpeak && (
            <Button
              variant={me?.hand_raised ? "default" : "outline"}
              onClick={toggleHand}
              className="gap-2"
            >
              <Hand className="w-4 h-4" />
              {me?.hand_raised ? "Hand raised" : "Raise hand"}
            </Button>
          )}

          {canSpeak && (
            <Button
              variant={micOn ? "default" : "outline"}
              size="icon"
              onClick={toggleMic}
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
              title={videoOn ? "Turn off camera" : "Turn on camera"}
            >
              {videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
          )}

          {isHost && (
            <Button
              variant={session.is_recording ? "destructive" : "outline"}
              size="icon"
              onClick={toggleRecording}
              title={session.is_recording ? "Stop recording" : "Start recording"}
            >
              <CircleIcon className={`w-4 h-4 ${session.is_recording ? "fill-current animate-pulse" : ""}`} />
            </Button>
          )}

          <Button
            variant="destructive"
            size="icon"
            onClick={isHost ? endSession : leaveAndExit}
            title={isHost ? "End circle for everyone" : "Leave circle"}
          >
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>

        {/* Context help */}
        {!canSpeak && (
          <div className="text-center text-[11px] text-muted-foreground/70">
            Listening mode · Raise your hand to ask for a speaking slot
          </div>
        )}
      </div>
    </div>
  );
}
