import {
  ConnectionState,
  createLocalTracks,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type AudioCaptureOptions,
  type VideoCaptureOptions,
} from "livekit-client";
import type {
  CircleMediaTransport,
  JoinMediaSessionOptions,
  MediaConnectionState,
  MediaTransportCallbacks,
} from "./circleMediaTransport";

/**
 * LiveKit media-plane transport. Mic and camera are independent publications:
 * adding, removing, or losing the camera never tears down the microphone.
 */
export class LiveKitCircleTransport implements CircleMediaTransport {
  readonly kind = "livekit" as const;
  private room: Room | null = null;
  private callbacks: MediaTransportCallbacks = {};
  private state: MediaConnectionState = "idle";
  private micTrack: LocalTrack | null = null;
  private camTrack: LocalTrack | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private audioContext: AudioContext | null = null;
  private mixDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mixSources = new Map<string, MediaStreamAudioSourceNode>();

  private static recordingMimeType(): string | undefined {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function") return candidates[0];
    return candidates.find(type => MediaRecorder.isTypeSupported(type));
  }

  private setState(state: MediaConnectionState) {
    this.state = state;
    this.callbacks.onConnectionStateChange?.(state);
  }

  async join(opts: JoinMediaSessionOptions, callbacks: MediaTransportCallbacks): Promise<void> {
    this.callbacks = callbacks;
    if (!opts.mediaUrl || !opts.mediaToken) {
      throw new Error("LiveKit requires a short-lived media URL and token (call /media-token first).");
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true, dtx: true },
    });
    this.room = room;
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      this.setState(
        state === ConnectionState.Connected ? "connected" :
        state === ConnectionState.Connecting ? "connecting" :
        state === ConnectionState.Reconnecting ? "reconnecting" :
        state === ConnectionState.Disconnected ? "lost" : "connecting",
      );
    });
    room.on(RoomEvent.Reconnecting, () => this.setState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => this.setState("connected"));
    room.on(RoomEvent.Disconnected, () => this.setState("ended"));
    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        let stream = this.remoteStreams.get(participant.identity);
        if (!stream) {
          stream = new MediaStream();
          this.remoteStreams.set(participant.identity, stream);
        }
        stream.addTrack(track.mediaStreamTrack);
         this.addStreamToMix(stream, `remote:${participant.identity}`);
        callbacks.onRemoteStream?.(participant.identity, stream);
      },
    );
    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const stream = this.remoteStreams.get(participant.identity);
        stream?.removeTrack(track.mediaStreamTrack);
        if (stream && stream.getTracks().length === 0) {
          this.remoteStreams.delete(participant.identity);
           this.removeStreamFromMix(`remote:${participant.identity}`);
          callbacks.onRemoteStreamEnded?.(participant.identity);
        } else if (stream) {
           this.addStreamToMix(stream, `remote:${participant.identity}`);
          callbacks.onRemoteStream?.(participant.identity, stream);
        }
      },
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.remoteStreams.delete(participant.identity);
       this.removeStreamFromMix(`remote:${participant.identity}`);
      callbacks.onRemoteStreamEnded?.(participant.identity);
    });

    this.setState("connecting");
    await room.connect(opts.mediaUrl, opts.mediaToken, { autoSubscribe: true });
    this.setState("connected");
  }

  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const room = this.room;
    if (!room) throw new Error("LiveKit transport not joined");
    if (!this.micTrack) {
      const [mic] = await createLocalTracks({ audio: true, video: false });
      if (!mic) throw new Error("Microphone unavailable");
      this.micTrack = mic;
      await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone });
    }
    if (opts.video && !this.camTrack) await this.addVideoTrack();
    const stream = this.emitLocalStream();
    this.addStreamToMix(stream, "local");
    return stream;
  }

  async addVideoTrack(): Promise<MediaStream> {
    const room = this.room;
    if (!room) throw new Error("LiveKit transport not joined");
    if (!this.camTrack) {
      const [camera] = await createLocalTracks({ audio: false, video: true });
      if (!camera) throw new Error("Camera unavailable");
      this.camTrack = camera;
      await room.localParticipant.publishTrack(camera, { source: Track.Source.Camera });
    }
    return this.emitLocalStream();
  }

  private emitLocalStream(): MediaStream {
    const stream = new MediaStream(
      [this.micTrack, this.camTrack]
        .filter((track): track is LocalTrack => !!track)
        .map(track => track.mediaStreamTrack),
    );
    this.callbacks.onLocalStream?.(stream);
    return stream;
  }

  stopLocalMedia(): void {
    if (!this.room) return;
    if (this.micTrack) {
      this.room.localParticipant.unpublishTrack(this.micTrack, true);
      this.micTrack.stop();
      this.micTrack = null;
    }
    this.stopVideoTracks();
    this.removeStreamFromMix("local");
    this.callbacks.onLocalStream?.(null);
  }

  stopVideoTracks(): void {
    if (!this.room || !this.camTrack) return;
    this.room.localParticipant.unpublishTrack(this.camTrack, true);
    this.camTrack.stop();
    this.camTrack = null;
    this.removeStreamFromMix("local");
    this.emitLocalStream();
    if (this.micTrack) this.addStreamToMix(this.emitLocalStream(), "local");
  }

  setMicEnabled(enabled: boolean): void {
    this.room?.localParticipant.setMicrophoneEnabled(enabled).catch(() => {});
  }

  setVideoEnabled(enabled: boolean): void {
    if (enabled) {
      if (this.camTrack) {
        this.camTrack.mediaStreamTrack.enabled = true;
        this.emitLocalStream();
      } else {
        void this.addVideoTrack().catch(() => {});
      }
      return;
    }
    if (this.camTrack) {
      this.camTrack.mediaStreamTrack.enabled = false;
      this.emitLocalStream();
    }
  }

  async switchAudioDevice(deviceId: string): Promise<MediaStream> {
    const track = this.micTrack;
    if (!track || track.kind !== Track.Kind.Audio) {
      throw new Error("Microphone is not active");
    }
    const options: AudioCaptureOptions = {
      deviceId: { exact: deviceId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    await track.restartTrack(options);
    const stream = this.emitLocalStream();
    this.addStreamToMix(stream, "local");
    return stream;
  }

  async switchVideoDevice(deviceId: string): Promise<MediaStream> {
    const track = this.camTrack;
    if (!track || track.kind !== Track.Kind.Video) {
      throw new Error("Camera is not active");
    }
    const options: VideoCaptureOptions = {
      deviceId: { exact: deviceId },
      resolution: { width: 320, height: 240 },
    };
    await track.restartTrack(options);
    return this.emitLocalStream();
  }

  startRecording(): void {
    if (this.mediaRecorder) return;
    if (typeof AudioContext === "undefined" || typeof MediaRecorder === "undefined") {
      throw new Error("Recording is not supported in this browser");
    }
    this.audioContext = new AudioContext();
    this.mixDestination = this.audioContext.createMediaStreamDestination();
    this.recordedChunks = [];
    if (this.micTrack || this.camTrack) this.addStreamToMix(this.emitLocalStream(), "local");
    for (const [userId, stream] of this.remoteStreams) {
      this.addStreamToMix(stream, `remote:${userId}`);
    }
    const mimeType = LiveKitCircleTransport.recordingMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.mixDestination.stream, { mimeType })
      : new MediaRecorder(this.mixDestination.stream);
    this.mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) this.recordedChunks.push(event.data);
    };
    this.mediaRecorder.start(1000);
  }

  stopRecording(): Promise<Blob | null> {
    return new Promise(resolve => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        resolve(null);
        return;
      }
      this.mediaRecorder = null;
      recorder.onstop = () => {
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.mixDestination = null;
        this.mixSources.clear();
        const blob = this.recordedChunks.length > 0
          ? new Blob(this.recordedChunks, { type: recorder.mimeType || "audio/webm" })
          : null;
        this.recordedChunks = [];
        resolve(blob);
      };
      try {
        recorder.stop();
      } catch {
        this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.mixDestination = null;
        this.mixSources.clear();
        this.recordedChunks = [];
        resolve(null);
      }
    });
  }

  getLocalStream(): MediaStream | null {
    if (!this.micTrack && !this.camTrack) return null;
    return new MediaStream(
      [this.micTrack, this.camTrack]
        .filter((track): track is LocalTrack => !!track)
        .map(track => track.mediaStreamTrack),
    );
  }

  getConnectionState(): MediaConnectionState { return this.state; }

  destroy(): void {
    void this.stopRecording();
    this.stopLocalMedia();
    this.remoteStreams.clear();
    this.mixSources.clear();
    this.room?.disconnect();
    this.room = null;
    this.setState("ended");
  }

  private addStreamToMix(stream: MediaStream, sourceId: string): void {
    if (!this.audioContext || !this.mixDestination) return;
    this.removeStreamFromMix(sourceId);
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.mixDestination);
    this.mixSources.set(sourceId, source);
  }

  private removeStreamFromMix(sourceId: string): void {
    const source = this.mixSources.get(sourceId);
    if (!source) return;
    try { source.disconnect(); } catch { /* already disconnected */ }
    this.mixSources.delete(sourceId);
  }
}