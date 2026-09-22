import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migrationPath = new URL(
  "../../../../lib/db/migrations/0133_neighborhood_spiral_provisioning.sql",
  import.meta.url,
);

describe("first-request Spiral provisioning", () => {
  it("backfills existing neighborhoods and provisions new rows idempotently", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    expect(sql).toMatch(/INSERT INTO audio_circles/i);
    expect(sql).toMatch(/ON CONFLICT \(neighborhood_id\) WHERE neighborhood_id IS NOT NULL DO NOTHING/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ensure_neighborhood_spiral_row/i);
    expect(sql).toMatch(/AFTER INSERT ON city_neighborhoods/i);
    expect(sql).toMatch(/CREATE TRIGGER city_neighborhoods_ensure_spiral/i);
  });
});
