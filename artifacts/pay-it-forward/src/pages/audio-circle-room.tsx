import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Hand, Video, VideoOff, Radio, Users, X, PhoneOff,
  Circle as CircleIcon, ChevronDown, Crown, Upload,
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
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const meshRef = useRef<AudioCircleMesh | null>(null);
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  // Track recording state in a ref so the WS closure always reads the latest
  const isRecordingRef = useRef(false);

  const myUserId = currentUser?.id;
  const me = participants.find(p => p.user_id === myUserId);
  const isHost = session?.host_id === myUserId;
  const canSpeak = me?.role === "host" || me?.role === "speaker";
  const speakers = participants.filter(p => p.role === "host" || p.role === "speaker");
  const listeners = participants.filter(p => p.role === "listener");

  // ── Load initial state, join as listener ────────────────────────────────
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
        setRemoteStreams(prev => { const next = new Map(prev); next.delete(userId); return next; });
      },
      subscribeToCircleSignal: (handler) => {
        const unsub1 = subscribeRaw("circle_signal", handler);
        return unsub1;
      },
    });
    meshRef.current = mesh;
    return () => { mesh.destroy(); meshRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, myUserId]);

  // Small helper so the mesh can subscribe to the shared WS without importing
  // the React hook (mesh is a plain class, not a component).
  function subscribeRaw(type: string, handler: (e: WsEvent) => void): () => void {
    signalHandlerRef.current = handler;
    return () => { signalHandlerRef.current = null; };
  }
  const signalHandlerRef = useRef<((e: WsEvent) => void) | null>(null);
  useWebSocket("circle_signal", (e) => signalHandlerRef.current?.(e));

  // Connect the mesh to the right set of peers once we know who's who.
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
  }, [participants.map(p => p.user_id).join(","), speakers.map(s => s.user_id).join(","), myUserId, canSpeak]);

  // ── Mic/video publish when promoted to speaker ──────────────────────────
  useEffect(() => {
    if (!canSpeak || !meshRef.current) return;
    meshRef.current.publishLocalMedia({ video: !!session?.video_enabled && videoOn })
      .then((stream) => {
        setMicOn(true);
        setLocalStream(stream);
      })
      .catch(() => toast({ title: "Couldn't access your microphone", description: "Check your browser's permission settings.", variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak]);

  // ── Remote audio element lifecycle ──────────────────────────────────────
  // <video> elements rendered in JSX handle their own audio output for video
  // streams. For audio-only streams (no video track) we create a hidden
  // <Audio> element imperatively.
  //
  // Critical: when a stream *transitions* from audio-only → audio+video (e.g.
  // the host turns their camera on mid-session), we MUST tear down the stale
  // hidden <audio> element. Without this, both the <audio> element and the
  // <video> element play audio simultaneously → doubled/echoed sound.
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const hasVideo = stream.getVideoTracks().length > 0;
      if (hasVideo) {
        // Video stream: <video> in JSX owns audio. Destroy any stale audio el.
        const staleAudio = audioElsRef.current.get(userId);
        if (staleAudio) {
          staleAudio.pause();
          staleAudio.srcObject = null;
          audioElsRef.current.delete(userId);
        }
      } else {
        // Audio-only stream: ensure a hidden <audio> element is playing.
        let el = audioElsRef.current.get(userId);
        if (!el) {
          el = new Audio();
          el.autoplay = true;
          audioElsRef.current.set(userId, el);
        }
        if (el.srcObject !== stream) el.srcObject = stream;
      }
    }
    // Clean up audio elements for peers who have left.
    for (const [userId] of Array.from(audioElsRef.current)) {
      if (!remoteStreams.has(userId)) {
        const el = audioElsRef.current.get(userId);
        if (el) { el.pause(); el.srcObject = null; }
        audioElsRef.current.delete(userId);
      }
    }
  }, [remoteStreams]);

  // ── Upload recording blob to server ──────────────────────────────────────
  const uploadRecording = useCallback(async (blob: Blob) => {
    if (!isHost) return;
    setUploading(true);
    try {
      const token = getToken();
      const res = await fetch(`${base}/api/audio-circle-sessions/${sessionId}/recording-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
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

  // ── Leave on unmount / tab close ─────────────────────────────────────────
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
  useWebSocket("circle_reaction", (e) => {
    const p = e.payload as { session_id: number; emoji: string };
    if (p.session_id !== sessionId) return;
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions(prev => [...prev, { id, emoji: p.emoji }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2000);
  });

  // ── Recording lifecycle — wire mesh startRecording/stopRecording ─────────
  // Every participant receives this event; only the host does the actual
  // recording (they hear everyone in a full mesh), but all clients update
  // the UI indicator.
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
        const blob = meshRef.current?.stopRecording();
        if (blob && blob.size > 0) {
          uploadRecording(blob);
        }
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

  // ── Actions ──────────────────────────────────────────────────────────────
  const post = async (path: string, body?: object) => {
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
  };

  const toggleHand = () => post("/hand", { raised: !me?.hand_raised });
  const promote = (userId: number) => post("/promote", { user_id: userId });
  const demote = (userId: number) => post("/demote", { user_id: userId });
  const react = (emoji: string) => post("/react", { emoji });
  const endSession = async () => { await post("/end"); setLocation("/audio-circles"); };
  const leaveAndExit = () => { leaveRoom(); setLocation("/audio-circles"); };

  const toggleMic = () => {
    setMicOn(prev => {
      const next = !prev;
      meshRef.current?.setMicEnabled(next);
      return next;
    });
  };

  const toggleVideo = async () => {
    if (!meshRef.current || !session?.video_enabled) return;
    const next = !videoOn;
    setVideoOn(next);
    if (next && localStream && localStream.getVideoTracks().length === 0) {
      // First time enabling camera — need to re-publish with video
      try {
        const stream = await meshRef.current.publishLocalMedia({ video: true });
        setLocalStream(stream);
      } catch {
        toast({ title: "Couldn't access camera", description: "Check browser permissions.", variant: "destructive" });
        setVideoOn(false);
        return;
      }
    }
    meshRef.current.setVideoEnabled(next);
  };

  const toggleRecording = () => post("/recording", { is_recording: !session?.is_recording });

  if (loading || !session) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading circle…</div>;
  }

  // Remote streams that carry video tracks (rendered as <video>)
  const remoteVideoStreams = [...remoteStreams.entries()].filter(
    ([, s]) => s.getVideoTracks().length > 0
  );

  return (
    <div className="min-h-screen bg-background pb-32 relative overflow-hidden">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <div className="font-black text-sm truncate">{session.title}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> {participants.length} here
              {session.is_recording && <span className="text-red-400 flex items-center gap-0.5 ml-1"><CircleIcon className="w-2 h-2 fill-current" /> REC</span>}
              {uploading && <span className="text-amber-400 flex items-center gap-0.5 ml-1"><Upload className="w-2.5 h-2.5" /> Saving…</span>}
            </div>
          </div>
        </div>
        <button onClick={leaveAndExit} className="p-2 rounded-full hover:bg-muted"><ChevronDown className="w-5 h-5" /></button>
      </div>

      {/* Floating reactions */}
      <div className="pointer-events-none fixed inset-x-0 bottom-32 flex justify-center z-20">
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

      <div className="p-4 space-y-6">

        {/* ── Video grid (only shown when this session has video on) ───────── */}
        {session.video_enabled && (remoteVideoStreams.length > 0 || (localStream && localStream.getVideoTracks().length > 0 && videoOn)) && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Video</div>
            <div className="grid grid-cols-2 gap-2">
              {/* Local camera preview */}
              {localStream && localStream.getVideoTracks().length > 0 && videoOn && (
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                  <video
                    autoPlay
                    muted
                    playsInline
                    ref={(el) => {
                      if (el && el.srcObject !== localStream) {
                        el.srcObject = localStream;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                    You
                  </div>
                </div>
              )}
              {/* Remote video feeds */}
              {remoteVideoStreams.map(([userId, stream]) => {
                const p = participants.find(x => x.user_id === userId);
                return (
                  <div key={userId} className="relative aspect-video bg-black rounded-xl overflow-hidden">
                    <video
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el && el.srcObject !== stream) {
                          el.srcObject = stream;
                          el.play().catch(() => {});
                        }
                      }}
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

        {/* ── Speakers ─────────────────────────────────────────────────────── */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Speaking ({speakers.length}/13)</div>
          <div className="grid grid-cols-4 gap-3">
            {speakers.map(s => (
              <div key={s.user_id} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/40">
                    {s.avatar_url ? <img src={s.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-lg font-black">{s.name?.[0] ?? "?"}</span>}
                  </div>
                  {s.role === "host" && <Crown className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1" />}
                  {s.muted && <MicOff className="w-3 h-3 text-red-400 absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5" />}
                </div>
                <span className="text-[10px] font-bold truncate max-w-[64px]">{s.name}</span>
                {isHost && s.user_id !== myUserId && (
                  <button onClick={() => demote(s.user_id)} className="text-[9px] text-muted-foreground underline">move down</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {listeners.length > 0 && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Listening ({listeners.length})</div>
            <div className="grid grid-cols-5 gap-3">
              {listeners.map(l => (
                <div key={l.user_id} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {l.avatar_url ? <img src={l.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-sm font-black">{l.name?.[0] ?? "?"}</span>}
                    </div>
                    {l.hand_raised && <Hand className="w-3.5 h-3.5 text-amber-400 absolute -top-1 -right-1" />}
                  </div>
                  <span className="text-[9px] truncate max-w-[52px]">{l.name}</span>
                  {isHost && l.hand_raised && (
                    <button onClick={() => promote(l.user_id)} className="text-[9px] text-primary font-bold underline">bring up</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-4 space-y-3">
        <div className="flex items-center justify-center gap-2">
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => react(e)} className="text-xl px-1 hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          {!canSpeak && (
            <Button variant={me?.hand_raised ? "default" : "outline"} onClick={toggleHand} className="gap-2">
              <Hand className="w-4 h-4" /> {me?.hand_raised ? "Hand raised" : "Raise hand"}
            </Button>
          )}
          {canSpeak && (
            <Button variant={micOn ? "default" : "outline"} size="icon" onClick={toggleMic} title={micOn ? "Mute" : "Unmute"}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
          )}
          {canSpeak && session.video_enabled && (
            <Button variant={videoOn ? "default" : "outline"} size="icon" onClick={toggleVideo} title={videoOn ? "Turn off camera" : "Turn on camera"}>
              {videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
          )}
          {isHost && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleRecording}
              disabled={uploading}
              title={session.is_recording ? "Stop recording" : "Start recording"}
            >
              <CircleIcon className={`w-4 h-4 ${session.is_recording ? "text-red-500 fill-red-500" : ""}`} />
            </Button>
          )}
          <Button variant="destructive" size="icon" onClick={isHost ? endSession : leaveAndExit}>
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
