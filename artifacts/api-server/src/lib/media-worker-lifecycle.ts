export interface MediaWorkerLifecycleEmitter {
  on(
    event: "ready" | "error" | "closed" | "ioredis:close" | "close",
    listener: (...args: unknown[]) => void,
  ): unknown;
}

export interface MediaWorkerBlockingConnection {
  on(event: "close" | "ready", listener: () => void): unknown;
  client: Promise<unknown>;
}

export interface MediaWorkerPrimaryConnection {
  on(event: "ready", listener: () => void): unknown;
}

export interface MediaWorkerStartup {
  waitUntilReady(): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
}

export interface MediaWorkerLifecycleCallbacks {
  ready(source: "startup" | "primary-redis-reconnected" | "blocking-redis-reconnected"): void;
  failed(error: unknown): void;
  stopped(reason: "primary-redis-close" | "blocking-redis-close" | "worker-closed"): void;
}

async function waitUntilReadyBounded(worker: MediaWorkerStartup, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      worker.waitUntilReady(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("media worker readiness timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitUntilBlockingClientReadyBounded(
  connection: MediaWorkerBlockingConnection,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      connection.client.then(() => undefined),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("media worker blocking Redis readiness timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function monitorMediaWorker(
  worker: MediaWorkerStartup & MediaWorkerLifecycleEmitter,
  blockingConnection: MediaWorkerBlockingConnection,
  callbacks: MediaWorkerLifecycleCallbacks,
  primaryConnection: MediaWorkerPrimaryConnection,
  timeoutMs = 10_000,
): Promise<void> {
  let initialReady = false;
  let closed = false;
  let checkingRecovery = false;
  let stopped = false;
  let primaryReady = false;
  let blockingReady = false;

  const markStopped = (reason: "primary-redis-close" | "blocking-redis-close" | "worker-closed") => {
    if (stopped) return;
    stopped = true;
    callbacks.stopped(reason);
  };

  const checkRecovery = (
    source: "primary-redis-reconnected" | "blocking-redis-reconnected",
  ) => {
    if (!initialReady || closed || checkingRecovery || !primaryReady || !blockingReady) return;
    checkingRecovery = true;
    void waitUntilReadyBounded(worker, timeoutMs)
      .then(() => {
        if (!closed && primaryReady && blockingReady) {
          stopped = false;
          callbacks.ready(source);
        }
      })
      .catch((error: unknown) => callbacks.failed(error))
      .finally(() => { checkingRecovery = false; });
  };

  worker.on("error", (error) => callbacks.failed(error));
  worker.on("closed", () => {
    closed = true;
    markStopped("worker-closed");
  });
  worker.on("ioredis:close", () => {
    primaryReady = false;
    markStopped("primary-redis-close");
  });
  blockingConnection.on("close", () => {
    blockingReady = false;
    markStopped("blocking-redis-close");
  });
  blockingConnection.on("ready", () => {
    blockingReady = true;
    checkRecovery("blocking-redis-reconnected");
  });
  worker.on("ready", () => {
    // BullMQ forwards ready from the blocking connection to Worker.
    blockingReady = true;
    checkRecovery("blocking-redis-reconnected");
  });
  primaryConnection.on("ready", () => {
    primaryReady = true;
    checkRecovery("primary-redis-reconnected");
  });

  try {
    await Promise.all([
      waitUntilReadyBounded(worker, timeoutMs),
      waitUntilBlockingClientReadyBounded(blockingConnection, timeoutMs),
    ]);
    if (closed) throw new Error("media worker closed before readiness");
    primaryReady = true;
    blockingReady = true;
    initialReady = true;
    stopped = false;
    callbacks.ready("startup");
  } catch (error) {
    callbacks.failed(error);
    await worker.close(true).catch(() => undefined);
    throw error;
  }
}