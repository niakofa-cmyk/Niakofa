import { describe, expect, it } from "vitest";

// This contract test intentionally stays pure: the singleton opens a browser
// WebSocket only when wsStart() is called in a browser environment. The test
// verifies the public telemetry shape without opening a socket in CI.
describe("WebSocket connection telemetry contract", () => {
  it("exposes stable connection states and recovery metadata", async () => {
    const client = await import("../wsClient");
    const snapshot = client.wsGetConnectionSnapshot();

    expect(["idle", "connecting", "connected", "reconnecting", "disconnected"]).toContain(snapshot.state);
    expect(snapshot.reconnect_attempt).toBeGreaterThanOrEqual(0);
    expect(snapshot.changed_at).toBeGreaterThan(0);
    expect(snapshot.last_connected_at === null || snapshot.last_connected_at > 0).toBe(true);
    expect(snapshot.last_disconnected_at === null || snapshot.last_disconnected_at > 0).toBe(true);
  });
});
