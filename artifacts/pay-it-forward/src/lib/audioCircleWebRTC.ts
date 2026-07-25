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

interface CircleSignalPayload {
  session_id: number;
  from_user_id: number;
  signal: { kind: "offer" | "answer" | "ice"; data: unknown };
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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
  private connectedSourceUserIds = new Set<number>();
  private videoExpected: boolean;

  constructor(opts: {
    sessionId: number;
    selfUserId: number;
    videoEnabled: boolean;
    onRemoteStream: (handle: RemoteStreamHandle) => void;
    onRemoteStreamEnded: (userId: number) => void;
    subscribeToCircleSignal: (handler: (event: WsEvent) => void) => () => void;
  }) {
    this.sessionId = opts.sessionId;
    this.selfUserId = opts.selfUserId;
    this.videoExpected = opts.videoEnabled;
    this.onRemoteStream = opts.onRemoteStream;
    this.onRemoteStreamEnded = opts.onRemoteStreamEnded;
    this.wsUnsubscribe = opts.subscribeToCircleSignal((event) => this.handleSignal(event));
  }

  /** Speakers/hosts call this to publish their mic (and optionally camera). */
  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: opts.video ? { width: 320, height: 240 } : false,
    });
    this.localStream = stream;
    // Add tracks to any peer connections that already exist (e.g. a
    // listener who's mid-connection when they get promoted to speaker).
    // Prefer upgrading an existing recvonly transceiver in place (reusing
    // its already-negotiated m-line) over addTrack, which would try to
    // create a brand new m-line and require a full renegotiation dance.
    for (const pc of this.peers.values()) {
      for (const track of stream.getTracks()) {
        const transceiver = pc.getTransceivers().find(
          t => t.receiver.track?.kind === track.kind || (!t.sender.track && t.direction === "recvonly")
        );
        if (transceiver) {
          transceiver.direction = "sendrecv";
          transceiver.sender.replaceTrack(track).catch(() => pc.addTrack(track, stream));
        } else {
          pc.addTrack(track, stream);
        }
      }
    }
    return stream;
  }

  stopLocalMedia(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
  }

  /** Mutes/unmutes the outgoing mic by disabling the track (cheaper than tearing down and re-publishing). */
  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Enables/disables the outgoing camera track, if this room has video on. */
  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Opens (or re-opens) a peer connection to another participant and starts signaling. isInitiator decides who sends the offer — always the lower user id, so both sides agree without extra coordination. */
  connectToPeer(remoteUserId: number): void {
    if (this.peers.has(remoteUserId)) return;
    const pc = this.createPeerConnection(remoteUserId);
    this.peers.set(remoteUserId, pc);

    const isInitiator = this.selfUserId < remoteUserId;
    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.sendSignal(remoteUserId, { kind: "offer", data: offer });
        } catch (err) {
          console.error("audioCircleWebRTC: failed to create offer", err);
        }
      };
    }
  }

  disconnectFromPeer(remoteUserId: number): void {
    const pc = this.peers.get(remoteUserId);
    if (pc) {
      pc.close();
      this.peers.delete(remoteUserId);
    }
    this.connectedSourceUserIds.delete(remoteUserId);
    this.onRemoteStreamEnded(remoteUserId);
  }

  /** Tears down every connection and local media — call on leaving the room. */
  destroy(): void {
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
  }

  // ── Recording (client-side Web Audio mix) ─────────────────────────────────

  /** Starts mixing every currently-heard stream (local + remote) into one recording. Call again if new speakers join mid-recording — it picks up whatever is connected at call time and keeps mixing as streams change via addRemoteAudioToMix. */
  startRecording(): void {
    if (this.mediaRecorder) return; // already recording
    this.audioContext = new AudioContext();
    this.mixDestination = this.audioContext.createMediaStreamDestination();

    if (this.localStream) this.addStreamToMix(this.localStream);
    for (const pc of this.peers.values()) {
      pc.getReceivers().forEach(r => {
        if (r.track && r.track.kind === "audio") {
          const stream = new MediaStream([r.track]);
          this.addStreamToMix(stream);
        }
      });
    }

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.mixDestination.stream, { mimeType: "audio/webm" });
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
        if (this.recordedChunks.length === 0) { resolve(null); return; }
        const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
        this.recordedChunks = [];
        resolve(blob);
      };

      // Trigger final flush → ondataavailable → onstop
      mr.stop();
    });
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

  private addStreamToMix(stream: MediaStream): void {
    if (!this.audioContext || !this.mixDestination) return;
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.mixDestination);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private createPeerConnection(remoteUserId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal(remoteUserId, { kind: "ice", data: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      this.onRemoteStream({ userId: remoteUserId, stream: e.streams[0] ?? new MediaStream([e.track]) });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.disconnectFromPeer(remoteUserId);
      }
    };

    return pc;
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
    }

    try {
      if (signal.kind === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from_user_id, { kind: "answer", data: answer });
      } else if (signal.kind === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
      } else if (signal.kind === "ice") {
        await pc.addIceCandidate(new RTCIceCandidate(signal.data as RTCIceCandidateInit));
      }
    } catch (err) {
      console.error("audioCircleWebRTC: failed to handle signal", signal.kind, err);
    }
  }
}
