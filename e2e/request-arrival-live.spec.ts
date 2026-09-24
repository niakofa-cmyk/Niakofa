/**
 * Guarded requester/helper arrival acceptance.
 *
 * Creates one disposable goodwill request, advances the real request lifecycle,
 * opens both role-specific browser sessions before arrival, verifies the live
 * role UI and durable API state, and cancels the request in finally.
 *
 * Run through ops/run-request-arrival-acceptance.sh. The test is intentionally
 * opt-in and must never use non-disposable accounts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from "@playwright/test";

const base = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5000";
const requesterStatePath = process.env.USER_A_STATE;
const helperStatePath = process.env.USER_B_STATE;
const enabled =
  process.env.ALLOW_MUTATING_E2E === "1" &&
  process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1" &&
  process.env.ALLOW_REQUEST_ARRIVAL_E2E === "1";

interface AuthenticatedState {
  token: string;
  userId: number;
  origin: string;
}

function readAuthenticatedState(statePath: string): AuthenticatedState {
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as {
    origins?: Array<{
      origin?: string;
      localStorage?: Array<{ name?: string; value?: string }>;
    }>;
  };
  const origins = parsed.origins ?? [];
  const entries = origins.flatMap((item) => item.localStorage ?? []);
  const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
  const userJson = entries.find((entry) => entry.name === "niakofa_user")?.value;
  const origin = origins.find((item) => item.origin)?.origin;

  if (!origin || !token || !userJson) {
    throw new Error("Storage state is missing an authenticated Niakofa user.");
  }

  const user = JSON.parse(userJson) as { id?: number | string };
  const userId = Number(user.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Storage state contains an invalid Niakofa user id.");
  }

  return { token, userId, origin: new URL(origin).origin };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function responseBody(response: APIResponse): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Expected JSON from ${response.url()}, got HTTP ${response.status()}.`);
  }
}

async function expectJson(
  response: APIResponse,
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  expect(response.status(), response.url()).toBe(expectedStatus);
  return responseBody(response);
}

async function closeContexts(contexts: Array<BrowserContext | null>): Promise<void> {
  await Promise.all(
    contexts.map(async (context) => {
      if (!context) return;
      try {
        await context.close();
      } catch {
        // Cleanup of a browser context must not prevent request cancellation.
      }
    }),
  );
}

test.describe("Requester/helper arrival — permanent opt-in acceptance", () => {
  test.skip(
    !requesterStatePath || !helperStatePath || !enabled,
    "Requires USER_A_STATE, USER_B_STATE, ALLOW_MUTATING_E2E=1, CONFIRM_DISPOSABLE_ACCOUNT=1, and ALLOW_REQUEST_ARRIVAL_E2E=1.",
  );

  test("both roles observe the real arrival transition", async ({ browser, request }) => {
    if (!requesterStatePath || !helperStatePath) {
      throw new Error("Both requester and helper storage states are required.");
    }

    const requester = readAuthenticatedState(requesterStatePath);
    const helper = readAuthenticatedState(helperStatePath);
    const baseOrigin = new URL(base).origin;
    const expectedCommit = process.env.EXPECTED_COMMIT?.trim().toLowerCase() ?? "";

    expect(requester.origin).toBe(baseOrigin);
    expect(helper.origin).toBe(baseOrigin);
    expect(requester.userId).not.toBe(helper.userId);
    expect(expectedCommit).toMatch(/^[0-9a-f]{40}$/);

    const requesterHeaders = authHeaders(requester.token);
    const helperHeaders = authHeaders(helper.token);
    const versionResponse = await request.get(new URL("/api/version", base).toString(), {
      headers: requesterHeaders,
    });
    const readinessResponse = await request.get(new URL("/api/readiness", base).toString(), {
      headers: requesterHeaders,
    });
    const requesterAccountResponse = await request.get(
      new URL(`/api/users/${requester.userId}`, base).toString(),
      { headers: requesterHeaders },
    );
    const helperAccountResponse = await request.get(
      new URL(`/api/users/${helper.userId}`, base).toString(),
      { headers: helperHeaders },
    );

    const version = await expectJson(versionResponse, 200);
    const readiness = await expectJson(readinessResponse, 200);
    const requesterAccount = await expectJson(requesterAccountResponse, 200);
    const helperAccount = await expectJson(helperAccountResponse, 200);

    expect(String(version.commit ?? "").trim().toLowerCase()).toBe(expectedCommit);
    expect(readiness.ready).toBe(true);
    expect(readiness.status).toBe("ready");
    expect(requesterAccount.approval_status).toBe("approved");
    expect(helperAccount.approval_status).toBe("approved");
    expect(Number(requesterAccount.id)).toBe(requester.userId);
    expect(Number(helperAccount.id)).toBe(helper.userId);

    const idempotencyKey = `request-arrival-acceptance-${randomUUID()}`;
    const latitude = Number(process.env.REQUEST_ARRIVAL_TEST_LAT ?? "32.7555");
    const longitude = Number(process.env.REQUEST_ARRIVAL_TEST_LNG ?? "-97.3308");
    const neighborhood = process.env.REQUEST_ARRIVAL_TEST_NEIGHBORHOOD ?? "Fort Worth";
    expect(Number.isFinite(latitude)).toBe(true);
    expect(Number.isFinite(longitude)).toBe(true);

    let requestId: number | null = null;
    const contexts: Array<BrowserContext | null> = [];

    try {
      const createdResponse = await request.post(new URL("/api/requests", base).toString(), {
        headers: { ...requesterHeaders, "Idempotency-Key": idempotencyKey },
        data: {
          title: `Disposable arrival acceptance ${new Date().toISOString()}`,
          description:
            "Disposable opt-in production acceptance request. It is cancelled after arrival verification.",
          category: "groceries",
          urgency: "low",
          payment_type: "goodwill",
          lat: latitude,
          lng: longitude,
          neighborhood,
        },
      });
      const created = await expectJson(createdResponse, 201);
      const createdId = Number(created.id);
      if (!Number.isSafeInteger(createdId) || createdId <= 0) {
        throw new Error("Request creation returned an invalid request id; refusing cleanup URL creation.");
      }
      requestId = createdId;
      expect(created.status).toBe("open");

      const claimResponse = await request.post(
        new URL(`/api/requests/${requestId}/claim`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      const claimed = await expectJson(claimResponse, 200);
      expect(claimed.status).toBe("claimed");

      const enRouteResponse = await request.post(
        new URL(`/api/requests/${requestId}/en-route`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      const enRoute = await expectJson(enRouteResponse, 200);
      expect(enRoute.status).toBe("en_route");

      // Keep both authenticated pages open before arrival to exercise live refresh.
      const requesterContext = await browser.newContext({
        baseURL: base,
        storageState: requesterStatePath,
      });
      const helperContext = await browser.newContext({
        baseURL: base,
        storageState: helperStatePath,
      });
      contexts.push(requesterContext, helperContext);

      const requesterPage = await requesterContext.newPage();
      const helperPage = await helperContext.newPage();
      await Promise.all([
        requesterPage.goto(`/request/${requestId}`, { waitUntil: "domcontentloaded" }),
        helperPage.goto(`/request/${requestId}`, { waitUntil: "domcontentloaded" }),
      ]);

      await expect(requesterPage).toHaveURL(new RegExp(`/request/${requestId}(?:\\?.*)?$`));
      await expect(helperPage).toHaveURL(new RegExp(`/request/${requestId}(?:\\?.*)?$`));
      await expect(requesterPage.getByTestId("state-arrival-arrived-requester")).toHaveCount(0);
      await expect(helperPage.getByTestId("state-arrival-arrived-helper")).toHaveCount(0);

      const arrivedResponse = await request.post(
        new URL(`/api/requests/${requestId}/arrived`, base).toString(),
        { headers: helperHeaders, data: {} },
      );
      const arrived = await expectJson(arrivedResponse, 200);
      expect(arrived.status).toBe("arrived");
      expect(typeof arrived.arrived_at).toBe("string");
      expect(String(arrived.arrived_at)).not.toHaveLength(0);
      expect(Number.isNaN(Date.parse(String(arrived.arrived_at)))).toBe(false);

      const requesterArrival = requesterPage.getByTestId("state-arrival-arrived-requester");
      const helperArrival = helperPage.getByTestId("state-arrival-arrived-helper");
      await expect(requesterArrival).toBeVisible({ timeout: 30_000 });
      await expect(helperArrival).toBeVisible({ timeout: 30_000 });
      await expect(requesterArrival).toContainText("Your helper has arrived");
      await expect(helperArrival).toContainText("You’ve arrived");

      const requesterViewResponse = await request.get(
        new URL(`/api/requests/${requestId}`, base).toString(),
        { headers: requesterHeaders },
      );
      const helperViewResponse = await request.get(
        new URL(`/api/requests/${requestId}`, base).toString(),
        { headers: helperHeaders },
      );
      const requesterFinal = await expectJson(requesterViewResponse, 200);
      const helperFinal = await expectJson(helperViewResponse, 200);

      for (const finalView of [requesterFinal, helperFinal]) {
        expect(finalView.status).toBe("arrived");
        expect(Number(finalView.requester_id)).toBe(requester.userId);
        expect(Number(finalView.helper_id)).toBe(helper.userId);
        expect(typeof finalView.arrived_at).toBe("string");
      }
      expect(helperFinal.arrived_at).toBe(requesterFinal.arrived_at);
    } finally {
      await closeContexts(contexts);

      if (requestId !== null) {
        const cleanupResponse = await request.post(
          new URL(`/api/requests/${requestId}/cancel`, base).toString(),
          { headers: requesterHeaders, data: {} },
        );
        if (!cleanupResponse.ok()) {
          const body = await cleanupResponse.text().catch(() => "");
          throw new Error(
            `Disposable request cleanup failed with HTTP ${cleanupResponse.status()}${body ? `: ${body.slice(0, 300)}` : ""}`,
          );
        }
        const cleanup = await responseBody(cleanupResponse);
        expect(cleanup.status).toBe("cancelled");
      }
    }
  });
});