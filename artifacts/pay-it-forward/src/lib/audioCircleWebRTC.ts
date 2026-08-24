/**
 * Audio Circle WebRTC mesh manager.
 *
 * Architecture: full mesh among everyone currently in the room (host +
 * speakers) publish their mic/camera; every OTHER participant (speaker or
 * listener) opens a receive connection to each publisher. The server (WS
 * hub, see circle_signal in ws-hub.ts) only relays signaling — offers,
 * answers, and ICE candidates — never audio/video itself.
 *
 * Scaling note: this is a genuine, working peer-to-peer mesh with no extra
 * infrastructure to stand up, which is why it's what ships here — but a
 * mesh's connection count grows as publishers × total participants, so it's
 * well suited to the "up to 13 speakers" cap this feature already enforces,
 * plus however many listeners a browser/network can comfortably sustain
 * (dozens, not thousands). If a circle regularly needs to serve very large
 * listener counts, swapping this module for a real SFU (e.g. a self-hosted
 * LiveKit server) is the intended upgrade path — the REST/WS lifecycle
 * (join/leave/roles/recording) in routes/audio-circles.ts does not need to
 * change to make that swap, since it never touches media itself either.
 *
 * Recording: mixed client-side via Web Audio API (every remote + local
 * audio track summed into one MediaStreamDestination) and captured with
 * MediaRecorder. This only captures what the CURRENT client can hear, which
 * in a mesh is everyone — so having the host record produces a real,
 * complete recording of the room.
 */
import { wsSend } from "./wsClient";
import type { WsEvent } from "./wsClient";

export interface RemoteStreamHandle {
  userId: number;
  stream: MediaStream;
}

export type AudioCircleConnectionState = "connecting" | "connected" | "reconnecting" | "lost";

interface CircleSignalPayload {
  session_id: number;
  from_user_id: number;
  signal: { kind: "offer" | "answer" | "ice"; data: unknown };
}

const STUN_ONLY_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Fetches this session's ICE servers (STUN + a short-lived TURN credential,
 * if a TURN server is configured) from the backend's /webrtc-ice-servers
 * endpoint — see api-server/src/routes/webrtc-ice.ts for how the TURN
 * credential is minted.
 *
 * Previously this read a permanent VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL
 * pair baked into the client bundle at build time, which — since this is a
 * Vite app — is visible to anyone who opens dev tools. Fetching a
 * short-lived, per-request credential instead means nothing long-lived ever
 * reaches the browser.
 *
 * Falls back to STUN-only (never throws) if the request fails, or if no
 * TURN server has been configured on the backend yet — the mesh still works
 * for most NAT types without TURN, just without a fallback for the
 * minority of symmetric-NAT peers. See getAudioCircleMediaCapabilities-
 * adjacent docs in audio-circles pages for the user-facing framing of that
 * tradeoff.
 */
export async function fetchIceServers(authHeadersFn: () => HeadersInit, base = ""): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${base}/api/webrtc-ice-servers`, { headers: authHeadersFn() });
    if (!res.ok) return STUN_ONLY_FALLBACK;
    const data = await res.json();
    const servers = data?.iceServers;
    return Array.isArray(servers) && servers.length > 0 ? servers : STUN_ONLY_FALLBACK;
  } catch {
    return STUN_ONLY_FALLBACK;
  }
}

function supportedRecordingMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder.isTypeSupported !== "function") return candidates[0];
  return candidates.find(type => MediaRecorder.isTypeSupported(type));
}

export interface AudioCircleMediaCapabilities {
  microphone: boolean;
  camera: boolean;
  recording: boolean;
}

/** Returns browser capability flags without prompting for permissions. */
export function getAudioCircleMediaCapabilities(): AudioCircleMediaCapabilities {
  const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const hasRecorder = typeof MediaRecorder !== "undefined";
  const hasAudioContext = typeof AudioContext !== "undefined";
  return {
    microphone: hasMediaDevices,
    camera: hasMediaDevices,
    recording: hasRecorder && hasAudioContext,
  };
}

export class AudioCircleMesh {
  private sessionId: number;
  private selfUserId: number;
  private localStream: MediaStream | null = null;
  private peers = new Map<number, RTCPeerConnection>();
  private onRemoteStream: (handle: RemoteStreamHandle) => void;
  private onRemoteStreamEnded: (userId: number) => void;
  private wsUnsubscribe: (() => void) | null = null;

  // Recording (mixed via Web Audio, see startRecording/stopRecording)
  private audioContext: AudioContext | null = null;
  private mixDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private connectedSourceIds = new Set<string>();
  private makingOffer = new Set<number>();
  private pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>();
  private mixSources = new Map<string, MediaStreamAudioSourceNode>();
  private videoExpected: boolean;
  private iceServers: RTCIceServer[];
  private onConnectionStateChange: (state: AudioCircleConnectionState) => void;
  private recoveryAttempts = new Map<number, number>();
  private recoveryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private peerStates = new Map<number, RTCPeerConnectionState>();
  private destroyed = false;

  constructor(opts: {
    sessionId: number;
    selfUserId: number;
    videoEnabled: boolean;
    /** Pass the result of fetchIceServers(); defaults to STUN-only if omitted. */
    iceServers?: RTCIceServer[];
    onRemoteStream: (handle: RemoteStreamHandle) => void;
    onRemoteStreamEnded: (userId: number) => void;
    onConnectionStateChange?: (state: AudioCircleConnectionState) => void;
    subscribeToCircleSignal: (handler: (event: WsEvent) => void) => () => void;
  }) {
    this.sessionId = opts.sessionId;
    this.selfUserId = opts.selfUserId;
    this.videoExpected = opts.videoEnabled;
    this.iceServers = opts.iceServers && opts.iceServers.length > 0 ? opts.iceServers : STUN_ONLY_FALLBACK;
    this.onRemoteStream = opts.onRemoteStream;
    this.onRemoteStreamEnded = opts.onRemoteStreamEnded;
    this.onConnectionStateChange = opts.onConnectionStateChange ?? (() => {});
    this.wsUnsubscribe = opts.subscribeToCircleSignal((event) => this.handleSignal(event));
  }

  /** Speakers/hosts call this to publish their mic (and optionally camera). */
  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: opts.video ? { width: 320, height: 240 } : false,
    });
    const previousStream = this.localStream;
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      track.onended = () => {
        if (this.localStream?.getTracks().includes(track)) {
          this.onConnectionStateChange("lost");
        }
      };
    }
    if (this.mediaRecorder) {
      this.addStreamToMix(stream, "local");
    }
    // Add tracks to any peer connections that already exist (e.g. a
    // listener who's mid-connection when they get promoted to speaker).
    // Prefer upgrading an existing recvonly transceiver in place (reusing
    // its already-negotiated m-line) over addTrack, which would try to
    // create a brand new m-line and require a full renegotiation dance.
    for (const pc of this.peers.values()) {
      for (const track of stream.getTracks()) {
        const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) {
          await sender.replaceTrack(track);
        } else {
          const transceiver = pc.getTransceivers().find(
            t => t.receiver.track?.kind === track.kind || (!t.sender.track && t.direction === "recvonly")
          );
          if (transceiver) {
            transceiver.direction = "sendrecv";
            await transceiver.sender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        }
      }
    }
    if (previousStream && previousStream !== stream) {
      previousStream.getTracks().forEach(track => track.stop());
    }
    return stream;
  }

  stopLocalMedia(): void {
    for (const pc of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track) sender.replaceTrack(null).catch(() => {});
      }
    }
    const stream = this.localStream;
    this.localStream = null;
    stream?.getTracks().forEach(t => t.stop());
  }

  /** Mutes/unmutes the outgoing mic by disabling the track (cheaper than tearing down and re-publishing). */
  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Enables/disables the outgoing camera track, if this room has video on. */
  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Acquires only a camera track and adds it to the existing local stream,
   *  avoiding re-acquiring the mic (which causes a brief audio dropout). */
  async addVideoTrack(): Promise<MediaStream> {
    if (!this.localStream) {
      // No existing stream — fall back to full publish.
      return this.publishLocalMedia({ video: true });
    }
    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: 320, height: 240 },
    });
    for (const track of videoStream.getTracks()) {
      this.localStream.addTrack(track);
      for (const pc of this.peers.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(track);
        } else {
          pc.addTrack(track, this.localStream);
        }
      }
    }
    return this.localStream;
  }

  /** Opens (or re-opens) a peer connection to another participant and starts signaling. */
  connectToPeer(remoteUserId: number): void {
    if (this.peers.has(remoteUserId)) return;
    this.onConnectionStateChange("connecting");
    const pc = this.createPeerConnection(remoteUserId);
    this.peers.set(remoteUserId, pc);
    this.peerStates.set(remoteUserId, pc.connectionState);
  }

  disconnectFromPeer(remoteUserId: number): void {
    const pc = this.peers.get(remoteUserId);
    if (pc) {
      pc.close();
      this.peers.delete(remoteUserId);
    }
    const timer = this.recoveryTimers.get(remoteUserId);
    if (timer) clearTimeout(timer);
    this.recoveryTimers.delete(remoteUserId);
    this.recoveryAttempts.delete(remoteUserId);
    this.peerStates.delete(remoteUserId);
    for (const sourceId of this.connectedSourceIds) {
      if (sourceId.startsWith(`remote:${remoteUserId}:`)) {
        this.connectedSourceIds.delete(sourceId);
        this.mixSources.get(sourceId)?.disconnect();
        this.mixSources.delete(sourceId);
      }
    }
    this.pendingIceCandidates.delete(remoteUserId);
    this.onRemoteStreamEnded(remoteUserId);
  }

  /** Tears down every connection and local media — call on leaving the room. */
  destroy(): void {
    this.destroyed = true;
    for (const timer of this.recoveryTimers.values()) clearTimeout(timer);
    this.recoveryTimers.clear();
    for (const userId of Array.from(this.peers.keys())) this.disconnectFromPeer(userId);
    this.stopLocalMedia();
    // stopRecording is async — fire and ignore on destroy (cleanup only, no upload)
    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
      this.mediaRecorder = null;
    }
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.wsUnsubscribe?.();
    this.pendingIceCandidates.clear();
    this.peerStates.clear();
    this.mixSources.clear();
  }

  // ── Recording (client-side Web Audio mix) ─────────────────────────────────

  /** Starts mixing every currently-heard stream (local + remote) into one recording. Call again if new speakers join mid-recording — it picks up whatever is connected at call time and keeps mixing as streams change via addRemoteAudioToMix. */
  startRecording(): void {
    if (this.mediaRecorder) return; // already recording
    this.audioContext = new AudioContext();
    this.mixDestination = this.audioContext.createMediaStreamDestination();

    if (this.localStream) this.addStreamToMix(this.localStream, "local");
    for (const pc of this.peers.values()) {
      pc.getReceivers().forEach(r => {
        if (r.track && r.track.kind === "audio") {
          const stream = new MediaStream([r.track]);
          this.addStreamToMix(stream, `remote:receiver:${r.track.id}`);
        }
      });
    }

    this.recordedChunks = [];
    const mimeType = supportedRecordingMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.mixDestination.stream, { mimeType })
      : new MediaRecorder(this.mixDestination.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(1000);
  }

  /** Stops recording and resolves with the complete audio Blob (webm) once all
   * MediaRecorder data has been flushed.  MediaRecorder.stop() is async — it
   * fires one final ondataavailable before onstop, so we MUST wait for onstop
   * rather than reading recordedChunks immediately after calling stop(). */
  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) { resolve(null); return; }
      const mr = this.mediaRecorder;
      this.mediaRecorder = null;

      mr.onstop = () => {
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.mixDestination = null;
        this.connectedSourceIds.clear();
        this.mixSources.clear();
        if (this.recordedChunks.length === 0) { resolve(null); return; }
        const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
        this.recordedChunks = [];
        resolve(blob);
      };

      // Trigger final flush → ondataavailable → onstop
      try {
        mr.stop();
      } catch {
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.mixDestination = null;
        this.connectedSourceIds.clear();
        this.mixSources.clear();
        this.recordedChunks = [];
        resolve(null);
      }
    });
  }

  // ── Device enumeration & hot-swap ─────────────────────────────────────────

  /**
   * Returns all available audio-input devices.
   * Requires getUserMedia permission to have been granted at least once;
   * before that, enumerateDevices returns blank labels.
   */
  static async enumerateAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter(d => d.kind === "audioinput")
        // Filter out virtual audio cables, loopback devices, and OS routing
        // artifacts that appear as real mics but produce no usable audio.
        // Windows exposes "Default" and "Communications" aliases of every real
        // device — deduplicate by keeping only the first occurrence of each
        // deviceId so the user sees each physical device exactly once.
        .filter(d => {
          if (!d.label) return true; // no label yet — permission not granted, keep it
          const l = d.label.toLowerCase();
          // Virtual cable / loopback keywords (VB-Audio, Voicemeeter, BlackHole, etc.)
          if (/virtual|cable|loopback|blackhole|voicemeeter|vb-audio|soundflower|stereomix|what u hear|wave link|obs|ndi/i.test(l)) return false;
          return true;
        })
        // Deduplicate: "Default - Microphone (USB)" and "Microphone (USB)" share
        // the same groupId so only keep the non-default/non-comms alias.
        .filter((d, _idx, arr) => {
          if (!d.label) return true;
          const isAlias = /^default\s*[-–]|^communications\s*[-–]/i.test(d.label);
          if (!isAlias) return true;
          // Only keep the alias when no canonical device with the same groupId exists
          return !arr.some(other => other !== d && other.groupId === d.groupId && !/^default\s*[-–]|^communications\s*[-–]/i.test(other.label));
        });
    } catch {
      return [];
    }
  }

  /**
   * Returns all available video-input (camera) devices.
   * Same permission requirement as enumerateAudioDevices.
   */
  static async enumerateVideoDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter(d => d.kind === "videoinput")
        // Filter out virtual cameras (OBS Virtual Camera, NDI HX Camera, etc.)
        .filter(d => {
          if (!d.label) return true;
          if (/virtual|obs|ndi|snap camera|manycam|xsplit|mmhmm/i.test(d.label)) return false;
          return true;
        });
    } catch {
      return [];
    }
  }

  /**
   * Hot-swaps the outgoing audio track to a different microphone device
   * without re-acquiring video or dropping existing peer connections.
   * Replaces the track in-place on each sender so no renegotiation is
   * needed. Returns the updated localStream.
   */
  async switchAudioDevice(deviceId: string): Promise<MediaStream> {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const newAudio = newStream.getAudioTracks()[0];
    if (!newAudio) {
      newStream.getTracks().forEach(t => t.stop());
      return this.localStream ?? new MediaStream();
    }

    // Replace on every sender so remote peers switch transparently
    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(newAudio);
    }

    // Swap track in the local stream
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        this.localStream!.removeTrack(t);
        t.stop();
      });
      this.localStream.addTrack(newAudio);
    } else {
      this.localStream = newStream;
    }

    // Re-wire recording mix if active
    if (this.mediaRecorder && this.audioContext && this.mixDestination) {
      const stream = new MediaStream([newAudio]);
      this.addStreamToMix(stream, "local");
    }

    return this.localStream!;
  }

  /**
   * Hot-swaps the outgoing video track to a different camera device.
   * Only works when video is already active; if not, use addVideoTrack.
   */
  async switchVideoDevice(deviceId: string): Promise<MediaStream> {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId }, width: 320, height: 240 },
    });
    const newVideo = newStream.getVideoTracks()[0];
    if (!newVideo) {
      newStream.getTracks().forEach(t => t.stop());
      return this.localStream ?? new MediaStream();
    }

    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newVideo);
    }

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => {
        this.localStream!.removeTrack(t);
        t.stop();
      });
      this.localStream.addTrack(newVideo);
    } else {
      this.localStream = newStream;
    }

    return this.localStream!;
  }

  /** Stops outgoing video tracks so the camera indicator light turns off.
   * Replaces the sender track with null on each peer connection so remote
   * participants stop receiving video without a full renegotiation. */
  stopVideoTracks(): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getVideoTracks()) {
      // Null out the peer sender first so remote peers receive nothing
      for (const pc of this.peers.values()) {
        const sender = pc.getSenders().find(s => s.track === track);
        if (sender) sender.replaceTrack(null).catch(() => {});
      }
      track.stop();
      this.localStream.removeTrack(track);
    }
  }

  private addStreamToMix(stream: MediaStream, sourceId: string): void {
    if (!this.audioContext || !this.mixDestination) return;
    const existing = this.mixSources.get(sourceId);
    if (existing) existing.disconnect();
    this.connectedSourceIds.add(sourceId);
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.mixDestination);
    this.mixSources.set(sourceId, source);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private createPeerConnection(remoteUserId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    } else {
      // Listeners publish nothing, but still need a reserved audio (and
      // video, if this room has it on) m-line to receive the speaker's
      // media on — without this, an offer created by a listener (whenever
      // they happen to have the lower user id, since that's who initiates)
      // would contain no media sections at all, and the far side couldn't
      // add tracks to a renegotiated answer without a second round trip.
      pc.addTransceiver("audio", { direction: "recvonly" });
      if (this.videoExpected) pc.addTransceiver("video", { direction: "recvonly" });
    }

    // Renegotiation is needed when a listener becomes a speaker or when a
    // speaker enables video. Both sides can initiate it; handleSignal applies
    // deterministic perfect-negotiation rules for offer collisions.
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.add(remoteUserId);
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        this.sendSignal(remoteUserId, { kind: "offer", data: pc.localDescription });
      } catch (err) {
        console.error("audioCircleWebRTC: failed to create offer", err);
      } finally {
        this.makingOffer.delete(remoteUserId);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal(remoteUserId, { kind: "ice", data: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      e.track.onended = () => {
        if (!this.destroyed) this.onRemoteStreamEnded(remoteUserId);
      };
      this.onRemoteStream({ userId: remoteUserId, stream });
      // Add tracks that arrive after REC was pressed, including newly promoted
      // speakers and renegotiated audio tracks.
      if (e.track.kind === "audio" && this.mediaRecorder) {
        this.addStreamToMix(new MediaStream([e.track]), `remote:${remoteUserId}:${e.track.id}`);
      }
    };

    pc.onconnectionstatechange = () => {
      this.peerStates.set(remoteUserId, pc.connectionState);
      if (pc.connectionState === "connected") {
        this.recoveryAttempts.delete(remoteUserId);
        const timer = this.recoveryTimers.get(remoteUserId);
        if (timer) clearTimeout(timer);
        this.recoveryTimers.delete(remoteUserId);
        this.emitAggregateConnectionState();
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.scheduleRecovery(remoteUserId, pc);
      } else if (pc.connectionState === "closed") {
        this.disconnectFromPeer(remoteUserId);
      }
    };

    return pc;
  }

  /**
   * Recover a transient ICE failure without making the user leave and rejoin.
   * Four bounded attempts keep a dead peer from creating an endless timer while
   * still covering the common Wi-Fi ↔ cellular/NAT transition.
   */
  private scheduleRecovery(remoteUserId: number, pc: RTCPeerConnection): void {
    if (this.destroyed || this.recoveryTimers.has(remoteUserId)) return;
    const attempt = (this.recoveryAttempts.get(remoteUserId) ?? 0) + 1;
    this.recoveryAttempts.set(remoteUserId, attempt);
    if (attempt > 4) {
      this.peerStates.set(remoteUserId, "failed");
      this.emitAggregateConnectionState();
      return;
    }
    this.peerStates.set(remoteUserId, "disconnected");
    this.onConnectionStateChange("reconnecting");
    const delay = 1000 * 2 ** (attempt - 1);
    const timer = setTimeout(() => {
      this.recoveryTimers.delete(remoteUserId);
      if (this.destroyed || this.peers.get(remoteUserId) !== pc) return;
      try {
        pc.restartIce();
      } catch {
        this.peerStates.set(remoteUserId, "failed");
        this.emitAggregateConnectionState();
      }
    }, delay);
    this.recoveryTimers.set(remoteUserId, timer);
  }

  private emitAggregateConnectionState(): void {
    const states = Array.from(this.peerStates.values());
    if (states.some(state => state === "failed" || state === "closed")) {
      this.onConnectionStateChange("lost");
    } else if (states.some(state => state === "disconnected")) {
      this.onConnectionStateChange("reconnecting");
    } else if (states.some(state => state === "connecting" || state === "new")) {
      this.onConnectionStateChange("connecting");
    } else if (states.length > 0 && states.every(state => state === "connected")) {
      this.onConnectionStateChange("connected");
    }
  }

  private sendSignal(toUserId: number, signal: { kind: "offer" | "answer" | "ice"; data: unknown }): void {
    wsSend({
      type: "circle_signal",
      payload: { session_id: this.sessionId, to_user_id: toUserId, signal },
    });
  }

  private async handleSignal(event: WsEvent): Promise<void> {
    if (event.type !== "circle_signal") return;
    const { from_user_id, signal, session_id } = event.payload as CircleSignalPayload;
    if (session_id !== this.sessionId) return;

    let pc = this.peers.get(from_user_id);
    if (!pc) {
      pc = this.createPeerConnection(from_user_id);
      this.peers.set(from_user_id, pc);
      this.peerStates.set(from_user_id, pc.connectionState);
    }

    try {
      if (signal.kind === "offer") {
        // Skip if the connection was already torn down
        if (pc.connectionState === "closed") return;
        const polite = this.selfUserId > from_user_id;
        const offerCollision = this.makingOffer.has(from_user_id) || pc.signalingState !== "stable";
        if (offerCollision && !polite) return;
        if (offerCollision) await pc.setLocalDescription({ type: "rollback" });
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from_user_id, { kind: "answer", data: pc.localDescription });
      } else if (signal.kind === "answer") {
        if (pc.connectionState === "closed") return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
      } else if (signal.kind === "ice") {
        // Guard: skip if the connection was already closed (e.g. peer left
        // while ICE was still trickling in — avoids InvalidStateError).
        if (pc.connectionState === "closed" || pc.signalingState === "closed") return;
        const candidate = signal.data as RTCIceCandidateInit;
        // ICE can arrive before the offer/answer has established a remote
        // description, especially on mobile networks. Queue it until the
        // description exists instead of dropping the candidate.
        if (!pc.remoteDescription) {
          const pending = this.pendingIceCandidates.get(from_user_id) ?? [];
          pending.push(candidate);
          this.pendingIceCandidates.set(from_user_id, pending);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }

      if (signal.kind === "offer" || signal.kind === "answer") {
        const pending = this.pendingIceCandidates.get(from_user_id);
        if (pending?.length) {
          this.pendingIceCandidates.delete(from_user_id);
          for (const candidate of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      }
    } catch (err) {
      console.error("audioCircleWebRTC: failed to handle signal", signal.kind, err);
    }
  }
}
