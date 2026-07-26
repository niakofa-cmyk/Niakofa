import { describe, expect, it } from "@jest/globals";
import {
  VALID_SPIRIT_ANIMALS,
  isValidSpiritAnimal,
} from "../lib/spirit-animal.js";

describe("Spirit Animal API contract", () => {
  it("keeps Sankofa Bird as the first/default persisted value", () => {
    expect(VALID_SPIRIT_ANIMALS[0]).toBe("sankofa_bird");
  });

  it("accepts both supported companions", () => {
    expect(isValidSpiritAnimal("sankofa_bird")).toBe(true);
    expect(isValidSpiritAnimal("black_panther")).toBe(true);
  });

  it("rejects unsupported and malformed values", () => {
    expect(isValidSpiritAnimal("dragon")).toBe(false);
    expect(isValidSpiritAnimal("BLACK_PANTHER")).toBe(false);
    expect(isValidSpiritAnimal(null)).toBe(false);
    expect(isValidSpiritAnimal(1)).toBe(false);
  });
});