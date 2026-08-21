import type { LegacyLaunchContext } from "@niakofa/shared-types";

/**
 * Mock-first launch context. Live launches may pass opaque references through
 * query parameters, but the RPG never receives or persists family biography.
 */
export function getLegacyLaunchContext(): LegacyLaunchContext {
  if (typeof window === "undefined") {
    return { mode: "mock", characterId: "kwame-mensah", gameHour: 14 };
  }

  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get("token") ?? undefined;
  const familyId = params.get("familyId") ?? undefined;
  const characterId = params.get("characterId") ?? "kwame-mensah";

  return sessionToken || familyId
    ? { mode: "live", familyId, characterId, sessionToken, gameHour: 14 }
    : { mode: "mock", characterId, gameHour: 14 };
}