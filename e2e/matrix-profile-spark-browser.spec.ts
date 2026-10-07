import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type MatrixUser = {
  id: number;
  name: string;
  email: string;
  approval_status: string;
  community_id: number | null;
  [key: string]: unknown;
};

type MatrixStorageState = {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:18848";
const apiUrl = process.env.MATRIX_TEST_API_URL;
const accountStatePaths = {
  A: process.env.MATRIX_USER_A_STATE,
  B: process.env.MATRIX_USER_B_STATE,
  C: process.env.MATRIX_USER_C_STATE,
};

test.skip(
  !apiUrl || Object.values(accountStatePaths).some((statePath) => !statePath),
  "Requires the opt-in local cross-community matrix fixture and its short-lived A/B/C states.",
);

async function loadMatrixUser(statePath: string): Promise<MatrixUser> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as MatrixStorageState;
  const storedUser = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_user");
  if (!storedUser) throw new Error("The local matrix storage state has no user fixture.");
  return JSON.parse(storedUser.value) as MatrixUser;
}

async function installLocalApiBridge(page: Page, user: MatrixUser): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (request.method() === "GET"
      && (pathname === "/api/users/me" || pathname === `/api/users/${user.id}`)) {
      return json({
        ...user,
        username: user.username ?? null,
        avatar_url: null,
        panic_contacts: [],
        trust_score: 0,
        help_count: 0,
        is_helper: false,
        helper_status: null,
        helper_mode_active: false,
        is_suspended: false,
      });
    }
    if (request.method() === "GET" && pathname === `/api/users/${user.id}/settings`) {
      return json({});
    }
    if (request.method() === "GET" && pathname.startsWith("/api/requests")) {
      return json({ requests: [] });
    }
    if (request.method() === "GET" && pathname.startsWith("/api/stripe/connect/status/")) {
      return json({ connected: false });
    }

    const fixturePath = `${pathname.replace(/^\/api(?=\/|$)/, "")}${url.search}`;
    return route.fetch({ url: new URL(fixturePath, apiUrl).toString() });
  });
}

async function openMatrixAccount(
  browser: Browser,
  statePath: string,
): Promise<{ context: BrowserContext; page: Page; user: MatrixUser }> {
  const user = await loadMatrixUser(statePath);
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  await installLocalApiBridge(page, user);
  return { context, page, user };
}

async function getFeed(page: Page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem("niakofa_token") ?? "";
    const response = await fetch("/api/community/stories", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json() as {
      stories?: Array<{ id: number; caption?: string; status?: string }>;
    };
    return { status: response.status, stories: body.stories ?? [] };
  });
}

async function getComposition(page: Page, storyId: number) {
  return page.evaluate(async (id) => {
    const token = localStorage.getItem("niakofa_token") ?? "";
    const response = await fetch(`/api/community/stories/${id}/moment-composition`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return {
      status: response.status,
      body: await response.json() as {
        composition?: { status?: string; source_count?: number; source_media_asset_ids?: number[] };
      },
    };
  }, storyId);
}

async function getMediaAccessCount(page: Page): Promise<number> {
  return page.evaluate(() => (
    (window as Window & { __sparkMediaAccessCalls?: number }).__sparkMediaAccessCalls ?? 0
  ));
}

test("renders the redesigned profile for disposable approved Account A", async ({ browser }) => {
  const { context, page, user } = await openMatrixAccount(browser, accountStatePaths.A!);
  try {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto(new URL("/profile", baseUrl).toString());
    await expect(page.getByTestId("text-profile-name")).toHaveText(user.name);
    await expect(page.getByTestId("text-profile-username")).toBeVisible();
    await expect(page.getByTestId("profile-appearance")).toBeVisible();
    await expect(page.getByTestId("link-profile-moments")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("requires camera consent and restores a cancelled Spark text draft without reopening camera", async ({ browser }) => {
  const { context, page } = await openMatrixAccount(browser, accountStatePaths.A!);
  const composerUrl = new URL("/community/moments?composer=1", baseUrl).toString();
  try {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.addInitScript(() => {
      const browserWindow = window as Window & { __sparkMediaAccessCalls?: number };
      browserWindow.__sparkMediaAccessCalls = 0;
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) return;
      const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: (...args: Parameters<MediaDevices["getUserMedia"]>) => {
          browserWindow.__sparkMediaAccessCalls = (browserWindow.__sparkMediaAccessCalls ?? 0) + 1;
          return originalGetUserMedia(...args);
        },
      });
    });

    await page.goto(composerUrl);
    const composer = page.getByRole("dialog", { name: "Create a Spark" });
    await expect(composer).toBeVisible();
    await expect(page.getByTestId("button-spark-camera")).toBeVisible();
    expect(await getMediaAccessCount(page)).toBe(0);

    await page.getByTestId("button-spark-camera").click();
    await expect(page.getByTestId("dialog-spark-camera")).toBeVisible();
    await expect(page.getByTestId("status-spark-camera-off")).toBeVisible();
    expect(await getMediaAccessCount(page)).toBe(0);
    await page.getByTestId("button-setup-spark-camera").click();
    await expect(page.getByTestId("button-confirm-spark-camera")).toBeVisible();
    expect(await getMediaAccessCount(page)).toBe(0);
    await page.getByTestId("button-confirm-spark-camera").click();
    await expect.poll(() => getMediaAccessCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId("button-record-spark-video")).toBeVisible();
    await page.getByTestId("button-cancel-spark-camera").click();
    await expect(composer).toHaveCount(0);

    await page.goto(composerUrl);
    await expect(composer).toBeVisible();
    await expect.poll(() => getMediaAccessCount(page)).toBe(0);
    const sourceWords = "Matrix browser draft: saved before closing.";
    await page.locator("#spark-source-words").fill(sourceWords);
    await page.getByTestId("button-spark-start-with-words").click();
    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Make it yours");
    await expect(page.locator(".nia-story-editor-surface").getByText(sourceWords, { exact: true })).toBeVisible();
    await expect(page.getByText("Draft saved on this device")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Close Spark creator" }).click();
    await expect(composer).toHaveCount(0);
    await page.goto(composerUrl);
    await expect(composer).toBeVisible();
    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Make it yours");
    await expect(page.locator(".nia-story-editor-surface").getByText(sourceWords, { exact: true })).toBeVisible();
    await expect.poll(() => getMediaAccessCount(page)).toBe(0);
  } finally {
    await context.close();
  }
});

test("keeps pending Spark and stitch retry details author-only across matrix Accounts A, B, and C", async ({ browser }) => {
  const storyId = Number(process.env.MATRIX_PENDING_STORY_ID);
  const caption = process.env.MATRIX_PENDING_STORY_CAPTION ?? "";
  const expectedSourceIds = JSON.parse(process.env.MATRIX_PENDING_SOURCE_IDS ?? "[]") as number[];
  expect(Number.isSafeInteger(storyId)).toBe(true);
  expect(caption).toMatch(/^Pending stitch fixture /);
  expect(expectedSourceIds).toHaveLength(2);

  const accountState = {
    A: accountStatePaths.A!,
    B: accountStatePaths.B!,
    C: accountStatePaths.C!,
  };
  for (const account of ["A", "B", "C"] as const) {
    const { context, page, user } = await openMatrixAccount(browser, accountState[account]);
    try {
      expect(user.approval_status).toBe("approved");
      await page.goto(new URL("/community/moments", baseUrl).toString());
      await expect(page).toHaveURL(/\/community\/moments/);

      const feed = await getFeed(page);
      expect(feed.status).toBe(200);
      const pendingStory = feed.stories.find((story) => story.id === storyId);
      if (account === "A") {
        expect(pendingStory).toMatchObject({ caption, status: "pending" });
        const composition = await getComposition(page, storyId);
        expect(composition.status).toBe(200);
        expect(composition.body.composition).toMatchObject({
          status: "ready",
          source_count: 2,
          source_media_asset_ids: expectedSourceIds,
        });
      } else {
        expect(pendingStory).toBeUndefined();
        const composition = await getComposition(page, storyId);
        expect(composition.status).toBe(404);
        const retryStatus = await page.evaluate(async ({ id, sourceIds }) => {
          const token = localStorage.getItem("niakofa_token") ?? "";
          const response = await fetch(`/api/community/stories/${id}/moment-composition`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ intent: "camera_clip_reel", media_asset_ids: sourceIds }),
          });
          return response.status;
        }, { id: storyId, sourceIds: expectedSourceIds });
        expect(retryStatus).toBe(404);
      }
    } finally {
      await context.close();
    }
  }
});
