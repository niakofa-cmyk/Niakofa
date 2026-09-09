import { expect, test } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;
const mutationEnabled = process.env.ADMIN_E2E_MUTATION === "true";

test.describe("Admin 2.0 live acceptance", () => {
  test.skip(!baseURL || !storageState, "Set ADMIN_E2E_BASE_URL and ADMIN_E2E_STORAGE_STATE for authenticated live acceptance.");
  test.use({ baseURL, storageState });

  test("renders the Admin 2.0 operations surface", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Attention required/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Full Admin/i })).toBeVisible();
    await expect(page.getByText(/Staged/i).first()).toBeVisible();
    await expect(page.getByText(/GPS Active/i).first()).toBeVisible();
  });

  test("reports production GIS stage counts and rejects generated Host Signal geography", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    const report = await page.evaluate(async () => {
      const [importsResponse, productionResponse] = await Promise.all([
        fetch("/api/admin/neighborhood-boundary-imports"),
        fetch("/api/admin/city-neighborhoods"),
      ]);
      if (!importsResponse.ok || !productionResponse.ok) {
        throw new Error(`GIS admin API failure: imports=${importsResponse.status} production=${productionResponse.status}`);
      }
      const rows = (await importsResponse.json()) as Array<{
        city_key?: string;
        geometry_valid?: boolean;
        geometry_verified?: boolean;
        reviewed?: boolean;
        source_kind?: string;
        authority_level?: string;
      }>;
      const production = (await productionResponse.json()) as Array<{
        city_key?: string;
        source_kind?: string;
        authority_level?: string;
        verified?: boolean;
        geometry_verified?: boolean;
      }>;
      const valid = rows.filter((row) => row.geometry_valid === true);
      const reviewed = rows.filter((row) => row.reviewed === true);
      const geometryVerified = rows.filter((row) => row.reviewed === true && row.geometry_verified === true);
      const active = production.filter((row) => row.verified === true && row.geometry_verified === true);
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

    await page.getByRole("button", { name: "Fort Worth", exact: true }).click();
    await page.getByRole("button", { name: /All\s+253/i }).click().catch(() => undefined);

    const target = page.locator("[data-testid^='boundary-import-row-']").first();
    await expect(target).toBeVisible({ timeout: 20_000 });
    const targetName = await target.getByRole("heading").first().textContent();

    const reviewed = await target.getByRole("button", { name: /Mark reviewed/i }).count();
    if (reviewed === 0) {
      const unreview = target.getByRole("button", { name: /Unreview/i });
      if (await unreview.count()) await unreview.click();
    }
    await expect(target.getByRole("button", { name: /Mark reviewed/i })).toBeVisible();
    await target.getByRole("button", { name: /Mark reviewed/i }).click();
    await expect(target.getByText(/Reviewed/i).first()).toBeVisible();

    await target.getByRole("button", { name: /Verify geometry/i }).click();
    await expect(target.getByText(/Ready to promote/i).first()).toBeVisible();
    await expect(target.getByRole("button", { name: /Promote.*Host Signal/i })).toBeVisible();

    await target.getByRole("button", { name: /Promote.*Host Signal/i }).click();
    await expect(target.getByText(/GPS Active/i).first()).toBeVisible();

    await target.getByRole("button", { name: /Revoke/i }).click();
    await expect(target.getByText(/Ready to promote|Reviewed/i).first()).toBeVisible();

    console.warn("FORT_WORTH_LIFECYCLE_COMPLETE", targetName ?? "unknown");
  });
});
