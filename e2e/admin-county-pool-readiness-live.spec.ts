import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageStatePath = resolve(process.cwd(), ".auth/niakofa-admin.json");
const hasAdminState = existsSync(storageStatePath);

if (baseURL && new URL(baseURL).origin !== "https://niakofa.com") {
  throw new Error("This production acceptance test only permits https://niakofa.com.");
}

test.describe("Tarrant county pool readiness — read-only production acceptance", () => {
  test.skip(
    !baseURL || !hasAdminState,
    "Set ADMIN_E2E_BASE_URL=https://niakofa.com and capture .auth/niakofa-admin.json locally.",
  );

  test.use({
    baseURL,
    storageState: hasAdminState ? storageStatePath : undefined,
  });

  test("renders the authenticated readiness row from the live admin API without writes", async ({ page }) => {
    const productionOrigin = new URL(baseURL!).origin;
    const blockedWrites: string[] = [];
    const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

    await page.route("**/*", async (route) => {
      const request = route.request();
      if (writeMethods.has(request.method())) {
        const url = new URL(request.url());
        blockedWrites.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();

    await page
      .getByRole("tablist", { name: "Admin areas" })
      .getByRole("tab", { name: "Finance", exact: true })
      .click();

    const communitiesResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === productionOrigin &&
        url.pathname === "/api/admin/communities" &&
        response.request().method() === "GET"
      );
    });

    await page
      .getByRole("tablist", { name: "Finance sections" })
      .getByRole("tab", { name: "Communities", exact: true })
      .click();

    const communitiesResponse = await communitiesResponsePromise;
    expect(communitiesResponse.status()).toBe(200);
    const payload = (await communitiesResponse.json()) as {
      communities?: Array<{
        id: number;
        name: string;
        county?: string | null;
        state?: string | null;
        pool_balance: number;
      }>;
    };
    const tarrantCommunities = (payload.communities ?? []).filter(
      (community) =>
        community.county?.replace(/\s+County$/i, "").trim().toLowerCase() === "tarrant" &&
        community.state?.trim().toUpperCase() === "TX",
    );
    expect(tarrantCommunities).toHaveLength(1);

    const tarrant = tarrantCommunities[0];
    if (!tarrant) throw new Error("Expected exactly one Tarrant County community.");
    const balance = Number(tarrant.pool_balance);
    expect(Number.isFinite(balance)).toBe(true);

    const readinessSection = page.getByRole("region", { name: "County pool readiness" });
    await expect(readinessSection).toBeVisible();
    const readinessBadge = page.getByTestId(`status-pool-readiness-${tarrant.id}`);
    await expect(readinessBadge).toBeVisible();
    expect((await readinessBadge.innerText()).trim()).not.toBe("");

    const tarrantCard = readinessBadge.locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' bg-card ')][1]",
    );
    await expect(tarrantCard.getByText(tarrant.name, { exact: true })).toBeVisible();
    await expect(tarrantCard).toContainText(`$${balance.toFixed(2)} ·`);
    expect(blockedWrites).toEqual([]);
  });
});
