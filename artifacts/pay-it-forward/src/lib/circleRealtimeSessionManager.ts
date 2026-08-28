/**
 * Owns the lifetime of a Circle's LiveKit media session.
 *
 * REST and WebSocket continue to own membership, moderation, chat, and
 * presence. This manager owns only the media plane so a camera problem cannot
 * tear down an otherwise healthy microphone or room connection.
 */
import type {
  CircleMediaTransport,
  MediaConnectionState,
  MediaTransportCallbacks,
} from "./circleMediaTransport";
import { LiveKitCircleTransport } from "./livekitCircleTransport";
import { classifyMediaError } from "./circleMediaReadiness";

export type ContinuityState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "token_refresh"
  | "lost"
  | "ended";

export interface CircleRealtimeSessionOptions {
  baseUrl: string;
  sessionId: string | number;
  selfUserId: string | number;
  authHeaders: () => HeadersInit;
  videoEnabled: boolean;
  /** Token lifetime from the API in seconds. Defaults to four hours. */
  tokenTtlSeconds?: number;
  /** Maximum full reconnect attempts before the UI is marked lost. */
  maxReconnectAttempts?: number;
  /** Injectable for deterministic manager tests; production defaults to LiveKit. */
  createTransport?: () => CircleMediaTransport;
  /** Injectable for tests and alternate browser fetch implementations. */
  fetchImpl?: typeof fetch;
  /** Backoff controls. Production uses one second plus small jitter. */
  reconnectBaseDelayMs?: number;
  reconnectJitterMs?: number;
  /** Minimum delay before token refresh. Defaults to one minute. */
  tokenRefreshMinDelayMs?: number;
  onStateChange?: (state: ContinuityState) => void;
  onTransportChange?: (transport: CircleMediaTransport | null) => void;
  onRemoteStream?: MediaTransportCallbacks["onRemoteStream"];
  onRemoteStreamEnded?: MediaTransportCallbacks["onRemoteStreamEnded"];
  onLocalStream?: MediaTransportCallbacks["onLocalStream"];
  onMediaError?: (
    device: "microphone" | "camera",
    message: string,
    code: string,
  ) => void;
}

interface TokenPayload {
  media_url: string;
  media_token: string;
  expires_in?: number;
  can_publish?: boolean;
}

export class CircleRealtimeSessionManager {
  private readonly opts: CircleRealtimeSessionOptions;
  private transport: CircleMediaTransport | null = null;
  private state: ContinuityState = "idle";
  private lifecycle = 0;
  private reconnectAttempts = 0;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private startPromise: Promise<void> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private destroyed = false;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private micLive = false;
  private camLive = false;
  private micRequested = false;
  private camRequested = false;
  private tokenTtlSeconds: number;

  constructor(opts: CircleRealtimeSessionOptions) {
    this.opts = opts;
    this.tokenTtlSeconds = opts.tokenTtlSeconds ?? 4 * 60 * 60;
  }

  getState(): ContinuityState {
    return this.state;
  }

  getTransport(): CircleMediaTransport | null {
    return this.transport;
  }

  isMicrophoneLive(): boolean {
    return this.micLive;
  }

  isCameraLive(): boolean {
    return this.camLive;
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error("Session manager destroyed");
    if (this.transport && this.state === "live") return;
    if (this.startPromise) return this.startPromise;

    const startPromise = this.runStart();
    const trackedPromise = startPromise.finally(() => {
      if (this.startPromise === trackedPromise) this.startPromise = null;
    });
    this.startPromise = trackedPromise;
    return trackedPromise;
  }

  private async runStart(): Promise<void> {
    this.lifecycle += 1;
    const life = this.lifecycle;
    this.setState("connecting");
    this.bindEnvironmentListeners();
    try {
      await this.connectWithToken(life);
      if (life !== this.lifecycle || this.destroyed) return;
      this.reconnectAttempts = 0;
      this.setState("live");
      this.scheduleTokenRefresh();
      this.startHealthLoop();
    } catch (error) {
      if (life !== this.lifecycle || this.destroyed) return;
      this.setState("lost");
      throw error;
    }
  }

  /**
   * Publishes only the microphone. Camera acquisition is deliberately a
   * separate operation so a denied/busy camera never rejects microphone state.
   */
  async ensureMicrophone(): Promise<MediaStream> {
    const transport = this.transport;
    if (!transport) throw new Error("Circle media is not connected");
    this.micRequested = true;

    try {
      const stream = await transport.publishLocalMedia({ video: false });
      this.micLive = true;
      return stream;
    } catch (error) {
      const classified = classifyMediaError(error, "microphone");
      this.opts.onMediaError?.(
        "microphone",
        classified.message,
        classified.code,
      );
      this.micLive = false;
      throw error;
    }
  }

  /**
   * Adds a camera publication without changing microphone or room state.
   */
  async enableCamera(): Promise<MediaStream> {
    const transport = this.transport;
    if (!transport?.addVideoTrack)
      throw new Error("Camera is not supported on this transport");
    this.camRequested = true;

    try {
      const stream = await transport.addVideoTrack();
      this.camLive = true;
      return stream;
    } catch (error) {
      this.camLive = false;
      const classified = classifyMediaError(error, "camera");
      this.opts.onMediaError?.("camera", classified.message, classified.code);
      throw error;
    }
  }

  disableCamera(): void {
    this.camRequested = false;
    this.transport?.stopVideoTracks?.();
    this.camLive = false;
  }

  stopLocalMedia(): void {
    this.micRequested = false;
    this.camRequested = false;
    this.micLive = false;
    this.camLive = false;
    this.transport?.stopLocalMedia?.();
  }

  setMicEnabled(enabled: boolean): void {
    this.transport?.setMicEnabled(enabled);
  }

  setVideoEnabled(enabled: boolean): void {
    if (enabled) void this.enableCamera().catch(() => {});
    else this.disableCamera();
  }

  async switchAudioDevice(deviceId: string): Promise<MediaStream> {
    const transport = this.transport;
    if (!transport?.switchAudioDevice) {
      throw new Error("Microphone device switching is unavailable");
    }
    try {
      return await transport.switchAudioDevice(deviceId);
    } catch (error) {
      const classified = classifyMediaError(error, "microphone");
      this.opts.onMediaError?.(
        "microphone",
        classified.message,
        classified.code,
      );
      throw error;
    }
  }

  async switchVideoDevice(deviceId: string): Promise<MediaStream> {
    const transport = this.transport;
    if (!transport?.switchVideoDevice) {
      throw new Error("Camera device switching is unavailable");
    }
    try {
      return await transport.switchVideoDevice(deviceId);
    } catch (error) {
      const classified = classifyMediaError(error, "camera");
      this.opts.onMediaError?.("camera", classified.message, classified.code);
      throw error;
    }
  }

  startRecording(): void {
    if (!this.transport?.startRecording)
      throw new Error("Recording is unavailable on this media connection");
    this.transport.startRecording();
  }

  stopRecording(): Promise<Blob | null> {
    return this.transport?.stopRecording?.() ?? Promise.resolve(null);
  }

  /**
   * Rejoins the same Circle room without reloading the page.
   * Concurrent recovery signals share one promise to prevent reconnect storms.
   */
  recover(reason: string): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.recoveryPromise) return this.recoveryPromise;

    this.recoveryPromise = this.runRecovery(reason).finally(() => {
      this.recoveryPromise = null;
    });
    return this.recoveryPromise;
  }

  /** Manual retry after the automatic attempt budget has been exhausted. */
  retry(reason = "manual-retry"): Promise<void> {
    this.reconnectAttempts = 0;
    return this.recover(reason);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifecycle += 1;
    this.clearTimers();
    this.unbindEnvironmentListeners();
    this.teardownTransportOnly();
    this.state = "ended";
    this.opts.onStateChange?.("ended");
  }

  private async runRecovery(reason: string): Promise<void> {
    const max = this.opts.maxReconnectAttempts ?? 8;
    if (this.reconnectAttempts >= max) {
      this.setState("lost");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setState("reconnecting");
      return;
    }

    this.reconnectAttempts += 1;
    this.lifecycle += 1;
    const life = this.lifecycle;
    this.setState("reconnecting");

    const baseDelay = Math.max(0, this.opts.reconnectBaseDelayMs ?? 1000);
    const maxDelay = 15_000;
    const delay = Math.min(
      maxDelay,
      baseDelay * 2 ** Math.min(this.reconnectAttempts - 1, 4),
    );
    const jitterMax = Math.max(0, this.opts.reconnectJitterMs ?? 300);
    await sleep(
      delay + (jitterMax ? Math.floor(Math.random() * jitterMax) : 0),
    );
    if (life !== this.lifecycle || this.destroyed) return;

    try {
      this.teardownTransportOnly();
      await this.connectWithToken(life);
      if (this.micRequested) {
        try {
          await this.ensureMicrophone();
        } catch {
          // The error callback already classified the microphone failure.
        }
      }
      if (this.camRequested) {
        try {
          await this.enableCamera();
        } catch {
          // Camera recovery is best effort and must not affect microphone.
        }
      }
      if (life !== this.lifecycle || this.destroyed) return;
      this.reconnectAttempts = 0;
      this.setState("live");
      this.scheduleTokenRefresh();
      this.startHealthLoop();
    } catch {
      if (life !== this.lifecycle || this.destroyed) return;
      if (this.reconnectAttempts >= max) {
        this.setState("lost");
        return;
      }
      await this.runRecovery(`retry-after-failure:${reason}`);
    }
  }

  private setState(next: ContinuityState): void {
    if (this.destroyed) return;
    this.state = next;
    this.opts.onStateChange?.(next);
  }

  private fetchFn(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  private async connectWithToken(life: number): Promise<void> {
    const token = await this.fetchMediaToken();
    if (life !== this.lifecycle || this.destroyed) return;

    const transport =
      this.opts.createTransport?.() ?? new LiveKitCircleTransport();
    const callbacks: MediaTransportCallbacks = {
      onRemoteStream: this.opts.onRemoteStream,
      onRemoteStreamEnded: this.opts.onRemoteStreamEnded,
      onLocalStream: this.opts.onLocalStream,
      onConnectionStateChange: (state: MediaConnectionState) => {
        if (life !== this.lifecycle || this.destroyed) return;
        if (state === "reconnecting") this.setState("reconnecting");
        if (state === "connected") {
          this.reconnectAttempts = 0;
          this.setState("live");
        }
        if (state === "lost" || state === "ended") {
          void this.recover(`transport:${state}`);
        }
      },
    };

    try {
      await transport.join(
        {
          circleSessionId: this.opts.sessionId,
          selfUserId: this.opts.selfUserId,
          mediaUrl: token.media_url,
          mediaToken: token.media_token,
          videoEnabled: this.opts.videoEnabled,
        },
        callbacks,
      );
    } catch (error) {
      transport.destroy();
      throw error;
    }

    if (life !== this.lifecycle || this.destroyed) {
      transport.destroy();
      return;
    }
    this.transport = transport;
    this.opts.onTransportChange?.(transport);
  }

  private async fetchMediaToken(): Promise<TokenPayload> {
    const url = `${this.opts.baseUrl}/api/audio-circle-sessions/${this.opts.sessionId}/media-token`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchFn()(url, {
        method: "POST",
        headers: this.opts.authHeaders(),
      });
      if (response.ok) {
        const data = (await response.json()) as TokenPayload;
        if (!data.media_url || !data.media_token) {
          throw new Error("Incomplete media token response");
        }
        if (
          typeof data.expires_in === "number" &&
          Number.isFinite(data.expires_in) &&
          data.expires_in > 0
        ) {
          this.tokenTtlSeconds = data.expires_in;
        }
        return data;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 2) {
        const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
        const delay = retryAfter ?? Math.min(4_000, 500 * 2 ** attempt);
        await sleep(delay);
        continue;
      }

      const body = await response.json().catch(() => ({}));
      const retryAfter = response.headers.get("Retry-After");
      const suffix = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
      throw new Error(
        `${(body as { error?: string }).error ?? `Media token failed (${response.status})`}${suffix}`,
      );
    }
    throw new Error("Media token request exhausted retries");
  }

  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    const minimumDelay = Math.max(
      0,
      this.opts.tokenRefreshMinDelayMs ?? 60_000,
    );
    const refreshMs = Math.max(
      minimumDelay,
      Math.floor(this.tokenTtlSeconds * 0.8 * 1000),
    );
    this.tokenRefreshTimer = setTimeout(() => {
      void this.refreshTokenOnly();
    }, refreshMs);
  }

  private async refreshTokenOnly(): Promise<void> {
    if (this.destroyed) return;
    this.setState("token_refresh");
    await this.recover("token-near-expiry");
  }

  private startHealthLoop(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      if (this.destroyed || !this.transport) return;
      const state = this.transport.getConnectionState();
      if (state === "lost" || state === "ended")
        void this.recover(`health:${state}`);
    }, 10_000);
  }

  private teardownTransportOnly(): void {
    const oldTransport = this.transport;
    this.transport = null;
    if (oldTransport) {
      this.opts.onTransportChange?.(null);
      try {
        oldTransport.destroy();
      } catch {
        // Teardown must not prevent token or network recovery.
      }
    }
  }

  private clearTimers(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.tokenRefreshTimer = null;
    this.healthTimer = null;
  }

  private bindEnvironmentListeners(): void {
    if (typeof window === "undefined") return;

    this.onlineHandler = () => {
      if (this.state === "lost" || this.state === "reconnecting")
        void this.recover("window.online");
    };
    this.offlineHandler = () => {
      if (this.state === "live") this.setState("reconnecting");
    };
    this.visibilityHandler = () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState !== "visible"
      )
        return;
      const state = this.transport?.getConnectionState();
      if (
        !this.transport ||
        state === "lost" ||
        state === "ended" ||
        state === "reconnecting"
      ) {
        void this.recover("visibility-visible");
      }
    };

    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private unbindEnvironmentListeners(): void {
    if (typeof window === "undefined") return;
    if (this.onlineHandler)
      window.removeEventListener("online", this.onlineHandler);
    if (this.offlineHandler)
      window.removeEventListener("offline", this.offlineHandler);
    if (this.visibilityHandler)
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.onlineHandler = null;
    this.offlineHandler = null;
    this.visibilityHandler = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
