/**
 * Extended User type — adds server-side fields that the API returns but are
 * not yet reflected in the generated @workspace/api-client-react User type.
 *
 * When these fields are added to openapi.yaml and codegen is re-run, remove
 * the corresponding lines here.
 */
import type { User } from "@workspace/api-client-react";

export interface ExtendedUser extends User {
  /** Number of help requests the user has made */
  request_count?: number;
  /** Government ID verification status */
  identity_verified?: boolean;
  /** Background check status */
  background_check_status?: "not_started" | "pending" | "completed" | "failed";
  /** Helper skills array (set during helper onboarding) */
  helper_skills?: string[];
  /** Helper biography text */
  helper_bio?: string;
  /** Helper languages */
  helper_languages?: string[];
  /** Helper vehicle info */
  helper_vehicle?: string;
  /** Helper social links */
  helper_social_links?: Record<string, string>;
  /** Whether two-factor auth is enabled */
  two_factor_enabled?: boolean;
  /** Whether profile is publicly visible */
  public_profile?: boolean;
  /** Whether live location sharing is enabled */
  live_location?: boolean;
  /** Activity visibility setting */
  activity_visible?: boolean;
}

/**
 * Cast a User to ExtendedUser.
 * Use this instead of `as any` to preserve type safety at call sites.
 */
export function asExtended(user: User | null): ExtendedUser | null {
  return user as ExtendedUser | null;
}
