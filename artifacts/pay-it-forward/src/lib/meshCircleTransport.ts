import type {
  CircleMediaTransport, JoinMediaSessionOptions, MediaConnectionState,
  MediaTransportCallbacks,
} from "./circleMediaTransport";

export interface MeshLike {
  publishLocalMedia(opts: { video: boolean }): Promise<MediaStream>;
  setMicEnabled(enabled: boolean): void;
  setVideoEnabled(enabled: boolean): void;
  addVideoTrack(): Promise<MediaStream>;
  stopVideoTracks(): void;
  connectToPeer(remoteUserId: number): void;
  disconnectFromPeer(remoteUserId: number): void;
  destroy(): void;
  getPeers?: () => Map<number, RTCPeerConnection>;
}

export type MeshFactory = (args: {
  sessionId: number;
  selfUserId: number;
  videoEnabled: boolean;
  iceServers?: RTCIceServer[];
  onRemoteStream: (handle: { userId: number; stream: MediaStream }) => void;
  onRemoteStreamEnded: (userId: number) => void;
  onConnectionStateChange?: (state: string) => void;
  subscribeToCircleSignal: (handler: (event: unknown) => void) => () => void;
}) => MeshLike;

/** Adapter that keeps the room UI independent of the mesh implementation. */
export class MeshCircleTransport implements CircleMediaTransport {
  readonly kind = "mesh" as const;
  private mesh: MeshLike | null = null;
  private localStream: MediaStream | null = null;
  private state: MediaConnectionState = "idle";
  private callbacks: MediaTransportCallbacks = {};

  constructor(private readonly createMesh: MeshFactory) {}

  async join(opts: JoinMediaSessionOptions, callbacks: MediaTransportCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.state = "connecting";
    callbacks.onConnectionStateChange?.(this.state);
    this.mesh = this.createMesh({
      sessionId: Number(opts.circleSessionId),
      selfUserId: Number(opts.selfUserId),
      videoEnabled: opts.videoEnabled,
      iceServers: opts.iceServers,
      onRemoteStream: ({ userId, stream }) => callbacks.onRemoteStream?.(userId, stream),
      onRemoteStreamEnded: (userId) => callbacks.onRemoteStreamEnded?.(userId),
      onConnectionStateChange: (state) => {
        this.state = state === "connected" || state === "connecting" ||
          state === "reconnecting" || state === "lost" ? state : "lost";
        callbacks.onConnectionStateChange?.(this.state);
      },
      subscribeToCircleSignal: (handler) => opts.subscribeToSignal?.(handler) ?? (() => {}),
    });
  }

  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    if (!this.mesh) throw new Error("Mesh transport not joined");
    this.localStream = await this.mesh.publishLocalMedia(opts);
    this.callbacks.onLocalStream?.(this.localStream);
    return this.localStream;
  }
  setMicEnabled(enabled: boolean): void { this.mesh?.setMicEnabled(enabled); }
  setVideoEnabled(enabled: boolean): void { this.mesh?.setVideoEnabled(enabled); }
  async addVideoTrack(): Promise<MediaStream> {
    if (!this.mesh) throw new Error("Mesh transport not joined");
    this.localStream = await this.mesh.addVideoTrack();
    this.callbacks.onLocalStream?.(this.localStream);
    return this.localStream;
  }
  stopVideoTracks(): void { this.mesh?.stopVideoTracks(); }
  connectToPeer(id: string | number): void { this.mesh?.connectToPeer(Number(id)); }
  disconnectFromPeer(id: string | number): void { this.mesh?.disconnectFromPeer(Number(id)); }
  getPeerConnections(): Map<string | number, RTCPeerConnection> {
    return this.mesh?.getPeers?.() ?? new Map();
  }
  getLocalStream(): MediaStream | null { return this.localStream; }
  getConnectionState(): MediaConnectionState { return this.state; }
  destroy(): void {
    this.mesh?.destroy();
    this.mesh = null;
    this.localStream = null;
    this.state = "ended";
    this.callbacks.onConnectionStateChange?.("ended");
  }
}