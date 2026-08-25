import type { CircleMediaTransport, JoinMediaSessionOptions, MediaConnectionState, MediaTransportCallbacks } from "./circleMediaTransport";

/**
 * Explicit SFU boundary. LiveKit is intentionally not enabled until the
 * backend mints room-scoped tokens and the client dependency is installed.
 */
export class LiveKitCircleTransport implements CircleMediaTransport {
  readonly kind = "livekit" as const;
  private state: MediaConnectionState = "idle";
  private callbacks: MediaTransportCallbacks = {};
  async join(opts: JoinMediaSessionOptions, callbacks: MediaTransportCallbacks): Promise<void> {
    this.callbacks = callbacks;
    if (!opts.mediaUrl || !opts.mediaToken) throw new Error("LiveKit requires a short-lived media URL and token.");
    this.state = "connecting"; callbacks.onConnectionStateChange?.(this.state);
    throw new Error("LiveKit transport is not configured. Keep mesh enabled until an SFU is provisioned.");
  }
  async publishLocalMedia(opts: { video: boolean }): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: opts.video });
    this.callbacks.onLocalStream?.(stream); return stream;
  }
  setMicEnabled(enabled: boolean): void { /* LiveKit implementation will control published tracks. */ void enabled; }
  setVideoEnabled(enabled: boolean): void { void enabled; }
  getConnectionState(): MediaConnectionState { return this.state; }
  destroy(): void { this.state = "ended"; this.callbacks.onConnectionStateChange?.("ended"); }
}