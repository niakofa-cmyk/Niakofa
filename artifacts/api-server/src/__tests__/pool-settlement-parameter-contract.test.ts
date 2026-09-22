import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pool settlement SQL parameter contract", () => {
  it("casts nullable settlement metadata and ledger identifiers explicitly", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/advance-pool-settlement-status.ts"),
      "utf8",
    );
    expect(source).toContain("CAST(${availableOn} AS text)");
    expect(source).toContain("CAST(${row.userId} AS integer)");
    expect(source).toContain("CAST(${row.ledgerId} AS integer)");
  });
});