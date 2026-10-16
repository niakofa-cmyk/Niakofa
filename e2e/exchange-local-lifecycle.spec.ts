import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Pool as PostgresPool } from "pg";

const baseURL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "";
const databaseURL = process.env.DATABASE_URL ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function requireLocalTarget(): void {
  if (!baseURL) throw new Error("BASE_URL must identify the local Exchange preview.");
  const preview = new URL(baseURL);
  if (!localHosts.has(preview.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("Refusing Exchange E2E against a non-local preview.");
  }
  if (!databaseURL) throw new Error("DATABASE_URL is required for disposable Exchange fixtures.");
  const databaseHost = new URL(databaseURL).hostname.replace(/^\[|\]$/g, "");
  if (!localHosts.has(databaseHost)) {
    throw new Error("Refusing Exchange fixtures against a non-local database.");
  }
  if (sessionSecret.length < 32) throw new Error("A local API-compatible SESSION_SECRET is required.");
}

const emptyState = { cookies: [], origins: [] };
test.use({ storageState: emptyState, trace: "off", screenshot: "off", video: "off" });
const workspaceRoot = process.cwd();
const dbRequire = createRequire(resolve(workspaceRoot, "lib/db/package.json"));
const { Pool } = dbRequire("pg") as { Pool: typeof PostgresPool };
type FixtureUser = { id: number; name: string; email: string; tokenVersion: number; token?: string };

test.describe("local Exchange UI → API → database pickup lifecycle", () => {
  test("focused: query route → Messages pickup controls → accept → two-party completion", async ({ browser }) => {
    test.skip(process.env.RUN_EXCHANGE_LOCAL_E2E !== "1", "Explicit local fixture opt-in required.");
    requireLocalTarget();
    test.setTimeout(90_000);
    const pool = new Pool({ connectionString: databaseURL, max: 2 });
    const runId = randomUUID().replace(/[0-9]/g, (digit) => String.fromCharCode(103 + Number(digit)));
    const area = `Exchange focus ${runId.slice(0, 8)}`;
    const title = `Focused pickup ${runId}`;
    const fixtureUsers: number[] = [];
    const contexts: BrowserContext[] = [];
    let listingId: number | null = null;
    let pickupId: number | null = null;
    try {
      const createUser = async (role: string): Promise<FixtureUser> => {
        const name = `Focused Exchange ${role}`;
        const email = `exchange-focus-${runId}-${role}@example.invalid`;
        const inserted = await pool.query(
          `INSERT INTO users(name,email,approval_status,lat,lng,neighborhood,city,is_disposable_test_account)
           VALUES($1,$2,'approved',32.7555,-97.3308,$3,'Fort Worth, TX',true)
           RETURNING id,token_version`,
          [name, email, area],
        );
        const row = inserted.rows[0] as { id: number; token_version: number };
        fixtureUsers.push(row.id);
        return { id: row.id, name, email, tokenVersion: row.token_version };
      };
      const [owner, buyer] = await Promise.all([createUser("owner"), createUser("buyer")]);
      const signerCode = `
        import { tsImport } from "tsx/esm/api";
        import { resolve } from "node:path";
        import { pathToFileURL } from "node:url";
        let raw = "";
        for await (const chunk of process.stdin) raw += chunk;
        const auth = await tsImport("../artifacts/api-server/src/middlewares/auth.ts",
          pathToFileURL(resolve(process.cwd(), "e2e/exchange-local-lifecycle.spec.ts")).href);
        process.stdout.write(JSON.stringify(JSON.parse(raw).map((u) => ({
          id: u.id, token: auth.signTokenById(u.id, u.tokenVersion),
        }))));
      `;
      const signed = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", signerCode], {
        cwd: workspaceRoot,
        env: { ...process.env, SESSION_SECRET: sessionSecret },
        input: JSON.stringify([owner, buyer]),
        encoding: "utf8",
      })) as Array<{ id: number; token: string }>;
      for (const user of [owner, buyer]) user.token = signed.find((item) => item.id === user.id)?.token;
      if (!owner.token || !buyer.token) throw new Error("Fixture token signing failed.");

      const makePage = async (user: FixtureUser) => {
        const context = await browser.newContext({ storageState: emptyState, viewport: { width: 1280, height: 900 } });
        contexts.push(context);
        await context.addInitScript(({ token, id, name, email }) => {
          localStorage.setItem("niakofa_token", token);
          localStorage.setItem("niakofa_user", JSON.stringify({
            id, name, email, approval_status: "approved", helper_mode_active: false,
          }));
        }, { token: user.token!, id: user.id, name: user.name, email: user.email });
        return context.newPage();
      };
      const ownerPage = await makePage(owner);
      const buyerPage = await makePage(buyer);
      const enterExchange = async (page: Page, path = "/community/exchange") => {
        await page.goto(`${baseURL}${path}`);
        const areaDialog = page.getByRole("dialog", { name: "Set your local area" });
        const exchange = page.getByRole("region", { name: "Niakofa Exchange" });
        // goto() can finish before the lazy Exchange surface mounts. An
        // immediate isVisible() used to skip the required first-visit dialog.
        await expect(areaDialog.or(exchange).first()).toBeVisible();
        if (await areaDialog.isVisible()) {
          await page.getByTestId("input-location-area").fill(area);
          await expect(page.getByTestId("input-location-area")).toHaveValue(area);
          await page.getByTestId("button-save-location").click();
          await expect(areaDialog).toBeHidden();
        }
        await expect(exchange).toBeVisible();
      };
      const api = async (user: FixtureUser, path: string, body: unknown) => {
        const response = await fetch(`${baseURL}/api${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      };

      // Create only the prerequisite request through the real local API; all
      // route, acceptance, confirmation, and notification checks remain UI/API/DB-backed.
      const createdListing = await api(owner, "/community/exchange/listings", {
        listing_type: "offer",
        resource_type: "goods",
        title,
        description: "A free item for the focused pickup lifecycle check.",
        category: "household",
        condition: "good",
        neighborhood: area,
        pickup_location_type: "library",
        pickup_notes: "Meet by the public library entrance.",
      });
      expect(createdListing.status).toBe(201);
      listingId = createdListing.body.listing.id as number;
      const createdPickup = await api(
        buyer,
        `/community/exchange/listings/${listingId}/pickup-requests`,
        {
          note: "I can use this for a neighborhood group.",
          pickup_area: `${area} public library`,
          pickup_location_type: "library",
          pickup_note: "Meet near the public entrance.",
          proposed_window: "Saturday afternoon",
        },
      );
      expect(createdPickup.status).toBe(201);
      pickupId = createdPickup.body.pickup_request.id as number;

      await enterExchange(ownerPage, "/community?tab=exchange");
      await expect(ownerPage.getByTestId(`pickup-request-${pickupId}`)).toBeVisible({ timeout: 10_000 });
      await ownerPage.getByTestId(`button-open-exchange-messages-${pickupId}`).click();
      await ownerPage.waitForURL(/\/messages\?/);
      const ownerInfo = ownerPage.getByRole("button", { name: "Conversation info" });
      await expect(ownerInfo).toBeVisible();
      await ownerInfo.click();
      await expect(ownerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("requested");
      await ownerPage.getByTestId("button-exchange-accept").click();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("accepted");
      const accepted = await pool.query(
        "SELECT status,buyer_confirmed_at,seller_confirmed_at FROM exchange_pickup_requests WHERE id=$1",
        [pickupId],
      );
      expect(accepted.rows[0]).toMatchObject({
        status: "accepted", buyer_confirmed_at: null, seller_confirmed_at: null,
      });

      await buyerPage.goto(
        `${baseURL}/messages?mode=direct&recipientId=${owner.id}&exchangeListingId=${listingId}&exchangePickupRequestId=${pickupId}`,
      );
      const buyerInfo = buyerPage.getByRole("button", { name: "Conversation info" });
      await expect(buyerInfo).toBeVisible();
      await buyerInfo.click();
      await expect(buyerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await buyerPage.getByTestId("button-exchange-confirm").click();
      await expect(buyerPage.getByRole("status")).toContainText("Waiting for the other participant");
      const firstConfirmation = await pool.query(
        "SELECT status,buyer_confirmed_at,seller_confirmed_at FROM exchange_pickup_requests WHERE id=$1",
        [pickupId],
      );
      expect(firstConfirmation.rows[0].status).toBe("accepted");
      expect(firstConfirmation.rows[0].buyer_confirmed_at ?? firstConfirmation.rows[0].seller_confirmed_at).not.toBeNull();
      expect(firstConfirmation.rows[0].buyer_confirmed_at && firstConfirmation.rows[0].seller_confirmed_at).toBeFalsy();

      const ownerRefresh = ownerPage.waitForResponse((response) =>
        response.url().includes("/api/community/exchange/pickup-requests")
        && response.request().method() === "GET",
      );
      await ownerPage.bringToFront();
      await ownerRefresh;
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("accepted");
      await ownerPage.getByTestId("button-exchange-confirm").click();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("completed");
      await expect(ownerPage.getByRole("status")).toContainText("Both participants confirmed");

      const finalState = await pool.query(
        `SELECT pickup.status,pickup.buyer_confirmed_at,pickup.seller_confirmed_at,
                listing.status AS listing_status
         FROM exchange_pickup_requests pickup
         JOIN exchange_listings listing ON listing.id=pickup.listing_id
         WHERE pickup.id=$1`,
        [pickupId],
      );
      expect(finalState.rows[0]).toMatchObject({ status: "completed", listing_status: "completed" });
      expect(finalState.rows[0].buyer_confirmed_at).not.toBeNull();
      expect(finalState.rows[0].seller_confirmed_at).not.toBeNull();
      const completionNotices = await pool.query(
        `SELECT user_id FROM message_notifications
         WHERE metadata->>'exchange_listing_id'=$1 AND metadata->>'action'='handoff_completed'`,
        [String(listingId)],
      );
      expect(completionNotices.rows).toEqual([{ user_id: buyer.id }]);

      // Private history removal survives reload without erasing the peer's
      // record or the shared two-party completion evidence.
      await enterExchange(buyerPage);
      await expect(buyerPage.getByTestId(`pickup-request-${pickupId}`)).toBeVisible();
      buyerPage.once("dialog", (dialog) => dialog.accept());
      await buyerPage.getByTestId(`button-remove-pickup-history-${pickupId}`).click();
      await expect(buyerPage.getByTestId(`pickup-request-${pickupId}`)).toHaveCount(0);
      await buyerPage.reload();
      await expect(buyerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await expect(buyerPage.getByTestId(`pickup-request-${pickupId}`)).toHaveCount(0);
      await enterExchange(ownerPage);
      await expect(ownerPage.getByTestId(`pickup-request-${pickupId}`)).toBeVisible();
      await ownerPage.getByRole("button", { name: "My posts", exact: true }).click();
      await ownerPage.getByTestId(`card-listing-${listingId}`).getByRole("button").first().click();
      ownerPage.once("dialog", (dialog) => dialog.accept());
      await ownerPage.getByTestId("button-remove-listing-history").click();
      await expect(ownerPage.getByTestId(`card-listing-${listingId}`)).toHaveCount(0);
      await ownerPage.reload();
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await expect(ownerPage.getByTestId(`card-listing-${listingId}`)).toHaveCount(0);
      await expect(ownerPage.getByTestId(`pickup-request-${pickupId}`)).toBeVisible();
      const retainedRecord = await pool.query(
        "SELECT status,buyer_history_removed_at FROM exchange_pickup_requests WHERE id=$1", [pickupId],
      );
      expect(retainedRecord.rows[0].status).toBe("completed");
      expect(retainedRecord.rows[0].buyer_history_removed_at).not.toBeNull();

      const withdrawTitle = `Focused withdraw ${runId}`;
      const withdrawListing = await api(owner, "/community/exchange/listings", {
        listing_type: "offer",
        resource_type: "goods",
        title: withdrawTitle,
        description: "A separate active listing for the owner withdraw control check.",
        category: "household",
        condition: "good",
        neighborhood: area,
        pickup_location_type: "library",
        pickup_notes: "Meet by the public library entrance.",
      });
      expect(withdrawListing.status).toBe(201);
      await ownerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await ownerPage.getByTestId("tab-filter-mine").click();
      await ownerPage.getByText(withdrawTitle, { exact: true }).click();
      await expect(ownerPage.getByTestId("button-withdraw-listing")).toBeVisible();
      ownerPage.once("dialog", async (dialog) => { await dialog.accept(); });
      await ownerPage.getByTestId("button-withdraw-listing").click();
      await expect(ownerPage.getByTestId("status-exchange-notice")).toContainText("listing was withdrawn");
      const withdrawn = await pool.query(
        "SELECT status FROM exchange_listings WHERE id=$1",
        [withdrawListing.body.listing.id],
      );
      expect(withdrawn.rows[0].status).toBe("withdrawn");
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (fixtureUsers.length) {
        await pool.query("BEGIN");
        try {
          const listings = await pool.query(
            "SELECT id FROM exchange_listings WHERE seller_id=ANY($1::int[]) OR title=$2",
            [fixtureUsers, title],
          );
          const listingIds = listings.rows.map((row: { id: number }) => Number(row.id));
          const pickups = listingIds.length
            ? await pool.query(
              "SELECT id FROM exchange_pickup_requests WHERE listing_id=ANY($1::int[]) OR buyer_id=ANY($2::int[])",
              [listingIds, fixtureUsers],
            )
            : { rows: [] as Array<{ id: number }> };
          const pickupIds = pickups.rows.map((row: { id: number }) => row.id);
          if (pickupIds.length) {
            await pool.query("DELETE FROM exchange_pickup_disputes WHERE pickup_request_id=ANY($1::int[])", [pickupIds]);
          }
          await pool.query(
            `DELETE FROM reports WHERE reporter_id=ANY($1::int[]) OR reported_user_id=ANY($1::int[])
             OR reported_exchange_listing_id=ANY($2::int[])`,
            [fixtureUsers, listingIds],
          );
          await pool.query(
            `DELETE FROM message_notifications
             WHERE user_id=ANY($1::int[]) OR metadata->>'exchange_listing_id'=ANY($2::text[])`,
            [fixtureUsers, listingIds.map(String)],
          );
          if (pickupIds.length) {
            await pool.query("DELETE FROM exchange_pickup_requests WHERE id=ANY($1::int[])", [pickupIds]);
          }
          if (listingIds.length) {
            await pool.query("DELETE FROM exchange_listings WHERE id=ANY($1::int[])", [listingIds]);
          }
          await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [fixtureUsers]);
          await pool.query("COMMIT");
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
        }
      }
      await pool.end();
    }
  });

  test("publishes, discovers, requests, accepts, and mutually completes a goods offer", async ({ browser }, testInfo) => {
    test.skip(process.env.RUN_EXCHANGE_LOCAL_E2E !== "1", "Explicit local fixture opt-in required.");
    requireLocalTarget();
    test.setTimeout(180_000);
    const pool = new Pool({ connectionString: databaseURL, max: 3 });
    const runId = randomUUID().replace(/[0-9]/g, (digit) => String.fromCharCode(103 + Number(digit)));
    const area = `Exchange E2E ${runId.slice(0, 8)}`;
    const listingTitle = `E2E shared table ${runId}`;
    const fixtureUsers: number[] = [];
    const contexts: BrowserContext[] = [];
    let listingId: number | null = null;
    let pickupId: number | null = null;
    let queryRouteWorked = false;

    try {
      await pool.query("SELECT 1 FROM exchange_listings LIMIT 0");
      await pool.query("SELECT 1 FROM exchange_pickup_requests LIMIT 0");
      await pool.query("SELECT 1 FROM message_notifications LIMIT 0");

      const createUser = async (role: string): Promise<FixtureUser> => {
        const name = `Disposable Exchange ${role}`;
        const email = `exchange-${runId}-${role}@example.invalid`;
        const result = await pool.query(
          `INSERT INTO users(name,email,approval_status,lat,lng,neighborhood,city,is_disposable_test_account)
           VALUES($1,$2,'approved',32.7555,-97.3308,$3,'Fort Worth, TX',true)
           RETURNING id,token_version`,
          [name, email, area],
        );
        const row = result.rows[0] as { id: number; token_version: number };
        fixtureUsers.push(row.id);
        return {
          id: row.id, name, email, tokenVersion: row.token_version,
        };
      };

      const [owner, buyer, outsider] = await Promise.all([
        createUser("owner"), createUser("buyer"), createUser("outsider"),
      ]);
      const signerCode = `
        import { tsImport } from "tsx/esm/api";
        import { resolve } from "node:path";
        import { pathToFileURL } from "node:url";
        let raw = "";
        for await (const chunk of process.stdin) raw += chunk;
        const auth = await tsImport("../artifacts/api-server/src/middlewares/auth.ts",
          pathToFileURL(resolve(process.cwd(), "e2e/exchange-local-lifecycle.spec.ts")).href);
        const users = JSON.parse(raw);
        process.stdout.write(JSON.stringify(users.map((user) => ({
          id: user.id, token: auth.signTokenById(user.id, user.tokenVersion),
        }))));
      `;
      const signed = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", signerCode], {
        cwd: workspaceRoot,
        env: { ...process.env, SESSION_SECRET: sessionSecret },
        input: JSON.stringify([owner, buyer, outsider]),
        encoding: "utf8",
      })) as Array<{ id: number; token: string }>;
      for (const user of [owner, buyer, outsider]) {
        user.token = signed.find((entry) => entry.id === user.id)?.token;
        if (!user.token) throw new Error("Local auth signer did not return a fixture token.");
      }
      const makePage = async (
        user: FixtureUser,
        viewport = { width: 1280, height: 900 },
        mobile = false,
      ) => {
        const context = await browser.newContext({
          storageState: emptyState,
          viewport,
          ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
        });
        contexts.push(context);
        await context.addInitScript(({ token, id, name, email }) => {
          localStorage.setItem("niakofa_token", token);
          localStorage.setItem("niakofa_user", JSON.stringify({
            id, name, email, approval_status: "approved", helper_mode_active: false,
          }));
        }, { token: user.token, id: user.id, name: user.name, email: user.email });
        return context.newPage();
      };
      const ownerPage = await makePage(owner);
      const buyerPage = await makePage(buyer, { width: 390, height: 844 }, true);
      const outsiderPage = await makePage(outsider);

      const openExchange = async (page: Page) => {
        await page.goto(`${baseURL}/community?tab=exchange`);
        // The initial location dialog correctly hides the background from AT.
        await expect(page.getByRole("region", { name: "Niakofa Exchange", includeHidden: true })).toBeVisible({ timeout: 10_000 });
        return true;
      };
      queryRouteWorked = await openExchange(ownerPage);
      await openExchange(buyerPage);
      await openExchange(outsiderPage);
      expect.soft(
        queryRouteWorked,
        "/community?tab=exchange should open Exchange without falling back to /community/exchange",
      ).toBe(true);

      const setArea = async (page: Page) => {
        const dialog = page.getByRole("dialog", { name: "Set your local area" });
        if (await dialog.isVisible().catch(() => false)) {
          await page.getByTestId("input-location-area").fill(area);
          await page.getByTestId("button-save-location").click();
        }
        await expect(page.getByTestId("button-create-listing")).toBeVisible();
      };
      await setArea(ownerPage);
      await setArea(buyerPage);
      await setArea(outsiderPage);

      // Verify both supported Exchange entry routes render the same screen,
      // and the Spark CTA lands in the Moments composer with its open flag.
      const directExchangeResponse = await ownerPage.goto(`${baseURL}/community/exchange`);
      expect(directExchangeResponse?.status()).toBe(200);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      const legacyExchangeResponse = await ownerPage.goto(`${baseURL}/community?section=exchange`);
      expect(legacyExchangeResponse?.status()).toBe(200);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await setArea(ownerPage);
      const createSparkLink = ownerPage.getByTestId("button-create-exchange-spark-studio");
      await expect(createSparkLink).toHaveAttribute("href", "/community/moments?composer=1");
      await createSparkLink.click();
      await ownerPage.waitForURL(/\/community\/moments\?composer=1$/);
      await ownerPage.goto(`${baseURL}/community/exchange`);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await setArea(ownerPage);

      const savedBuyerArea = await buyerPage.evaluate(() => {
        const saved = localStorage.getItem("niakofa_exchange_location");
        return saved ? JSON.parse(saved) as { label?: string; source?: string } : null;
      });
      expect(savedBuyerArea).toMatchObject({ label: area, source: "area" });

      // Publish through the actual three-step Exchange form.
      await ownerPage.getByTestId("button-create-listing").click();
      await expect(ownerPage.getByRole("dialog", { name: "Post to Exchange" })).toContainText("Step 1 of 3");
      await ownerPage.getByTestId("button-post-type-offer").click();
      await ownerPage.getByTestId("button-post-resource-goods").click();
      await ownerPage.getByTestId("button-post-next").click();
      await ownerPage.getByTestId("input-post-title").fill(listingTitle);
      await ownerPage.getByTestId("input-post-description").fill("A sturdy table offered freely to a nearby neighbor.");
      await ownerPage.getByTestId("select-post-category").selectOption("household");
      await ownerPage.getByTestId("select-post-condition").selectOption("good");
      await ownerPage.getByTestId("button-post-next").click();
      await ownerPage.getByTestId("input-post-neighborhood").fill(area);
      await ownerPage.getByTestId("select-post-pickup-location-type").selectOption("library");
      await ownerPage.getByTestId("input-post-pickup-notes").fill("Meet by the public library entrance.");
      const publishResponsePromise = ownerPage.waitForResponse((response) =>
        response.url().includes("/api/community/exchange/listings")
        && response.request().method() === "POST",
      );
      await ownerPage.getByTestId("button-post-next").click();
      const publishResponse = await publishResponsePromise;
      const published = await publishResponse.json() as { listing?: { id: number; title: string }; error?: string };
      expect(publishResponse.status(), `publish response: ${published.error ?? "no error detail"}`).toBe(201);
      if (!published.listing) throw new Error("Publish API returned no listing.");
      listingId = published.listing.id;
      expect(published.listing.title).toBe(listingTitle);
      await expect(ownerPage.getByRole("dialog", { name: "Post to Exchange" })).toBeHidden();

      const storedListing = await pool.query(
        "SELECT seller_id,listing_type,resource_type,title,status,moderation_status FROM exchange_listings WHERE id=$1",
        [listingId],
      );
      expect(storedListing.rows[0]).toMatchObject({
        seller_id: owner.id, listing_type: "offer", resource_type: "goods",
        title: listingTitle, status: "active", moderation_status: "approved",
      });

      // Separate mobile-width account discovers the real server listing after refresh.
      await buyerPage.reload();
      await openExchange(buyerPage);
      await expect(buyerPage.getByRole("dialog", { name: "Set your local area" })).toBeHidden();
      await setArea(buyerPage);
      await expect(buyerPage.getByText(listingTitle, { exact: true })).toBeVisible();
      const mobileMetrics = await buyerPage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        maxTouchPoints: navigator.maxTouchPoints,
      }));
      expect(mobileMetrics.width).toBe(390);
      expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(mobileMetrics.width);
      expect(mobileMetrics.maxTouchPoints).toBeGreaterThan(0);
      await expect(buyerPage.getByTestId("input-search-listings")).toHaveAttribute("type", "search");
      const waitForListingQuery = (expected: Record<string, string>) => buyerPage.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/community/exchange/listings"
          && Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
      });
      for (const [tab, queryKey, queryValue] of [
        ["goods", "resource_type", "goods"],
        ["services", "resource_type", "services"],
        ["needs", "type", "need"],
        ["mine", "mine", "true"],
      ]) {
        const filteredRequest = waitForListingQuery({ [queryKey]: queryValue });
        await buyerPage.getByTestId(`tab-filter-${tab}`).tap();
        await filteredRequest;
      }
      await buyerPage.getByTestId("tab-filter-all").tap();
      const searchRequest = waitForListingQuery({ q: listingTitle });
      await buyerPage.getByTestId("input-search-listings").fill(listingTitle);
      await searchRequest;
      await expect(buyerPage.getByText(listingTitle, { exact: true })).toBeVisible();
      await buyerPage.getByTestId("input-search-listings").fill("");
      await buyerPage.getByText(listingTitle, { exact: true }).tap();
      await expect(buyerPage.getByRole("dialog")).toBeVisible();
      await expect(buyerPage.getByTestId("input-pickup-area")).toBeVisible();
      await expect(buyerPage.getByTestId("input-pickup-window")).toBeVisible();

      // Prove the draft request form survives the same focus refresh used for polling.
      await buyerPage.getByTestId("input-pickup-note").fill("I can use this for our neighborhood study group.");
      await buyerPage.getByTestId("input-pickup-area").fill(`${area} public library`);
      await buyerPage.getByTestId("input-pickup-window").fill("Saturday afternoon");
      await buyerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(buyerPage.getByTestId("input-pickup-note")).toHaveValue(
        "I can use this for our neighborhood study group.",
      );
      await expect(buyerPage.getByTestId("input-pickup-area")).toHaveValue(`${area} public library`);
      await expect(buyerPage.getByTestId("input-pickup-window")).toHaveValue("Saturday afternoon");
      await buyerPage.getByTestId("button-send-pickup-request").tap();
      await expect(buyerPage.getByTestId("status-exchange-notice")).toBeVisible();

      const pickupRows = await pool.query(
        "SELECT id FROM exchange_pickup_requests WHERE listing_id=$1 AND buyer_id=$2",
        [listingId, buyer.id],
      );
      expect(pickupRows.rowCount).toBe(1);
      pickupId = Number(pickupRows.rows[0].id);

      const authorizedFetch = async (user: FixtureUser, path: string, method: string, body?: unknown) => {
        const response = await fetch(`${baseURL}/api${path}`, {
          method,
          headers: {
          Authorization: `Bearer ${user.token ?? ""}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      };
      const unauthorizedEdit = await authorizedFetch(outsider, `/community/exchange/listings/${listingId}`, "PATCH", {
        title: `intruder-${runId}`,
      });
      expect([403, 404]).toContain(unauthorizedEdit.status);
      const unauthorizedAccept = await authorizedFetch(
        outsider, `/community/exchange/pickup-requests/${pickupId}/accept`, "POST",
      );
      expect([403, 404]).toContain(unauthorizedAccept.status);
      const duplicateRequest = await authorizedFetch(
        buyer, `/community/exchange/listings/${listingId}/pickup-requests`, "POST", {
          note: "Duplicate request should be rejected.",
          pickup_area: `${area} public library`,
          pickup_location_type: "library",
          pickup_note: "Meet by the public entrance.",
          proposed_window: "Saturday afternoon",
        },
      );
      expect(duplicateRequest.status).toBe(409);
      const pickupAfterRejectedWrites = await pool.query(
        "SELECT count(*)::int AS count,status FROM exchange_pickup_requests WHERE listing_id=$1 AND buyer_id=$2 GROUP BY status",
        [listingId, buyer.id],
      );
      expect(pickupAfterRejectedWrites.rows).toEqual([{ count: 1, status: "requested" }]);

      // Owner view refreshes on focus without an explicit reload.
      await ownerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(ownerPage.getByTestId(`pickup-request-${pickupId}`)).toBeVisible({ timeout: 8000 });
      await expect(ownerPage.getByTestId(`status-pickup-${pickupId}`)).toHaveText("requested");
      await ownerPage.getByTestId(`button-open-exchange-messages-${pickupId}`).click();
      await ownerPage.waitForURL(/\/messages\?/);
      const infoButton = ownerPage.getByRole("button", { name: "Conversation info" });
      await expect.soft(
        infoButton,
        "Opening a request's Messages link should select the direct recipient and expose Conversation info",
      ).toBeVisible();
      const infoButtonVisible = await infoButton.isVisible();
      await testInfo.attach("exchange-local-route-observations.txt", {
        body: `query-route=${queryRouteWorked}; owner-messages-info=${infoButtonVisible}; pickup-panel=${await ownerPage.getByTestId("exchange-pickup-context-panel").isVisible().catch(() => false)}`,
        contentType: "text/plain",
      });
      if (!infoButtonVisible) return;
      await infoButton.click();
      await expect(ownerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await ownerPage.getByTestId("button-exchange-accept").click();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("accepted");

      const accepted = await pool.query(
        "SELECT status,buyer_confirmed_at,seller_confirmed_at FROM exchange_pickup_requests WHERE id=$1",
        [pickupId],
      );
      expect(accepted.rows[0].status).toBe("accepted");
      expect(accepted.rows[0].buyer_confirmed_at).toBeNull();
      expect(accepted.rows[0].seller_confirmed_at).toBeNull();

      // Both participants confirm from the actual Messages coordination panel.
      await buyerPage.goto(
        `${baseURL}/messages?mode=direct&recipientId=${owner.id}&exchangeListingId=${listingId}&exchangePickupRequestId=${pickupId}`,
      );
      await expect(buyerPage.getByRole("button", { name: "Conversation info" })).toBeVisible();
      await buyerPage.getByRole("button", { name: "Conversation info" }).click();
      await expect(buyerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await buyerPage.getByTestId("button-exchange-confirm").click();
      await expect(buyerPage.getByTestId("exchange-pickup-status")).toHaveText("accepted");
      await expect(buyerPage.getByRole("status")).toContainText("Waiting for the other participant");
      const firstConfirmation = await pool.query(
        "SELECT buyer_confirmed_at,seller_confirmed_at,status FROM exchange_pickup_requests WHERE id=$1",
        [pickupId],
      );
      expect(firstConfirmation.rows[0].status).toBe("accepted");
      expect(firstConfirmation.rows[0].buyer_confirmed_at ?? firstConfirmation.rows[0].seller_confirmed_at).not.toBeNull();
      expect(firstConfirmation.rows[0].buyer_confirmed_at && firstConfirmation.rows[0].seller_confirmed_at).toBeFalsy();

      await ownerPage.goto(
        `${baseURL}/messages?mode=direct&recipientId=${buyer.id}&exchangeListingId=${listingId}&exchangePickupRequestId=${pickupId}`,
      );
      await expect(ownerPage.getByRole("button", { name: "Conversation info" })).toBeVisible();
      await ownerPage.getByRole("button", { name: "Conversation info" }).click();
      await expect(ownerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await ownerPage.getByTestId("button-exchange-confirm").click();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("completed");
      await expect(ownerPage.getByRole("status")).toContainText("Both participants confirmed");

      const completed = await pool.query(
        `SELECT pickup.status,pickup.buyer_confirmed_at,pickup.seller_confirmed_at,
                listing.status AS listing_status
         FROM exchange_pickup_requests pickup
         JOIN exchange_listings listing ON listing.id=pickup.listing_id
         WHERE pickup.id=$1`,
        [pickupId],
      );
      expect(completed.rows[0]).toMatchObject({ status: "completed", listing_status: "completed" });
      expect(completed.rows[0].buyer_confirmed_at).not.toBeNull();
      expect(completed.rows[0].seller_confirmed_at).not.toBeNull();

      const notices = await pool.query(
        `SELECT user_id,metadata->>'action' AS action
         FROM message_notifications
         WHERE metadata->>'exchange_listing_id'=$1`,
        [String(listingId)],
      );
      const noticeActions = notices.rows.map((row: { user_id: number; action: string }) => row.action);
      expect(noticeActions).toContain("request_created");
      expect(noticeActions).toContain("request_accepted");
      expect(noticeActions.filter((action: string) => action === "handoff_completed")).toHaveLength(1);
      expect(new Set(notices.rows.map((row: { user_id: number }) => row.user_id))).toEqual(
        new Set([owner.id, buyer.id]),
      );

      // Exercise browser location permission on the touch-enabled mobile account
      // with a synthetic coordinate, then verify only a coarse label is saved
      // in browser storage while the authenticated API receives the fix.
      await buyerPage.context().grantPermissions(["geolocation"], { origin: baseURL });
      await buyerPage.context().setGeolocation({
        latitude: 32.7555,
        longitude: -97.3308,
        accuracy: 100,
      });
      await buyerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(buyerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await buyerPage.getByTestId("button-change-area").tap();
      const buyerLocationDialog = buyerPage.getByRole("dialog", { name: "Set your local area" });
      await expect(buyerLocationDialog).toBeVisible();
      const locationSaveResponse = buyerPage.waitForResponse((response) =>
        response.url().includes(`/api/users/${buyer.id}/location`)
        && response.request().method() === "PATCH",
      );
      await buyerPage.getByTestId("button-use-browser-location").tap();
      expect((await locationSaveResponse).status()).toBe(200);
      await expect(buyerLocationDialog).toBeHidden();
      const coarseBrowserLocation = await buyerPage.evaluate(() => {
        const saved = localStorage.getItem("niakofa_exchange_location");
        return saved ? JSON.parse(saved) as Record<string, unknown> : null;
      });
      expect(coarseBrowserLocation).toEqual({
        label: "Nearby area",
        city: "Nearby community",
        source: "browser",
      });
      const buyerLocationRow = await pool.query(
        "SELECT lat,lng,location_updated_at FROM users WHERE id=$1",
        [buyer.id],
      );
      expect(Number(buyerLocationRow.rows[0].lat)).toBeCloseTo(32.7555, 4);
      expect(Number(buyerLocationRow.rows[0].lng)).toBeCloseTo(-97.3308, 4);
      expect(buyerLocationRow.rows[0].location_updated_at).not.toBeNull();
      await buyerPage.reload();
      await openExchange(buyerPage);
      await expect(buyerPage.getByRole("dialog", { name: "Set your local area" })).toBeHidden();
      await expect(buyerPage.getByTestId("button-change-area")).toContainText("Nearby area");

      // Account C denies geolocation. The error must keep the manual fallback
      // available and must not send a location mutation to the API.
      await outsiderPage.context().grantPermissions([], { origin: baseURL });
      await outsiderPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(outsiderPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await outsiderPage.getByTestId("button-change-area").click();
      const outsiderLocationDialog = outsiderPage.getByRole("dialog", { name: "Set your local area" });
      await expect(outsiderLocationDialog).toBeVisible();
      let deniedLocationWrites = 0;
      outsiderPage.on("request", (request) => {
        if (request.url().includes(`/api/users/${outsider.id}/location`)
          && request.method() === "PATCH") deniedLocationWrites += 1;
      });
      await outsiderPage.getByTestId("button-use-browser-location").click();
      await expect(outsiderPage.getByTestId("error-location")).toContainText(
        "Location access was not granted. Nothing was shared",
      );
      await expect(outsiderPage.getByTestId("input-location-area")).toBeVisible();
      expect(deniedLocationWrites).toBe(0);
      const preservedManualArea = await outsiderPage.evaluate(() => {
        const saved = localStorage.getItem("niakofa_exchange_location");
        return saved ? JSON.parse(saved) as { label?: string; source?: string } : null;
      });
      expect(preservedManualArea).toMatchObject({ label: area, source: "area" });

      // Exercise owner edit and renew controls, followed by the report control
      // and its duplicate-report response through the real browser/API paths.
      const maintenanceTitle = `E2E maintenance ${runId}`;
      const maintenanceListing = await authorizedFetch(owner, "/community/exchange/listings", "POST", {
        listing_type: "offer",
        resource_type: "goods",
        title: maintenanceTitle,
        description: "A separate listing for owner edit and renewal checks.",
        category: "household",
        condition: "good",
        neighborhood: area,
        pickup_location_type: "library",
        pickup_notes: "Meet by the public library entrance.",
      });
      expect(maintenanceListing.status).toBe(201);
      const maintenanceListingId = Number(maintenanceListing.body.listing.id);
      const editedTitle = `${maintenanceTitle} revised`;

      await openExchange(ownerPage);
      await ownerPage.getByTestId("tab-filter-mine").click();
      await ownerPage.getByTestId(`button-edit-listing-${maintenanceListingId}`).click();
      await expect(ownerPage.getByRole("dialog", { name: "Edit Exchange post" })).toBeVisible();
      await ownerPage.getByTestId("input-edit-title").fill(editedTitle);
      const editResponsePromise = ownerPage.waitForResponse((response) =>
        response.url().includes(`/api/community/exchange/listings/${maintenanceListingId}`)
        && response.request().method() === "PATCH",
      );
      await ownerPage.getByTestId("button-save-edit-listing").click();
      expect((await editResponsePromise).status()).toBe(200);
      await expect(ownerPage.getByText(editedTitle, { exact: true })).toBeVisible();

      await pool.query(
        "UPDATE exchange_listings SET status='archived', archived_at=NOW(), archive_reason='expired' WHERE id=$1",
        [maintenanceListingId],
      );
      await openExchange(ownerPage);
      await ownerPage.getByTestId("tab-filter-mine").click();
      const renewButton = ownerPage.getByTestId(`button-renew-listing-${maintenanceListingId}`);
      await expect(renewButton).toBeVisible();
      const renewResponsePromise = ownerPage.waitForResponse((response) =>
        response.url().includes(`/api/community/exchange/listings/${maintenanceListingId}/renew`)
        && response.request().method() === "POST",
      );
      await renewButton.click();
      expect((await renewResponsePromise).status()).toBe(200);
      await expect(ownerPage.getByTestId(`button-edit-listing-${maintenanceListingId}`)).toBeVisible();

      await openExchange(outsiderPage);
      await outsiderPage.getByTestId("input-search-listings").fill(editedTitle);
      await expect(outsiderPage.getByText(editedTitle, { exact: true })).toBeVisible();
      await outsiderPage.getByText(editedTitle, { exact: true }).click();
      await outsiderPage.getByTestId("button-report-listing").click();
      await expect(outsiderPage.getByRole("dialog", { name: "Report a safety concern" })).toBeVisible();
      await outsiderPage.getByTestId("select-report-type").selectOption("spam");
      await outsiderPage.getByTestId("input-report-description").fill(
        "This synthetic test listing is being reported to verify the safety flow.",
      );
      const reportResponsePromise = outsiderPage.waitForResponse((response) =>
        response.url().includes(`/api/community/exchange/listings/${maintenanceListingId}/report`)
        && response.request().method() === "POST",
      );
      await outsiderPage.getByTestId("button-submit-report").click();
      const reportResponse = await reportResponsePromise;
      expect(reportResponse.status()).toBe(201);
      const reportRow = await pool.query(
        "SELECT reporter_id,type,reported_exchange_listing_id FROM reports WHERE reporter_id=$1 AND reported_exchange_listing_id=$2",
        [outsider.id, maintenanceListingId],
      );
      expect(reportRow.rows).toEqual([{
        reporter_id: outsider.id,
        type: "spam",
        reported_exchange_listing_id: maintenanceListingId,
      }]);
      expect((await authorizedFetch(
        outsider,
        `/community/exchange/listings/${maintenanceListingId}/report`,
        "POST",
        { type: "spam", description: "Duplicate synthetic report for conflict verification." },
      )).status).toBe(409);

      const createActionListing = async (title: string) => {
        const response = await authorizedFetch(owner, "/community/exchange/listings", "POST", {
          listing_type: "offer",
          resource_type: "goods",
          title,
          description: "A separate listing for a pickup action check.",
          category: "household",
          condition: "good",
          neighborhood: area,
          pickup_location_type: "library",
          pickup_notes: "Meet by the public library entrance.",
        });
        expect(response.status).toBe(201);
        return Number(response.body.listing.id);
      };
      const createActionPickup = async (actionListingId: number, requester: FixtureUser) => {
        const response = await authorizedFetch(
          requester,
          `/community/exchange/listings/${actionListingId}/pickup-requests`,
          "POST",
          {
            note: "I can use this for a neighborhood group.",
            pickup_area: `${area} public library`,
            pickup_location_type: "library",
            pickup_note: "Meet near the public entrance.",
            proposed_window: "Saturday afternoon",
          },
        );
        expect(response.status).toBe(201);
        return Number(response.body.pickup_request.id);
      };

      const declineTitle = `E2E decline ${runId}`;
      const declineListingId = await createActionListing(declineTitle);
      const declinePickupId = await createActionPickup(declineListingId, outsider);
      await openExchange(ownerPage);
      await ownerPage.getByTestId(`button-open-exchange-messages-${declinePickupId}`).click();
      await ownerPage.waitForURL(/\/messages\?/);
      await ownerPage.getByRole("button", { name: "Conversation info" }).click();
      await expect(ownerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("requested");
      await ownerPage.getByTestId("button-exchange-decline").click();
      await expect(ownerPage.getByTestId("exchange-pickup-status")).toHaveText("declined");
      expect((await pool.query(
        "SELECT status FROM exchange_pickup_requests WHERE id=$1",
        [declinePickupId],
      )).rows[0].status).toBe("declined");
      const openDeclinedPostLink = ownerPage.getByTestId("link-exchange-pickup");
      await expect(openDeclinedPostLink).toHaveAttribute(
        "href",
        `/community?tab=exchange&listingId=${declineListingId}&pickupRequestId=${declinePickupId}`,
      );
      await openDeclinedPostLink.click();
      await ownerPage.waitForURL(/\/community\?tab=exchange/);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      await expect(ownerPage.getByRole("dialog", { name: declineTitle })).toBeVisible();

      const cancelListingId = await createActionListing(`E2E cancel ${runId}`);
      const cancelPickupId = await createActionPickup(cancelListingId, buyer);
      await buyerPage.goto(
        `${baseURL}/messages?mode=direct&recipientId=${owner.id}&exchangeListingId=${cancelListingId}&exchangePickupRequestId=${cancelPickupId}`,
      );
      await buyerPage.getByRole("button", { name: "Conversation info" }).click();
      await expect(buyerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await expect(buyerPage.getByTestId("exchange-pickup-status")).toHaveText("requested");
      await buyerPage.getByTestId("button-exchange-cancel").click();
      await expect(buyerPage.getByTestId("exchange-pickup-status")).toHaveText("cancelled");
      expect((await pool.query(
        "SELECT status FROM exchange_pickup_requests WHERE id=$1",
        [cancelPickupId],
      )).rows[0].status).toBe("cancelled");

      const disputeListingId = await createActionListing(`E2E dispute ${runId}`);
      const disputePickupId = await createActionPickup(disputeListingId, buyer);
      expect((await authorizedFetch(
        owner,
        `/community/exchange/pickup-requests/${disputePickupId}/accept`,
        "POST",
      )).status).toBe(200);
      await buyerPage.goto(
        `${baseURL}/messages?mode=direct&recipientId=${owner.id}&exchangeListingId=${disputeListingId}&exchangePickupRequestId=${disputePickupId}`,
      );
      await buyerPage.getByRole("button", { name: "Conversation info" }).click();
      await expect(buyerPage.getByTestId("exchange-pickup-context-panel")).toBeVisible();
      await expect(buyerPage.getByTestId("exchange-pickup-status")).toHaveText("accepted");
      await buyerPage.getByTestId("button-exchange-open-dispute").click();
      await buyerPage.getByTestId("input-exchange-dispute-reason").fill(
        "The pickup arrangement changed and needs a safety review.",
      );
      const disputeResponsePromise = buyerPage.waitForResponse((response) =>
        response.url().includes(`/api/community/exchange/pickup-requests/${disputePickupId}/dispute`)
        && response.request().method() === "POST",
      );
      await buyerPage.getByRole("button", { name: "Send dispute" }).click();
      expect((await disputeResponsePromise).status()).toBe(201);
      await expect(buyerPage.getByTestId("exchange-pickup-status")).toHaveText("disputed");
      expect((await pool.query(
        "SELECT status FROM exchange_pickup_requests WHERE id=$1",
        [disputePickupId],
      )).rows[0].status).toBe("disputed");

      await testInfo.attach("exchange-local-lifecycle.txt", {
        body: `listing=${listingId}; pickup=${pickupId}; lifecycle=completed; links=exchange-entry+studio+messages-open-post; filters=goods+services+needs+mine+search; owner=edit+renew+withdraw; report=created+duplicate-rejected; messages=decline+cancel+dispute; location=manual-persisted+browser-granted+browser-denied; db=local; api=real; query-route=${queryRouteWorked}`,
        contentType: "text/plain",
      });
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (fixtureUsers.length) {
        await pool.query("BEGIN");
        try {
          const listings = await pool.query(
            "SELECT id FROM exchange_listings WHERE seller_id=ANY($1::int[]) OR title LIKE $2",
            [fixtureUsers, `%${runId}%`],
          );
          const listingIds = listings.rows.map((row: { id: number }) => String(row.id));
          const pickups = listingIds.length
            ? await pool.query(
              "SELECT id FROM exchange_pickup_requests WHERE listing_id=ANY($1::int[]) OR buyer_id=ANY($2::int[])",
              [listingIds.map(Number), fixtureUsers],
            )
            : { rows: [] as Array<{ id: number }> };
          const pickupIds = pickups.rows.map((row: { id: number }) => row.id);
          if (pickupIds.length) {
            await pool.query("DELETE FROM exchange_pickup_disputes WHERE pickup_request_id=ANY($1::int[])", [pickupIds]);
          }
          await pool.query(
            `DELETE FROM reports WHERE reporter_id=ANY($1::int[]) OR reported_user_id=ANY($1::int[])
             OR reported_exchange_listing_id=ANY($2::int[])`,
            [fixtureUsers, listingIds.map(Number)],
          );
          await pool.query(
            `DELETE FROM message_notifications
             WHERE user_id=ANY($1::int[]) OR metadata->>'exchange_listing_id'=ANY($2::text[])`,
            [fixtureUsers, listingIds],
          );
          if (pickupIds.length) {
            await pool.query("DELETE FROM exchange_pickup_requests WHERE id=ANY($1::int[])", [pickupIds]);
          }
          if (listingIds.length) {
            await pool.query("DELETE FROM exchange_listings WHERE id=ANY($1::int[])", [listingIds.map(Number)]);
          }
          await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [fixtureUsers]);
          await pool.query("COMMIT");
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
        }
      }
      await pool.end();
    }
  });
});
