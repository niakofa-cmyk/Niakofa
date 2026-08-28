import test from "node:test";
import assert from "node:assert/strict";
import type {
  CircleMediaTransport,
  JoinMediaSessionOptions,
  MediaTransportCallbacks,
} from "../circleMediaTransport";
import {
  CircleRealtimeSessionManager,
  MediaTokenError,
} from "../circleRealtimeSessionManager";

class FakeTransport implements CircleMediaTransport {
  readonly kind = "livekit" as const;
  private state = "idle" as "idle" | "connected" | "lost" | "ended";
  private callbacks: MediaTransportCallbacks = {};
  micPublished = false;
  cameraEnabled = false;
  destroyed = false;
  failCamera = false;

  async join(
    _opts: JoinMediaSessionOptions,
    callbacks: MediaTransportCallbacks,
  ): Promise<void> {
    this.callbacks = callbacks;
    this.state = "connected";
    callbacks.onConnectionStateChange?.("connected");
  }

  async publishLocalMedia(): Promise<MediaStream> {
    this.micPublished = true;
    return {} as MediaStream;
  }

  async addVideoTrack(): Promise<MediaStream> {
    if (this.failCamera) {
      throw new DOMException("Permission denied", "NotAllowedError");
    }
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
  assert.deepEqual(errors, [{ device: "camera", code: "permission_denied" }]);
  manager.destroy();
});

test("setVideoEnabled returns a typed camera failure to its caller", async () => {
  const transport = new FakeTransport();
  const manager = new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId: 42,
    selfUserId: 7,
    authHeaders: () => ({}),
    videoEnabled: true,
    createTransport: () => transport,
    fetchImpl: async () => tokenResponse(),
    reconnectBaseDelayMs: 0,
    reconnectJitterMs: 0,
  });

  await manager.start();
  transport.failCamera = true;
  const result = await manager.setVideoEnabled(true);

  assert.deepEqual(result, {
    ok: false,
    code: "permission_denied",
    message:
      "Allow camera access for Niakofa in your browser/site settings, then try again.",
  });
  manager.destroy();
});

test("media token failures expose distinct UI-actionable status codes", async () => {
  const statuses = [
    [401, "reauthenticate"],
    [403, "not_authorized"],
    [404, "session_ended"],
    [409, "state_conflict"],
    [429, "rate_limited"],
    [503, "server_error"],
  ] as const;

  for (const [status, code] of statuses) {
    const manager = new CircleRealtimeSessionManager({
      baseUrl: "",
      sessionId: "token-status",
      selfUserId: "user-token-status",
      authHeaders: () => ({}),
      videoEnabled: false,
      fetchImpl: async () =>
        ({
          ok: false,
          status,
          headers: {
            get: (name: string) =>
              name === "Retry-After" && status === 429 ? "0" : null,
          },
          json: async () => ({ error: "token failed" }),
        }) as unknown as Response,
    });

    await assert.rejects(manager.start(), (error: unknown) => {
      assert.ok(error instanceof MediaTokenError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      if (status === 429) assert.equal(error.retryAfterSeconds, 0);
      return true;
    });
    manager.destroy();
  }
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
    onStateChange: (state) => states.push(state),
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

test("token refresh uses the server expiry and shares concurrent starts", async () => {
  const transports = [new FakeTransport(), new FakeTransport()];
  let tokenRequests = 0;
  const manager = new CircleRealtimeSessionManager({
    baseUrl: "",
    sessionId: "circle-refresh",
    selfUserId: "user-refresh",
    authHeaders: () => ({}),
    videoEnabled: false,
    createTransport: () => transports.shift() ?? new FakeTransport(),
    fetchImpl: async () => {
      tokenRequests += 1;
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          media_url: "wss://livekit.example.test",
          media_token: `token-${tokenRequests}`,
          expires_in: 0.01,
        }),
      } as unknown as Response;
    },
    reconnectBaseDelayMs: 0,
    reconnectJitterMs: 0,
    tokenRefreshMinDelayMs: 0,
  });

  await Promise.all([manager.start(), manager.start()]);
  assert.equal(tokenRequests, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(tokenRequests >= 2);
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
    onStateChange: (state) => states.push(state),
  });

  await manager.start();
  manager.destroy();
  assert.equal(manager.getState(), "ended");
  assert.equal(states.at(-1), "ended");
});
