/**
 * Compatibility layer for the Community short-form migration.
 *
 * The existing community-story API and records remain the persistence
 * boundary; these names describe the user-facing experience only.
 */
import {
  COMMUNITY_EXPERIENCE,
  canonicalCommunityRoute,
  normalizeCommunityRoute,
} from "./CommunityExperienceContract";

export { CommunityMomentsUploader } from "./CommunityMomentsUploader";
export type { CommunityMomentContext } from "@/lib/community-moments-upload";

export const COMMUNITY_CONTENT_LANGUAGE = COMMUNITY_EXPERIENCE.vocabulary;

export const MOMENTS_ROUTE = COMMUNITY_EXPERIENCE.routes.moments;
export const LEGACY_MOMENTS_ROUTE = COMMUNITY_EXPERIENCE.legacyRoutes.stories;
export const SPIRALS_ROUTE = COMMUNITY_EXPERIENCE.routes.spirals;
export const LEGACY_SPIRALS_ROUTE = COMMUNITY_EXPERIENCE.legacyRoutes.circles;

export function normalizeCommunitySection(section: string): string {
  return normalizeCommunityRoute(section);
}

export function canonicalCommunitySectionRoute(section: string): string {
  return canonicalCommunityRoute(section);
}
