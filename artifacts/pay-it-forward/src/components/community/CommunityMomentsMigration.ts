/**
 * Product vocabulary for the Community short-form migration.
 *
 * The existing community-story API and records remain the persistence
 * boundary; these names describe the user-facing experience only.
 */
export const COMMUNITY_CONTENT_LANGUAGE = {
  destination: "Moments",
  itemSingular: "Spark",
  itemPlural: "Sparks",
  community: "Spirals",
  durableNarrative: "Stories",
  preservedMemory: "Legacy",
} as const;

export const MOMENTS_ROUTE = "/community/moments" as const;
export const LEGACY_MOMENTS_ROUTE = "/community/stories" as const;
export const SPIRALS_ROUTE = "/community/spirals" as const;
export const LEGACY_SPIRALS_ROUTE = "/community/circles" as const;

export function normalizeCommunitySection(section: string): string {
  if (section === "stories") return "moments";
  if (section === "circles") return "spirals";
  return section;
}