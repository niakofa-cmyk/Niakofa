import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/admin-exchange-sparks.ts", import.meta.url);
const routesIndexPath = new URL("../routes/index.ts", import.meta.url);
const exchangeRoutePath = new URL("../routes/community-exchange.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/exchange-sparks.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0177_exchange_spark_moderation.sql", import.meta.url);
const adminUiPath = new URL("../../../pay-it-forward/src/pages/admin.tsx", import.meta.url);

describe("held Exchange Spark moderation contract", () => {
  it("restricts the queue and resolution endpoints to admins and lists only pending Sparks", async () => {
    const [route, routesIndex, exchangeRoute] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(routesIndexPath, "utf8"),
      fs.readFile(exchangeRoutePath, "utf8"),
    ]);
    expect(routesIndex).toMatch(/adminExchangeSparksRouter/);
    expect(route).toMatch(/\/admin\/exchange\/sparks\/held", requireAuth, requireAdmin\(\), adminLimiter/);
    expect(route).toMatch(/eq\(exchangeSparksTable\.status, "pending"\)/);
    expect(route).toMatch(/\/admin\/exchange\/sparks\/:id\/resolve", requireAuth, requireAdmin\(\), adminLimiter/);
    expect(exchangeRoute).toMatch(/eq\(exchangeSparksTable\.status, "published"\)/);
  });

  it("requires a rejection reason, approves to published, rejects to hidden, and records moderator history transactionally", async () => {
    const [route, schema, migration] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(schemaPath, "utf8"),
      fs.readFile(migrationPath, "utf8"),
    ]);
    expect(route).toMatch(/decision: z\.enum\(\["approve", "reject"\]\)/);
    expect(route).toMatch(/decision === "reject" && !value\.reason/);
    expect(route).toMatch(/decision === "approve" \? "published" : "rejected"/);
    expect(route).toMatch(/moderation_reviewed_by: moderatorId/);
    expect(route).toMatch(/moderation_reviewed_at: now/);
    expect(route).toMatch(/tx\.insert\(exchangeSparkModerationHistoryTable\)\.values/);
    expect(route).toMatch(/eq\(exchangeSparksTable\.status, "pending"\)/);
    expect(schema).toMatch(/exchangeSparkModerationHistoryTable = pgTable\("exchange_spark_moderation_history"/);
    expect(schema).toMatch(/moderation_reason: text\("moderation_reason"\)/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS exchange_spark_moderation_history/);
  });

  it("offers actionable admin decisions and refreshes the held queue after resolution", async () => {
    const adminUi = await fs.readFile(adminUiPath, "utf8");
    expect(adminUi).toMatch(/\/api\/admin\/exchange\/sparks\/held/);
    expect(adminUi).toMatch(/\/api\/admin\/exchange\/sparks\/\$\{spark\.id\}\/resolve/);
    expect(adminUi).toMatch(/"✓ Approve & publish"/);
    expect(adminUi).toMatch(/"✕ Reject"/);
    expect(adminUi).toMatch(/required to reject/);
    expect(adminUi).toMatch(/exchange-sparks.*Exchange Sparks/s);
    expect(adminUi).toMatch(/setSparks\(\(current\) => current\.filter/);
  });
});