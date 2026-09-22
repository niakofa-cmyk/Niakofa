import {
  RoomEvent,
  Track,
} from "livekit-client";
import type {
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
} from "livekit-client";
import type { CircleRtcTelemetry } from "./circleRtcTelemetry";

function removeRoomListener(
  room: Room,
  event: RoomEvent,
  listener: unknown,
): void {
  const off = (
    room as unknown as {
      off?: (event: RoomEvent, listener: unknown) => void;
    }
  ).off;
  off?.call(room, event, listener);
}

export interface CircleMediaRecoveryOptions {
  telemetry: CircleRtcTelemetry;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  cameraRestartCooldownMs?: number;
  subscriptionRetryCooldownMs?: number;
  /** False while the user intentionally has the camera switched off. */
  shouldRecoverCamera?: () => boolean;
}

/**
 * Repairs independently stalled media without competing with LiveKit's
 * signaling reconnect and ICE restart behavior.
 */
export class CircleMediaRecoveryController {
  private readonly telemetry: CircleRtcTelemetry;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly cameraRestartCooldownMs: number;
  private readonly subscriptionRetryCooldownMs: number;
  private readonly shouldRecoverCamera: () => boolean;
  private room?: Room;
  private unsubscribed = false;
  private cameraRetryTimer?: ReturnType<typeof setTimeout>;
  private cameraRetryAttempts = 0;
  private readonly subscriptionTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly roomCleanups: Array<() => void> = [];
  private lastCameraRestartAt = 0;

  constructor(options: CircleMediaRecoveryOptions) {
    this.telemetry = options.telemetry;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 8_000;
    this.cameraRestartCooldownMs = options.cameraRestartCooldownMs ?? 5_000;
    this.subscriptionRetryCooldownMs =
      options.subscriptionRetryCooldownMs ?? 1_500;
    this.shouldRecoverCamera = options.shouldRecoverCamera ?? (() => true);
  }

  attach(room: Room): () => void {
    this.detach();
    this.room = room;
    this.unsubscribed = false;

    const onReconnecting = () => {
      this.telemetry.record("reconnecting", "recovery-room-reconnecting");
    };
    const onReconnected = () => {
      this.telemetry.record("connected", "recovery-room-reconnected");
      this.cameraRetryAttempts = 0;
      void this.repairLocalCamera("reconnected");
    };
    const onSubscriptionFailed = (
      sid: string,
      participant: RemoteParticipant,
    ) => {
      void this.retrySubscription(participant, sid);
    };
    const onStreamStateChanged = (
      publication: RemoteTrackPublication,
      state: unknown,
      participant: RemoteParticipant,
    ) => {
      if (String(state).toLowerCase().includes("paused")) {
        this.telemetry.record("reconnecting", "remote-track-paused", {
          participant: participant.identity,
          sid: publication.trackSid,
        });
      }
    };
    const onLocalUnpublished = (publication: { source?: Track.Source; trackSid?: string }) => {
      if (publication.source !== Track.Source.Camera) return;
      if (!this.shouldRecoverCamera()) return;
      this.telemetry.record("failed", "camera-unpublished-recovery-trigger", {
        sid: publication.trackSid,
      });
      void this.repairLocalCamera("camera-unpublished");
    };

    room
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.TrackSubscriptionFailed, onSubscriptionFailed)
      .on(RoomEvent.TrackStreamStateChanged, onStreamStateChanged)
      .on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);

    this.roomCleanups.push(
      () => removeRoomListener(room, RoomEvent.Reconnecting, onReconnecting),
      () => removeRoomListener(room, RoomEvent.Reconnected, onReconnected),
      () =>
        removeRoomListener(
          room,
          RoomEvent.TrackSubscriptionFailed,
          onSubscriptionFailed,
        ),
      () =>
        removeRoomListener(
          room,
          RoomEvent.TrackStreamStateChanged,
          onStreamStateChanged,
        ),
      () =>
        removeRoomListener(
          room,
          RoomEvent.LocalTrackUnpublished,
          onLocalUnpublished,
        ),
    );
    return () => this.detach();
  }

  private backoff(attempt: number): number {
    const jitter = Math.round(Math.random() * 250);
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt) + jitter;
  }

  private async retrySubscription(
    participant: RemoteParticipant,
    sid: string,
  ): Promise<void> {
    const key = `${participant.identity}:${sid}`;
    if (this.subscriptionTimers.has(key)) return;

    const publication = [...participant.trackPublications.values()].find(
      (candidate) => candidate.trackSid === sid,
    );
    if (!publication) return;

    const timer = setTimeout(async () => {
      this.subscriptionTimers.delete(key);
      if (this.unsubscribed || !this.room) return;
      try {
        await publication.setSubscribed(false);
        await publication.setSubscribed(true);
        this.telemetry.record(
          "remote-subscribed",
          "subscription-retry-succeeded",
          { identity: participant.identity, sid },
        );
      } catch (error) {
        this.telemetry.setError(error, "subscription-retry-failed");
      }
    }, this.subscriptionRetryCooldownMs);
    this.subscriptionTimers.set(key, timer);
  }

  private async repairLocalCamera(reason: string): Promise<void> {
    const room = this.room;
    if (!room || this.unsubscribed || !this.shouldRecoverCamera()) return;

    const publication = [...room.localParticipant.trackPublications.values()].find(
      (candidate) => candidate.source === Track.Source.Camera,
    );
    if (!publication?.track) return;

    const currentTime = Date.now();
    if (
      currentTime - this.lastCameraRestartAt <
      this.cameraRestartCooldownMs
    ) {
      return;
    }
    if (this.cameraRetryAttempts >= this.maxAttempts) {
      this.telemetry.setError(
        new Error("Camera recovery exhausted without refreshing the page"),
        "camera-recovery-exhausted",
      );
      return;
    }

    this.lastCameraRestartAt = currentTime;
    const attempt = this.cameraRetryAttempts++;
    if (this.cameraRetryTimer !== undefined) clearTimeout(this.cameraRetryTimer);
    this.cameraRetryTimer = setTimeout(async () => {
      this.cameraRetryTimer = undefined;
      if (this.unsubscribed || !this.room || !this.shouldRecoverCamera()) {
        return;
      }
      try {
        this.telemetry.record("capture", "camera-restart-attempt", {
          reason,
          attempt: attempt + 1,
          maxAttempts: this.maxAttempts,
        });
        await publication.track!.restartTrack();
        this.telemetry.record("video-published", "camera-restart-succeeded", {
          attempt: attempt + 1,
        });
        this.cameraRetryAttempts = 0;
      } catch (error) {
        this.telemetry.setError(error, "camera-restart-failed");
        if (this.cameraRetryAttempts < this.maxAttempts) {
          void this.repairLocalCamera("camera-retry");
        }
      }
    }, this.backoff(attempt));
  }

  detach(): void {
    this.unsubscribed = true;
    this.room = undefined;
    for (const cleanup of this.roomCleanups.splice(0)) cleanup();
    if (this.cameraRetryTimer !== undefined) {
      clearTimeout(this.cameraRetryTimer);
      this.cameraRetryTimer = undefined;
    }
    for (const timer of this.subscriptionTimers.values()) clearTimeout(timer);
    this.subscriptionTimers.clear();
  }

  destroy(): void {
    this.detach();
  }
}