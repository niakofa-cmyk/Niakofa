/**
 * Opt-in deployed county-travel certification.
 *
 * This mutates the authenticated disposable user's location. When an original
 * GPS fix exists it is restored in finally; otherwise the account remains at
 * the final test location and must therefore never be a real member account.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const base = process.env.BASE_URL || "http://127.0.0.1:5000";
const state = process.env.USER_A_STATE;
const allowed =
  process.env.ALLOW_MUTATING_E2E === "1" &&
  process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1";

function authFromState(storageState: Awaited<ReturnType<APIRequestContext["storageState"]>>) {
  return storageState.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_token")?.value;
}

test.describe("County travel — live authenticated integration", () => {
  test.skip(!state || !allowed, "Requires an explicitly confirmed disposable authenticated account.");
  test.use({ storageState: state });

  test("fresh GPS fixes move between independent county pools", async ({ request }) => {
    const storageState = await request.storageState();
    const token = authFromState(storageState);
    expect(token).toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };

    const beforeResponse = await request.get(new URL("/api/users/me", base).toString(), { headers });
    expect(beforeResponse.ok()).toBeTruthy();
    const before = await beforeResponse.json();
    const hasOriginalCoordinates =
      before.lat !== null && before.lat !== undefined &&
      before.lng !== null && before.lng !== undefined;
    const original = { lat: Number(before.lat), lng: Number(before.lng) };
    const canRestore =
      hasOriginalCoordinates &&
      Number.isFinite(original.lat) &&
      Number.isFinite(original.lng);

    const updateLocation = async (lat: number, lng: number) => {
      const response = await request.patch(
        new URL(`/api/users/${Number(before.id)}/location`, base).toString(),
        { headers, data: { lat, lng } },
      );
      expect(response.ok()).toBeTruthy();
      return response.json();
    };

    try {
      const tarrant = await updateLocation(32.7555, -97.3308);
      expect(tarrant.community_id).toBeTruthy();

      const jackson = await updateLocation(39.0997, -94.5786);
      expect(jackson.community_id).toBeTruthy();
      expect(jackson.community_id).not.toBe(tarrant.community_id);

      const countyFeed = await request.get(new URL("/api/civic/needs", base).toString(), { headers });
      expect(countyFeed.ok()).toBeTruthy();
      expect(Array.isArray(await countyFeed.json())).toBe(true);
    } finally {
      if (canRestore) await updateLocation(original.lat, original.lng);
    }
  });
});