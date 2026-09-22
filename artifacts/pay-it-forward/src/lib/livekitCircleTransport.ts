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
  type CreateLocalTracksOptions,
  type RoomOptions,
} from "livekit-client";
import type {
  CircleMediaTransport,
  JoinMediaSessionOptions,
  MediaConnectionState,
  MediaTransportCallbacks,
} from "./circleMediaTransport";
import {
  installCircleRtcHardening,
  type CircleRtcRuntime,
} from "./installCircleRtcHardening";

export interface LiveKitCircleTransportOptions {
  /**
   * Test seam for the SDK room. Production leaves this unset and uses the
   * browser LiveKit Room implementation.
   */
  createRoom?: (options: RoomOptions) => Room;
  /**
   * Test seam for browser capture. Production leaves this unset and uses
   * livekit-client's createLocalTracks implementation.
   */
  createLocalTracks?: (
    options?: CreateLocalTracksOptions,
  ) => Promise<LocalTrack[]>;
  /**
   * Test seam for MediaStream construction. This keeps transport integration
   * tests runnable in Node without pretending to connect to a real cluster.
   */
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
}

/**
 * LiveKit media-plane transport. Mic and camera are independent publications:
 * adding, removing, or losing the camera never tears down the microphone.
 */
export class LiveKitCircleTransport implements CircleMediaTransport {
  readonly kind = "livekit" as const;
  private room: Room | null = null;
  private callbacks: MediaTransportCallbacks = {};
  private state: MediaConnectionState = "idle";
  private lifecycleId = 0;
  private localMediaRequestId = 0;
  private cameraRequestId = 0;
  private mediaOperation: Promise<unknown> = Promise.resolve();
  private micTrack: LocalTrack | null = null;
  private camTrack: LocalTrack | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private audioContext: AudioContext | null = null;
  private mixDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingStopPromise: Promise<Blob | null> | null = null;
  private recordedChunks: Blob[] = [];
  private mixSources = new Map<string, MediaStreamAudioSourceNode>();
  private rtcRuntime: CircleRtcRuntime | null = null;
  private cameraRecoveryEnabled = true;
  private readonly createRoom: (options: RoomOptions) => Room;
  private readonly createLocalTracks: (
    options?: CreateLocalTracksOptions,
  ) => Promise<LocalTrack[]>;
  private readonly createMediaStream: (
    tracks: MediaStreamTrack[],
  ) => MediaStream;

  constructor(options: LiveKitCircleTransportOptions = {}) {
    this.createRoom =
      options.createRoom ?? ((roomOptions) => new Room(roomOptions));
    this.createLocalTracks =
      options.createLocalTracks ??
      ((trackOptions) => createLocalTracks(trackOptions));
    this.createMediaStream =
      options.createMediaStream ?? ((tracks) => new MediaStream(tracks));
  }

  private static recordingMimeType(): string | undefined {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function")
      return candidates[0];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  }

  private setState(state: MediaConnectionState) {
    this.state = state;
    this.callbacks.onConnectionStateChange?.(state);
  }

  private isCurrent(room: Room, lifecycleId: number): boolean {
    return this.room === room && this.lifecycleId === lifecycleId;
  }

  private runMediaOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mediaOperation.then(operation, operation);
    this.mediaOperation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private currentLocalStream(): MediaStream {
    return this.createMediaStream(
      [this.micTrack, this.camTrack]
        .filter((track): track is LocalTrack => !!track)
        .map((track) => track.mediaStreamTrack),
    );
  }

  async join(
    opts: JoinMediaSessionOptions,
    callbacks: MediaTransportCallbacks,
  ): Promise<void> {
    if (this.room) throw new Error("LiveKit transport is already joined");
    this.callbacks = callbacks;
    if (!opts.mediaUrl || !opts.mediaToken) {
      throw new Error(
        "LiveKit requires a short-lived media URL and token (call /media-token first).",
      );
    }

    const lifecycleId = ++this.lifecycleId;
    const room = this.createRoom({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { simulcast: true, dtx: true },
    });
    this.room = room;
    this.cameraRecoveryEnabled = true;
    const rtcRuntime = installCircleRtcHardening(room, {
      shouldRecoverCamera: () => this.cameraRecoveryEnabled,
    });
    this.rtcRuntime = rtcRuntime;
    rtcRuntime.telemetry.markTokenReceived();
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (!this.isCurrent(room, lifecycleId)) return;
      this.setState(
        state === ConnectionState.Connected
          ? "connected"
          : state === ConnectionState.Connecting
            ? "connecting"
            : state === ConnectionState.Reconnecting
              ? "reconnecting"
              : state === ConnectionState.Disconnected
                ? "lost"
                : "connecting",
      );
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (this.isCurrent(room, lifecycleId)) this.setState("reconnecting");
    });
    room.on(RoomEvent.Reconnected, () => {
      if (this.isCurrent(room, lifecycleId)) this.setState("connected");
    });
    room.on(RoomEvent.Disconnected, () => {
      if (this.isCurrent(room, lifecycleId)) this.setState("ended");
    });
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (!this.isCurrent(room, lifecycleId)) return;
        let stream = this.remoteStreams.get(participant.identity);
        if (!stream) {
          stream = this.createMediaStream([]);
          this.remoteStreams.set(participant.identity, stream);
        }
        stream.addTrack(track.mediaStreamTrack);
        this.addStreamToMix(stream, `remote:${participant.identity}`);
        callbacks.onRemoteStream?.(participant.identity, stream);
      },
    );
    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (!this.isCurrent(room, lifecycleId)) return;
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
    room.on(
      RoomEvent.ParticipantDisconnected,
      (participant: RemoteParticipant) => {
        if (!this.isCurrent(room, lifecycleId)) return;
        this.remoteStreams.delete(participant.identity);
        this.removeStreamFromMix(`remote:${participant.identity}`);
        callbacks.onRemoteStreamEnded?.(participant.identity);
      },
    );

    this.setState("connecting");
    try {
      await room.connect(opts.mediaUrl, opts.mediaToken, { autoSubscribe: true });
    } catch (error) {
      rtcRuntime.telemetry.setError(error, "room-connect-failed");
      rtcRuntime.detach();
      this.rtcRuntime = null;
      this.room = null;
      room.disconnect();
      throw error;
    }
    if (!this.isCurrent(room, lifecycleId)) {
      room.disconnect();
      throw new Error("LiveKit media session ended while connecting");
    }
    this.setState("connected");
  }

  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const requestId = this.localMediaRequestId;
    return this.runMediaOperation(async () => {
      const room = this.room;
      const lifecycleId = this.lifecycleId;
      if (!room) throw new Error("LiveKit transport not joined");
      if (!this.micTrack) {
        let mic: LocalTrack | undefined;
        try {
          [mic] = await this.createLocalTracks({
            audio: true,
            video: false,
          });
        } catch (error) {
          this.rtcRuntime?.telemetry.setError(error, "audio-capture-failed");
          throw error;
        }
        if (!mic) throw new Error("Microphone unavailable");
        this.rtcRuntime?.telemetry.markCaptureStarted("audio");
        if (
          !this.isCurrent(room, lifecycleId) ||
          requestId !== this.localMediaRequestId
        ) {
          mic.stop();
          throw new Error(
            "LiveKit media session ended while acquiring the microphone",
          );
        }
        try {
          await room.localParticipant.publishTrack(mic, {
            source: Track.Source.Microphone,
          });
        } catch (error) {
          this.rtcRuntime?.telemetry.setError(error, "audio-publish-failed");
          mic.stop();
          throw error;
        }
        if (
          !this.isCurrent(room, lifecycleId) ||
          requestId !== this.localMediaRequestId
        ) {
          await this.unpublishAndStop(room, mic);
          throw new Error(
            "LiveKit media session ended while publishing the microphone",
          );
        }
        this.micTrack = mic;
      }
      if (opts.video && !this.camTrack) {
        const cameraRequestId = ++this.cameraRequestId;
        await this.addVideoTrackInternal(
          room,
          lifecycleId,
          requestId,
          cameraRequestId,
        );
      }
      if (
        !this.isCurrent(room, lifecycleId) ||
        requestId !== this.localMediaRequestId
      ) {
        throw new Error(
          "LiveKit media session ended while publishing local media",
        );
      }
      const stream = this.emitLocalStream();
      this.addStreamToMix(stream, "local");
      return stream;
    });
  }

  async addVideoTrack(): Promise<MediaStream> {
    const requestId = this.localMediaRequestId;
    const cameraRequestId = ++this.cameraRequestId;
    this.cameraRecoveryEnabled = true;
    return this.runMediaOperation(async () => {
      const room = this.room;
      const lifecycleId = this.lifecycleId;
      if (!room) throw new Error("LiveKit transport not joined");
      return this.addVideoTrackInternal(
        room,
        lifecycleId,
        requestId,
        cameraRequestId,
      );
    });
  }

  private async addVideoTrackInternal(
    room: Room,
    lifecycleId: number,
    requestId: number,
    cameraRequestId: number,
  ): Promise<MediaStream> {
    if (this.camTrack) return this.emitLocalStream();
    let camera: LocalTrack | undefined;
    try {
      [camera] = await this.createLocalTracks({
        audio: false,
        video: true,
      });
    } catch (error) {
      this.rtcRuntime?.telemetry.setError(error, "video-capture-failed");
      throw error;
    }
    if (!camera) throw new Error("Camera unavailable");
    this.rtcRuntime?.telemetry.markCaptureStarted("video");
    if (
      !this.isCurrent(room, lifecycleId) ||
      requestId !== this.localMediaRequestId ||
      cameraRequestId !== this.cameraRequestId
    ) {
      camera.stop();
      throw new Error("LiveKit media session ended while acquiring the camera");
    }
    try {
      await room.localParticipant.publishTrack(camera, {
        source: Track.Source.Camera,
      });
    } catch (error) {
      this.rtcRuntime?.telemetry.setError(error, "video-publish-failed");
      camera.stop();
      throw error;
    }
    if (
      !this.isCurrent(room, lifecycleId) ||
      requestId !== this.localMediaRequestId ||
      cameraRequestId !== this.cameraRequestId
    ) {
      await this.unpublishAndStop(room, camera);
      throw new Error(
        "LiveKit media session ended while publishing the camera",
      );
    }
    this.camTrack = camera;
    return this.emitLocalStream();
  }

  private emitLocalStream(): MediaStream {
    const stream = this.createMediaStream(
      [this.micTrack, this.camTrack]
        .filter((track): track is LocalTrack => !!track)
        .map((track) => track.mediaStreamTrack),
    );
    this.callbacks.onLocalStream?.(stream);
    return stream;
  }

  stopLocalMedia(): void {
    this.localMediaRequestId += 1;
    this.cameraRequestId += 1;
    this.cameraRecoveryEnabled = false;
    const room = this.room;
    const micTrack = this.micTrack;
    this.micTrack = null;
    if (room && micTrack) void this.unpublishAndStop(room, micTrack);
    this.stopVideoTracks();
    this.removeStreamFromMix("local");
    this.callbacks.onLocalStream?.(null);
  }

  stopVideoTracks(): void {
    this.cameraRequestId += 1;
    this.cameraRecoveryEnabled = false;
    const room = this.room;
    const camTrack = this.camTrack;
    this.camTrack = null;
    if (!room || !camTrack) return;
    void this.unpublishAndStop(room, camTrack);
    this.removeStreamFromMix("local");
    this.emitLocalStream();
    if (this.micTrack) this.addStreamToMix(this.emitLocalStream(), "local");
  }

  setMicEnabled(enabled: boolean): void {
    this.room?.localParticipant.setMicrophoneEnabled(enabled).catch(() => {});
  }

  setVideoEnabled(enabled: boolean): void {
    this.cameraRecoveryEnabled = enabled;
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
    const requestId = this.localMediaRequestId;
    return this.runMediaOperation(async () => {
      const room = this.room;
      const lifecycleId = this.lifecycleId;
      const track = this.micTrack;
      if (!room || !track || track.kind !== Track.Kind.Audio) {
        throw new Error("Microphone is not active");
      }
      const options: AudioCaptureOptions = {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      try {
        await track.restartTrack(options);
      } catch (error) {
        if (
          !this.isCurrent(room, lifecycleId) ||
          requestId !== this.localMediaRequestId
        ) {
          track.stop();
          throw new Error(
            "LiveKit media session ended while switching the microphone",
          );
        }
        throw error;
      }
      if (
        !this.isCurrent(room, lifecycleId) ||
        requestId !== this.localMediaRequestId ||
        track !== this.micTrack
      ) {
        track.stop();
        throw new Error(
          "LiveKit media session ended while switching the microphone",
        );
      }
      const stream = this.emitLocalStream();
      this.addStreamToMix(stream, "local");
      return stream;
    });
  }

  async switchVideoDevice(deviceId: string): Promise<MediaStream> {
    const requestId = this.localMediaRequestId;
    const cameraRequestId = this.cameraRequestId;
    return this.runMediaOperation(async () => {
      const room = this.room;
      const lifecycleId = this.lifecycleId;
      const track = this.camTrack;
      if (!room || !track || track.kind !== Track.Kind.Video) {
        throw new Error("Camera is not active");
      }
      const options: VideoCaptureOptions = {
        deviceId: { exact: deviceId },
        resolution: { width: 320, height: 240 },
      };
      try {
        await track.restartTrack(options);
      } catch (error) {
        if (
          !this.isCurrent(room, lifecycleId) ||
          requestId !== this.localMediaRequestId ||
          cameraRequestId !== this.cameraRequestId
        ) {
          track.stop();
          throw new Error(
            "LiveKit media session ended while switching the camera",
          );
        }
        throw error;
      }
      if (
        !this.isCurrent(room, lifecycleId) ||
        requestId !== this.localMediaRequestId ||
        cameraRequestId !== this.cameraRequestId ||
        track !== this.camTrack
      ) {
        track.stop();
        throw new Error(
          "LiveKit media session ended while switching the camera",
        );
      }
      return this.emitLocalStream();
    });
  }

  startRecording(): void {
    if (this.mediaRecorder || this.recordingStopPromise) return;
    if (
      typeof AudioContext === "undefined" ||
      typeof MediaRecorder === "undefined"
    ) {
      throw new Error("Recording is not supported in this browser");
    }
    const audioContext = new AudioContext();
    try {
      this.audioContext = audioContext;
      this.mixDestination = audioContext.createMediaStreamDestination();
      this.recordedChunks = [];
      if (this.micTrack || this.camTrack)
        this.addStreamToMix(this.emitLocalStream(), "local");
      for (const [userId, stream] of this.remoteStreams) {
        this.addStreamToMix(stream, `remote:${userId}`);
      }
      const mimeType = LiveKitCircleTransport.recordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(this.mixDestination.stream, { mimeType })
        : new MediaRecorder(this.mixDestination.stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.recordedChunks.push(event.data);
      };
      recorder.start(1000);
      this.mediaRecorder = recorder;
    } catch (error) {
      audioContext.close().catch(() => {});
      this.audioContext = null;
      this.mixDestination = null;
      this.mixSources.clear();
      this.recordedChunks = [];
      throw error;
    }
  }

  stopRecording(): Promise<Blob | null> {
    if (this.recordingStopPromise) return this.recordingStopPromise;
    const recorder = this.mediaRecorder;
    if (!recorder) return Promise.resolve(null);

    this.mediaRecorder = null;
    let settled = false;
    let resolveStop!: (blob: Blob | null) => void;
    const stopPromise = new Promise<Blob | null>((resolve) => {
      resolveStop = resolve;
    });
    this.recordingStopPromise = stopPromise;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      this.audioContext?.close().catch(() => {});
      this.audioContext = null;
      this.mixDestination = null;
      this.mixSources.clear();
      this.recordedChunks = [];
      this.recordingStopPromise = null;
      resolveStop(blob);
    };
    recorder.onstop = () => {
      const blob =
        this.recordedChunks.length > 0
          ? new Blob(this.recordedChunks, {
              type: recorder.mimeType || "audio/webm",
            })
          : null;
      finish(blob);
    };
    recorder.onerror = () => finish(null);
    try {
      if (recorder.state === "inactive") {
        const blob =
          this.recordedChunks.length > 0
            ? new Blob(this.recordedChunks, {
                type: recorder.mimeType || "audio/webm",
              })
            : null;
        finish(blob);
      } else {
        recorder.stop();
      }
    } catch {
      finish(null);
    }
    return stopPromise;
  }

  getLocalStream(): MediaStream | null {
    if (!this.micTrack && !this.camTrack) return null;
    return this.currentLocalStream();
  }

  getConnectionState(): MediaConnectionState {
    return this.state;
  }

  getRtcDiagnostics(): string | null {
    return this.rtcRuntime?.telemetry.exportJson() ?? null;
  }

  markRtcRendering(kind: "audio" | "video"): void {
    this.rtcRuntime?.telemetry.markRendering(kind);
  }

  destroy(): void {
    this.lifecycleId += 1;
    this.localMediaRequestId += 1;
    this.cameraRequestId += 1;
    void this.stopRecording();
    this.stopLocalMedia();
    this.remoteStreams.clear();
    this.mixSources.clear();
    this.rtcRuntime?.detach();
    this.rtcRuntime = null;
    this.room?.disconnect();
    this.room = null;
    this.setState("ended");
  }

  private async unpublishAndStop(room: Room, track: LocalTrack): Promise<void> {
    try {
      await room.localParticipant.unpublishTrack(track, true);
    } catch {
      // The room may already be disconnected during teardown.
    } finally {
      track.stop();
    }
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
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    this.mixSources.delete(sourceId);
  }
}
