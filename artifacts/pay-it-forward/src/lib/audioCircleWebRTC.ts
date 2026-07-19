/**
 * Audio Circle WebRTC mesh manager — full-mesh peer-to-peer voice/video.
 *
 * Architecture: every speaker/host publishes their mic (and optionally camera).
 * Every other participant opens a receive-only connection to each publisher.
 * The server (ws-hub.ts circle_signal) only relays SDP and ICE — it never
 * touches audio/video payloads.
 *
 * Key fixes in this version:
 *   - Per-peer ICE candidate buffering: candidates that arrive before
 *     setRemoteDescription are queued and applied immediately after. This is
 *     the #1 real-world cause of WebRTC connection failures in mesh setups.
 *   - onLocalStream callback so the room UI can show a local camera preview.
 *   - addStreamToMixIfRecording() so new speakers who join mid-recording are
 *     automatically added to the mixed recording.
 *   - setRecording(enabled) unified method — calls startRecording/stopRecording
 *     and returns the recorded Blob when stopping.
 *   - Additional public STUN servers for better NAT traversal diversity.
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

// Free public STUN servers from Google and Cloudflare — diverse providers
// improve the chance of a working path through NAT.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export class AudioCircleMesh {
  private sessionId: number;
  private selfUserId: number;
  private localStream: MediaStream | null = null;
  private peers = new Map<number, RTCPeerConnection>();
  // Per-peer ICE candidate buffer: candidates that arrive before
  // setRemoteDescription is called are queued here and applied right after.
  private pendingIce = new Map<number, RTCIceCandidateInit[]>();
  private onRemoteStream: (handle: RemoteStreamHandle) => void;
  private onRemoteStreamEnded: (userId: number) => void;
  private onLocalStream: ((stream: MediaStream | null) => void) | null;
  private wsUnsubscribe: (() => void) | null = null;

  // Recording (mixed via Web Audio, see startRecording/stopRecording)
  private audioContext: AudioContext | null = null;
  private mixDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private videoExpected: boolean;

  constructor(opts: {
    sessionId: number;
    selfUserId: number;
    videoEnabled: boolean;
    onRemoteStream: (handle: RemoteStreamHandle) => void;
    onRemoteStreamEnded: (userId: number) => void;
    onLocalStream?: (stream: MediaStream | null) => void;
    subscribeToCircleSignal: (handler: (event: WsEvent) => void) => () => void;
  }) {
    this.sessionId = opts.sessionId;
    this.selfUserId = opts.selfUserId;
    this.videoExpected = opts.videoEnabled;
    this.onRemoteStream = opts.onRemoteStream;
    this.onRemoteStreamEnded = opts.onRemoteStreamEnded;
    this.onLocalStream = opts.onLocalStream ?? null;
    this.wsUnsubscribe = opts.subscribeToCircleSignal((event) => this.handleSignal(event));
  }

  /** Speakers/hosts call this to publish their mic (and optionally camera). */
  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: opts.video ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } : false,
    });
    this.localStream = stream;
    this.onLocalStream?.(stream);

    // Add local tracks to any peer connections that already exist (e.g. a
    // listener who's mid-connection when promoted to speaker). Prefer
    // upgrading an existing recvonly transceiver to sendrecv rather than
    // addTrack — avoids unnecessary renegotiation round-trips.
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

    // If we're already recording, add the local mic to the mix immediately.
    if (this.audioContext && this.mixDestination) this.addStreamToMix(stream);

    return stream;
  }

  stopLocalMedia(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.onLocalStream?.(null);
  }

  /** Mutes/unmutes the outgoing mic by disabling the track (cheaper than teardown). */
  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Enables/disables the outgoing camera track. */
  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  /**
   * Opens (or re-opens) a peer connection to another participant and starts
   * signaling. The lower user_id is always the offerer so both sides agree
   * on who initiates without extra coordination.
   */
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
          console.error("[CircleMesh] failed to create offer", err);
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
    this.pendingIce.delete(remoteUserId);
    this.onRemoteStreamEnded(remoteUserId);
  }

  /** Tears down every connection and local media — call on leaving the room. */
  destroy(): void {
    for (const userId of Array.from(this.peers.keys())) this.disconnectFromPeer(userId);
    this.stopLocalMedia();
    this.stopRecording();
    this.wsUnsubscribe?.();
    this.pendingIce.clear();
  }

  // ── Recording (client-side Web Audio mix) ──────────────────────────────────

  /**
   * Unified toggle — starts or stops recording and returns the Blob on stop.
   * Call this in response to the toggleRecording UI action.
   */
  setRecording(enabled: boolean): Blob | null {
    if (enabled) {
      this.startRecording();
      return null;
    }
    return this.stopRecording();
  }

  /** Starts mixing every currently-heard stream into one recording. */
  startRecording(): void {
    if (this.mediaRecorder) return; // already recording
    this.audioContext = new AudioContext();
    this.mixDestination = this.audioContext.createMediaStreamDestination();

    // Mix local mic (if we're a speaker)
    if (this.localStream) this.addStreamToMix(this.localStream);

    // Mix every remote audio track currently connected
    for (const pc of this.peers.values()) {
      pc.getReceivers().forEach(r => {
        if (r.track?.kind === "audio") {
          this.addStreamToMix(new MediaStream([r.track]));
        }
      });
    }

    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.mediaRecorder = new MediaRecorder(this.mixDestination.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(1000); // 1-second chunks for resilience
  }

  /** Stops recording and returns the mixed audio Blob. */
  stopRecording(): Blob | null {
    if (!this.mediaRecorder) return null;

    // Flush any buffered data before stopping
    if (this.mediaRecorder.state === "recording") this.mediaRecorder.requestData();
    this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.mixDestination = null;

    if (this.recordedChunks.length === 0) return null;
    const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
    this.recordedChunks = [];
    return blob;
  }

  /**
   * Adds a new remote stream to the active recording mix.
   * Called automatically when a new speaker arrives mid-recording so their
   * audio is captured without needing to stop and restart recording.
   */
  addStreamToMixIfRecording(stream: MediaStream): void {
    if (this.audioContext && this.mixDestination) {
      this.addStreamToMix(stream);
    }
  }

  private addStreamToMix(stream: MediaStream): void {
    if (!this.audioContext || !this.mixDestination) return;
    const audioStream = new MediaStream(stream.getAudioTracks());
    if (audioStream.getAudioTracks().length === 0) return;
    const source = this.audioContext.createMediaStreamSource(audioStream);
    source.connect(this.mixDestination);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private createPeerConnection(remoteUserId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    } else {
      // Listeners publish nothing, but need recvonly transceivers so an offer
      // they create (when they have the lower user_id) still has media sections
      // that a speaker can attach tracks to without a full renegotiation.
      pc.addTransceiver("audio", { direction: "recvonly" });
      if (this.videoExpected) pc.addTransceiver("video", { direction: "recvonly" });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal(remoteUserId, { kind: "ice", data: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      // e.streams[0] is the canonical stream for this peer — using it means
      // both audio and video tracks share the same MediaStream object, so a
      // single <video> element can display both.
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.onRemoteStream({ userId: remoteUserId, stream });

      // Automatically add new audio to recording mix if in progress
      if (e.track.kind === "audio") this.addStreamToMixIfRecording(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed") {
        console.warn(`[CircleMesh] peer ${remoteUserId} connection failed — disconnecting`);
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
        // Flush any ICE candidates that arrived before the remote description
        const queued = this.pendingIce.get(from_user_id) ?? [];
        for (const c of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(err =>
            console.warn("[CircleMesh] queued ICE candidate failed after offer", err));
        }
        this.pendingIce.delete(from_user_id);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from_user_id, { kind: "answer", data: answer });

      } else if (signal.kind === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
        // Flush queued ICE candidates
        const queued = this.pendingIce.get(from_user_id) ?? [];
        for (const c of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(err =>
            console.warn("[CircleMesh] queued ICE candidate failed after answer", err));
        }
        this.pendingIce.delete(from_user_id);

      } else if (signal.kind === "ice") {
        // ICE candidates sometimes arrive before the remote description is set.
        // Buffer them and apply once we have a remote description, otherwise
        // addIceCandidate throws InvalidStateError and the connection never forms.
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data as RTCIceCandidateInit));
        } else {
          const q = this.pendingIce.get(from_user_id) ?? [];
          q.push(signal.data as RTCIceCandidateInit);
          this.pendingIce.set(from_user_id, q);
        }
      }
    } catch (err) {
      console.error("[CircleMesh] signal handling failed:", signal.kind, err);
    }
  }
}
