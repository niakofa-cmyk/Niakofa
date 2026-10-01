import { authHeaders } from "@/lib/auth";

export type MomentMediaItem = {
  id: number;
  media_type: "photo" | "video" | "audio" | string;
  media_url: string;
  alt_text?: string | null;
  mime_type?: string;
};

export type CreatorMoment = {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  caption: string | null;
  audience: string;
  created_at: string | null;
  expires_at: string | null;
  author: { id: number; name: string; avatar_url: string | null };
  media: MomentMediaItem[];
  moment_video?: { status: string; playback_grant_url: string; duration_ms?: number | null } | null;
  featured_at?: string | null;
  archive_enabled?: boolean;
  remix_enabled?: boolean;
  response_to_story_id?: number | null;
  response_to?: { story_id: number | null; author_user_id: number | null; author_name: string | null } | null;
  challenge_key?: string | null;
};

export type CreatorMomentsResponse = {
  stories: CreatorMoment[];
  creator: { id: number; name: string; avatar_url: string | null };
  viewer_user_id: number;
  next_cursor: string | null;
};

export type WeeklyMomentChallenge = {
  challenge: { key: string; prompt: string; starts_at: string; ends_at: string; participant_count: number };
};

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

export function getCreatorMoments(authorId: number, view: "published" | "archive" | "featured", cursor?: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ view });
  if (cursor) params.set("cursor", cursor);
  return requestJson<CreatorMomentsResponse>(`/api/community/stories/creator/${authorId}?${params}`, { signal });
}

export function getWeeklyMomentChallenge(hubId: number | null, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (hubId !== null) params.set("hubId", String(hubId));
  return requestJson<WeeklyMomentChallenge>(`/api/community/stories/challenge${params.size ? `?${params}` : ""}`, { signal });
}

export function archiveMoment(storyId: number) {
  return requestJson(`/api/community/stories/${storyId}/archive`, { method: "POST" });
}

export function setMomentFeatured(storyId: number, featured: boolean) {
  return requestJson(`/api/community/stories/${storyId}/featured`, { method: featured ? "POST" : "DELETE" });
}

export function updateMomentSettings(storyId: number, remixEnabled: boolean) {
  return requestJson(`/api/community/stories/${storyId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remix_enabled: remixEnabled }),
  });
}

export async function deleteMoment(storyId: number) {
  const result = await requestJson<{ deleted: boolean }>(`/api/community/stories/${storyId}`, { method: "DELETE" });
  if (!result.deleted) throw new Error("This Moment could not be deleted.");
  return result;
}