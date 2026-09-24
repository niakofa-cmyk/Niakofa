/**
 * Opt-in deployed requester/helper arrival acceptance.
 *
 * This test creates one disposable goodwill request, advances it through the
 * real claim → en-route → arrived lifecycle with a second approved account,
 * verifies both role-specific browser views, and cancels the request in
 * finally. It must never run against a real user's account.
 *
 * Run through ops/run-deployed-acceptance.sh with:
 *   ALLOW_REQUEST_ARRIVAL_E2E=1
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

const base = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const requesterState = process.env.USER_A_STATE;
const helperState = process.env.USER_B_STATE;
const allowed =
  process.env.ALLOW_MUTATING_E2E === "1" &&
  process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1" &&
  process.env.ALLOW_REQUEST_ARRIVAL_E2E === "1";

function tokenFromState(statePath: string | undefined): string | null {
  if (!statePath) return null;
  const storageState = readFileSync(statePath, "utf8");
  const parsed = JSON.parse(storageState) as {
    origins?: Array<{ localStorage?: Array<{ name?: string; value?: string }> }>;
  };
  return parsed.origins
    ?.flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => entry.name === "niakofa_token")
    ?.value ?? null;
}

function authHeaders(token: string | null): Record<string, string> {
  if (!token) throw new Error("Authenticated storage state did not contain niakofa_token");
  return { Authorization: `Bearer ${token}` };
}

async function responseBody(response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Expected JSON response from ${response.url()}, got HTTP ${response.status()}`);
  }
}

test.describe("Requester/helper arrival — live authenticated integration", () => {
  test.skip(
    !requesterState || !helperState || !allowed,
    "Requires USER_A_STATE, USER_B_STATE, ALLOW_MUTATING_E2E=1, CONFIRM_DISPOSABLE_ACCOUNT=1, and ALLOW_REQUEST_ARRIVAL_E2E=1.",
  );

  test("both roles see the arrived state after the real lifecycle", async ({ browser, request }) => {
    const requesterToken = tokenFromState(requesterState);
    const helperToken = tokenFromState(helperState);
    const requesterHeaders = authHeaders(requesterToken);
    const helperHeaders = authHeaders(helperToken);

    const idempotencyKey = `production-arrival-e2e-${randomUUID()}`;
    let requestId: number | null = null;
    let requesterContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    let helperContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

    try {
      const createdResponse = await request.post(new URL("/api/requests", base).toString(), {
        headers: { ...requesterHeaders, "Idempotency-Key": idempotencyKey },
        data: {
          title: "Disposable acceptance arrival check",
          description: "Approved disposable production acceptance request; cancel after arrival verification.",
          category: "groceries",
          urgency: "low",
          payment_type: "goodwill",
          lat: 32.7555,
          lng: -97.3308,
          neighborhood: "Fort Worth",
        },
      });
      expect(createdResponse.ok()).toBeTruthy();
      const created = await responseBody(createdResponse);
      const createdId = Number(created.id);
      expect(Number.isInteger(createdId) && createdId > 0).toBeTruthy();
      requestId = createdId;
      expect(created.status).toBe("open");

      const claimResponse = await request.post(
        new URL(`/api/requests/${requestId}/claim`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      expect(claimResponse.ok()).toBeTruthy();
      expect((await responseBody(claimResponse)).status).toBe("claimed");

      const enRouteResponse = await request.post(
        new URL(`/api/requests/${requestId}/en-route`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      expect(enRouteResponse.ok()).toBeTruthy();
      expect((await responseBody(enRouteResponse)).status).toBe("en_route");

      const arrivedResponse = await request.post(
        new URL(`/api/requests/${requestId}/arrived`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      expect(arrivedResponse.ok()).toBeTruthy();
      expect((await responseBody(arrivedResponse)).status).toBe("arrived");

      const requesterView = await request.get(
        new URL(`/api/requests/${requestId}`, base).toString(),
        { headers: requesterHeaders },
      );
      const helperView = await request.get(
        new URL(`/api/requests/${requestId}`, base).toString(),
        { headers: helperHeaders },
      );
      expect(requesterView.ok()).toBeTruthy();
      expect(helperView.ok()).toBeTruthy();
      expect((await responseBody(requesterView)).status).toBe("arrived");
      expect((await responseBody(helperView)).status).toBe("arrived");

      requesterContext = await browser.newContext({
        baseURL: base,
        storageState: requesterState,
      });
      helperContext = await browser.newContext({
        baseURL: base,
        storageState: helperState,
      });
      const requesterPage = await requesterContext.newPage();
      const helperPage = await helperContext.newPage();

      await Promise.all([
        requesterPage.goto(`/request/${requestId}`, { waitUntil: "domcontentloaded" }),
        helperPage.goto(`/request/${requestId}`, { waitUntil: "domcontentloaded" }),
      ]);

      const requesterArrival = requesterPage.locator('[data-testid="state-arrival-arrived"]');
      const helperArrival = helperPage.locator('[data-testid="state-arrival-arrived"]');
      await requesterArrival.waitFor({ state: "visible", timeout: 30_000 });
      await helperArrival.waitFor({ state: "visible", timeout: 30_000 });
      await expect(requesterArrival).toContainText("Your helper has arrived");
      await expect(helperArrival).toContainText("You’ve arrived");
    } finally {
      await requesterContext?.close();
      await helperContext?.close();

      if (requestId !== null) {
        const cleanupResponse = await request.post(
          new URL(`/api/requests/${requestId}/cancel`, base).toString(),
          { headers: requesterHeaders, data: {} },
        );
        if (!cleanupResponse.ok()) {
          throw new Error(`Disposable request cleanup failed with HTTP ${cleanupResponse.status()}`);
        }
        expect((await responseBody(cleanupResponse)).status).toBe("cancelled");
      }
    }
  });
});