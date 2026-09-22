/**
 * Browser-safe health state for the Circle realtime media plane.
 *
 * This module deliberately does not refresh the page and never owns media
 * tracks. It observes the transport and browser lifecycle, classifies health,
 * and provides a bounded recovery decision to the session manager.
 */
import type { CircleMediaTransport, MediaConnectionState } from "./circleMediaTransport";

export type CircleRtcHealth =
  | "healthy"
  | "degraded"
  | "offline"
  | "lost";

export interface CircleRtcHealthSnapshot {
  health: CircleRtcHealth;
  transportState: MediaConnectionState;
  online: boolean;
  visible: boolean;
  checkedAt: number;
  consecutiveLostChecks: number;
}

export interface CircleRtcHealthOptions {
  /** Number of consecutive lost/ended checks before recovery is requested. */
  lostChecksBeforeRecovery?: number;
  /** Minimum time between recovery requests. */
  recoveryCooldownMs?: number;
  now?: () => number;
  isOnline?: () => boolean;
  isVisible?: () => boolean;
}

export class CircleRtcHealthMonitor {
  private readonly opts: Required<CircleRtcHealthOptions>;
  private consecutiveLostChecks = 0;
  private lastRecoveryAt = 0;

  constructor(options: CircleRtcHealthOptions = {}) {
    this.opts = {
      lostChecksBeforeRecovery: options.lostChecksBeforeRecovery ?? 2,
      recoveryCooldownMs: options.recoveryCooldownMs ?? 15_000,
      now: options.now ?? (() => Date.now()),
      isOnline: options.isOnline ?? (() =>
        typeof navigator === "undefined" ? true : navigator.onLine),
      isVisible: options.isVisible ?? (() =>
        typeof document === "undefined" ? true : document.visibilityState === "visible"),
    };
  }

  inspect(transport: CircleMediaTransport | null): CircleRtcHealthSnapshot {
    const now = this.opts.now();
    const online = this.opts.isOnline();
    const visible = this.opts.isVisible();
    const transportState = transport?.getConnectionState() ?? "lost";

    if (!online) {
      this.consecutiveLostChecks = 0;
      return { health: "offline", transportState, online, visible, checkedAt: now, consecutiveLostChecks: 0 };
    }

    if (transportState === "connected") {
      this.consecutiveLostChecks = 0;
      return { health: visible ? "healthy" : "degraded", transportState, online, visible, checkedAt: now, consecutiveLostChecks: 0 };
    }

    if (transportState === "reconnecting" || transportState === "connecting") {
      return { health: "degraded", transportState, online, visible, checkedAt: now, consecutiveLostChecks: this.consecutiveLostChecks };
    }

    this.consecutiveLostChecks += 1;
    return { health: "lost", transportState, online, visible, checkedAt: now, consecutiveLostChecks: this.consecutiveLostChecks };
  }

  shouldRecover(snapshot: CircleRtcHealthSnapshot): boolean {
    if (snapshot.health !== "lost" || !snapshot.online) return false;
    if (snapshot.consecutiveLostChecks < this.opts.lostChecksBeforeRecovery) return false;
    const now = snapshot.checkedAt;
    if (now - this.lastRecoveryAt < this.opts.recoveryCooldownMs) return false;
    this.lastRecoveryAt = now;
    return true;
  }

  reset(): void {
    this.consecutiveLostChecks = 0;
    this.lastRecoveryAt = 0;
  }
}
