export type CircleRtcHealthState = "healthy" | "degraded" | "offline" | "lost";

export interface CircleRtcHealthSnapshot {
  state: CircleRtcHealthState;
  lastConnectionState: string;
  consecutiveFailures: number;
  recoveryAttempts: number;
  lastTransitionAt: number;
  reason?: string;
}

export interface CircleRtcHealthMonitorOptions {
  /** Number of consecutive unhealthy samples before recovery is requested. */
  failureThreshold?: number;
  /** Minimum time between recovery requests. */
  recoveryCooldownMs?: number;
  /** Health sampling interval. */
  intervalMs?: number;
  isOnline?: () => boolean;
  now?: () => number;
  onSnapshot?: (snapshot: CircleRtcHealthSnapshot) => void;
  onRecover?: (reason: string) => Promise<void> | void;
}

/**
 * Lightweight browser-side watchdog for a LiveKit Circle session.
 *
 * This does not refresh the page and does not create a second LiveKit room.
 * It only turns transport state + browser network state into one recovery
 * policy, with a cooldown to prevent 4–5 second reconnect storms.
 */
export class CircleRtcHealthMonitor {
  private readonly opts: Required<Omit<CircleRtcHealthMonitorOptions, "onSnapshot" | "onRecover" | "isOnline" | "now">> &
    Pick<CircleRtcHealthMonitorOptions, "onSnapshot" | "onRecover" | "isOnline" | "now">;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: CircleRtcHealthState = "healthy";
  private lastConnectionState = "connected";
  private consecutiveFailures = 0;
  private recoveryAttempts = 0;
  private lastTransitionAt = Date.now();
  private lastRecoveryAt = 0;
  private stopped = true;

  constructor(options: CircleRtcHealthMonitorOptions = {}) {
    this.opts = {
      failureThreshold: options.failureThreshold ?? 3,
      recoveryCooldownMs: options.recoveryCooldownMs ?? 8_000,
      intervalMs: options.intervalMs ?? 2_000,
      isOnline: options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine),
      now: options.now ?? Date.now,
      onSnapshot: options.onSnapshot,
      onRecover: options.onRecover,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.emit();
    this.timer = setInterval(() => this.sample(), this.opts.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getSnapshot(): CircleRtcHealthSnapshot {
    return {
      state: this.state,
      lastConnectionState: this.lastConnectionState,
      consecutiveFailures: this.consecutiveFailures,
      recoveryAttempts: this.recoveryAttempts,
      lastTransitionAt: this.lastTransitionAt,
    };
  }

  reportConnectionState(connectionState: string): void {
    this.lastConnectionState = connectionState;
    const normalized = connectionState.toLowerCase();
    if (normalized === "connected") {
      this.consecutiveFailures = 0;
      this.setState("healthy");
      return;
    }
    if (normalized === "reconnecting" || normalized === "signalreconnecting" || normalized === "connecting") {
      this.setState("degraded");
      return;
    }
    if (normalized === "disconnected") {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.opts.failureThreshold) {
        this.setState(this.opts.isOnline() ? "lost" : "offline");
      } else {
        this.setState("degraded");
      }
    }
  }

  reportReason(reason: string): void {
    this.emit(reason);
  }

  private sample(): void {
    if (this.stopped) return;
    if (!this.opts.isOnline()) {
      this.setState("offline");
      return;
    }
    const normalized = this.lastConnectionState.toLowerCase();
    if (normalized === "connected") {
      this.consecutiveFailures = 0;
      this.setState("healthy");
      return;
    }
    if (normalized === "reconnecting" || normalized === "signalreconnecting" || normalized === "connecting") {
      this.setState("degraded");
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.opts.failureThreshold) {
      this.setState("lost");
      void this.requestRecovery("livekit-connection-lost");
    }
  }

  private async requestRecovery(reason: string): Promise<void> {
    if (!this.opts.onRecover) return;
    const now = this.opts.now();
    if (now - this.lastRecoveryAt < this.opts.recoveryCooldownMs) return;
    this.lastRecoveryAt = now;
    this.recoveryAttempts += 1;
    this.emit(reason);
    await this.opts.onRecover(reason);
  }

  private setState(next: CircleRtcHealthState): void {
    if (this.state === next) {
      this.emit();
      return;
    }
    this.state = next;
    this.lastTransitionAt = this.opts.now();
    this.emit();
  }

  private emit(reason?: string): void {
    this.opts.onSnapshot?.({
      ...this.getSnapshot(),
      ...(reason ? { reason } : {}),
    });
  }
}
