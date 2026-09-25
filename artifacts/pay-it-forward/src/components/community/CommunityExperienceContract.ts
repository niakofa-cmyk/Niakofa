/**
 * Canonical Community experience contract.
 *
 * Product language is intentionally separated from persistence/API names.
 * This lets Niakofa evolve the experience from Stories/Circles to
 * Moments/Sparks/Spirals without breaking the mature story/media boundary.
 */
export const COMMUNITY_EXPERIENCE = {
  primaryNavigation: ["home", "moments", "spirals", "people", "notifications"] as const,
  routes: {
    home: "/community",
    moments: "/community/moments",
    spirals: "/community/spirals",
    people: "/community/people",
    notifications: "/notifications",
    messages: "/messages",
  },
  legacyRoutes: {
    stories: "/community/stories",
    circles: "/community/circles",
  },
  vocabulary: {
    destination: "Moments",
    itemSingular: "Spark",
    itemPlural: "Sparks",
    community: "Spirals",
    durableNarrative: "Stories",
    preservedMemory: "Legacy",
  },
  principles: {
    preserveStoryApi: true,
    preserveAuthenticatedMedia: true,
    preserveDeepLinks: true,
    separateNiaAi: true,
  },
} as const;

export type CommunityPrimaryNavKey =
  (typeof COMMUNITY_EXPERIENCE.primaryNavigation)[number];

export function normalizeCommunityRoute(section: string): string {
  if (section === "stories") return "moments";
  if (section === "circles") return "spirals";
  return section;
}
