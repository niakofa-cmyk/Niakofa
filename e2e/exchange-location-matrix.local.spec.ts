import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Pool as PostgresPool } from "pg";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "";
const databaseURL = process.env.DATABASE_URL ?? "";
const emptyState = { cookies: [], origins: [] };
const { Pool } = createRequire(resolve("lib/db/package.json"))("pg") as { Pool: typeof PostgresPool };
type Actor = { id: number; name: string; email: string; community_id: number; token_version: number; token: string };

test.use({ storageState: emptyState, trace: "off", screenshot: "off", video: "off" });

test("local Exchange A/B/C matrix: failed location, composer layout, drafts, pagination and withdrawal", async ({ browser }, testInfo) => {
  test.skip(process.env.RUN_EXCHANGE_LOCAL_E2E !== "1", "Explicit local fixture opt-in required.");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  for (const target of [baseURL, databaseURL]) {
    if (!target || !localHosts.has(new URL(target).hostname.replace(/^\[|\]$/g, ""))) {
      throw new Error("Exchange matrix fixtures require both a local preview and local database.");
    }
  }
  if ((process.env.SESSION_SECRET ?? "").length < 32) throw new Error("Local API-compatible signing configuration is required.");
  test.setTimeout(180_000);
  const pool = new Pool({ connectionString: databaseURL, max: 2 });
  const marker = randomUUID().replace(/[0-9]/g, (digit) => String.fromCharCode(103 + Number(digit)));
  const area = `Matrix area ${marker.slice(0, 8)}`;
  const actorIds: number[] = [];
  const communityIds: number[] = [];
  const contexts: BrowserContext[] = [];
  const keyboard: Record<string, boolean> = {};
  const listingIds: number[] = [];
  const titles: string[] = [];
  try {
    for (const suffix of ["same", "other"]) {
      const result = await pool.query("INSERT INTO communities(name) VALUES($1) RETURNING id", [`Exchange matrix ${marker} ${suffix}`]);
      communityIds.push(Number(result.rows[0].id));
    }
    const actors: Actor[] = [];
    for (const [index, role] of ["A", "B", "C"].entries()) {
      const result = await pool.query(
        `INSERT INTO users(name,email,approval_status,lat,lng,community_id,is_disposable_test_account)
         VALUES($1,$2,'approved',32.7555,-97.3308,$3,true)
         RETURNING id,name,email,community_id,token_version`,
        [`Exchange matrix ${role}`, `exchange-matrix-${marker}-${role.toLowerCase()}@example.invalid`, communityIds[index === 2 ? 1 : 0]],
      );
      actorIds.push(Number(result.rows[0].id));
      actors.push({ ...result.rows[0], token: "" } as Actor);
    }
    const signed = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { tsImport } from "tsx/esm/api";
      import { resolve } from "node:path";
      import { pathToFileURL } from "node:url";
      let raw = "";
      for await (const chunk of process.stdin) raw += chunk;
      const auth = await tsImport("../artifacts/api-server/src/middlewares/auth.ts",
        pathToFileURL(resolve("e2e/exchange-location-matrix.local.spec.ts")).href);
      process.stdout.write(JSON.stringify(JSON.parse(raw).map(u => auth.signTokenById(u.id, u.token_version))));
    `], { input: JSON.stringify(actors), encoding: "utf8", env: process.env })) as string[];
    actors.forEach((actor, index) => { actor.token = signed[index]; });
    const [a, b, c] = actors;
    expect(a.community_id).toBe(b.community_id);
    expect(c.community_id).not.toBe(a.community_id);
    const api = async (actor: Actor, path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${baseURL}/api${path}`, {
        method,
        headers: { Authorization: `Bearer ${actor.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const makePage = async (actor: Actor) => {
      const context = await browser.newContext({
        storageState: emptyState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      });
      contexts.push(context);
      await context.addInitScript(({ token, id, name, email }) => {
        localStorage.setItem("niakofa_token", token);
        localStorage.setItem("niakofa_user", JSON.stringify({ id, name, email, approval_status: "approved", helper_mode_active: false }));
      }, actor);
      return context.newPage();
    };
    const [owner, buyer, outsider] = await Promise.all(actors.map(makePage));
    const checkLayout = async (page: Page) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const dialog = page.getByRole("dialog");
      if (await dialog.isVisible()) {
        expect(await dialog.locator(":scope > div").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    };
    const enterArea = async (page: Page) => {
      await page.goto(`${baseURL}/community?tab=exchange`);
      await expect(page.getByRole("dialog", { name: "Set your local area" })).toBeVisible();
      await expect(page.getByLabel("City or neighborhood", { exact: true })).toBeVisible();
      await page.getByTestId("input-location-area").fill(area);
      await page.getByTestId("button-save-location").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByTestId("button-change-area")).toContainText(area);
    };
    await Promise.all([enterArea(owner), enterArea(buyer), enterArea(outsider)]);

    // A failed server PATCH must not promote an unsaved GPS fix into discovery.
    const previousLocation = await owner.evaluate(() => localStorage.getItem("niakofa_exchange_location"));
    const previousFix = (await pool.query("SELECT lat,lng FROM users WHERE id=$1", [a.id])).rows[0];
    await owner.context().grantPermissions(["geolocation"], { origin: baseURL });
    await owner.context().setGeolocation({ latitude: 34.0522, longitude: -118.2437, accuracy: 100 });
    const locationRoute = `**/api/users/${a.id}/location`;
    let failedSaveRequests = 0;
    await owner.route(locationRoute, async (route) => {
      failedSaveRequests += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable location save" }) });
    });
    await owner.getByTestId("button-change-area").click();
    await owner.getByTestId("button-use-browser-location").click();
    await expect(owner.getByTestId("error-location")).toContainText("Location could not be saved");
    expect(failedSaveRequests).toBe(1);
    await expect(owner.getByRole("dialog", { name: "Set your local area" })).toBeVisible();
    expect(await owner.evaluate(() => localStorage.getItem("niakofa_exchange_location"))).toBe(previousLocation);
    expect((await pool.query("SELECT lat,lng FROM users WHERE id=$1", [a.id])).rows[0]).toEqual(previousFix);
    await owner.keyboard.press("Escape");
    const preservedFeed = owner.waitForRequest((request) => new URL(request.url()).pathname === "/api/community/exchange/listings");
    await owner.reload();
    const preservedQuery = new URL((await preservedFeed).url()).searchParams;
    expect(preservedQuery.get("neighborhood")).toBe(area);
    expect(preservedQuery.has("nearby")).toBe(false);
    await expect(owner.getByTestId("button-change-area")).toContainText(area);
    await owner.unroute(locationRoute);

    // All four combinations are published through the actual mobile composer.
    for (const [index, [intent, resource]] of [
      ["offer", "goods"], ["need", "goods"], ["offer", "services"], ["need", "services"],
    ].entries()) {
      const trigger = owner.getByTestId("button-create-listing");
      await trigger.focus();
      await owner.keyboard.press("Enter");
      const composer = owner.getByRole("dialog", { name: "Post to Exchange" });
      await expect(composer).toBeVisible();
      if (index === 0) {
        keyboard.initialFocusInsideComposer = await composer.evaluate((element) => element.contains(document.activeElement));
        await owner.getByTestId("button-post-next").focus();
        await owner.keyboard.press("Tab");
        keyboard.tabRemainsInsideComposer = await composer.evaluate((element) => element.contains(document.activeElement));
      }
      await checkLayout(owner);
      await owner.getByTestId(`button-post-type-${intent}`).click();
      await owner.getByTestId(`button-post-resource-${resource}`).click();
      await owner.getByTestId("button-post-next").click();
      const title = `Matrix ${intent} ${resource} ${marker}`;
      titles.push(title);
      await owner.getByLabel("Short title", { exact: true }).fill(title);
      await owner.getByLabel("Description", { exact: true }).fill("A free community resource for the disposable local Exchange matrix.");
      await checkLayout(owner);
      await owner.getByTestId("button-post-next").click();
      await owner.getByLabel("Neighborhood or ZIP", { exact: true }).fill(area);
      await owner.getByLabel("Public pickup location type", { exact: true }).selectOption("library");
      await checkLayout(owner);
      const published = owner.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/community/exchange/listings" && response.request().method() === "POST");
      await owner.getByTestId("button-post-next").click();
      const response = await published;
      expect(response.status()).toBe(201);
      const listing = (await response.json()).listing;
      listingIds.push(Number(listing.id));
      expect(listing).toMatchObject({ listing_type: intent, resource_type: resource, status: "active", moderation_status: "approved" });
      await expect(composer).toBeHidden();
    }

    // Exchange listings are approved-member/coarse-area scoped, unlike community-only Sparks.
    for (const actor of [b, c]) {
      const feed = await api(actor, `/community/exchange/listings?neighborhood=${encodeURIComponent(area)}`);
      expect(feed.status).toBe(200);
      expect(feed.body.listings.map((listing: { id: number }) => listing.id).sort()).toEqual([...listingIds].sort());
      const detail = await api(actor, `/community/exchange/listings/${listingIds[0]}`);
      expect(detail.status).toBe(200);
      for (const key of ["latitude", "longitude", "lat", "lng", "seller_email"]) expect(detail.body.listing).not.toHaveProperty(key);
    }
    expect((await api(c, `/community/exchange/listings/${listingIds[0]}`, "PATCH", { title: "Unauthorized edit" })).status).toBe(404);
    await outsider.reload();
    await outsider.getByText(titles[0], { exact: true }).click();
    await expect(outsider.getByTestId("button-withdraw-listing")).toHaveCount(0);
    await checkLayout(outsider);
    await outsider.keyboard.press("Escape");
    await expect(outsider.getByRole("dialog")).toBeHidden();

    // A real tab switch plus the app's focus refresh must not reset an unsent form.
    await buyer.reload();
    await buyer.getByText(titles[0], { exact: true }).click();
    await buyer.getByTestId("input-pickup-note").fill("A draft note for the neighborhood group.");
    await buyer.getByTestId("input-pickup-area").fill(`${area} public library`);
    await buyer.getByTestId("input-pickup-window").fill("Saturday afternoon");
    const awayTab = await buyer.context().newPage();
    await awayTab.goto("about:blank");
    await awayTab.bringToFront();
    await buyer.bringToFront();
    const refreshedDetail = buyer.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/community/exchange/listings/${listingIds[0]}` && response.request().method() === "GET");
    await buyer.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshedDetail;
    await expect(buyer.getByTestId("input-pickup-note")).toHaveValue("A draft note for the neighborhood group.");
    await expect(buyer.getByTestId("input-pickup-area")).toHaveValue(`${area} public library`);
    await expect(buyer.getByTestId("input-pickup-window")).toHaveValue("Saturday afternoon");
    await checkLayout(buyer);
    await awayTab.close();
    const pickupResponse = buyer.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/community/exchange/listings/${listingIds[0]}/pickup-requests`
      && response.request().method() === "POST");
    await buyer.getByTestId("button-send-pickup-request").click();
    const pickup = await pickupResponse;
    expect(pickup.status()).toBe(201);
    const pickupId = Number((await pickup.json()).pickup_request.id);
    const outsidersPickups = await api(c, "/community/exchange/pickup-requests");
    expect(outsidersPickups.body.pickup_requests.some((row: { id: number }) => row.id === pickupId)).toBe(false);
    expect((await api(c, `/community/exchange/pickup-requests/${pickupId}/accept`, "POST")).status).toBe(403);

    // Fixture-only bulk rows exercise real 24-row UI pagination without weakening write limits.
    await pool.query(
      `INSERT INTO exchange_listings(seller_id,listing_type,resource_type,title,description,category,condition,neighborhood,pickup_location_type)
       SELECT $1,'offer','goods',$2 || ' extra ' || n,'A disposable pagination fixture.','other','good',$3,'library'
       FROM generate_series(1,23) n`, [a.id, `Matrix ${marker}`, area]);
    await outsider.reload();
    const cards = outsider.getByTestId("listings-grid").locator(":scope > div");
    await expect(cards).toHaveCount(24);
    await outsider.getByTestId("button-load-more-listings").click();
    await expect(cards).toHaveCount(27);
    const cardIds = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
    expect(new Set(cardIds).size).toBe(27);
    await expect(outsider.getByTestId("button-load-more-listings")).toHaveCount(0);
    await checkLayout(outsider);

    await owner.getByTestId("tab-filter-mine").click();
    await owner.getByText(titles[3], { exact: true }).click();
    let withdrawalWrites = 0;
    owner.on("request", (request) => {
      if (new URL(request.url()).pathname === `/api/community/exchange/listings/${listingIds[3]}/withdraw`) withdrawalWrites += 1;
    });
    owner.once("dialog", async (dialog) => { await dialog.dismiss(); });
    await owner.getByTestId("button-withdraw-listing").click();
    expect(withdrawalWrites).toBe(0);
    expect((await api(a, `/community/exchange/listings/${listingIds[3]}`)).body.listing.status).toBe("active");
    await expect(owner.getByTestId("button-withdraw-listing")).toBeVisible();
    owner.once("dialog", async (dialog) => { await dialog.accept(); });
    await owner.getByTestId("button-withdraw-listing").click();
    await expect(owner.getByTestId("status-exchange-notice")).toContainText("listing was withdrawn");
    expect(withdrawalWrites).toBe(1);
    expect((await api(a, `/community/exchange/listings/${listingIds[3]}`)).body.listing.status).toBe("withdrawn");
    expect((await api(c, `/community/exchange/listings/${listingIds[3]}`)).status).toBe(404);

    await testInfo.attach("exchange-expanded-local-evidence.json", {
      body: JSON.stringify({ target: "local-only", roles: "A/B same assigned community; C different assigned community",
        failedLocationSave: "previous coarse-area query, browser storage and server fix preserved",
        composer: "all four combinations; mobile no-horizontal-overflow",
        pagination: "24 then 27 unique listings", draft: "tab-switch plus focus-refresh retained all unsent fields",
        withdrawal: "cancel left active with zero writes; confirm withdrew", keyboard,
        deviceLimit: "No physical browser backgrounding, VoiceOver or TalkBack certification" }, null, 2),
      contentType: "application/json",
    });
    expect.soft(keyboard.initialFocusInsideComposer, "Opening a modal by keyboard must move focus inside it").toBe(true);
    expect.soft(keyboard.tabRemainsInsideComposer, "Tab must not leave an open aria-modal dialog").toBe(true);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    if (actorIds.length) {
      await pool.query("BEGIN");
      try {
        const rows = await pool.query("SELECT id FROM exchange_listings WHERE seller_id=ANY($1::int[])", [actorIds]);
        const ids = rows.rows.map((row: { id: number }) => Number(row.id));
        await pool.query("DELETE FROM message_notifications WHERE user_id=ANY($1::int[]) OR metadata->>'exchange_listing_id'=ANY($2::text[])", [actorIds, ids.map(String)]);
        await pool.query("DELETE FROM exchange_pickup_requests WHERE listing_id=ANY($1::int[]) OR buyer_id=ANY($2::int[])", [ids, actorIds]);
        await pool.query("DELETE FROM exchange_listings WHERE id=ANY($1::int[])", [ids]);
        await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [actorIds]);
        await pool.query("DELETE FROM communities WHERE id=ANY($1::int[])", [communityIds]);
        await pool.query("COMMIT");
        expect((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=ANY($1::int[])", [actorIds])).rows[0].count).toBe(0);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    } else if (communityIds.length) {
      await pool.query("DELETE FROM communities WHERE id=ANY($1::int[])", [communityIds]);
    }
    await pool.end();
  }
});
