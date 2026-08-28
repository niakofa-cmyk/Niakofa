/**
 * Media-plane seam for Circles. The room lifecycle remains Niakofa REST/WS;
 * implementations can use the current browser mesh or a future SFU.
 */
export type MediaTransportKind = "mesh" | "livekit" | "agora" | "daily";
export type MediaConnectionState =
  | "idle" | "connecting" | "connected" | "reconnecting" | "lost" | "ended";

export interface MediaTransportCallbacks {
  onRemoteStream?: (userId: string | number, stream: MediaStream) => void;
  onRemoteStreamEnded?: (userId: string | number) => void;
  onConnectionStateChange?: (state: MediaConnectionState) => void;
  onLocalStream?: (stream: MediaStream | null) => void;
}

export interface JoinMediaSessionOptions {
  circleSessionId: string | number;
  selfUserId: string | number;
  mediaToken?: string;
  mediaUrl?: string;
  videoEnabled: boolean;
  iceServers?: RTCIceServer[];
  subscribeToSignal?: (handler: (event: unknown) => void) => () => void;
}

export interface CircleMediaTransport {
  readonly kind: MediaTransportKind;
  join(opts: JoinMediaSessionOptions, callbacks: MediaTransportCallbacks): Promise<void>;
  publishLocalMedia(opts: { video: boolean }): Promise<MediaStream>;
  stopLocalMedia?(): void;
  setMicEnabled(enabled: boolean): void;
  setVideoEnabled(enabled: boolean): void;
  addVideoTrack?(): Promise<MediaStream>;
  stopVideoTracks?(): void;
  switchAudioDevice?(deviceId: string): Promise<MediaStream>;
  switchVideoDevice?(deviceId: string): Promise<MediaStream>;
  startRecording?(): void;
  stopRecording?(): Promise<Blob | null>;
  /** Browser-local, credential-free diagnostics for the current media session. */
  getRtcDiagnostics?(): string | null;
  markRtcRendering?(kind: "audio" | "video"): void;
  connectToPeer?(remoteUserId: string | number): void;
  disconnectFromPeer?(remoteUserId: string | number): void;
  getPeerConnections?(): Map<string | number, RTCPeerConnection>;
  getLocalStream?(): MediaStream | null;
  getConnectionState(): MediaConnectionState;
  destroy(): void;
}

export function selectMediaTransportKind(input: {
  expectedSpeakers: number;
  expectedListeners: number;
  preferSfu?: boolean;
}): MediaTransportKind {
  void input;
  return "livekit";
}