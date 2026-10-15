import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

type FixtureUser = {
  id: number;
  name: string;
  email: string;
  token: string;
};

type FixtureListing = {
  id: number;
  seller_id: number;
  listing_type: "offer";
  resource_type: "goods";
  title: string;
  description: string;
  category: "household";
  condition: "good";
  neighborhood: string;
  pickup_location_type: "library";
  pickup_notes: string;
  status: "active";
  moderation_status: "approved";
  created_at: string;
  updated_at: string;
};

type FixtureAsset = {
  id: number;
  sparkId: number;
  ownerUserId: number;
  mimeType: string;
  byteSize: number;
  status: "pending" | "ready";
  storagePath: string | null;
};

type FixtureSpark = {
  id: number;
  listingId: number;
  authorUserId: number;
  caption: string | null;
  status: "draft" | "published";
  assetId: number | null;
};

type ApiCall = {
  userId: number;
  method: string;
  path: string;
  bodyBytes: number;
  contentLength: string | null;
};

async function fulfillJson(
  route: Route,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
) {
  await route.fulfill({
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
    body: JSON.stringify(payload),
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test.describe("Exchange Spark Studio browser publishing (local fixture)", () => {
  test("owner publishes a listing-linked video in Studio and an approved neighbor plays it", async ({ browser }, testInfo) => {
    const target = new URL(baseURL);
    test.skip(
      !localHosts.has(target.hostname.replace(/^\[|\]$/g, ""))
        || process.env.RUN_EXCHANGE_STUDIO_BROWSER_E2E !== "1",
      "Requires explicit opt-in and a loopback-only app preview; all API state is disposable and fixture-backed.",
    );
    test.setTimeout(120_000);

    const runId = randomUUID();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-exchange-studio-browser-"));
    const videoPath = path.join(tempDir, "disposable-neighborhood-video.mp4");
    const uploadPath = path.join(tempDir, "uploaded-spark-video.mp4");
    const listingId = 930001;
    const sparkId = 930002;
    const assetId = 930003;
    const neighborhood = `Studio test ${runId.slice(0, 8)}`;
    const caption = `Studio browser fixture ${runId}`;
    const owner: FixtureUser = {
      id: 930011,
      name: "Disposable Spark owner",
      email: `spark-owner-${runId}@example.invalid`,
      token: `local-fixture-owner-${runId}`,
    };
    const viewer: FixtureUser = {
      id: 930012,
      name: "Disposable Spark neighbor",
      email: `spark-viewer-${runId}@example.invalid`,
      token: `local-fixture-viewer-${runId}`,
    };
    const usersByToken = new Map([[owner.token, owner], [viewer.token, viewer]]);
    let syntheticVideoBytes = Buffer.alloc(0);
    const listing: FixtureListing = {
      id: listingId,
      seller_id: owner.id,
      listing_type: "offer",
      resource_type: "goods",
      title: `Free neighborhood table ${runId}`,
      description: "A disposable active listing for the Studio browser journey.",
      category: "household",
      condition: "good",
      neighborhood,
      pickup_location_type: "library",
      pickup_notes: "Meet by the public library entrance.",
      status: "active",
      moderation_status: "approved",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const fixture = {
      listings: new Map([[listing.id, listing]]),
      sparks: new Map<number, FixtureSpark>(),
      assets: new Map<number, FixtureAsset>(),
      calls: [] as ApiCall[],
      viewerPlaybackGrants: new Set<number>(),
      uploadedBytes: 0,
      uploadRequests: 0,
    };
    const contexts: BrowserContext[] = [];
    let binaryUploadServer: ReturnType<typeof createServer> | null = null;
    let binaryUploadUrl = "";

    const installBrowserFixture = async (context: BrowserContext, user: FixtureUser) => {
      contexts.push(context);
      await context.addInitScript(({ token, id, name, email, neighborhood }) => {
        localStorage.setItem("niakofa_token", token);
        localStorage.setItem("niakofa_user", JSON.stringify({
          id,
          name,
          email,
          approval_status: "approved",
          helper_mode_active: false,
          is_admin: false,
          community_id: null,
          neighborhood,
          is_disposable_test_account: true,
        }));
        localStorage.setItem("niakofa_exchange_location", JSON.stringify({
          label: neighborhood,
          source: "area",
        }));
      }, { token: user.token, id: user.id, name: user.name, email: user.email, neighborhood });

      await context.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== target.origin) {
          await route.abort("blockedbyclient");
          return;
        }
        const pathname = url.pathname;
        const method = request.method().toUpperCase();
        const authorization = request.headers().authorization ?? "";
        const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
        const actor = usersByToken.get(token);
        const bodyBuffer = request.postDataBuffer();
        const bodyBytes = bodyBuffer?.byteLength ?? 0;
        if (pathname === `/api/media-assets/${assetId}/play` && method === "GET") {
          const cookie = request.headers().cookie ?? "";
          const asset = fixture.assets.get(assetId);
          if (!asset?.storagePath || !cookie.includes(`spark-fixture-grant=${user.id}`)) {
            await fulfillJson(route, 404, { error: "Spark video not found." });
            return;
          }
          const bytes = await readFile(asset.storagePath).catch(() => null);
          if (!bytes) {
            await fulfillJson(route, 404, { error: "Spark video not found." });
            return;
          }
          const range = request.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
          if (range) {
            const start = Number(range[1]);
            const end = Math.min(range[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
            if (start > end || start >= bytes.length) {
              await route.fulfill({
                status: 416,
                headers: { "content-range": `bytes */${bytes.length}` },
                body: "",
              });
              return;
            }
            const chunk = bytes.subarray(start, end + 1);
            await route.fulfill({
              status: 206,
              headers: {
                "content-type": "video/mp4",
                "accept-ranges": "bytes",
                "content-range": `bytes ${start}-${end}/${bytes.length}`,
                "content-length": String(chunk.length),
              },
              body: chunk,
            });
            return;
          }
          await route.fulfill({
            status: 200,
            headers: {
              "content-type": "video/mp4",
              "accept-ranges": "bytes",
              "content-length": String(bytes.length),
            },
            body: bytes,
          });
          return;
        }

        if (!actor) {
          await fulfillJson(route, 401, { error: "A disposable approved fixture is required." });
          return;
        }
        fixture.calls.push({
          userId: actor.id,
          method,
          path: `${pathname}${url.search}`,
          bodyBytes,
          contentLength: request.headers()["content-length"] ?? null,
        });

        if (method === "GET" && pathname === `/api/users/${actor.id}`) {
          await fulfillJson(route, 200, {
            id: actor.id,
            name: actor.name,
            email: actor.email,
            approval_status: "approved",
            helper_mode_active: false,
            is_admin: false,
            is_suspended: false,
            community_id: null,
            neighborhood,
            lat: 32.7555,
            lng: -97.3308,
            avatar_url: null,
          });
          return;
        }
        if (method === "GET" && pathname === "/api/community/my-hub") {
          await fulfillJson(route, 200, { hub_id: null });
          return;
        }
        if (method === "GET" && pathname === "/api/community/stories") {
          await fulfillJson(route, 200, { stories: [], next_cursor: null, viewer_user_id: actor.id });
          return;
        }
        if (method === "GET" && pathname === "/api/community/exchange/listings") {
          await fulfillJson(route, 200, { listings: [...fixture.listings.values()], next_cursor: null });
          return;
        }
        if (method === "GET" && pathname === "/api/community/exchange/sparks") {
          const published = [...fixture.sparks.values()].find((spark) => spark.status === "published");
          const publishedAsset = published?.assetId ? fixture.assets.get(published.assetId) : undefined;
          const sparks = published && publishedAsset?.status === "ready"
            ? [{
              id: published.id,
              spark_id: published.id,
              listing_id: published.listingId,
              caption: published.caption,
              created_at: new Date().toISOString(),
              expires_at: null,
              durable: true,
              media_asset_id: publishedAsset.id,
              media_url: `/api/media-assets/${publishedAsset.id}`,
              thumbnail_url: null,
              neighborhood,
              author_name: owner.name,
              author_avatar_url: null,
            }]
            : [];
          await fulfillJson(route, 200, { sparks, next_cursor: null });
          return;
        }
        if (method === "GET" && pathname === "/api/community/exchange/sparks/drafts") {
          const drafts = [...fixture.sparks.values()]
            .filter((spark) => spark.authorUserId === actor.id && spark.status === "draft")
            .map((spark) => ({
              spark_id: spark.id,
              listing_id: spark.listingId,
              status: spark.status,
              caption: spark.caption,
              media_assets: spark.assetId && fixture.assets.has(spark.assetId)
                ? [{
                  media_asset_id: spark.assetId,
                  media_type: "video",
                  mime_type: "video/mp4",
                  byte_size: fixture.assets.get(spark.assetId)!.byteSize,
                  status: fixture.assets.get(spark.assetId)!.status,
                  variant_ready: fixture.assets.get(spark.assetId)!.status === "ready",
                }]
                : [],
            }));
          await fulfillJson(route, 200, { drafts });
          return;
        }
        const createDraftMatch = pathname.match(/^\/api\/community\/exchange\/listings\/(\d+)\/sparks\/drafts$/);
        if (method === "POST" && createDraftMatch) {
          if (actor.id !== owner.id || Number(createDraftMatch[1]) !== listing.id
            || !fixture.listings.has(listing.id)) {
            await fulfillJson(route, 404, { error: "An active approved listing you own is required." });
            return;
          }
          const body = JSON.parse(request.postData() || "{}") as { caption?: string };
          const spark: FixtureSpark = {
            id: sparkId,
            listingId: listing.id,
            authorUserId: owner.id,
            caption: body.caption?.trim() || null,
            status: "draft",
            assetId: null,
          };
          fixture.sparks.set(spark.id, spark);
          await fulfillJson(route, 201, {
            spark_id: spark.id,
            status: "draft",
            upload_context: { contextKind: "exchange_spark", contextId: spark.id },
          });
          return;
        }
        const draftMatch = pathname.match(/^\/api\/community\/exchange\/sparks\/drafts\/(\d+)$/);
        if (draftMatch) {
          const spark = fixture.sparks.get(Number(draftMatch[1]));
          if (!spark || spark.authorUserId !== actor.id || spark.status !== "draft") {
            await fulfillJson(route, 404, { error: "Spark draft not found." });
            return;
          }
          if (method === "PATCH") {
            const body = JSON.parse(request.postData() || "{}") as { caption?: string };
            spark.caption = body.caption?.trim() || null;
            await fulfillJson(route, 200, { spark_id: spark.id, caption: spark.caption });
            return;
          }
          if (method === "GET") {
            const asset = spark.assetId ? fixture.assets.get(spark.assetId) : undefined;
            await fulfillJson(route, 200, {
              spark_id: spark.id,
              status: spark.status,
              listing_id: spark.listingId,
              caption: spark.caption,
              media_assets: asset
                ? [{
                  media_asset_id: asset.id,
                  media_type: "video",
                  mime_type: asset.mimeType,
                  byte_size: asset.byteSize,
                  status: asset.status,
                  variant_ready: asset.status === "ready",
                }]
                : [],
            });
            return;
          }
        }
        if (method === "POST" && pathname === "/api/media-assets/uploads") {
          const body = JSON.parse(request.postData() || "{}") as {
            contextKind?: string;
            contextId?: number;
            mediaType?: string;
            mimeType?: string;
            byteSize?: number;
          };
          const spark = fixture.sparks.get(sparkId);
          if (actor.id !== owner.id || body.contextKind !== "exchange_spark"
            || body.contextId !== spark?.id || body.mediaType !== "video"
            || body.mimeType !== "video/mp4" || body.byteSize !== syntheticVideoBytes.byteLength || !spark) {
            await fulfillJson(route, 400, { error: "The Spark upload context is invalid." });
            return;
          }
          fixture.assets.set(assetId, {
            id: assetId,
            sparkId,
            ownerUserId: owner.id,
            mimeType: "video/mp4",
            byteSize: body.byteSize ?? 0,
            status: "pending",
            storagePath: null,
          });
          spark.assetId = assetId;
          await fulfillJson(route, 201, {
            media_asset_id: assetId,
            upload: {
              method: "PUT",
              url: binaryUploadUrl,
              headers: { "Content-Type": "video/mp4" },
              expires_in_seconds: null,
            },
            complete_url: `/api/media-assets/${assetId}/complete`,
          });
          return;
        }
        const assetMatch = pathname.match(/^\/api\/media-assets\/(\d+)(?:\/(upload|complete|playback-grant))?$/);
        if (assetMatch && Number(assetMatch[1]) === assetId) {
          const asset = fixture.assets.get(assetId);
          if (!asset || asset.ownerUserId !== owner.id
            && !(actor.id === viewer.id && fixture.sparks.get(sparkId)?.status === "published")) {
            await fulfillJson(route, 404, { error: "Spark video not found." });
            return;
          }
          if (method === "PUT" && assetMatch[2] === "upload") {
            await fulfillJson(route, 400, { error: "The binary fixture must arrive through its loopback upload endpoint." });
            return;
          }
          if (method === "POST" && assetMatch[2] === "complete" && actor.id === owner.id) {
            if (!asset.storagePath || !(await fileExists(asset.storagePath))) {
              await fulfillJson(route, 409, { error: "The uploaded video is missing." });
              return;
            }
            asset.status = "ready";
            await fulfillJson(route, 200, { media_asset_id: asset.id, status: "ready" });
            return;
          }
          if (method === "POST" && assetMatch[2] === "playback-grant"
            && fixture.sparks.get(sparkId)?.status === "published" && asset.status === "ready") {
            fixture.viewerPlaybackGrants.add(actor.id);
            await context.addCookies([{
              name: "spark-fixture-grant",
              value: String(actor.id),
              domain: target.hostname,
              path: `/api/media-assets/${asset.id}`,
              httpOnly: true,
              sameSite: "Lax",
            }]);
            await fulfillJson(route, 200, {
              playback_url: `/api/media-assets/${asset.id}/play`,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            }, {
              "set-cookie": `spark-fixture-grant=${actor.id}; Path=/api/media-assets/${asset.id}; HttpOnly; SameSite=Lax; Max-Age=60`,
              "cache-control": "private, no-store",
            });
            return;
          }
        }
        const publishMatch = pathname.match(/^\/api\/community\/exchange\/sparks\/drafts\/(\d+)\/publish$/);
        if (method === "POST" && publishMatch) {
          const spark = fixture.sparks.get(Number(publishMatch[1]));
          const asset = spark?.assetId ? fixture.assets.get(spark.assetId) : undefined;
          if (actor.id !== owner.id || !spark || !asset || asset.status !== "ready"
            || !fixture.listings.has(spark.listingId)) {
            await fulfillJson(route, 409, { error: "A ready video and eligible listing are required." });
            return;
          }
          const body = JSON.parse(request.postData() || "{}") as { caption?: string };
          spark.caption = body.caption?.trim() || spark.caption;
          spark.status = "published";
          await fulfillJson(route, 201, {
            spark_id: spark.id,
            status: "published",
            media_asset_id: asset.id,
          });
          return;
        }
        const deleteMatch = pathname.match(/^\/api\/community\/exchange\/sparks\/(\d+)$/);
        if (method === "DELETE" && deleteMatch) {
          const spark = fixture.sparks.get(Number(deleteMatch[1]));
          if (actor.id !== owner.id || !spark || spark.authorUserId !== actor.id) {
            await fulfillJson(route, 404, { error: "Spark not found." });
            return;
          }
          const asset = spark.assetId ? fixture.assets.get(spark.assetId) : undefined;
          if (asset?.storagePath) await rm(asset.storagePath, { force: true });
          if (asset) fixture.assets.delete(asset.id);
          fixture.sparks.delete(spark.id);
          fixture.uploadedBytes = 0;
          await route.fulfill({ status: 202, body: "" });
          return;
        }

        // Non-mutating app-shell queries not relevant to this focused Studio
        // journey receive an empty success envelope; all upload/publish/playback
        // requests above have explicit stateful assertions.
        await fulfillJson(route, 200, {});
      });
    };

    try {
      execFileSync(process.env.FFMPEG_PATH || "ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-f", "lavfi",
        "-i", "color=c=0x207b7e:s=320x480:r=15:d=1.2",
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-y", videoPath,
      ], { timeout: 30_000 });
      syntheticVideoBytes = await readFile(videoPath);

      binaryUploadServer = createServer((request, response) => {
        const corsHeaders = {
          "Access-Control-Allow-Origin": target.origin,
          "Access-Control-Allow-Methods": "PUT, OPTIONS",
          "Access-Control-Allow-Headers": request.headers["access-control-request-headers"] ?? "content-type",
          "Access-Control-Max-Age": "60",
          "Vary": "Origin",
        };
        if (request.method === "OPTIONS") {
          response.writeHead(204, corsHeaders);
          response.end();
          return;
        }
        if (request.method !== "PUT" || request.url !== `/uploads/${assetId}`
          || request.headers.origin !== target.origin) {
          response.writeHead(404, corsHeaders);
          response.end();
          return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        request.on("end", () => {
          const received = Buffer.concat(chunks);
          const asset = fixture.assets.get(assetId);
          fixture.uploadRequests++;
          if (!asset || request.headers["content-type"] !== "video/mp4"
            || !received.equals(syntheticVideoBytes)) {
            response.writeHead(400, corsHeaders);
            response.end();
            return;
          }
          void writeFile(uploadPath, received).then(() => {
            asset.storagePath = uploadPath;
            fixture.uploadedBytes = received.byteLength;
            response.writeHead(204, corsHeaders);
            response.end();
          }).catch(() => {
            response.writeHead(500, corsHeaders);
            response.end();
          });
        });
      });
      await new Promise<void>((resolve, reject) => {
        binaryUploadServer!.once("error", reject);
        binaryUploadServer!.listen(0, "127.0.0.1", resolve);
      });
      const uploadAddress = binaryUploadServer.address();
      if (!uploadAddress || typeof uploadAddress === "string") {
        throw new Error("The disposable loopback upload server did not open a TCP port.");
      }
      binaryUploadUrl = `http://127.0.0.1:${uploadAddress.port}/uploads/${assetId}`;

      const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const viewerContext = await browser.newContext({ viewport: { width: 402, height: 874 } });
      await installBrowserFixture(ownerContext, owner);
      await installBrowserFixture(viewerContext, viewer);
      const ownerPage = await ownerContext.newPage();
      const viewerPage = await viewerContext.newPage();

      await ownerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(ownerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      const areaDialog = ownerPage.getByRole("dialog", { name: "Set your local area" });
      if (await areaDialog.isVisible().catch(() => false)) {
        await ownerPage.getByTestId("input-location-area").fill(neighborhood);
        await ownerPage.getByTestId("button-save-location").click();
        await expect(areaDialog).toBeHidden();
      }
      const createSparkLink = ownerPage.getByTestId("button-create-exchange-spark-studio");
      await expect(createSparkLink).toBeVisible();
      await createSparkLink.click();
      await ownerPage.waitForURL(/\/community\/moments\?composer=1$/);

      const composer = ownerPage.getByTestId("media-studio");
      await expect(composer).toBeVisible({ timeout: 15_000 });
      const fileChooserPromise = ownerPage.waitForEvent("filechooser");
      await ownerPage.getByRole("button", { name: "Choose from library" }).first().click();
      await (await fileChooserPromise).setFiles(videoPath);
      await expect(composer).toHaveAttribute("data-mode", "review", { timeout: 15_000 });
      await composer.getByLabel("Caption").fill(caption);

      await composer.getByRole("button", { name: "Next", exact: true }).click();
      const exchangeDestination = composer.getByRole("radio", { name: /^Exchange Spark/ });
      await expect(exchangeDestination).toBeVisible();
      await exchangeDestination.click();
      const listingChoice = composer.getByLabel("Choose an active Exchange listing");
      await expect(listingChoice).toBeVisible();
      await expect(listingChoice.locator(`option[value="${listing.id}"]`)).toContainText(listing.title);
      await listingChoice.selectOption(String(listing.id));
      await expect(composer.getByRole("button", { name: "Share Exchange Spark" })).toBeEnabled();
      const publishResponsePromise = ownerPage.waitForResponse((response) =>
        response.url().includes(`/api/community/exchange/sparks/drafts/${sparkId}/publish`)
        && response.request().method() === "POST",
      );
      await composer.getByRole("button", { name: "Share Exchange Spark" }).click();
      const publishOutcome = await Promise.race([
        publishResponsePromise.then((response) => ({ kind: "response" as const, response })),
        composer.getByRole("alert").waitFor({ state: "visible" }).then(async () => ({
          kind: "error" as const,
          message: await composer.getByRole("alert").innerText(),
        })),
      ]);
      if (publishOutcome.kind === "error") {
        throw new Error(`Studio could not publish the disposable Spark: ${publishOutcome.message}; API calls: ${JSON.stringify(fixture.calls)}`);
      }
      const publishResponse = publishOutcome.response;
      expect(publishResponse.status()).toBe(201);
      await expect(ownerPage).toHaveURL(/\/community\?tab=exchange$/);
      await expect(ownerPage.getByTestId(`card-exchange-spark-${sparkId}`)).toBeVisible({ timeout: 15_000 });
      expect(fixture.calls.some((call) => call.userId === owner.id
        && call.method === "POST"
        && call.path === `/api/community/exchange/listings/${listing.id}/sparks/drafts`)).toBe(true);
      expect(fixture.uploadRequests).toBe(1);
      expect(fixture.uploadedBytes).toBe(syntheticVideoBytes.byteLength);
      expect(Buffer.compare(await readFile(uploadPath), syntheticVideoBytes)).toBe(0);
      expect(fixture.calls.some((call) => call.userId === owner.id
        && call.method === "POST"
        && call.path === `/api/media-assets/${assetId}/complete`)).toBe(true);
      expect(fixture.calls.some((call) => call.userId === owner.id
        && call.method === "POST"
        && call.path === `/api/community/exchange/sparks/drafts/${sparkId}/publish`)).toBe(true);

      await viewerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(viewerPage.getByRole("region", { name: "Niakofa Exchange" })).toBeVisible();
      const viewerAreaDialog = viewerPage.getByRole("dialog", { name: "Set your local area" });
      if (await viewerAreaDialog.isVisible().catch(() => false)) {
        await viewerPage.getByTestId("input-location-area").fill(neighborhood);
        await viewerPage.getByTestId("button-save-location").click();
        await expect(viewerAreaDialog).toBeHidden();
      }
      const viewerCard = viewerPage.getByTestId(`card-exchange-spark-${sparkId}`);
      await expect(viewerCard).toBeVisible({ timeout: 15_000 });
      const video = viewerCard.locator("video");
      await expect(video).toBeVisible();
      await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
        .toBeGreaterThanOrEqual(1);
      await video.evaluate(async (element) => {
        const player = element as HTMLVideoElement;
        player.muted = true;
        await player.play();
      });
      await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
        .toBeGreaterThan(0.05);
      expect(fixture.viewerPlaybackGrants.has(viewer.id)).toBe(true);

      const deleteResponse = await ownerPage.evaluate(async (id) => {
        const token = localStorage.getItem("niakofa_token") ?? "";
        const response = await fetch(`/api/community/exchange/sparks/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "same-origin",
        });
        return response.status;
      }, sparkId);
      expect(deleteResponse).toBe(202);
      expect(fixture.sparks.size).toBe(0);
      expect(fixture.assets.size).toBe(0);
      expect(fixture.uploadedBytes).toBe(0);
      expect(fixture.uploadRequests).toBe(1);
      expect(await fileExists(uploadPath)).toBe(false);

      await viewerPage.goto(`${baseURL}/community?tab=exchange`);
      await expect(viewerPage.getByText("No nearby Exchange videos yet")).toBeVisible();
      await expect(viewerPage.getByTestId(`card-exchange-spark-${sparkId}`)).toHaveCount(0);
      const deniedPlayback = await viewerPage.evaluate(async (id) => {
        const response = await fetch(`/api/media-assets/${id}/play`, { credentials: "same-origin" });
        return response.status;
      }, assetId);
      expect(deniedPlayback).toBe(404);

      await testInfo.attach("exchange-spark-studio-browser.txt", {
        body: `local-preview=true; approved-fixtures=2; listing=${listing.id}; spark=${sparkId}; asset=${assetId}; uploaded-bytes=${syntheticVideoBytes.byteLength}; loopback-upload-requests=${fixture.uploadRequests}; viewer-played=true; deleted=true; storage-file-present=${await fileExists(uploadPath)}`,
        contentType: "text/plain",
      });
      fixture.listings.clear();
      expect(fixture.listings.size).toBe(0);
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
      if (binaryUploadServer) {
        await new Promise<void>((resolve) => binaryUploadServer!.close(() => resolve()));
      }
      if (fixture.assets.size || fixture.sparks.size) {
        for (const asset of fixture.assets.values()) {
          if (asset.storagePath) await rm(asset.storagePath, { force: true }).catch(() => undefined);
        }
      }
      fixture.assets.clear();
      fixture.sparks.clear();
      fixture.listings.clear();
      fixture.uploadedBytes = 0;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
