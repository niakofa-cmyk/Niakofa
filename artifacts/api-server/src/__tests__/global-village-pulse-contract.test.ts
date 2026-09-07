import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/global-village-pulse.ts"),
  "utf8",
);

describe("Global Village pulse database contract", () => {
  it("uses the canonical help_requests table for deduplicated request totals", () => {
    expect(routeSource).toContain("FROM help_requests r");
    expect(routeSource).not.toMatch(/FROM requests r/);
  });
});