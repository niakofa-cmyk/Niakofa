/** Persisted Spirit Animal values accepted by the API. */
export const VALID_SPIRIT_ANIMALS = ["sankofa_bird", "black_panther"] as const;

export type SpiritAnimalId = typeof VALID_SPIRIT_ANIMALS[number];

export function isValidSpiritAnimal(value: unknown): value is SpiritAnimalId {
  return typeof value === "string" &&
    (VALID_SPIRIT_ANIMALS as readonly string[]).includes(value);
}