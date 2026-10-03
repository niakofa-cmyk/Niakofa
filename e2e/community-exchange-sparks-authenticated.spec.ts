import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/*
 * Production acceptance prerequisites:
 * - separate, approved, active disposable USER_A_STATE/USER_B_STATE accounts;
 * - the accounts have distinct user IDs and different assigned community identities;
 * - SPARK_SMOKE_LISTING_ID is an active, approved listing owned by A;
 * - operator confirmation that B is outside A's community;
 * - exact deployed EXPECTED_COMMIT and the explicit gates enforced by the runner.
 *
 * The media API can re-enqueue processing by POSTing /complete after an asset
 * reaches failed. There is no safe API to force a deterministic worker failure;
 * this test retries if its own asset naturally fails. Do not inject corrupt
 * objects or mutate another account's asset to manufacture that state.
 * The public API can verify deletion visibility, but physical bucket-object
 * removal requires a separately approved storage-inspection credential/path;
 * this spec intentionally does not accept or expose one.
 *
 * A private 0600 recovery record outside the checkout is required. It persists
 * run/owner/listing identity and resource IDs before upload/publish transitions.
 * Pending-moderation and expired/ineligible Sparks may be invisible to both
 * owner draft lists and feed scans; those states require exact-ID server-side
 * reconciliation. Empty feeds never clear a recovery record or prove cleanup.
 */
const ownerState = process.env.USER_A_STATE;
const viewerState = process.env.USER_B_STATE;
const expectedCommit = process.env.EXPECTED_COMMIT?.trim().toLowerCase() ?? "";
const listingId = Number(process.env.SPARK_SMOKE_LISTING_ID);
const runId = process.env.SPARK_SMOKE_RUN_ID?.trim() ?? "";
const recoveryDirectory = process.env.SPARK_SMOKE_RECOVERY_DIR ?? "";
const baseUrl = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "";
const enabled =
  process.env.ALLOW_COMMUNITY_EXCHANGE_SPARKS_E2E === "1" &&
  process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1" &&
  process.env.CONFIRM_COMMUNITY_EXCHANGE_SPARKS_PRODUCTION_GATE === "1" &&
  process.env.CONFIRM_DISPOSABLE_SPARK_LISTING === "1" &&
  process.env.CONFIRM_SPARK_VIEWER_OUTSIDE_OWNER_COMMUNITY === "1";
const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 10_000;
const MAX_RECONCILIATION_PAGES = 4;
const MAX_RECOVERY_SPARKS = 1;
const MAX_RECOVERY_ASSETS = 2;

type AuthenticatedState = {
  token: string;
  userId: number;
  communityId: number | null;
  origin: string;
};
type DraftSnapshot = {
  spark_id: number;
  status: string;
  media_assets: Array<{ media_asset_id: number; status: string }>;
};
type TaggedResource = { sparkId: number; assetIds: number[] };
type RecoveryRecord = {
  version: 1;
  run_id: string;
  target_origin: string;
  owner_user_id: number;
  listing_id: number;
  phase: string;
  spark_ids: number[];
  media_asset_ids: number[];
  reconciled_spark_ids: number[];
  reconciled_media_asset_ids: number[];
  manual_reconciliation_confirmed: boolean;
};

const runCaption = `Disposable Spark lifecycle ${runId}`;

// This suite uses explicit Bearer headers; never persist credentials in traces,
// screenshots, or videos.
test.use({ trace: "off", screenshot: "off", video: "off" });

function recoveryFilePath(): string {
  const resolvedDirectory = path.resolve(recoveryDirectory);
  const directoryInfo = lstatSync(resolvedDirectory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()
    || (directoryInfo.mode & 0o700) !== 0o700 || (directoryInfo.mode & 0o077) !== 0) {
    throw new Error("SPARK_SMOKE_RECOVERY_DIR must be a writable private directory with mode 0700.");
  }
  if (realpathSync(resolvedDirectory) !== resolvedDirectory) {
    throw new Error("SPARK_SMOKE_RECOVERY_DIR must not resolve through a symbolic link.");
  }
  const repository = path.resolve(".");
  const relative = path.relative(repository, resolvedDirectory);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("SPARK_SMOKE_RECOVERY_DIR must be outside the checkout.");
  }
  return path.join(resolvedDirectory, `community-exchange-sparks-${runId}.json`);
}

function writeRecoveryRecord(record: RecoveryRecord): void {
  const filePath = recoveryFilePath();
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function loadRecoveryRecord(expected: {
  runId: string;
  targetOrigin: string;
  ownerUserId: number;
}): RecoveryRecord | null {
  const filePath = recoveryFilePath();
  if (!existsSync(filePath)) return null;
  const info = lstatSync(filePath);
  if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077) !== 0 || realpathSync(filePath) !== filePath) {
    throw new Error("The run recovery record must be a regular, private 0600 file.");
  }
  const record = JSON.parse(readFileSync(filePath, "utf8")) as RecoveryRecord;
  if (record.version !== 1 ||
    record.run_id !== expected.runId ||
    record.target_origin !== expected.targetOrigin ||
    record.owner_user_id !== expected.ownerUserId ||
    record.listing_id !== listingId ||
    !Array.isArray(record.spark_ids) ||
    !Array.isArray(record.media_asset_ids) ||
    !Array.isArray(record.reconciled_spark_ids) ||
    !Array.isArray(record.reconciled_media_asset_ids) ||
    typeof record.manual_reconciliation_confirmed !== "boolean") {
    throw new Error("The recovery record does not match this run, target, owner, or approved listing.");
  }
  if ([...record.spark_ids, ...record.media_asset_ids,
    ...record.reconciled_spark_ids, ...record.reconciled_media_asset_ids]
    .some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error("The recovery record contains an invalid resource id.");
  }
  return record;
}

function readAuthenticatedState(filePath: string): AuthenticatedState {
  const state = JSON.parse(readFileSync(filePath, "utf8")) as {
    origins?: Array<{
      origin?: string;
      localStorage?: Array<{ name?: string; value?: string }>;
    }>;
  };
  const origins = state.origins ?? [];
  const origin = origins.find((entry) => entry.origin)?.origin;
  const entries = origins.flatMap((entry) => entry.localStorage ?? []);
  const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
  const userJson = entries.find((entry) => entry.name === "niakofa_user")?.value;
  if (!origin || !token || !userJson) throw new Error("Authenticated storage state is incomplete.");
  const user = JSON.parse(userJson) as {
    id?: number | string;
    community_id?: number | string | null;
    approval_status?: string;
    is_suspended?: boolean;
  };
  const userId = Number(user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Storage state has an invalid user id.");
  if (user.approval_status !== "approved" || user.is_suspended === true) {
    throw new Error("Storage state must belong to an approved, active user.");
  }
  if (!Object.hasOwn(user, "community_id")) {
    throw new Error("Storage state does not include the user's community identity.");
  }
  const communityId = user.community_id === null ? null : Number(user.community_id);
  if (communityId !== null && (!Number.isSafeInteger(communityId) || communityId < 1)) {
    throw new Error("Storage state has an invalid community identity.");
  }
  return { token, userId, communityId, origin: new URL(origin).origin };
}

function authHeaders(token: string): Record<string, string> {
  return { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function apiGet(
  request: APIRequestContext,
  pathname: string,
  options: Parameters<APIRequestContext["get"]>[1] = {},
) {
  return request.get(pathname, { ...options, timeout: HTTP_TIMEOUT_MS });
}

function apiPost(
  request: APIRequestContext,
  pathname: string,
  options: Parameters<APIRequestContext["post"]>[1] = {},
) {
  return request.post(pathname, { ...options, timeout: HTTP_TIMEOUT_MS });
}

function apiPut(
  request: APIRequestContext,
  pathname: string,
  options: Parameters<APIRequestContext["put"]>[1] = {},
) {
  return request.put(pathname, { ...options, timeout: HTTP_TIMEOUT_MS });
}

function apiDelete(
  request: APIRequestContext,
  pathname: string,
  options: Parameters<APIRequestContext["delete"]>[1] = {},
) {
  return request.delete(pathname, { ...options, timeout: HTTP_TIMEOUT_MS });
}

async function jsonBody<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createVideoFixture(): Promise<{ directory: string; bytes: Buffer }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "niakofa-spark-e2e-"));
  const output = path.join(directory, "fixture.mp4");
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=blue:s=16x16:d=0.4",
      "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
      "-shortest", "-frames:v", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-movflags", "+faststart", "-y", output,
    ], { timeout: 15_000 });
    return { directory, bytes: await readFile(output) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function getDraft(
  request: APIRequestContext,
  headers: Record<string, string>,
  sparkId: number,
): Promise<DraftSnapshot> {
  const response = await apiGet(request, `/api/community/exchange/sparks/drafts/${sparkId}`, { headers });
  return jsonBody<DraftSnapshot>(response);
}

async function waitForAssetState(
  request: APIRequestContext,
  headers: Record<string, string>,
  sparkId: number,
): Promise<string> {
  let latest = "";
  await expect.poll(async () => {
    const draft = await getDraft(request, headers, sparkId);
    latest = draft.media_assets[0]?.status ?? "missing";
    return latest;
  }, { timeout: 120_000, intervals: [1_000, 2_000, 5_000] }).toMatch(/^(ready|failed)$/);
  return latest;
}

async function feedContains(
  request: APIRequestContext,
  headers: Record<string, string>,
  sparkId: number,
): Promise<boolean> {
  const payload = await jsonBody<{ sparks?: Array<{ id: number }> }>(
    await apiGet(request, "/api/community/exchange/sparks?limit=40", { headers }),
  );
  return Boolean(payload.sparks?.some((spark) => spark.id === sparkId));
}

async function findRunResources(
  request: APIRequestContext,
  headers: Record<string, string>,
  targetListingId: number,
  caption: string,
  onFound?: (resource: TaggedResource) => void,
): Promise<TaggedResource[]> {
  const resources = new Map<number, Set<number>>();
  const remember = (sparkId: number, assetIds: number[]) => {
    const existing = resources.get(sparkId) ?? new Set<number>();
    assetIds.forEach((assetId) => existing.add(assetId));
    resources.set(sparkId, existing);
    onFound?.({ sparkId, assetIds });
  };

  const drafts = await jsonBody<{
    drafts?: Array<{
      spark_id: number;
      listing_id: number;
      caption: string | null;
      media_assets: Array<{ media_asset_id: number }>;
    }>;
  }>(await apiGet(request, "/api/community/exchange/sparks/drafts", { headers }));
  for (const draft of drafts.drafts ?? []) {
    if (draft.listing_id === targetListingId && draft.caption === caption) {
      remember(draft.spark_id, draft.media_assets.map((asset) => asset.media_asset_id));
    }
  }

  // Reconcile all owner-visible feed pages, but only durable Sparks with the
  // exact operator-supplied run marker and approved listing id.
  let cursor: string | null = null;
  let pagesRead = 0;
  const seenCursors = new Set<string>();
  do {
    pagesRead += 1;
    const query: string = cursor ? `?limit=40&cursor=${encodeURIComponent(cursor)}` : "?limit=40";
    const page: {
      sparks?: Array<{
        id: number;
        spark_id: number | null;
        listing_id: number;
        caption: string | null;
        durable: boolean;
        media_asset_id: number | null;
      }>;
      next_cursor?: string | null;
    } = await jsonBody<{
      sparks?: Array<{
        id: number;
        spark_id: number | null;
        listing_id: number;
        caption: string | null;
        durable: boolean;
        media_asset_id: number | null;
      }>;
      next_cursor?: string | null;
    }>(await apiGet(request, `/api/community/exchange/sparks${query}`, { headers }));
    for (const spark of page.sparks ?? []) {
      if (spark.durable && spark.spark_id !== null
        && spark.listing_id === targetListingId && spark.caption === caption) {
        remember(spark.spark_id, spark.media_asset_id === null ? [] : [spark.media_asset_id]);
      }
    }
    cursor = page.next_cursor ?? null;
    if (cursor && seenCursors.has(cursor)) throw new Error("Spark reconciliation cursor repeated.");
    if (cursor && pagesRead >= MAX_RECONCILIATION_PAGES) {
      throw new Error("Spark reconciliation scan exceeded its bounded page budget; manual server-side reconciliation is required.");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return [...resources].map(([sparkId, assetIds]) => ({ sparkId, assetIds: [...assetIds] }));
}

async function cleanup(
  request: APIRequestContext,
  headers: Record<string, string>,
  sparkId: number | null,
  assetId: number | null,
): Promise<void> {
  const failures: string[] = [];
  if (assetId !== null) {
    try {
      const response = await apiDelete(request, `/api/media-assets/${assetId}`, { headers });
      if (![204, 404].includes(response.status())) failures.push(`asset cleanup returned ${response.status()}`);
    } catch {
      failures.push("asset cleanup request failed");
    }
  }
  if (sparkId !== null) {
    try {
      const response = await apiDelete(request, `/api/community/exchange/sparks/${sparkId}`, { headers });
      if (![202, 404].includes(response.status())) failures.push(`Spark cleanup returned ${response.status()}`);
    } catch {
      failures.push("Spark cleanup request failed");
    }
  }
  if (failures.length) throw new Error(`Disposable Spark cleanup incomplete: ${failures.join("; ")}.`);
}

async function reconcileRunResources(
  request: APIRequestContext,
  headers: Record<string, string>,
  record: RecoveryRecord,
): Promise<void> {
  await findRunResources(request, headers, listingId, runCaption, (resource) => {
    if (!record.spark_ids.includes(resource.sparkId)) record.spark_ids.push(resource.sparkId);
    for (const assetId of resource.assetIds) {
      if (!record.media_asset_ids.includes(assetId)) record.media_asset_ids.push(assetId);
    }
    if (record.phase === "prepared") record.phase = "reconciliation_discovered";
    writeRecoveryRecord(record);
  });
  if (record.phase === "prepared" && !record.spark_ids.length && !record.media_asset_ids.length) return;

  // Persist the exact owner/listing-scoped IDs before issuing cleanup calls.
  // A hard interruption after this point remains recoverable from this record.
  record.phase = "cleanup_requested";
  record.manual_reconciliation_confirmed = false;
  writeRecoveryRecord(record);
  if (record.spark_ids.length > MAX_RECOVERY_SPARKS || record.media_asset_ids.length > MAX_RECOVERY_ASSETS) {
    record.phase = "cleanup_failed";
    writeRecoveryRecord(record);
    throw new Error("Run marker resolved to more resources than this single disposable lifecycle; manual exact-ID reconciliation is required.");
  }
  const failures: string[] = [];
  for (const assetId of record.media_asset_ids) {
    try {
      await cleanup(request, headers, null, assetId);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "asset reconciliation failed");
    }
  }
  for (const sparkId of record.spark_ids) {
    try {
      await cleanup(request, headers, sparkId, null);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Spark reconciliation failed");
    }
  }
  record.phase = failures.length ? "cleanup_failed" : "awaiting_manual_reconciliation";
  writeRecoveryRecord(record);
  if (failures.length) throw new Error(`Run-tag reconciliation incomplete: ${failures.join("; ")}.`);
}

function createRecoveryRecord(input: {
  targetOrigin: string;
  ownerUserId: number;
}): RecoveryRecord {
  return {
    version: 1,
    run_id: runId,
    target_origin: input.targetOrigin,
    owner_user_id: input.ownerUserId,
    listing_id: listingId,
    phase: "prepared",
    spark_ids: [],
    media_asset_ids: [],
    reconciled_spark_ids: [],
    reconciled_media_asset_ids: [],
    manual_reconciliation_confirmed: false,
  };
}

function beginNewAttempt(record: RecoveryRecord): void {
  record.reconciled_spark_ids.push(...record.spark_ids);
  record.reconciled_media_asset_ids.push(...record.media_asset_ids);
  record.spark_ids = [];
  record.media_asset_ids = [];
  record.phase = "prepared";
  record.manual_reconciliation_confirmed = false;
  writeRecoveryRecord(record);
}

test.describe("authenticated Community/Exchange Sparks lifecycle regression", () => {
  test.skip(
    !enabled ||
      !ownerState ||
      !viewerState ||
      !/^[0-9a-f]{40}$/.test(expectedCommit) ||
      !Number.isSafeInteger(listingId) ||
      listingId < 1 ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(runId) ||
      !recoveryDirectory ||
      !baseUrl,
    "Requires the guarded Spark runner, approved disposable account states/listing, isolated viewer, unique run ID, private recovery directory, and full deployed commit.",
  );

  test.beforeAll(async ({ request }) => {
    test.setTimeout(60_000);
    const target = new URL(baseUrl);
    expect(target.protocol, "Production acceptance must use HTTPS.").toBe("https:");
    expect(target.username).toBe("");
    expect(target.password).toBe("");
    expect(target.pathname).toBe("/");
    expect(target.search).toBe("");
    expect(target.hash).toBe("");
    const configuredRequestBase = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000");
    expect(configuredRequestBase.username).toBe("");
    expect(configuredRequestBase.password).toBe("");
    expect(configuredRequestBase.pathname).toBe("/");
    expect(configuredRequestBase.search).toBe("");
    expect(configuredRequestBase.hash).toBe("");
    expect(configuredRequestBase.origin, "Playwright's configured request origin must match the explicitly confirmed target.")
      .toBe(target.origin);
    expect(configuredRequestBase.protocol).toBe("https:");
    const owner = readAuthenticatedState(ownerState!);
    const viewer = readAuthenticatedState(viewerState!);
    expect(owner.origin).toBe(target.origin);
    expect(viewer.origin).toBe(target.origin);
    expect(viewer.userId).not.toBe(owner.userId);
    const ownerHasAssignedCommunity =
      typeof owner.communityId === "number" &&
      Number.isSafeInteger(owner.communityId) &&
      owner.communityId > 0;
    const viewerHasAssignedCommunity =
      typeof viewer.communityId === "number" &&
      Number.isSafeInteger(viewer.communityId) &&
      viewer.communityId > 0;
    expect(ownerHasAssignedCommunity, "USER_A must belong to an assigned community.").toBe(true);
    expect(viewerHasAssignedCommunity, "USER_B must belong to an assigned community.").toBe(true);
    expect(owner.communityId, "USER_A and USER_B must belong to different communities.")
      .not.toBe(viewer.communityId);

    const health = await apiGet(request, "/api/healthz");
    expect(new URL(health.url()).origin, "The actual preflight request must reach the confirmed HTTPS target.")
      .toBe(target.origin);
    expect(health.ok()).toBeTruthy();
    const healthBody = await health.json() as {
      storage_readiness?: { media_platform_flag?: boolean; cloud_configured?: boolean; credentials_present?: boolean };
    };
    expect(healthBody.storage_readiness?.media_platform_flag).toBe(true);
    expect(healthBody.storage_readiness?.cloud_configured).toBe(true);
    expect(healthBody.storage_readiness?.credentials_present).toBe(true);

    const readiness = await apiGet(request, "/api/readiness");
    expect(readiness.ok()).toBeTruthy();
    expect((await readiness.json()).ready).toBe(true);
    const version = await apiGet(request, "/api/version");
    expect(version.ok()).toBeTruthy();
    const deployedCommit = String((await version.json()).commit ?? "").toLowerCase();
    expect(deployedCommit, "The deployed commit must exactly match the approved release.").toBe(expectedCommit);
  });

  test("creates, uploads, retries eligible processing, publishes, enforces visibility, and cleans up", async ({ request }) => {
    // Budget: 240s for two 120s processing polls; 100s for two bounded
    // 50s reconciliation scans; 15s fixture; 160s for mutation/cleanup HTTP;
    // and 205s explicit teardown/runtime reserve. beforeAll has a separate 60s cap.
    test.setTimeout(720_000);
    const owner = readAuthenticatedState(ownerState!);
    const viewer = readAuthenticatedState(viewerState!);
    const ownerHeaders = authHeaders(owner.token);
    const viewerHeaders = authHeaders(viewer.token);
    const fixture = await createVideoFixture();
    let sparkId: number | null = null;
    let assetId: number | null = null;
    let recovery: RecoveryRecord | null = null;

    try {
      const targetOrigin = new URL(baseUrl).origin;
      recovery = loadRecoveryRecord({ runId, targetOrigin, ownerUserId: owner.userId })
        ?? createRecoveryRecord({ targetOrigin, ownerUserId: owner.userId });
      if (recovery.phase === "prepared" && !recovery.spark_ids.length && !recovery.media_asset_ids.length) {
        writeRecoveryRecord(recovery);
      } else if (recovery.manual_reconciliation_confirmed
        && process.env.CONFIRM_SPARK_RECOVERY_RECONCILED === "1") {
        beginNewAttempt(recovery);
      } else {
        await reconcileRunResources(request, ownerHeaders, recovery);
        throw new Error(
          `Previous run is unresolved. Reconcile only the owner/listing/resource IDs in the private recovery record ${recoveryFilePath()}, confirm server-side cleanup there, then rerun with explicit confirmation.`,
        );
      }

      // Reconcile only this run marker and listing. Every discovered ID is
      // durably written before a cleanup request; no unrelated rows are swept.
      await reconcileRunResources(request, ownerHeaders, recovery);
      if (recovery.phase !== "prepared") {
        throw new Error(`A matching prior resource requires manual reconciliation; see ${recoveryFilePath()}.`);
      }

      recovery.phase = "draft_create_requested";
      writeRecoveryRecord(recovery);
      const create = await apiPost(request, `/api/community/exchange/listings/${listingId}/sparks/drafts`, {
        data: { caption: runCaption },
        headers: ownerHeaders,
      });
      expect(create.status()).toBe(201);
      const created = await create.json() as { spark_id: number; status: string; upload_context: { contextKind: string; contextId: number } };
      sparkId = created.spark_id;
      recovery.spark_ids.push(sparkId);
      recovery.phase = "draft_created";
      writeRecoveryRecord(recovery);
      expect(created.status).toBe("draft");
      expect(created.upload_context).toEqual({ contextKind: "exchange_spark", contextId: sparkId });

      recovery.phase = "asset_init_requested";
      writeRecoveryRecord(recovery);
      const init = await apiPost(request, "/api/media-assets/uploads", {
        data: {
          contextKind: "exchange_spark",
          contextId: sparkId,
          mediaType: "video",
          mimeType: "video/mp4",
          originalName: `disposable-exchange-spark-${runId}.mp4`,
          byteSize: fixture.bytes.length,
        },
        headers: ownerHeaders,
      });
      expect(init.status()).toBe(201);
      const initialized = await init.json() as {
        media_asset_id: number;
        upload: { url: string; headers: Record<string, string> };
        complete_url: string;
      };
      assetId = initialized.media_asset_id;
      recovery.media_asset_ids.push(assetId);
      recovery.phase = "asset_session_created";
      writeRecoveryRecord(recovery);
      expect(initialized.upload.url).toBe(`/api/media-assets/${assetId}/upload`);
      expect(initialized.complete_url).toBe(`/api/media-assets/${assetId}/complete`);
      recovery.phase = "asset_upload_requested";
      writeRecoveryRecord(recovery);
      const upload = await apiPut(request, initialized.upload.url, {
        data: fixture.bytes,
        headers: { ...initialized.upload.headers, Authorization: ownerHeaders.Authorization },
      });
      expect(upload.status()).toBe(204);

      // The publish API must reject a non-ready asset without consuming the draft.
      const prematurePublish = await apiPost(request, `/api/community/exchange/sparks/drafts/${sparkId}/publish`, {
        data: {},
        headers: ownerHeaders,
      });
      expect(prematurePublish.status()).toBe(409);

      recovery.phase = "processing";
      writeRecoveryRecord(recovery);
      const complete = await apiPost(request, initialized.complete_url, { headers: ownerHeaders });
      expect(complete.status()).toBe(202);
      let assetState = await waitForAssetState(request, ownerHeaders, sparkId);
      let processingRetryExercised = false;
      if (assetState === "failed") {
        // The supported processing retry is a second complete call on a failed asset.
        const retry = await apiPost(request, initialized.complete_url, { headers: ownerHeaders });
        expect(retry.status()).toBe(202);
        processingRetryExercised = true;
        assetState = await waitForAssetState(request, ownerHeaders, sparkId);
      }
      if (!processingRetryExercised) {
        test.info().annotations.push({
          type: "coverage-note",
          description: "Failed-asset retry branch not exercised: this disposable upload did not enter failed processing state.",
        });
      }
      expect(assetState, "The disposable Spark video must process successfully.").toBe("ready");

      recovery.phase = "publishing";
      writeRecoveryRecord(recovery);
      const publish = await apiPost(request, `/api/community/exchange/sparks/drafts/${sparkId}/publish`, {
        data: {},
        headers: ownerHeaders,
      });
      expect(publish.status()).toBe(201);
      expect((await publish.json()).status).toBe("published");
      recovery.phase = "published";
      writeRecoveryRecord(recovery);
      expect(await feedContains(request, ownerHeaders, sparkId)).toBe(true);
      expect(await feedContains(request, viewerHeaders, sparkId)).toBe(false);
      const deniedPlaybackGrant = await apiPost(request, `/api/media-assets/${assetId}/playback-grant`, {
        headers: viewerHeaders,
      });
      expect(deniedPlaybackGrant.status()).toBe(404);

      // User-facing deletion hides the video immediately; Spark deletion tombstones
      // the listing-linked publication and its remaining rows for asynchronous cleanup.
      recovery.phase = "cleanup_requested";
      writeRecoveryRecord(recovery);
      const deleteAsset = await apiDelete(request, `/api/media-assets/${assetId}`, { headers: ownerHeaders });
      expect(deleteAsset.status()).toBe(204);
      const deletedPlayback = await apiGet(request, `/api/media-assets/${assetId}`, { headers: ownerHeaders });
      expect(deletedPlayback.status()).toBe(404);
      const deleteSpark = await apiDelete(request, `/api/community/exchange/sparks/${sparkId}`, { headers: ownerHeaders });
      expect(deleteSpark.status()).toBe(202);
    } finally {
      try {
        if (recovery && (recovery.phase !== "prepared" || recovery.spark_ids.length || recovery.media_asset_ids.length)) {
          if (sparkId !== null && !recovery.spark_ids.includes(sparkId)) recovery.spark_ids.push(sparkId);
          if (assetId !== null && !recovery.media_asset_ids.includes(assetId)) recovery.media_asset_ids.push(assetId);
          try {
            await reconcileRunResources(request, ownerHeaders, recovery);
          } catch (error) {
            recovery.phase = "cleanup_failed";
            writeRecoveryRecord(recovery);
            throw new Error(
              `Cleanup request failed; inspect only the exact IDs in private recovery record ${recoveryFilePath()}. ${error instanceof Error ? error.message : "Reconciliation failed."}`,
            );
          }
          throw new Error(
            `Cleanup was requested, but the public API reports asynchronous Spark deletion and cannot prove final row/storage reconciliation. Do not treat feed absence as cleanup completion. Use the private record ${recoveryFilePath()} for exact owner/listing/Spark/media IDs; follow the runner's manual server-side reconciliation instructions, confirm that record, then rerun with CONFIRM_SPARK_RECOVERY_RECONCILED=1.`,
          );
        }
      } finally {
        await rm(fixture.directory, { recursive: true, force: true });
      }
    }
  });
});