import { readFileSync } from "node:fs";
import {
  buildExchangeSparkAuditEvent,
  type ExchangeSparkAuditInput,
} from "../lib/exchange-spark-audit";

const route = readFileSync(new URL("../routes/community-exchange-spark-drafts.ts", import.meta.url), "utf8");
const scheduler = readFileSync(new URL("../lib/scheduler.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const createStart = route.indexOf('"/community/exchange/listings/:listingId/sparks/drafts"');
const createEnd = route.indexOf('"/community/exchange/sparks/drafts"', createStart + 1);
const publishStart = route.indexOf('"/community/exchange/sparks/drafts/:sparkId/publish"');
const deleteStart = route.indexOf('"/community/exchange/sparks/:sparkId"');
const createRoute = route.slice(createStart, createEnd);
const publishRoute = route.slice(publishStart, deleteStart);
const deleteRoute = route.slice(deleteStart);
const cleanupStart = scheduler.indexOf("// Recover a Spark claimed by a scheduler instance");
const cleanupEnd = scheduler.indexOf("const orphanedSparkAssets", cleanupStart);
const cleanupRoute = scheduler.slice(cleanupStart, cleanupEnd);

describe("Exchange Spark lifecycle audit events", () => {
  it("keeps event fields allowlisted and replaces unrecognized reasons", () => {
    const unsafeInput = {
      action: "created",
      actorUserId: 17,
      sparkId: 29,
      status: "draft",
      caption: "private Spark caption",
      mediaUrl: "https://private.example/media",
      storageKey: "private/object/key",
    } as unknown as ExchangeSparkAuditInput;

    expect(buildExchangeSparkAuditEvent(unsafeInput)).toEqual({
      event: "exchange_spark.audit",
      action: "created",
      actor_user_id: 17,
      spark_id: 29,
      status: "draft",
    });

    const unsafeReason = {
      action: "delete_result",
      actorUserId: 17,
      sparkId: 29,
      deleted: false,
      reason: "private/object/key",
    } as unknown as ExchangeSparkAuditInput;
    expect(buildExchangeSparkAuditEvent(unsafeReason)).toEqual({
      event: "exchange_spark.audit",
      action: "delete_result",
      actor_user_id: 17,
      spark_id: 29,
      deleted: false,
      reason: "unknown",
    });
  });

  it("distinguishes an accepted delete request from the worker's actual delete result", () => {
    expect(buildExchangeSparkAuditEvent({
      action: "delete_requested",
      actorUserId: 17,
      sparkId: 29,
      status: "deletion_pending",
    })).toEqual({
      event: "exchange_spark.audit",
      action: "delete_requested",
      actor_user_id: 17,
      spark_id: 29,
      status: "deletion_pending",
    });
    expect(buildExchangeSparkAuditEvent({
      action: "cleanup_result",
      actorUserId: 17,
      sparkId: 29,
      deleted: true,
    })).toEqual({
      event: "exchange_spark.audit",
      action: "cleanup_result",
      actor_type: "system",
      actor_user_id: 17,
      spark_id: 29,
      deleted: true,
    });
  });

  it("audits draft creation and new or replayed publish status without logging content", () => {
    expect(createRoute).toMatch(/logger\.info\(buildExchangeSparkAuditEvent\(\{\s*action: "created"/);
    expect(createRoute).toContain('status: "draft"');
    expect(createRoute.indexOf('action: "created"')).toBeGreaterThan(createRoute.indexOf("db.insert(exchangeSparksTable)"));
    expect(publishRoute).toContain('replayed: true as const');
    expect(publishRoute).toContain('replayed: false as const');
    expect(publishRoute).toMatch(/action: result\.replayed \? "publish_replayed" : "publish_result"/);
    expect(publishRoute.indexOf("action: result.replayed")).toBeGreaterThan(publishRoute.indexOf("const result = await db.transaction"));
    expect(publishRoute.indexOf("action: result.replayed")).toBeLessThan(publishRoute.indexOf("return res.status(201)"));
  });

  it("audits deletion request failures and the worker's actual cleanup boolean with safe reasons", () => {
    expect(deleteRoute).toContain('reason: "not_found_or_not_owned"');
    expect(deleteRoute).toMatch(/action: "delete_requested"[\s\S]*status: "deletion_pending"/);
    expect(deleteRoute).not.toContain("deleted: true");
    expect(cleanupRoute).toContain('reason: "media_processing"');
    expect(cleanupRoute).toContain('reason: "storage_cleanup_failed"');
    expect(cleanupRoute).toContain('reason: "row_cleanup_failed"');
    expect(cleanupRoute).toContain('reason: "row_missing_after_cleanup"');
    expect(cleanupRoute).toMatch(/db\.delete\(exchangeSparksTable\)[\s\S]*?\.returning\(\{ id: exchangeSparksTable\.id \}\)/);
    expect(cleanupRoute).toContain("deleted: true");
    expect(cleanupRoute).toContain("deleted: false");
    const strictStorageDelete = cleanupRoute.indexOf("await deleteAssetStrict(key)");
    const databaseDelete = cleanupRoute.indexOf("db.delete(exchangeSparksTable)");
    const successAudit = cleanupRoute.indexOf('action: "cleanup_result"', databaseDelete);
    expect(strictStorageDelete).toBeGreaterThanOrEqual(0);
    expect(strictStorageDelete).toBeLessThan(databaseDelete);
    expect(databaseDelete).toBeLessThan(successAudit);
    expect(storage).toMatch(/export async function deleteAssetStrict\(key: string\): Promise<void> \{[\s\S]*?await verifyAssetAbsent\(key\)/);
    expect(cleanupRoute).not.toMatch(/logger\.error\(\{ err, sparkId:/);
  });
});