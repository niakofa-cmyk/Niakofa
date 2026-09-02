import { expect, test } from "@playwright/test";

const browserTestToken = "browser-test-token";
const signedInUser = {
  id: 7301,
  name: "Ama Mensah",
  email: "ama@example.test",
  is_helper: false,
  helper_mode_active: false,
  trust_score: 0,
  account_type: "member",
  approval_status: "approved",
  created_at: "2026-01-01T00:00:00.000Z",
};

const family = {
  id: 42,
  name: "Mensah Family Space",
  status: "active",
  memory_count: 2,
};

const initialEvents = [
  {
    id: 501,
    year: 1957,
    date: "1957-01-01T00:00:00.000Z",
    title: "Grandmother opened the family shop",
    description: "A place where every neighbor could find a welcome.",
    location: "Kumasi, Ghana",
    type: "import",
    event_type: "milestone",
    memory_id: 501,
    family_id: family.id,
  },
  {
    id: 502,
    year: 1998,
    date: "1998-01-01T00:00:00.000Z",
    title: "The family gathered in Chicago",
    description: "The first reunion after the move north.",
    location: "Chicago, Illinois",
    type: "import",
    event_type: "migration",
    memory_id: 502,
    family_id: family.id,
  },
];

test("signed-in users can load, follow, and add to a family timeline", async ({ page }) => {
  const timelineRequests: Array<{
    method: string;
    path: string;
    authorization: string | undefined;
    body: Record<string, unknown> | null;
  }> = [];

  await page.addInitScript(({ user, token }) => {
    window.localStorage.setItem("niakofa_user", JSON.stringify(user));
    window.localStorage.setItem("niakofa_token", token);
  }, { user: signedInUser, token: browserTestToken });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === `/api/family/${family.id}/timeline`) {
      timelineRequests.push({
        method: request.method(),
        path,
        authorization: request.headers().authorization,
        body: request.postDataJSON() as Record<string, unknown> | null,
      });
    }

    if (path === `/api/users/${signedInUser.id}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signedInUser) });
      return;
    }

    if (path === "/api/admin/nia-status") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false }) });
      return;
    }

    if (path === "/api/family/mine") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ families: [family] }) });
      return;
    }

    if (path === `/api/family/${family.id}/timeline` && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: initialEvents }) });
      return;
    }

    if (path === `/api/family/${family.id}/timeline` && request.method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          event: {
            id: 503,
            year: 2024,
            date: "2024-01-01T00:00:00.000Z",
            title: "The family garden was planted",
            description: "A new tradition for the next generation.",
            location: "Dallas, Texas",
            type: "import",
            event_type: "tradition",
            memory_id: 503,
            family_id: family.id,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unstubbed browser-test request" }) });
  });

  await page.goto("/diaspora/timeline");

  await expect(page.getByRole("heading", { name: "Legacy Timeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: family.name })).toBeVisible();
  await expect(page.getByText(initialEvents[0].title)).toBeVisible();
  await expect(page.getByText(initialEvents[1].title)).toBeVisible();
  await expect(page.getByRole("heading", { name: "1957" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1998" })).toBeVisible();

  await page.getByRole("button", { name: initialEvents[0].title }).click();
  await expect(page).toHaveURL(/\/family\/42\/memory\/501$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Legacy Timeline" })).toBeVisible();

  await page.getByRole("button", { name: "Add milestone" }).click();
  await page.getByLabel("Title *").fill("The family garden was planted");
  await page.getByLabel("Year *").fill("2024");
  await page.getByLabel("Type").selectOption("tradition");
  await page.getByLabel("What happened?").fill("A new tradition for the next generation.");
  await page.getByLabel(/Place/).fill("Dallas, Texas");
  await page.getByRole("button", { name: "Save milestone" }).click();

  await expect(page.getByText("The family garden was planted")).toBeVisible();
  await expect(page.getByText("Dallas, Texas")).toBeVisible();

  const postRequest = timelineRequests.find(request => request.method === "POST");
  expect(postRequest).toMatchObject({
    method: "POST",
    path: `/api/family/${family.id}/timeline`,
    authorization: `Bearer ${browserTestToken}`,
    body: {
      title: "The family garden was planted",
      year: 2024,
      description: "A new tradition for the next generation.",
      location: "Dallas, Texas",
      event_type: "tradition",
    },
  });
  expect(timelineRequests.filter(request => request.method === "GET").length).toBeGreaterThan(0);
  expect(timelineRequests.every(request => request.authorization === `Bearer ${browserTestToken}`)).toBe(true);
});