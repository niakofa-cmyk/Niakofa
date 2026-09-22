import { describe, it } from "node:test";
import { expect } from "expect";
import { parseEtaSeconds } from "../eta";

describe("parseEtaSeconds", () => {
  const cases: Array<[string, number]> = [
    ["12 min", 12 * 60],
    ["1h 5min", 65 * 60],
    ["1 hour 5 minutes (moderate traffic)", 65 * 60],
    ["0.5 hrs", 30 * 60],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${input}`, () => {
      expect(parseEtaSeconds(input)).toBe(expected);
    });
  }

  it("returns zero when the provider gives no duration", () => {
    expect(parseEtaSeconds("route unavailable")).toBe(0);
  });
});