import { describe, expect, it } from "@jest/globals";
import {
  buildPresenceSnapshot,
  isLivePresenceTimestamp,
  LIVE_PRESENCE_WINDOW_MS,
} from "../lib/diasporaPresence";

const now = new Date("2026-09-07T18:00:00.000Z");
const hubs = [{
  id: 1,
  name: "Fort Worth, TX",
  lat: 32.7555,
  lng: -97.3308,
  presence_radius_km: 35,
  status: "approved",
}];

describe("Diaspora live-presence freshness", () => {
  it("accepts timestamps through the exact ten-minute boundary", () => {
    expect(isLivePresenceTimestamp(new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS), now)).toBe(true);
    expect(isLivePresenceTimestamp(new Date(now.getTime() - LIVE_PRESENCE_WINDOW_MS - 1), now)).toBe(false);
  });

  it("rejects future timestamps instead of counting clock-skewed users as live", () => {
    expect(isLivePresenceTimestamp(new Date(now.getTime() + 1), now)).toBe(false);

    const snapshot = buildPresenceSnapshot({
      now,
      hubs,
      currentUserId: 1,
      users: [
        {
          id: 1,
          lat: 32.7555,
          lng: -97.3308,
          location_updated_at: new Date(now.getTime() + 1),
        },
      ],
    });

    expect(snapshot.current_user.location_fresh).toBe(false);
    expect(snapshot.current_user.current_hub).toBeNull();
    expect(snapshot.hubs[0]?.live_user_count).toBe(0);
  });
});