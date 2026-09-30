export interface MediaWorkerLifecycleEmitter {
  on(
    event: "ready" | "error" | "closed" | "ioredis:close" | "close",
    listener: (...args: unknown[]) => void,
  ): unknown;
}

export interface MediaWorkerBlockingConnection {
  on(event: "close", listener: () => void): unknown;
}

export interface MediaWorkerStartup {
  waitUntilReady(): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
}

export interface MediaWorkerLifecycleCallbacks {
  ready(): void;
  failed(error: unknown): void;
  stopped(): void;
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

export async function monitorMediaWorker(
  worker: MediaWorkerStartup & MediaWorkerLifecycleEmitter,
  blockingConnection: MediaWorkerBlockingConnection,
  callbacks: MediaWorkerLifecycleCallbacks,
  timeoutMs = 10_000,
): Promise<void> {
  let initialReady = false;
  let closed = false;
  let checkingRecovery = false;
  worker.on("error", (error) => callbacks.failed(error));
  worker.on("closed", () => {
    closed = true;
    callbacks.stopped();
  });
  worker.on("ioredis:close", () => callbacks.stopped());
  // BullMQ Worker 5.78.1 forwards blockingConnection error/ready, but not its
  // close event. A blocking-only disconnect therefore needs this direct hook.
  blockingConnection.on("close", () => callbacks.stopped());
  worker.on("ready", () => {
    // BullMQ emits ready when its blocking Redis connection reconnects. Recheck
    // the full worker handshake so both its normal and blocking clients are ready.
    if (!initialReady || closed || checkingRecovery) return;
    checkingRecovery = true;
    void waitUntilReadyBounded(worker, timeoutMs)
      .then(() => {
        if (!closed) callbacks.ready();
      })
      .catch((error: unknown) => callbacks.failed(error))
      .finally(() => { checkingRecovery = false; });
  });

  try {
    await waitUntilReadyBounded(worker, timeoutMs);
    if (closed) throw new Error("media worker closed before readiness");
    initialReady = true;
    callbacks.ready();
  } catch (error) {
    callbacks.failed(error);
    await worker.close(true).catch(() => undefined);
    throw error;
  }
}