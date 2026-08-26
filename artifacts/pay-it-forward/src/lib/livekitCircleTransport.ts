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
          callbacks.onRemoteStreamEnded?.(participant.identity);
        } else if (stream) {
          callbacks.onRemoteStream?.(participant.identity, stream);
        }
      },
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.remoteStreams.delete(participant.identity);
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
    return this.emitLocalStream();
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

  stopVideoTracks(): void {
    if (!this.room || !this.camTrack) return;
    this.room.localParticipant.unpublishTrack(this.camTrack, true);
    this.camTrack.stop();
    this.camTrack = null;
    this.emitLocalStream();
  }

  setMicEnabled(enabled: boolean): void {
    this.room?.localParticipant.setMicrophoneEnabled(enabled).catch(() => {});
  }

  setVideoEnabled(enabled: boolean): void {
    if (enabled) this.addVideoTrack().catch(() => {});
    else this.camTrack?.mediaStreamTrack && (this.camTrack.mediaStreamTrack.enabled = false);
  }

  getLocalStream(): MediaStream | null {
    return this.micTrack || this.camTrack ? this.emitLocalStream() : null;
  }

  getConnectionState(): MediaConnectionState { return this.state; }

  destroy(): void {
    this.micTrack?.stop();
    this.camTrack?.stop();
    this.micTrack = null;
    this.camTrack = null;
    this.remoteStreams.clear();
    this.room?.disconnect();
    this.room = null;
    this.setState("ended");
  }
}