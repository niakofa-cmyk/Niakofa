import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Browser-level proof for the most important no-deployment path. Every API
 * response is mocked so this remains runnable in CI without seeded accounts.
 */
const browserTestToken = "browser-test-token";
const signedInUser = {
  id: 9001,
  name: "Kwame Asante",
  email: "kwame@example.test",
  is_helper: false,
  helper_mode_active: false,
  trust_score: 0,
  account_type: "member",
  approval_status: "approved",
  created_at: "2026-01-01T00:00:00.000Z",
};
const family = { id: 77, name: "Asante Family Space", status: "active", memory_count: 4 };
const researchCase = {
  id: 501,
  title: "Where did Grandpa Kojo settle?",
  research_question: "Did Kojo Asante settle in Kumasi or Accra after 1961?",
};

function seedAuth(page: Page) {
  return page.addInitScript(({ user, token }) => {
    window.localStorage.setItem("niakofa_user", JSON.stringify(user));
    window.localStorage.setItem("niakofa_token", token);
  }, { user: signedInUser, token: browserTestToken });
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("DNA Connections — no profile yet", () => {
  test("primary CTA is Import when the engine is enabled but no profile exists", async ({ page }) => {
    await seedAuth(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/family/mine") return fulfillJson(route, { families: [family] });
      if (path === "/api/diaspora/dna/matching/status") {
        return fulfillJson(route, {
          enabled: true,
          consent: { opted_in: false },
          has_ready_profile: false,
        });
      }
      if (path === "/api/diaspora/dna/connections") {
        return fulfillJson(route, { enabled: true, opted_in: false, candidates: [] });
      }
      if (path === "/api/diaspora/research/cases") return fulfillJson(route, { cases: [researchCase] });
      return fulfillJson(route, { error: "Unstubbed browser-test request" }, 404);
    });

    await page.goto("/diaspora/dna");
    await expect(page.getByRole("heading", { name: "Import a DNA export to get started" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import export/i })).toBeDisabled();
    await expect(page.getByText("Ready derived DNA profile for this Family Space")).toBeVisible();
    await expect(page.getByText("Import and validate a supported DNA export first.")).toBeVisible();
    await expect(page.getByText("Next step")).toHaveCount(0);
  });

  test("uploading a file sends raw bytes and reloads profile status", async ({ page }) => {
    await seedAuth(page);
    let importCall: {
      provider: string;
      familyId: string;
      fileName: string;
      contentType: string;
      bodyLength: number;
    } | null = null;
    let statusCallCount = 0;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/family/mine") return fulfillJson(route, { families: [family] });
      if (path === "/api/diaspora/dna/matching/status") {
        statusCallCount += 1;
        return fulfillJson(route, {
          enabled: true,
          consent: { opted_in: false },
          has_ready_profile: statusCallCount > 1,
        });
      }
      if (path === "/api/diaspora/dna/connections") return fulfillJson(route, { candidates: [] });
      if (path === "/api/diaspora/research/cases") return fulfillJson(route, { cases: [researchCase] });
      if (path === "/api/diaspora/dna/import" && request.method() === "POST") {
        const headers = request.headers();
        importCall = {
          provider: headers["x-dna-provider"] ?? "",
          familyId: headers["x-dna-family-id"] ?? "",
          fileName: headers["x-dna-file-name"] ?? "",
          contentType: headers["content-type"] ?? "",
          bodyLength: request.postDataBuffer()?.length ?? 0,
        };
        return fulfillJson(route, {
          profile: { provider: "AncestryDNA", status: "ready" },
          message: "DNA export validated. The raw file was discarded after in-memory parsing.",
        }, 201);
      }
      return fulfillJson(route, { error: "Unstubbed browser-test request" }, 404);
    });

    await page.goto("/diaspora/dna");
    await expect(page.getByRole("heading", { name: "Import a DNA export to get started" })).toBeVisible();
    await page.setInputFiles('input[type="file"]', {
      name: "ancestry-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("rsid,chromosome,position,genotype\nrs123,1,1000,AA\n"),
    });
    await page.getByRole("button", { name: /Import export/i }).click();

    await expect(page.getByText("DNA export validated. The raw file was discarded after in-memory parsing.")).toBeVisible();
    expect(importCall).not.toBeNull();
    expect(importCall?.provider).toBe("AncestryDNA");
    expect(importCall?.familyId).toBe(String(family.id));
    expect(importCall?.fileName).toBe("ancestry-export.csv");
    expect(importCall?.contentType).toBe("text/csv");
    expect(importCall?.bodyLength).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Import a DNA export to get started" })).toHaveCount(0);
  });
});

test.describe("DNA Connections — profile ready, not opted in", () => {
  test("primary CTA is Opt in, not Import", async ({ page }) => {
    await seedAuth(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/family/mine") return fulfillJson(route, { families: [family] });
      if (path === "/api/diaspora/dna/matching/status") return fulfillJson(route, {
        enabled: true,
        consent: { opted_in: false },
        has_ready_profile: true,
      });
      if (path === "/api/diaspora/dna/connections") return fulfillJson(route, { candidates: [] });
      if (path === "/api/diaspora/research/cases") return fulfillJson(route, { cases: [researchCase] });
      return fulfillJson(route, { error: "Unstubbed browser-test request" }, 404);
    });

    await page.goto("/diaspora/dna");
    await expect(page.getByRole("heading", { name: "Import a DNA export to get started" })).toHaveCount(0);
    await expect(page.getByText("Next step")).toBeVisible();
    await expect(page.getByRole("button", { name: "Opt in" })).toBeEnabled();
  });
});

test.describe("Research workspace — case status controls", () => {
  test("Resolve is available from Open and PATCHes the transition", async ({ page }) => {
    await seedAuth(page);
    let lastPatchBody: Record<string, unknown> | null = null;
    const openCase = {
      ...researchCase,
      family_id: family.id,
      status: "open",
      confidence: "unreviewed",
      person_member_id: 12,
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/family/mine") return fulfillJson(route, { families: [family] });
      if (path === "/api/diaspora/research/guides") return fulfillJson(route, { guides: [] });
      if (path === `/api/family/${family.id}/members`) return fulfillJson(route, { members: [] });
      if (path === "/api/diaspora/research/cases" && request.method() === "GET") return fulfillJson(route, { cases: [openCase] });
      if (path === `/api/diaspora/research/cases/${openCase.id}` && request.method() === "GET") {
        return fulfillJson(route, { case: openCase, evidence: [], notes: [] });
      }
      if (path === `/api/diaspora/research/cases/${openCase.id}` && request.method() === "PATCH") {
        lastPatchBody = request.postDataJSON() as Record<string, unknown>;
        return fulfillJson(route, { case: { ...openCase, status: lastPatchBody.status } });
      }
      return fulfillJson(route, { error: "Unstubbed browser-test request" }, 404);
    });

    await page.goto("/diaspora/research");
    await expect(page.getByRole("heading", { name: openCase.title })).toBeVisible();
    const resolveButton = page.getByRole("button", { name: "resolved" });
    await expect(resolveButton).toBeEnabled();
    await resolveButton.click();
    await expect.poll(() => lastPatchBody).not.toBeNull();
    expect(lastPatchBody?.status).toBe("resolved");
  });
});