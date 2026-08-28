import test from "node:test";
import assert from "node:assert/strict";
import { CircleRtcHealthMonitor } from "../circleRtcHealthMonitor";

test("Circle RTC monitor does not recover on a single transient disconnect", () => {
  let recoveries = 0;
  const monitor = new CircleRtcHealthMonitor({
    failureThreshold: 3,
    onRecover: () => { recoveries += 1; },
  });

  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("connected");
  monitor.reportConnectionState("disconnected");

  assert.equal(monitor.getSnapshot().state, "degraded");
  assert.equal(recoveries, 0);
});

test("Circle RTC monitor requests one recovery after consecutive disconnects", async () => {
  let recoveries = 0;
  const monitor = new CircleRtcHealthMonitor({
    failureThreshold: 3,
    recoveryCooldownMs: 0,
    onRecover: async () => { recoveries += 1; },
  });

  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("disconnected");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(monitor.getSnapshot().state, "lost");
  assert.equal(recoveries, 1);
});

test("Circle RTC monitor reports offline without forcing page refresh", () => {
  const monitor = new CircleRtcHealthMonitor({
    isOnline: () => false,
  });

  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("disconnected");

  assert.equal(monitor.getSnapshot().state, "lost");
});

test("Circle RTC monitor returns to healthy after LiveKit reconnects", () => {
  const monitor = new CircleRtcHealthMonitor();

  monitor.reportConnectionState("disconnected");
  monitor.reportConnectionState("reconnecting");
  monitor.reportConnectionState("connected");

  const snapshot = monitor.getSnapshot();
  assert.equal(snapshot.state, "healthy");
  assert.equal(snapshot.consecutiveFailures, 0);
});
