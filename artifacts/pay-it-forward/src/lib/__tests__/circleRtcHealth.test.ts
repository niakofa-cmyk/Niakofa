import test from "node:test";
import assert from "node:assert/strict";
import { CircleRtcHealthMonitor } from "../circleRtcHealth";
import type { CircleMediaTransport } from "../circleMediaTransport";

function transport(state: CircleMediaTransport["getConnectionState"] extends () => infer S ? S : never): CircleMediaTransport {
  return {
    kind: "livekit",
    join: async () => {},
    publishLocalMedia: async () => { throw new Error("not used"); },
    setMicEnabled: () => {},
    setVideoEnabled: () => {},
    getConnectionState: () => state,
    destroy: () => {},
  } as CircleMediaTransport;
}

test("healthy transport is healthy while the document is visible", () => {
  const monitor = new CircleRtcHealthMonitor({ now: () => 1000, isOnline: () => true, isVisible: () => true });
  const snapshot = monitor.inspect(transport("connected"));
  assert.equal(snapshot.health, "healthy");
  assert.equal(monitor.shouldRecover(snapshot), false);
});

test("offline never triggers reconnect", () => {
  const monitor = new CircleRtcHealthMonitor({ now: () => 1000, isOnline: () => false });
  const snapshot = monitor.inspect(transport("lost"));
  assert.equal(snapshot.health, "offline");
  assert.equal(monitor.shouldRecover(snapshot), false);
});

test("one transient lost check does not create a reconnect storm", () => {
  const monitor = new CircleRtcHealthMonitor({ now: () => 1000, lostChecksBeforeRecovery: 2, isOnline: () => true });
  const snapshot = monitor.inspect(transport("lost"));
  assert.equal(snapshot.consecutiveLostChecks, 1);
  assert.equal(monitor.shouldRecover(snapshot), false);
});

test("recovery is requested only after consecutive loss and cooldown", () => {
  let now = 10_000;
  const monitor = new CircleRtcHealthMonitor({ now: () => now, lostChecksBeforeRecovery: 2, recoveryCooldownMs: 5_000, isOnline: () => true });
  monitor.inspect(transport("lost"));
  now += 1_000;
  const second = monitor.inspect(transport("lost"));
  assert.equal(monitor.shouldRecover(second), true);

  now += 1_000;
  const third = monitor.inspect(transport("lost"));
  assert.equal(monitor.shouldRecover(third), false);

  now += 5_000;
  monitor.inspect(transport("lost"));
  now += 1;
  const afterCooldown = monitor.inspect(transport("lost"));
  assert.equal(monitor.shouldRecover(afterCooldown), true);
});

test("reconnecting is degraded, not lost", () => {
  const monitor = new CircleRtcHealthMonitor({ isOnline: () => true });
  const snapshot = monitor.inspect(transport("reconnecting"));
  assert.equal(snapshot.health, "degraded");
  assert.equal(snapshot.consecutiveLostChecks, 0);
  assert.equal(monitor.shouldRecover(snapshot), false);
});
