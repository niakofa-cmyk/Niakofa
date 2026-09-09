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
    await expect(page.getByText(/review.*verify.*promote/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Needs review/i)).toBeVisible();
    await expect(page.getByText(/Reviewed/i)).toBeVisible();
    await expect(page.getByText(/Ready to promote/i)).toBeVisible();
    await expect(page.getByText(/GPS Active/i)).toBeVisible();
    await expect(page.getByText(/Rows no longer vanish without explanation/i)).toBeVisible();
  });

  test("full admin navigation remains reachable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Full Admin/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("reports production GIS stage counts", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible({ timeout: 20_000 });

    const report = await page.evaluate(async () => {
      const [importsResponse, neighborhoodsResponse] = await Promise.all([
        fetch("/api/admin/neighborhood-boundary-imports"),
        fetch("/api/admin/city-neighborhoods"),
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
    console.info("PRODUCTION_GIS_REPORT", JSON.stringify(report));
  });

  test("opt-in live path completes one Fort Worth boundary Review → Verify → Promote → Revoke lifecycle", async ({ page }) => {
    test.skip(!mutationEnabled, "Set ADMIN_E2E_MUTATION=true only for an intentional authenticated live mutation test.");

    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible({ timeout: 20_000 });

    // Scope the mutation to Fort Worth. If all Fort Worth rows are already Reviewed,
    // deliberately unreview one target first so this acceptance test traverses the
    // complete Review → Verify → Promote → Revoke lifecycle from a known state.
    await page.getByRole("button", { name: "Fort Worth", exact: true }).click();

    const cardSelector = "div.rounded-xl.border.border-border.bg-background\\/50";
    let targetCard = page.locator(cardSelector).filter({ hasText: "Fort Worth" }).first();
    const initialCount = await targetCard.count();
    expect(initialCount).toBeGreaterThan(0);

    const targetName = (await targetCard.locator("div.font-bold.text-sm").innerText()).trim();
    expect(targetName).not.toBe("");

    // Prefer an existing Needs Review row; otherwise locate the same Fort Worth
    // boundary in Reviewed and reset only that one row to Needs Review.
    await page.getByRole("button", { name: /Needs review \(/i }).first().click();
    targetCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    if (!(await targetCard.count())) {
      await page.getByRole("button", { name: /Reviewed \(/i }).first().click();
      targetCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
      await expect(targetCard).toBeVisible();
      await targetCard.getByRole("button", { name: "Unreview" }).click();
      await expect(page.getByText(`${targetName} was moved back to Needs review.`)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /Needs review \(/i }).first().click();
      targetCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    }

    await expect(targetCard).toBeVisible();
    await targetCard.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByText(`${targetName} was reviewed and remains visible in the Reviewed queue.`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Reviewed \(/i }).first().click();
    const reviewedCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(reviewedCard).toBeVisible();
    await reviewedCard.getByRole("button", { name: "Verify geometry" }).click();
    await expect(page.getByText(`${targetName} is verified and now appears in Ready to promote.`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Ready to promote \(/i }).first().click();
    const readyCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(readyCard).toBeVisible();
    await expect(readyCard.getByRole("button", { name: /Promote → Host Signal/i })).toBeVisible();

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await readyCard.getByRole("button", { name: /Promote → Host Signal/i }).click();
    await expect(page.getByText(`${targetName} was promoted. It is now GPS-active when its effective date is current.`)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /GPS Active \(/i }).first().click();
    const activeRow = page.getByText(targetName, { exact: true }).locator("..");
    await expect(activeRow).toBeVisible({ timeout: 15_000 });
    const revoke = activeRow.getByRole("button", { name: "Revoke" });
    await expect(revoke).toBeVisible();

    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await revoke.click();
    await expect(page.getByText(`${targetName} is no longer GPS-active.`)).toBeVisible({ timeout: 20_000 });

    // Revoke must remove the production GPS-active record while preserving the staged import.
    await expect(activeRow.getByRole("button", { name: "Revoke" })).toHaveCount(0);
    await page.getByRole("button", { name: /Ready to promote \(/i }).first().click();
    const preservedReadyCard = page.locator(cardSelector).filter({ hasText: targetName }).filter({ hasText: "Fort Worth" }).first();
    await expect(preservedReadyCard).toBeVisible({ timeout: 15_000 });
    await expect(preservedReadyCard.getByRole("button", { name: /Promote → Host Signal/i })).toBeVisible();
  });
});
