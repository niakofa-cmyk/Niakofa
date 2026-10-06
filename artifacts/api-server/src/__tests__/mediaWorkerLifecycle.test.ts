import { describe, expect, it } from "@jest/globals";
import { EventEmitter } from "node:events";
import { getMediaWorkerReadiness } from "../routes/health";
import {
  monitorMediaWorker,
  type MediaWorkerBlockingConnection,
  type MediaWorkerLifecycleCallbacks,
  type MediaWorkerLifecycleEmitter,
  type MediaWorkerPrimaryConnection,
  type MediaWorkerStartup,
} from "../lib/media-worker-lifecycle";

class MockRedisClient {
  status = "ready";
}

class MockBlockingConnection extends EventEmitter {
  readonly redisClient = new MockRedisClient();
  readonly client: Promise<unknown>;

  constructor(client?: Promise<unknown>) {
    super();
    this.client = client ?? Promise.resolve(this.redisClient);
  }

  disconnect(): void {
    this.redisClient.status = "close";
    this.emit("close");
  }

  reconnect(): void {
    this.redisClient.status = "ready";
    this.emit("ready");
  }
}

class MockPrimaryConnection extends EventEmitter {
  status = "ready";

  disconnect(): void {
    this.status = "close";
  }

  reconnect(): void {
    this.status = "ready";
    this.emit("ready");
  }
}

class MockMediaWorker extends EventEmitter {
  closed = false;
  readinessChecks = 0;

  constructor(private readonly readiness: Promise<unknown>) {
    super();
  }

  waitUntilReady(): Promise<unknown> {
    this.readinessChecks++;
    return this.readiness;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.emit("closed");
  }
}

function mockWorker(worker: MockMediaWorker): MediaWorkerStartup & MediaWorkerLifecycleEmitter {
  return worker as unknown as MediaWorkerStartup & MediaWorkerLifecycleEmitter;
}

function mockBlockingConnection(connection: MockBlockingConnection): MediaWorkerBlockingConnection {
  return connection as unknown as MediaWorkerBlockingConnection;
}

function mockPrimaryConnection(connection: MockPrimaryConnection): MediaWorkerPrimaryConnection {
  return connection as unknown as MediaWorkerPrimaryConnection;
}

function mockCallbacks() {
  const events: string[] = [];
  const callbacks: MediaWorkerLifecycleCallbacks = {
    ready: () => events.push("ready"),
    failed: () => events.push("failed"),
    stopped: () => events.push("stopped"),
  };
  return { callbacks, events };
}

describe("media BullMQ worker lifecycle readiness", () => {
  it("marks ready only after waitUntilReady and tracks failures, disconnects, and recovery", async () => {
    let finishReadiness!: () => void;
    const readiness = new Promise<void>((resolve) => { finishReadiness = resolve; });
    const worker = new MockMediaWorker(readiness);
    const blockingConnection = new MockBlockingConnection();
    const primaryConnection = new MockPrimaryConnection();
    const { callbacks, events } = mockCallbacks();

    const startup = monitorMediaWorker(
      mockWorker(worker),
      mockBlockingConnection(blockingConnection),
      callbacks,
      mockPrimaryConnection(primaryConnection),
    );
    worker.emit("ready");
    expect(events).toEqual([]);
    finishReadiness();
    await startup;
    expect(events).toEqual(["ready"]);

    worker.emit("error", new Error("connection error"));
    expect(events.at(-1)).toBe("failed");
    primaryConnection.disconnect();
    worker.emit("ioredis:close");
    expect(events.at(-1)).toBe("stopped");
    // The shared client reconnects without a Worker "ready" event. BullMQ
    // only forwards that event from the separate blocking connection.
    primaryConnection.reconnect();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events.at(-1)).toBe("ready");
    expect(worker.readinessChecks).toBe(2);
    worker.emit("closed");
    expect(events.at(-1)).toBe("stopped");
  });

  it("degrades on blocking-only close and restores readiness only after reconnect handshake", async () => {
    const worker = new MockMediaWorker(Promise.resolve());
    const blockingConnection = new MockBlockingConnection();
    const primaryConnection = new MockPrimaryConnection();
    const { callbacks, events } = mockCallbacks();
    await monitorMediaWorker(
      mockWorker(worker),
      mockBlockingConnection(blockingConnection),
      callbacks,
      mockPrimaryConnection(primaryConnection),
    );

    blockingConnection.disconnect();
    expect(events.at(-1)).toBe("stopped");
    expect(getMediaWorkerReadiness(true, [
      { name: "media-processing", status: "stopped" },
    ])?.status).toBe("degraded");

    // BullMQ 5.78.1 forwards a blocking-connection ready event to Worker "ready".
    blockingConnection.reconnect();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(worker.readinessChecks).toBe(2);
    expect(events.at(-1)).toBe("ready");
    expect(getMediaWorkerReadiness(true, [
      { name: "media-processing", status: "running" },
    ])?.status).toBe("ready");
  });

  it("fails closed and closes the worker if the bounded initial handshake times out", async () => {
    const worker = new MockMediaWorker(new Promise(() => undefined));
    const blockingConnection = new MockBlockingConnection();
    const primaryConnection = new MockPrimaryConnection();
    const { callbacks, events } = mockCallbacks();

    await expect(monitorMediaWorker(
      mockWorker(worker),
      mockBlockingConnection(blockingConnection),
      callbacks,
      mockPrimaryConnection(primaryConnection),
      5,
    )).rejects.toThrow(
      "media worker readiness timed out",
    );
    expect(events).toEqual(["failed", "stopped"]);
    expect(worker.closed).toBe(true);
  });

  it("bounds the blocking Redis client's startup handshake", async () => {
    const worker = new MockMediaWorker(Promise.resolve());
    const blockingConnection = new MockBlockingConnection(new Promise(() => undefined));
    const primaryConnection = new MockPrimaryConnection();
    const { callbacks, events } = mockCallbacks();

    await expect(monitorMediaWorker(
      mockWorker(worker),
      mockBlockingConnection(blockingConnection),
      callbacks,
      mockPrimaryConnection(primaryConnection),
      5,
    )).rejects.toThrow("blocking Redis readiness timed out");

    expect(worker.closed).toBe(true);
    expect(events).toEqual(["failed", "stopped"]);
  });
});