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

test.use({ trace: "off", screenshot: "off", video: "off" });
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
    const runId = randomUUID();
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
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

      await ownerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      const areaDialog = ownerPage.getByRole("dialog", { name: "Set your local area" });
      if (await areaDialog.isVisible().catch(() => false)) {
        await ownerPage.getByTestId("input-location-area").fill(area);
        await ownerPage.getByTestId("button-save-location").click();
      }
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
    test.setTimeout(120_000);
    const pool = new Pool({ connectionString: databaseURL, max: 3 });
    const runId = randomUUID();
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
      const makePage = async (user: FixtureUser, viewport = { width: 1280, height: 900 }) => {
        const context = await browser.newContext({ viewport });
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
      const buyerPage = await makePage(buyer, { width: 390, height: 844 });
      const outsiderPage = await makePage(outsider);

      const openExchange = async (page: Page) => {
        await page.goto(`${baseURL}/community?tab=exchange`);
        const exchange = page.getByRole("region", { name: "Niakofa Exchange" });
        const queryRoute = await exchange.isVisible().catch(() => false);
        if (!queryRoute) await page.goto(`${baseURL}/community/exchange`);
        await expect(page.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
        return queryRoute;
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
      await setArea(buyerPage);
      await expect(buyerPage.getByText(listingTitle, { exact: true })).toBeVisible();
      expect(await buyerPage.evaluate(() => document.documentElement.clientWidth)).toBe(390);
      await expect(buyerPage.getByTestId("input-search-listings")).toHaveAttribute("type", "search");
      await buyerPage.getByText(listingTitle, { exact: true }).click();
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
      await buyerPage.getByTestId("button-send-pickup-request").click();
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

      await testInfo.attach("exchange-local-lifecycle.txt", {
        body: `listing=${listingId}; pickup=${pickupId}; lifecycle=completed; db=local; api=real; query-route=${queryRouteWorked}`,
        contentType: "text/plain",
      });
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
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
