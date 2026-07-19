import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Hand, Video, VideoOff, Radio, Users, X, PhoneOff,
  Circle as CircleIcon, ChevronDown, Crown,
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
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());

  const meshRef = useRef<AudioCircleMesh | null>(null);
  const localAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());

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
    // useWebSocket below re-dispatches into this ref-held handler.
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
      .then(() => setMicOn(true))
      .catch(() => toast({ title: "Couldn't access your microphone", description: "Check your browser's permission settings.", variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak]);

  // ── Play remote audio ────────────────────────────────────────────────────
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      let el = audioElsRef.current.get(userId);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        audioElsRef.current.set(userId, el);
      }
      if (el.srcObject !== stream) el.srcObject = stream;
    }
  }, [remoteStreams]);

  // ── Leave on unmount / tab close ─────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    if (isNaN(sessionId)) return;
    const url = `${base}/api/audio-circle-sessions/${sessionId}/leave`;
    const token = getToken();
    // NOTE: sendBeacon cannot carry an Authorization header (the leave route
    // requires auth), and in browsers where sendBeacon succeeds it would
    // silently short-circuit the authenticated fetch below via `||` — so the
    // leave would appear to "work" client-side but never persist server-side.
    // A keepalive fetch survives page unload just like sendBeacon does, so
    // there's no reason to use the unauthenticated beacon path at all.
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
  useWebSocket("circle_recording_changed", (e) => {
    const p = e.payload as { session_id: number; is_recording: boolean };
    if (p.session_id !== sessionId) return;
    setSession(prev => prev ? { ...prev, is_recording: p.is_recording } : prev);
  });
  useWebSocket("circle_session_ended", (e) => {
    const p = e.payload as { session_id: number };
    if (p.session_id !== sessionId) return;
    toast({ title: "The host ended this circle" });
    setLocation("/audio-circles");
  });
  // Host disconnected (e.g. a page refresh) — the session stays live for a
  // grace period rather than ending immediately (see routes/audio-circles.ts).
  // Just a heads-up notification; nobody gets kicked out for this.
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

  const toggleVideo = () => {
    setVideoOn(prev => {
      const next = !prev;
      meshRef.current?.setVideoEnabled(next);
      return next;
    });
  };

  const toggleRecording = () => post("/recording", { is_recording: !session?.is_recording });

  if (loading || !session) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading circle…</div>;
  }

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
            <Button variant={micOn ? "default" : "outline"} size="icon" onClick={toggleMic}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </Button>
          )}
          {canSpeak && session.video_enabled && (
            <Button variant={videoOn ? "default" : "outline"} size="icon" onClick={toggleVideo}>
              {videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>
          )}
          {isHost && (
            <Button variant="outline" size="icon" onClick={toggleRecording} title="Toggle recording">
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
