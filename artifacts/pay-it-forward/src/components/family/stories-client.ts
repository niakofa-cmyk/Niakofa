import { authHeaders } from "@/lib/auth";

export type StoryPrecision = "day" | "month" | "year" | "decade" | "circa";
export interface FamilyStory {
  id: number;
  family_id: number;
  author_id: number | null;
  author: { name: string; avatar_url: string | null } | null;
  viewer_can_manage: boolean;
  title: string;
  body: string;
  audience: "family" | "private";
  category: string | null;
  language: string | null;
  memory_id: number | null;
  date_year: number | null;
  date_month: number | null;
  date_day: number | null;
  date_precision: StoryPrecision | null;
  date_label: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}
export interface StoriesPage {
  stories: FamilyStory[];
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}
export type StoryInput = {
  title: string;
  body: string;
  audience: "family" | "private";
  category?: "oral" | "written" | "tradition" | "recipe" | "song" | "proverb" | "biography";
  memory_id?: number | null;
  language?: string;
  tags?: string[];
  date_year?: number | null;
  date_month?: number | null;
  date_day?: number | null;
  date_precision?: StoryPrecision | null;
};
export interface MemoryAsset {
  id: number;
  storage_key: string;
  mime_type: string;
  asset_type: string;
  transcript: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { ...authHeaders(), ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || (response.status === 401 ? "Your session has expired. Please sign in again." : `Request failed (${response.status}).`));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const storiesClient = {
  list: (familyId: number, page: number) =>
    request<StoriesPage>(`/api/family/${familyId}/stories?page=${page}&limit=10`),
  create: (familyId: number, input: StoryInput) =>
    request<unknown>(`/api/family/${familyId}/stories`, { method: "POST", body: JSON.stringify(input) }),
  update: (familyId: number, storyId: number, input: StoryInput) =>
    request<unknown>(`/api/family/${familyId}/stories/${storyId}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (familyId: number, storyId: number) =>
    request<unknown>(`/api/family/${familyId}/stories/${storyId}`, { method: "DELETE" }),
  memory: (familyId: number, memoryId: number) =>
    request<{ assets: MemoryAsset[] }>(`/api/family/${familyId}/memories/${memoryId}`),
  memories: (familyId: number, query: string) =>
    request<{ memories: Array<{ id: number; title: string | null; source: string; primary_asset: { asset_type: string } | null }> }>(
      `/api/family/${familyId}/memories?${new URLSearchParams({ limit: "30", ...(query ? { q: query } : {}) })}`),
  mine: () => request<{ families: Array<{ id: number; name: string; my_role: string; status: string }> }>("/api/family/mine"),
  keepMoment: (familyId: number, momentId: number) =>
    request<unknown>(`/api/family/${familyId}/stories/keep-moment`, { method: "POST", body: JSON.stringify({ moment_id: momentId }) }),
};