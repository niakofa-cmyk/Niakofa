import { authHeaders } from "./auth";

export const MAX_COMMUNITY_STORY_WATCH_CONTRIBUTION_MS = 5 * 60 * 1000;

export type CommunityStoryWatchContribution = {
  storyId: number;
  eventId: string;
  durationMs: number;
  completed: boolean;
};

export function createCommunityStoryWatchContribution(
  storyId: number,
  durationMs: number,
  completed: boolean,
  createId: () => string = () => crypto.randomUUID(),
): CommunityStoryWatchContribution {
  if (!Number.isSafeInteger(storyId) || storyId < 1) throw new Error("A valid Story id is required for watch analytics.");
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > MAX_COMMUNITY_STORY_WATCH_CONTRIBUTION_MS) {
    throw new Error("Watch duration contribution is outside the permitted range.");
  }
  if (!completed && durationMs === 0) throw new Error("An empty watch contribution cannot be recorded.");
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Secure event IDs are unavailable; watch analytics were not sent.");
  }
  return { storyId, eventId: createId(), durationMs, completed };
}

/**
 * Sends one immutable contribution. A retry reuses this contribution's UUID,
 * making the server-side transaction idempotent across transient failures.
 */
export async function postCommunityStoryWatchContribution(
  contribution: CommunityStoryWatchContribution,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const request = {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    credentials: "same-origin" as const,
    keepalive: true,
    body: JSON.stringify({
      event_id: contribution.eventId,
      duration_ms: contribution.durationMs,
      completed: contribution.completed,
    }),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(`/api/community/stories/${contribution.storyId}/watch`, request);
    } catch (reason) {
      if (attempt === 1) throw reason instanceof Error ? reason : new Error("This Story watch contribution could not be saved.");
      continue;
    }
    if (response.ok) return;
    if ((response.status === 429 || response.status >= 500) && attempt === 0) continue;
    throw new Error("This Story watch contribution could not be saved.");
  }
}