import {
  ConnectionState,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
} from "livekit-client";

export type CircleRtcPhase =
  | "idle"
  | "permission"
  | "capture"
  | "token"
  | "connecting"
  | "ice-gathering"
  | "ice-connected"
  | "dtls-connected"
  | "audio-published"
  | "video-published"
  | "remote-subscribed"
  | "rendering"
  | "reconnecting"
  | "connected"
  | "failed";

export interface CircleRtcEvent {
  at: number;
  phase: CircleRtcPhase;
  type: string;
  detail?: Record<string, unknown>;
}

export interface CircleRtcSnapshot {
  phase: CircleRtcPhase;
  roomState: string;
  cameraPermission: PermissionState | "unknown";
  microphonePermission: PermissionState | "unknown";
  localAudioPublished: boolean;
  localVideoPublished: boolean;
  remoteSubscriptions: number;
  lastError?: string;
  lastEventAt: number;
  events: CircleRtcEvent[];
  stats?: {
    candidatePairState?: string;
    iceRole?: string;
    currentRoundTripTimeMs?: number;
    packetsLost?: number;
    jitterMs?: number;
    inboundBytes?: number;
    outboundBytes?: number;
    framesDecoded?: number;
    framesDropped?: number;
    audioLevel?: number;
  };
}

const now = () => Date.now();

interface RtcStatsEntry {
  type?: string;
  state?: string;
  nominated?: boolean;
  currentRoundTripTime?: number;
  packetsLost?: number;
  jitter?: number;
  bytesReceived?: number;
  bytesSent?: number;
  framesDecoded?: number;
  framesDropped?: number;
  dtlsState?: string;
}

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

async function permission(
  kind: "camera" | "microphone",
): Promise<PermissionState | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return "unknown";
    }
    const result = await navigator.permissions.query({
      name: kind === "camera" ? "camera" : "microphone",
    } as PermissionDescriptor);
    return result.state;
  } catch {
    return "unknown";
  }
}

/**
 * Browser-local diagnostics for one Circle media session.
 *
 * The snapshot contains no token, credential, URL query, or media payload.
 * It is intentionally safe to download and attach to a bug report.
 */
export class CircleRtcTelemetry {
  private readonly events: CircleRtcEvent[] = [];
  private readonly remoteTracks = new Map<string, RemoteTrack>();
  private room?: Room;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private roomCleanups: Array<() => void> = [];
  private snapshotValue: CircleRtcSnapshot = {
    phase: "idle",
    roomState: "disconnected",
    cameraPermission: "unknown",
    microphonePermission: "unknown",
    localAudioPublished: false,
    localVideoPublished: false,
    remoteSubscriptions: 0,
    lastEventAt: now(),
    events: [],
  };

  constructor(private readonly maxEvents = 250) {}

  get snapshot(): CircleRtcSnapshot {
    return {
      ...this.snapshotValue,
      events: [...this.events],
      stats: this.snapshotValue.stats
        ? { ...this.snapshotValue.stats }
        : undefined,
    };
  }

  record(
    phase: CircleRtcPhase,
    type: string,
    detail?: Record<string, unknown>,
  ): void {
    const event: CircleRtcEvent = { at: now(), phase, type, detail };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.snapshotValue = {
      ...this.snapshotValue,
      phase,
      lastEventAt: event.at,
      events: [...this.events],
    };
  }

  setError(error: unknown, type = "error"): void {
    const message = error instanceof Error ? error.message : String(error);
    this.snapshotValue = { ...this.snapshotValue, lastError: message };
    this.record("failed", type, { message });
  }

  async markPermissionState(): Promise<void> {
    const [cameraPermission, microphonePermission] = await Promise.all([
      permission("camera"),
      permission("microphone"),
    ]);
    this.snapshotValue = {
      ...this.snapshotValue,
      cameraPermission,
      microphonePermission,
    };
    this.record("permission", "permission-state", {
      cameraPermission,
      microphonePermission,
    });
  }

  attachRoom(room: Room): () => void {
    this.detachRoom();
    this.room = room;

    const onConnection = (state: ConnectionState) => {
      this.snapshotValue = { ...this.snapshotValue, roomState: state };
      if (state === ConnectionState.Connecting) {
        this.record("connecting", "room-connecting");
      } else if (state === ConnectionState.Reconnecting) {
        this.record("reconnecting", "room-reconnecting");
      } else if (state === ConnectionState.Connected) {
        this.record("connected", "room-connected");
      } else if (state === ConnectionState.Disconnected) {
        this.record("failed", "room-disconnected");
      }
    };

    const onReconnecting = () =>
      this.record("reconnecting", "livekit-reconnecting");
    const onReconnected = () =>
      this.record("connected", "livekit-reconnected");

    const onLocalPublished = (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Microphone) {
        this.snapshotValue = { ...this.snapshotValue, localAudioPublished: true };
        this.record("audio-published", "local-audio-published", {
          sid: publication.trackSid,
        });
      }
      if (publication.source === Track.Source.Camera) {
        this.snapshotValue = { ...this.snapshotValue, localVideoPublished: true };
        this.record("video-published", "local-video-published", {
          sid: publication.trackSid,
        });
      }
    };

    const onLocalUnpublished = (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.Microphone) {
        this.snapshotValue = {
          ...this.snapshotValue,
          localAudioPublished: false,
        };
        this.record("failed", "local-audio-unpublished", {
          sid: publication.trackSid,
        });
      }
      if (publication.source === Track.Source.Camera) {
        this.snapshotValue = {
          ...this.snapshotValue,
          localVideoPublished: false,
        };
        this.record("failed", "local-video-unpublished", {
          sid: publication.trackSid,
        });
      }
    };

    const onSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      this.remoteTracks.set(`${participant.identity}:${publication.trackSid}`, track);
      this.snapshotValue = {
        ...this.snapshotValue,
        remoteSubscriptions: this.remoteTracks.size,
      };
      this.record("remote-subscribed", "track-subscribed", {
        identity: participant.identity,
        kind: track.kind,
        sid: publication.trackSid,
      });
    };

    const onUnsubscribed = (
      _track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      this.remoteTracks.delete(`${participant.identity}:${publication.trackSid}`);
      this.snapshotValue = {
        ...this.snapshotValue,
        remoteSubscriptions: this.remoteTracks.size,
      };
      this.record("failed", "track-unsubscribed", {
        identity: participant.identity,
        sid: publication.trackSid,
      });
    };

    const onSubscriptionFailed = (
      sid: string,
      participant: RemoteParticipant,
    ) => {
      this.record("failed", "track-subscription-failed", {
        identity: participant.identity,
        sid,
      });
    };

    const onQuality = (quality: unknown, participant: Participant) => {
      this.record("connected", "connection-quality", {
        identity: participant.identity,
        quality: String(quality),
      });
    };

    room
      .on(RoomEvent.ConnectionStateChanged, onConnection)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.TrackSubscriptionFailed, onSubscriptionFailed)
      .on(RoomEvent.ConnectionQualityChanged, onQuality);

    this.roomCleanups = [
      () => removeRoomListener(room, RoomEvent.ConnectionStateChanged, onConnection),
      () => removeRoomListener(room, RoomEvent.Reconnecting, onReconnecting),
      () => removeRoomListener(room, RoomEvent.Reconnected, onReconnected),
      () => removeRoomListener(room, RoomEvent.LocalTrackPublished, onLocalPublished),
      () => removeRoomListener(room, RoomEvent.LocalTrackUnpublished, onLocalUnpublished),
      () => removeRoomListener(room, RoomEvent.TrackSubscribed, onSubscribed),
      () => removeRoomListener(room, RoomEvent.TrackUnsubscribed, onUnsubscribed),
      () => removeRoomListener(room, RoomEvent.TrackSubscriptionFailed, onSubscriptionFailed),
      () => removeRoomListener(room, RoomEvent.ConnectionQualityChanged, onQuality),
    ];

    this.startStatsPolling();
    void this.markPermissionState();
    return () => this.detachRoom();
  }

  private startStatsPolling(): void {
    this.stopStatsPolling();
    if (typeof window === "undefined") return;
    this.pollTimer = setInterval(() => void this.collectStats(), 2_000);
  }

  private stopStatsPolling(): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async collectStats(): Promise<void> {
    if (!this.room) return;

    const tracks: Array<{
      track: {
        getRTCStatsReport?: () => Promise<RTCStatsReport | undefined>;
      };
      direction: "inbound" | "outbound";
    }> = [];
    for (const publication of this.room.localParticipant.trackPublications.values()) {
      const track = publication.track;
      if (track) tracks.push({ track, direction: "outbound" });
    }
    for (const participant of this.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const track = publication.track;
        if (track) tracks.push({ track, direction: "inbound" });
      }
    }

    const aggregate: NonNullable<CircleRtcSnapshot["stats"]> = {};
    for (const item of tracks) {
      try {
        const getStats = item.track.getRTCStatsReport;
        if (typeof getStats !== "function") continue;
        const report = await getStats.call(item.track);
        if (!report) continue;

        report.forEach((value: RTCStats) => {
          const entry = value as unknown as RtcStatsEntry;
          if (
            entry.type === "candidate-pair" &&
            (entry.state === "succeeded" || entry.state === "connected")
          ) {
            aggregate.candidatePairState = String(entry.state);
            aggregate.iceRole = entry.nominated ? "controlling" : undefined;
            if (typeof entry.currentRoundTripTime === "number") {
              aggregate.currentRoundTripTimeMs = Math.round(
                entry.currentRoundTripTime * 1_000,
              );
            }
          }
          if (entry.type === "inbound-rtp") {
            aggregate.packetsLost = Number(
              entry.packetsLost ?? aggregate.packetsLost ?? 0,
            );
            if (typeof entry.jitter === "number") {
              aggregate.jitterMs = Math.round(entry.jitter * 1_000);
            }
            aggregate.inboundBytes = Number(
              entry.bytesReceived ?? aggregate.inboundBytes ?? 0,
            );
            aggregate.framesDecoded = Number(
              entry.framesDecoded ?? aggregate.framesDecoded ?? 0,
            );
            aggregate.framesDropped = Number(
              entry.framesDropped ?? aggregate.framesDropped ?? 0,
            );
          }
          if (entry.type === "outbound-rtp") {
            aggregate.outboundBytes = Number(
              entry.bytesSent ?? aggregate.outboundBytes ?? 0,
            );
          }
          if (entry.type === "transport" && entry.dtlsState === "connected") {
            this.record("dtls-connected", "dtls-connected");
          }
        });
      } catch (error) {
        this.setError(error, "rtc-stats-failed");
      }
    }

    if (aggregate.candidatePairState) {
      this.record("ice-connected", "ice-candidate-pair", aggregate);
    }
    this.snapshotValue = { ...this.snapshotValue, stats: aggregate };
  }

  markCaptureStarted(kind: "audio" | "video"): void {
    this.record("capture", `${kind}-capture-started`);
  }

  markTokenReceived(): void {
    this.record("token", "livekit-token-received");
  }

  markRendering(kind: "audio" | "video"): void {
    this.record("rendering", `${kind}-rendering`);
  }

  detachRoom(): void {
    this.stopStatsPolling();
    for (const cleanup of this.roomCleanups.splice(0)) cleanup();
    this.room = undefined;
    this.remoteTracks.clear();
    this.snapshotValue = {
      ...this.snapshotValue,
      roomState: "disconnected",
      localAudioPublished: false,
      localVideoPublished: false,
      remoteSubscriptions: 0,
    };
  }

  exportJson(): string {
    return JSON.stringify(this.snapshot, null, 2);
  }
}