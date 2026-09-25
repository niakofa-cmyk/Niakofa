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

const COMMUNITY_SECTION_ALIASES: Readonly<Record<string, string>> = {
  stories: "moments",
  circles: "spirals",
};

export function normalizeCommunityRoute(section: string): string {
  return COMMUNITY_SECTION_ALIASES[section] ?? section;
}

export function isCommunityPrimaryNavKey(value: string): value is CommunityPrimaryNavKey {
  return (COMMUNITY_EXPERIENCE.primaryNavigation as readonly string[]).includes(value);
}

export function canonicalCommunityRoute(section: string): string {
  const normalized = normalizeCommunityRoute(section);
  if (normalized === "home") return COMMUNITY_EXPERIENCE.routes.home;
  if (normalized === "moments") return COMMUNITY_EXPERIENCE.routes.moments;
  if (normalized === "spirals") return COMMUNITY_EXPERIENCE.routes.spirals;
  if (normalized === "people") return COMMUNITY_EXPERIENCE.routes.people;
  return `/community/${normalized}`;
}

export function isLegacyCommunitySection(section: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMUNITY_SECTION_ALIASES, section);
}
