/**
 * Circle continuity integration tests.
 *
 * These tests instantiate the production LiveKitCircleTransport adapter
 * rather than a manager-only fake. The SDK room and capture seams provide a
 * deterministic in-process LiveKit-shaped network so the A–G contract can
 * run in CI without credentials or a browser. Real-cluster certification is
 * still tracked separately in reference/niakofa-circles-certification-runbook-2026-08-24.md.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ConnectionState,
  RoomEvent,
  type LocalTrack,
  type Room,
  type RoomOptions,
} from "livekit-client";
import {
  LiveKitCircleTransport,
  type LiveKitCircleTransportOptions,
} from "../livekitCircleTransport";
import { CircleRealtimeSessionManager } from "../circleRealtimeSessionManager";
import { canPublishCircleMedia } from "../circleMediaPolicy";
import type {
  CircleMediaTransport,
  JoinMediaSessionOptions,
  MediaTransportCallbacks,
} from "../circleMediaTransport";

type EventHandler = (...args: unknown[]) => void;
type TrackKind = "audio" | "video";

class TestMediaStream {
  private readonly tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  addTrack(track: MediaStreamTrack): void {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index >= 0) this.tracks.splice(index, 1);
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class TestLocalTrack {
  readonly kind: TrackKind;
  readonly mediaStreamTrack: MediaStreamTrack;
  stopped = false;
  deviceId = "default";

  constructor(kind: TrackKind) {
    this.kind = kind;
    const rawTrack = {
      kind,
      enabled: true,
      stop: () => {
        this.stopped = true;
        rawTrack.readyState = "ended";
      },
      getSettings: () => ({ deviceId: this.deviceId }),
      readyState: "live",
    } as unknown as MediaStreamTrack & { readyState: MediaStreamTrackState };
    this.mediaStreamTrack = rawTrack;
  }

  stop(): void {
    this.mediaStreamTrack.stop();
  }

  async restartTrack(options: {
    deviceId?: { exact?: string };
  }): Promise<void> {
    this.deviceId = options.deviceId?.exact ?? this.deviceId;
    this.stopped = false;
  }
}

interface PublishedTrack {
  owner: FakeLiveKitRoom;
  track: TestLocalTrack;
}

class FakeLiveKitNetwork {
  readonly rooms = new Map<string, FakeLiveKitRoom>();
  readonly publications: PublishedTrack[] = [];
  connectionType: "wifi" | "cellular" = "wifi";

  createRoom(identity: string): FakeLiveKitRoom {
    const room = new FakeLiveKitRoom(this, identity);
    this.rooms.set(identity, room);
    return room;
  }

  publish(owner: FakeLiveKitRoom, track: TestLocalTrack): void {
    this.publications.push({ owner, track });
    for (const room of this.rooms.values()) {
      if (room === owner) continue;
      room.emit(
        RoomEvent.TrackSubscribed,
        { mediaStreamTrack: track.mediaStreamTrack },
        {},
        { identity: owner.identity },
      );
    }
  }

  unpublish(owner: FakeLiveKitRoom, track: TestLocalTrack): void {
    const index = this.publications.findIndex(
      (publication) =>
        publication.owner === owner && publication.track === track,
    );
    if (index >= 0) this.publications.splice(index, 1);
    for (const room of this.rooms.values()) {
      if (room === owner) continue;
      room.emit(
        RoomEvent.TrackUnsubscribed,
        { mediaStreamTrack: track.mediaStreamTrack },
        {},
        { identity: owner.identity },
      );
    }
  }

  transitionTo(connectionType: "wifi" | "cellular"): void {
    this.connectionType = connectionType;
    for (const room of this.rooms.values()) {
      room.emit(
        RoomEvent.ConnectionStateChanged,
        ConnectionState.Disconnected,
      );
    }
  }
}

class FakeLiveKitRoom {
  readonly localParticipant: {
    publishTrack: (track: TestLocalTrack) => Promise<void>;
    unpublishTrack: (track: TestLocalTrack) => Promise<void>;
    setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  };
  readonly identity: string;
  joinOptions: JoinMediaSessionOptions | null = null;
  disconnected = false;
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(
    private readonly network: FakeLiveKitNetwork,
    identity: string,
  ) {
    this.identity = identity;
    this.localParticipant = {
      publishTrack: async (track) => this.network.publish(this, track),
      unpublishTrack: async (track) => this.network.unpublish(this, track),
      setMicrophoneEnabled: async () => {},
    };
  }

  on(event: string, handler: EventHandler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  async connect(
    _url: string,
    _token: string,
    _options: object,
  ): Promise<void> {}

  disconnect(): void {
    this.disconnected = true;
    this.emit(RoomEvent.Disconnected);
  }
}

function testTrackFactory(sequence?: Array<TestLocalTrack | Error>) {
  const planned = [...(sequence ?? [])];
  return async (options?: {
    audio?: boolean;
    video?: boolean;
  }): Promise<LocalTrack[]> => {
    const next = planned.shift();
    if (next instanceof Error) throw next;
    if (next) return [next as unknown as LocalTrack];
    return [
      new TestLocalTrack(
        options?.video ? "video" : "audio",
      ) as unknown as LocalTrack,
    ];
  };
}

function transportOptions(
  network: FakeLiveKitNetwork,
  identity: string,
  sequence?: Array<TestLocalTrack | Error>,
  roomCapture?: (room: FakeLiveKitRoom) => void,
): LiveKitCircleTransportOptions {
  return {
    createRoom: (_options: RoomOptions) => {
      const room = network.createRoom(identity);
      roomCapture?.(room);
      return room as unknown as Room;
    },
    createLocalTracks: testTrackFactory(sequence),
    createMediaStream: (tracks) =>
      new TestMediaStream(tracks) as unknown as MediaStream,
  };
}

async function joinTransport(
  transport: CircleMediaTransport,
  identity: string,
  callbacks: MediaTransportCallbacks = {},
): Promise<void> {
  await transport.join(
    {
      circleSessionId: "circle-a-g",
      selfUserId: identity,
      mediaUrl: "wss://livekit.test",
      mediaToken: `token-${identity}`,
      videoEnabled: true,
    },
    callbacks,
  );
}

function tokenResponse(): Response {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      media_url: "wss://livekit.test",
      media_token: "test-token",
      expires_in: 14_400,
      can_publish: true,
    }),
  } as unknown as Response;
}

function managerFor(
  transportFactory: () => CircleMediaTransport,
  sessionId: string | number,
  selfUserId: string | number,
  overrides: Partial<
    ConstructorParameters<typeof CircleRealtimeSessionManager>[0]
  > = {},
): CircleRealtimeSessionManager {
  return new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId,
    selfUserId,
    authHeaders: () => ({}),
    videoEnabled: true,
    createTransport: transportFactory,
    fetchImpl: async () => tokenResponse(),
    reconnectBaseDelayMs: 0,
    reconnectJitterMs: 0,
    ...overrides,
  });
}

test("Test A — host audio reaches listener through the LiveKit transport", async () => {
  const network = new FakeLiveKitNetwork();
  const remoteStreams = new Map<string, MediaStream>();
  let hostRoom: FakeLiveKitRoom | undefined;
  const host = new LiveKitCircleTransport(
    transportOptions(network, "host", undefined, (room) => {
      hostRoom = room;
    }),
  );
  const listener = new LiveKitCircleTransport(
    transportOptions(network, "listener"),
  );

  await joinTransport(host, "host");
  await joinTransport(listener, "listener", {
    onRemoteStream: (userId, stream) =>
      remoteStreams.set(String(userId), stream),
  });
  await host.publishLocalMedia({ video: false });

  assert.ok(hostRoom);
  assert.deepEqual(remoteStreams.get("host")?.getAudioTracks().length, 1);
  assert.equal(
    network.publications.some(
      (publication) =>
        publication.owner === hostRoom && publication.track.kind === "audio",
    ),
    true,
  );
  host.destroy();
  listener.destroy();
});

test("Test B — host camera publication does not interrupt host audio", async () => {
  const network = new FakeLiveKitNetwork();
  const remoteStreams = new Map<string, MediaStream>();
  const host = new LiveKitCircleTransport(transportOptions(network, "host"));
  const listener = new LiveKitCircleTransport(
    transportOptions(network, "listener"),
  );

  await joinTransport(host, "host");
  await joinTransport(listener, "listener", {
    onRemoteStream: (userId, stream) =>
      remoteStreams.set(String(userId), stream),
  });
  const localAudio = await host.publishLocalMedia({ video: false });
  await host.addVideoTrack();

  const received = remoteStreams.get("host");
  assert.equal(localAudio.getAudioTracks().length, 1);
  assert.equal(host.getLocalStream()?.getAudioTracks().length, 1);
  assert.equal(host.getLocalStream()?.getVideoTracks().length, 1);
  assert.equal(received?.getAudioTracks().length, 1);
  assert.equal(received?.getVideoTracks().length, 1);
  host.destroy();
  listener.destroy();
});

test("Test C — an open Circle lets a listener publish video without approval", async () => {
  const network = new FakeLiveKitNetwork();
  const listener = new LiveKitCircleTransport(
    transportOptions(network, "listener"),
  );
  await joinTransport(listener, "listener");

  assert.equal(canPublishCircleMedia("listener", "open"), true);
  await listener.addVideoTrack();
  assert.equal(listener.getLocalStream()?.getVideoTracks().length, 1);
  listener.destroy();
});

test("Test D — denied camera reports a camera error while microphone stays live", async () => {
  const network = new FakeLiveKitNetwork();
  const errors: Array<{ device: string; code: string }> = [];
  const cameraDenied = new DOMException("Permission denied", "NotAllowedError");
  const manager = managerFor(
    () =>
      new LiveKitCircleTransport(
        transportOptions(network, "host", [
          new TestLocalTrack("audio"),
          cameraDenied,
        ]),
      ),
    "circle-d",
    "host",
    {
      onMediaError: (device, _message, code) => errors.push({ device, code }),
    },
  );

  await manager.start();
  await manager.ensureMicrophone();
  await assert.rejects(manager.enableCamera());

  assert.equal(manager.isMicrophoneLive(), true);
  assert.equal(manager.isCameraLive(), false);
  assert.deepEqual(errors, [{ device: "camera", code: "permission_denied" }]);
  assert.equal(
    manager.getTransport()?.getLocalStream()?.getAudioTracks().length,
    1,
  );
  manager.destroy();
});

test("Test E — Wi-Fi to cellular handoff recovers active audio and video", async () => {
  const network = new FakeLiveKitNetwork();
  const rooms: FakeLiveKitRoom[] = [];
  const transports: LiveKitCircleTransport[] = [];
  const tokenUrls: string[] = [];
  const manager = managerFor(
    () => {
      const transport = new LiveKitCircleTransport(
        transportOptions(network, "host", undefined, (room) =>
          rooms.push(room),
        ),
      );
      transports.push(transport);
      return transport;
    },
    "circle-e",
    "host",
    {
      fetchImpl: async (input) => {
        tokenUrls.push(String(input));
        return tokenResponse();
      },
    },
  );

  await manager.start();
  await manager.ensureMicrophone();
  await manager.enableCamera();
  const firstRoom = rooms[0];
  assert.equal(firstRoom.identity, "host");
  assert.equal(manager.isMicrophoneLive(), true);
  assert.equal(manager.isCameraLive(), true);
  assert.equal(
    manager.getTransport()?.getLocalStream()?.getAudioTracks().length,
    1,
  );
  assert.equal(
    manager.getTransport()?.getLocalStream()?.getVideoTracks().length,
    1,
  );

  network.transitionTo("cellular");
  await manager.recover("wifi-to-cellular-handoff");

  assert.equal(rooms.length, 2);
  assert.equal(network.connectionType, "cellular");
  assert.equal(firstRoom.disconnected, true);
  assert.equal(rooms[1].identity, "host");
  assert.deepEqual(tokenUrls, [
    "/api/audio-circle-sessions/circle-e/media-token",
    "/api/audio-circle-sessions/circle-e/media-token",
  ]);
  assert.equal(manager.getState(), "live");
  assert.equal(manager.getTransport(), transports[1]);
  assert.equal(manager.isMicrophoneLive(), true);
  assert.equal(manager.isCameraLive(), true);
  assert.equal(
    manager.getTransport()?.getLocalStream()?.getAudioTracks().length,
    1,
  );
  assert.equal(
    manager.getTransport()?.getLocalStream()?.getVideoTracks().length,
    1,
  );
  manager.destroy();
});

test("Test F — visibility return drives recovery without a page reload", async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousNavigator = (globalThis as { navigator?: unknown }).navigator;
  const fakeWindow = new EventTarget();
  const fakeDocument = new EventTarget() as EventTarget & {
    visibilityState: DocumentVisibilityState;
  };
  Object.defineProperty(fakeDocument, "visibilityState", {
    value: "hidden",
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: fakeDocument,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    configurable: true,
  });

  try {
    const network = new FakeLiveKitNetwork();
    const rooms: FakeLiveKitRoom[] = [];
    const manager = managerFor(
      () =>
        new LiveKitCircleTransport(
          transportOptions(network, "host", undefined, (room) =>
            rooms.push(room),
          ),
        ),
      "circle-f",
      "host",
    );
    await manager.start();
    rooms[0].emit(
      RoomEvent.ConnectionStateChanged,
      ConnectionState.Reconnecting,
    );
    (
      fakeDocument as { visibilityState: DocumentVisibilityState }
    ).visibilityState = "visible";
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    await manager.recover("visibility-test");

    assert.equal(rooms.length, 2);
    assert.equal(manager.getState(), "live");
    manager.destroy();
  } finally {
    if (previousWindow === undefined)
      delete (globalThis as { window?: unknown }).window;
    else
      Object.defineProperty(globalThis, "window", {
        value: previousWindow,
        configurable: true,
      });
    if (previousDocument === undefined)
      delete (globalThis as { document?: unknown }).document;
    else
      Object.defineProperty(globalThis, "document", {
        value: previousDocument,
        configurable: true,
      });
    if (previousNavigator === undefined)
      delete (globalThis as { navigator?: unknown }).navigator;
    else
      Object.defineProperty(globalThis, "navigator", {
        value: previousNavigator,
        configurable: true,
      });
  }
});

test("Test G — device switching preserves the other media track", async () => {
  const network = new FakeLiveKitNetwork();
  const transport = new LiveKitCircleTransport(
    transportOptions(network, "host"),
  );
  await joinTransport(transport, "host");
  await transport.publishLocalMedia({ video: false });
  await transport.addVideoTrack();

  const before = transport.getLocalStream();
  const audioBefore = before?.getAudioTracks()[0];
  const videoBefore = before?.getVideoTracks()[0];
  await transport.switchVideoDevice!("camera-2");
  await transport.switchAudioDevice!("mic-2");
  const after = transport.getLocalStream();

  assert.equal(after?.getAudioTracks()[0], audioBefore);
  assert.equal(after?.getVideoTracks()[0], videoBefore);
  assert.equal(after?.getAudioTracks().length, 1);
  assert.equal(after?.getVideoTracks().length, 1);
  assert.equal(
    (after?.getAudioTracks()[0].getSettings() as MediaTrackSettings).deviceId,
    "mic-2",
  );
  assert.equal(
    (after?.getVideoTracks()[0].getSettings() as MediaTrackSettings).deviceId,
    "camera-2",
  );
  transport.destroy();
});
