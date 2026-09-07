import { describe, expect, it } from "@jest/globals";
import { LIVE_PRESENCE_WINDOW_MS, buildPresenceSnapshot, resolveNearestHub } from "../src/lib/diasporaPresence";

const now = new Date("2026-09-07T03:00:00.000Z");
const hubs = [
  { id: 1, name: "Fort Worth, TX", lat: 32.75, lng: -97.33, presence_radius_km: 35, status: "approved" },
  { id: 2, name: "Dallas, TX", lat: 32.7767, lng: -96.797, presence_radius_km: 35, status: "approved" },
];

describe("Diaspora live presence", () => {
  it("resolves the nearest eligible hub", () => expect(resolveNearestHub(32.75, -97.33, hubs)?.hub_id).toBe(1));
  it("does not assign a user outside every hub radius", () => expect(resolveNearestHub(31, -100, hubs)).toBeNull());
  it("counts only fresh users and assigns each user once", () => {
    const snapshot = buildPresenceSnapshot({ now, hubs, currentUserId: 10, users: [
      { id: 10, lat: 32.75, lng: -97.33, location_updated_at: now },
      { id: 11, lat: 32.751, lng: -97.331, location_updated_at: new Date(now.getTime() - 60_000) },
      { id: 12, lat: 32.77, lng: -96.8, location_updated_at: new Date(now.getTime() - 2 * 60_000) },
      { id: 13, lat: 32.75, lng: -97.33, location_updated_at: new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS - 1) },
    ]});
    expect(snapshot.current_user.current_hub?.hub_id).toBe(1);
    expect(snapshot.hubs.find((h) => h.hub_id === 1)?.live_user_count).toBe(2);
    expect(snapshot.hubs.find((h) => h.hub_id === 2)?.live_user_count).toBe(1);
  });
  it("marks a stale current location as not live", () => {
    const snapshot = buildPresenceSnapshot({ now, hubs, currentUserId: 10, users: [{ id: 10, lat: 32.75, lng: -97.33, location_updated_at: new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS - 1) }] });
    expect(snapshot.current_user.location_fresh).toBe(false);
    expect(snapshot.current_user.current_hub).toBeNull();
  });
});
