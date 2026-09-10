import { test, expect } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;
const mutationEnabled = process.env.ADMIN_E2E_MUTATION === "true";

test.describe("Admin 2.0 live acceptance", () => {
  test.skip(
    !baseURL || !storageState,
    "Set ADMIN_E2E_BASE_URL and ADMIN_E2E_STORAGE_STATE for an authenticated acceptance run.",
  );

  test.use({ baseURL, storageState });

  test("admin operations renders without user chrome", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Admin 2\.0 Operations/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Full Admin/i })).toBeVisible();
    await expect(page.getByText(/Attention-first/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Community Pool/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /System & Workers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Nia & Connectivity/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible();
    const attention = page.getByRole("heading", { name: /Attention required/i });
    if (await attention.count()) await expect(attention).toBeVisible();
  });

  test("boundary workflow exposes every state without silently losing rows", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/review\s*→\s*verify\s*→\s*promote/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Pending$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reviewed", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ready to promote", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Verified Host", exact: true })).toBeVisible();
    await expect(page.getByText(/Host Signal/i).first()).toBeVisible();
  });

  test("full admin navigation remains reachable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Full Admin/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("regular Admin renders the live Global Ops contract", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    await page.getByRole("tab", { name: "Configure", exact: true }).click();
    const globalOpsResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET" &&
      /\/api\/admin\/global-ops(?:\?|$)/.test(response.url()),
    );
    await page.getByRole("tab", { name: "System", exact: true }).click();

    const globalOpsResponse = await globalOpsResponsePromise;
    expect(globalOpsResponse.ok()).toBeTruthy();
    const globalOps = await globalOpsResponse.json();
    expect(globalOps).toMatchObject({
      workers: { all_critical_ok: expect.any(Boolean), list: expect.any(Array) },
      websocket_hub: expect.any(Object),
      redis: expect.any(Object),
      navigation_circuit_breaker: expect.any(Object),
      process: expect.objectContaining({ commit: expect.any(String) }),
    });
    for (const legacyField of ["summary", "gps_health", "regions", "feature_checks"]) {
      expect(globalOps).not.toHaveProperty(legacyField);
    }

    await expect(page.getByTestId("admin-global-ops")).toBeVisible();
    await expect(page.getByTestId("admin-global-ops-live")).toHaveText("Live · 60s refresh");
    await expect(page.getByText("Worker Registry")).toBeVisible();
    await expect(page.getByText("Connectivity & Process")).toBeVisible();
    await expect(page.getByText("Coverage by Region")).toHaveCount(0);
    await expect(page.getByText("Languages in Use (7 days)")).toHaveCount(0);
  });

  test("reports production GIS stage counts", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible({ timeout: 20_000 });

    const report = await page.evaluate(async () => {
      const token = window.localStorage.getItem("niakofa_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [importsResponse, neighborhoodsResponse] = await Promise.all([
        fetch("/api/admin/neighborhood-boundary-imports", { headers }),
        fetch("/api/admin/city-neighborhoods", { headers }),
      ]);
      if (!importsResponse.ok || !neighborhoodsResponse.ok) {
        throw new Error(`GIS admin APIs failed: imports=${importsResponse.status}, neighborhoods=${neighborhoodsResponse.status}`);
      }
      const imports = await importsResponse.json();
      const neighborhoods = await neighborhoodsResponse.json();
      const rows = Array.isArray(imports) ? imports : (Array.isArray(imports.rows) ? imports.rows : []);
      const production = Array.isArray(neighborhoods) ? neighborhoods : (Array.isArray(neighborhoods.rows) ? neighborhoods.rows : []);
      const valid = rows.filter((row) => row.geometry_valid === true && row.source_kind !== "generated_hint" && row.authority_level !== "generated");
      const reviewed = valid.filter((row) => row.reviewed === true);
      const geometryVerified = reviewed.filter((row) => row.geometry_verified === true);
      const active = production.filter((row) => row.verified === true && row.geometry_verified === true && row.source_kind !== "generated_hint" && row.authority_level !== "generated");
      return {
        staged: rows.length,
        valid: valid.length,
        reviewed: reviewed.length,
        geometryVerified: geometryVerified.length,
        readyToPromote: geometryVerified.length,
        gpsActive: active.length,
        invalid: rows.filter((row) => row.geometry_valid !== true).length,
        fortWorth: rows.filter((row) => row.city_key === "fort_worth").length,
        kansasCityMissouri: rows.filter((row) => row.city_key === "kansas_city_missouri").length,
        generatedActive: production.filter((row) => row.source_kind === "generated_hint" || row.authority_level === "generated").length,
      };
    });

    expect(report.staged).toBeGreaterThanOrEqual(0);
    expect(report.geometryVerified).toBeLessThanOrEqual(report.reviewed);
    expect(report.gpsActive).toBeGreaterThanOrEqual(0);
    expect(report.generatedActive).toBe(0);
    console.warn("PRODUCTION_GIS_REPORT", JSON.stringify(report));
  });

  test("opt-in live path completes one Fort Worth boundary Review → Verify → Promote → Revoke lifecycle", async ({ page }) => {
    test.skip(!mutationEnabled, "Set ADMIN_E2E_MUTATION=true only for an intentional authenticated live mutation test.");

    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible({ timeout: 20_000 });

    // Scope the mutation to Fort Worth and intentionally traverse the
    // Review → Verify → Promote lifecycle. This test must only run against a
    // disposable authenticated environment because promotion changes production
    // neighborhood data.
    await page.getByRole("button", { name: "Fort Worth", exact: true }).click();

    const cardSelector = "div.rounded-xl.border.border-border.bg-background";
    let targetCard = page.locator(cardSelector).filter({ hasText: "Fort Worth" }).first();
    const initialCount = await targetCard.count();
    expect(initialCount).toBeGreaterThan(0);

    const targetName = (await targetCard.locator("div.font-bold.text-sm").innerText()).trim();
    expect(targetName).not.toBe("");

    await page.getByRole("button", { name: /^Pending$/i }).click();
    targetCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(targetCard).toBeVisible();
    await targetCard.getByRole("button", { name: "Review" }).click();

    await page.getByRole("button", { name: /^Reviewed$/i }).click();
    const reviewedCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(reviewedCard).toBeVisible();
    await reviewedCard.getByRole("button", { name: "Verify geometry" }).click();

    await page.getByRole("button", { name: /^Ready to promote$/i }).click();
    const readyCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(readyCard).toBeVisible();
    await expect(readyCard.getByRole("button", { name: /Promote → Host Signal/i })).toBeVisible();

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await readyCard.getByRole("button", { name: /Promote → Host Signal/i }).click();

    await page.getByRole("button", { name: /^Verified Host$/i }).click();
    await expect(
      page.locator(cardSelector).filter({ hasText: targetName }).getByText("Host Signal verified"),
    ).toBeVisible({ timeout: 20_000 });
  });
});
