import test from "node:test";
import assert from "node:assert/strict";
import type {
  CircleMediaTransport,
  JoinMediaSessionOptions,
  MediaTransportCallbacks,
} from "../circleMediaTransport";
import { CircleRealtimeSessionManager } from "../circleRealtimeSessionManager";

class FakeTransport implements CircleMediaTransport {
  readonly kind = "livekit" as const;
  private state = "idle" as "idle" | "connected" | "lost" | "ended";
  private callbacks: MediaTransportCallbacks = {};
  micPublished = false;
  cameraEnabled = false;
  destroyed = false;
  failCamera = false;

  async join(_opts: JoinMediaSessionOptions, callbacks: MediaTransportCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.state = "connected";
    callbacks.onConnectionStateChange?.("connected");
  }

  async publishLocalMedia(): Promise<MediaStream> {
    this.micPublished = true;
    return {} as MediaStream;
  }

  async addVideoTrack(): Promise<MediaStream> {
    if (this.failCamera) throw new Error("camera permission denied");
    this.cameraEnabled = true;
    return {} as MediaStream;
  }

  stopVideoTracks(): void {
    this.cameraEnabled = false;
  }

  setMicEnabled(_enabled: boolean): void {}
  setVideoEnabled(_enabled: boolean): void {}
  getConnectionState() {
    return this.state;
  }
  destroy(): void {
    this.destroyed = true;
    this.state = "ended";
  }

  loseConnection(): void {
    this.state = "lost";
    this.callbacks.onConnectionStateChange?.("lost");
  }
}

function tokenResponse(): Response {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      media_url: "wss://livekit.example.test",
      media_token: "short-lived-test-token",
      expires_in: 14_400,
    }),
  } as unknown as Response;
}

test("camera failure preserves microphone and reports a camera error", async () => {
  const errors: Array<{ device: string; code: string }> = [];
  const transport = new FakeTransport();
  const manager = new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId: 42,
    selfUserId: 7,
    authHeaders: () => ({}),
    videoEnabled: true,
    createTransport: () => transport,
    fetchImpl: async () => tokenResponse(),
    onMediaError: (device, _message, code) => errors.push({ device, code }),
    reconnectBaseDelayMs: 0,
    reconnectJitterMs: 0,
  });

  await manager.start();
  await manager.ensureMicrophone();
  transport.failCamera = true;
  await assert.rejects(manager.enableCamera());

  assert.equal(manager.isMicrophoneLive(), true);
  assert.equal(manager.isCameraLive(), false);
  assert.deepEqual(errors, [{ device: "camera", code: "unknown" }]);
  manager.destroy();
});

test("recovery reuses the same Circle identity and republishes active media", async () => {
  const transports = [new FakeTransport(), new FakeTransport()];
  const states: string[] = [];
  let tokenRequests = 0;
  const manager = new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId: "circle-9",
    selfUserId: "user-3",
    authHeaders: () => ({ Authorization: "Bearer test" }),
    videoEnabled: true,
    createTransport: () => transports.shift() ?? new FakeTransport(),
    fetchImpl: async () => {
      tokenRequests += 1;
      return tokenResponse();
    },
    onStateChange: state => states.push(state),
    reconnectBaseDelayMs: 0,
    reconnectJitterMs: 0,
  });

  await manager.start();
  await manager.ensureMicrophone();
  await manager.enableCamera();
  const first = manager.getTransport() as FakeTransport;

  await manager.recover("test-network-blip");
  const second = manager.getTransport() as FakeTransport;

  assert.notEqual(first, second);
  assert.equal(first.destroyed, true);
  assert.equal(second.micPublished, true);
  assert.equal(second.cameraEnabled, true);
  assert.equal(tokenRequests, 2);
  assert.equal(states.includes("reconnecting"), true);
  assert.equal(manager.getState(), "live");
  manager.destroy();
});

test("destroy ends the manager without using a page reload", async () => {
  const states: string[] = [];
  const manager = new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId: 1,
    selfUserId: 2,
    authHeaders: () => ({}),
    videoEnabled: false,
    createTransport: () => new FakeTransport(),
    fetchImpl: async () => tokenResponse(),
    onStateChange: state => states.push(state),
  });

  await manager.start();
  manager.destroy();
  assert.equal(manager.getState(), "ended");
  assert.equal(states.at(-1), "ended");
});