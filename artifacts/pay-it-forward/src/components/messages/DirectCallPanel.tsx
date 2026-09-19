import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneCall, PhoneOff } from "lucide-react";
import { Room, RoomEvent, Track, createLocalTracks, type LocalTrack, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from "livekit-client";
import { authHeaders } from "@/lib/auth";
import { wsSend, wsSubscribe, type WsEvent } from "@/lib/wsClient";

type CallMode = "voice" | "video";
type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "connected";

type Props = {
  conversationId: number;
  selfUserId: number;
  peerId: number;
  peerName: string;
  autoStartMode?: CallMode | null;
  onAutoStartConsumed?: () => void;
  onClose?: () => void;
};

function newCallId(): string {
  return crypto.randomUUID();
}

export function DirectCallPanel({
  conversationId,
  peerId,
  peerName,
  autoStartMode,
  onAutoStartConsumed,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [mode, setMode] = useState<CallMode>("voice");
  const [callId, setCallId] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const attachTrack = useCallback((track: RemoteTrack | LocalTrack, kind: "local" | "remote") => {
    const element = track.attach();
    element.autoplay = true;
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      if (kind === "local") element.muted = true;
      if (kind === "local") {
        localVideoRef.current?.replaceWith(element);
        localVideoRef.current = element;
      } else {
        remoteVideoRef.current?.replaceWith(element);
        remoteVideoRef.current = element;
      }
    } else if (kind === "remote" && element instanceof HTMLAudioElement) {
      remoteAudioRef.current?.replaceWith(element);
      remoteAudioRef.current = element;
    }
  }, []);

  const cleanupRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    localTracksRef.current.forEach((track) => track.stop());
    localTracksRef.current = [];
    if (room) {
      room.remoteParticipants.forEach((participant) => participant.trackPublications.forEach((publication) => publication.track?.detach()));
      await room.disconnect().catch(() => {});
    }
  }, []);

  const connect = useCallback(async (nextCallId: string, nextMode: CallMode, peer: number) => {
    setPhase("connecting");
    setError(null);
    const response = await fetch("/api/messages/direct/" + conversationId + "/call-token", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ callId: nextCallId, mode: nextMode }),
    });
    const data = await response.json().catch(() => ({})) as { media_url?: string; media_token?: string; error?: string };
    if (!response.ok || !data.media_url || !data.media_token) throw new Error(data.error || "Direct calling is not configured.");

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => attachTrack(track, "remote"));
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach());
    room.on(RoomEvent.Disconnected, () => {
      setPhase("idle");
      void cleanupRoom();
    });

    await room.connect(data.media_url, data.media_token, { autoSubscribe: true });
    const localTracks = await createLocalTracks({ audio: true, video: nextMode === "video" });
    localTracksRef.current = localTracks;
    for (const track of localTracks) {
      await room.localParticipant.publishTrack(track, {
        source: track.kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
      });
      if (track.kind === Track.Kind.Video) attachTrack(track, "local");
    }
    setCameraEnabled(nextMode === "video");
    setRemoteUserId(peer);
    setPhase("connected");
    await room.startAudio().catch(() => {});
  }, [attachTrack, cleanupRoom, conversationId]);

  const endCall = useCallback(() => {
    if (callId && remoteUserId) {
      wsSend({
        type: "direct_call_end",
        payload: { conversation_id: conversationId, to_user_id: remoteUserId, call_id: callId, mode },
      });
    }
    void cleanupRoom();
    setCallId(null);
    setRemoteUserId(null);
    setPhase("idle");
    setCameraEnabled(false);
    setMuted(false);
    onClose?.();
  }, [callId, cleanupRoom, conversationId, mode, onClose, remoteUserId]);

  useEffect(() => {
    const unsubscribe = wsSubscribe((event: WsEvent) => {
      if (event.type !== "direct_call_invite" && event.type !== "direct_call_accept" && event.type !== "direct_call_end") return;
      const payload = event.payload as { conversation_id?: number; from_user_id?: number; call_id?: string; mode?: CallMode } | null;
      if (!payload || payload.conversation_id !== conversationId || !payload.call_id || !payload.mode) return;

      if (event.type === "direct_call_invite") {
        setCallId(payload.call_id);
        setMode(payload.mode);
        setRemoteUserId(payload.from_user_id ?? null);
        setPhase("incoming");
      } else if (event.type === "direct_call_accept" && payload.call_id === callId) {
        const peer = payload.from_user_id ?? peerId;
        void connect(payload.call_id, payload.mode, peer).catch((connectError) => {
          setError(connectError instanceof Error ? connectError.message : "Could not connect the call.");
          void cleanupRoom();
          setPhase("idle");
        });
      } else if (event.type === "direct_call_end" && payload.call_id === callId) {
        void cleanupRoom();
        setCallId(null);
        setPhase("idle");
        onClose?.();
      }
    });
    return unsubscribe;
  }, [callId, cleanupRoom, connect, conversationId, onClose, peerId]);

  useEffect(() => {
    if (!autoStartMode || phase !== "idle") return;
    const nextCallId = newCallId();
    setMode(autoStartMode);
    setCallId(nextCallId);
    setRemoteUserId(peerId);
    setPhase("outgoing");
    setError(null);
    wsSend({
      type: "direct_call_invite",
      payload: { conversation_id: conversationId, to_user_id: peerId, call_id: nextCallId, mode: autoStartMode },
    });
    onAutoStartConsumed?.();
  }, [autoStartMode, conversationId, onAutoStartConsumed, peerId, phase]);

  const acceptIncoming = useCallback(() => {
    if (!callId || !remoteUserId) return;
    wsSend({
      type: "direct_call_accept",
      payload: { conversation_id: conversationId, to_user_id: remoteUserId, call_id: callId, mode },
    });
    void connect(callId, mode, remoteUserId).catch((connectError) => {
      setError(connectError instanceof Error ? connectError.message : "Could not connect the call.");
      void cleanupRoom();
      setPhase("idle");
    });
  }, [callId, cleanupRoom, connect, conversationId, mode, remoteUserId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={mode === "video" ? "Video call" : "Voice call"}>
      <section className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{mode === "video" ? "Video call" : "Voice call"}</p><h2 className="mt-1 text-sm font-black">{peerName}</h2></div>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/70">{phase}</span>
        </header>

        {phase === "incoming" ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center text-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary"><PhoneCall className="h-9 w-9" /></div>
            <p className="mt-4 text-xl font-black">{peerName} is calling</p>
            <p className="mt-1 text-xs text-white/60">{mode === "video" ? "Video call" : "Voice call"}</p>
            <div className="mt-6 flex gap-3"><button type="button" onClick={acceptIncoming} className="min-h-11 rounded-xl bg-emerald-500 px-5 text-sm font-black text-white">Accept</button><button type="button" onClick={endCall} className="min-h-11 rounded-xl bg-rose-500 px-5 text-sm font-black text-white">Decline</button></div>
          </div>
        ) : phase === "outgoing" || phase === "connecting" ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center text-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary animate-pulse"><Phone className="h-9 w-9" /></div>
            <p className="mt-4 text-xl font-black">{phase === "outgoing" ? "Calling " + peerName + "…" : "Connecting…"}</p>
            <button type="button" onClick={endCall} className="mt-6 flex min-h-11 items-center gap-2 rounded-xl bg-rose-500 px-5 text-sm font-black text-white"><PhoneOff className="h-4 w-4" /> End call</button>
          </div>
        ) : phase === "connected" ? (
          <div className="relative min-h-96 flex-1 bg-black p-3 text-white">
            {mode === "video" ? (
              <div className="relative h-[min(70vh,34rem)] overflow-hidden rounded-3xl bg-slate-900">
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-4 right-4 h-28 w-40 rounded-2xl border-2 border-white/20 bg-black object-cover shadow-xl" />
              </div>
            ) : (
              <div className="flex h-80 flex-col items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 text-primary"><Phone className="h-10 w-10" /></div>
                <p className="mt-4 text-lg font-black">{peerName}</p>
                <audio ref={remoteAudioRef} autoPlay />
              </div>
            )}
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={() => { const track = localTracksRef.current.find((item) => item.kind === Track.Kind.Audio); if (track) { track.mediaStreamTrack.enabled = !track.mediaStreamTrack.enabled; setMuted(!track.mediaStreamTrack.enabled); } }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
              {mode === "video" && <button type="button" onClick={() => { const track = localTracksRef.current.find((item) => item.kind === Track.Kind.Video); if (track) { track.mediaStreamTrack.enabled = !track.mediaStreamTrack.enabled; setCameraEnabled(track.mediaStreamTrack.enabled); } }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10">{cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}</button>}
              <button type="button" onClick={endCall} className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500"><PhoneOff className="h-4 w-4" /></button>
            </div>
            {error && <p role="alert" className="mt-2 text-center text-xs text-rose-300">{error}</p>}
          </div>
        ) : null}
      </section>
    </div>
  );
}
