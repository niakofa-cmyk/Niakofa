import { authHeaders } from "@/lib/auth";

export type HubCommunityFeed = {
  hub: {
    id: number;
    name: string;
    display_name: string;
    region: string | null;
    country_code: string | null;
    subdivision_code: string | null;
    hub_scope: string | null;
  };
  counts: { members: number; open_requests: number; gratitude: number; posts: number };
  gratitude: Array<{
    id: number;
    author_name: string | null;
    author_avatar: string | null;
    helper_name: string | null;
    message: string;
    request_title: string | null;
    likes: number;
    created_at: string | null;
  }>;
  requests: Array<{
    id: number;
    title: string;
    category: string | null;
    urgency: string | null;
    status: string;
    created_at: string | null;
  }>;
  posts: Array<{
    id: number;
    hub_id: number;
    body: string;
    author_id: number;
    author_name: string | null;
    author_avatar: string | null;
    created_at: string;
    media: Array<{ id: number; post_id: number; mime_type: string; alt_text: string | null; media_url: string }>;
    comments: Array<{ id: number; post_id: number; body: string; author_name: string | null; author_avatar: string | null; created_at: string }>;
    reaction_count: number;
    viewer_reacted: boolean;
  }>;
  actions: { community: string; messages: string; spirals: string };
  context: { membership_is_not_inferred_from_location: true; spirals_are_curated: true };
  permissions: { can_post: boolean; can_comment: boolean; can_react: boolean };
};

function normalizeHubId(value: number | string): number {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error("Invalid Hub id.");
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid Hub id.");
  return id;
}

export async function fetchHubCommunityFeed(hubId: number | string): Promise<HubCommunityFeed> {
  const id = normalizeHubId(hubId);
  const response = await fetch(`/api/community/hubs/${encodeURIComponent(String(id))}/feed`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Could not load Hub feed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<HubCommunityFeed>;
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || `${fallback} (HTTP ${response.status}).`);
  return data as T;
}

export async function createHubCommunityPost(hubId: number | string, body: string): Promise<{ post: { id: number } }> {
  const id = normalizeHubId(hubId);
  return parseResponse<{ post: { id: number } }>(await fetch(`/api/community/hubs/${id}/posts`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  }), "Could not publish this Hub post");
}

export async function uploadHubCommunityMedia(
  hubId: number | string,
  postId: number,
  dataUrl: string,
  altText?: string,
): Promise<void> {
  const id = normalizeHubId(hubId);
  await parseResponse(await fetch(`/api/community/hubs/${id}/posts/${postId}/media`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl, alt_text: altText }),
  }), "Could not attach this media");
}

export async function addHubCommunityComment(hubId: number | string, postId: number, body: string): Promise<void> {
  const id = normalizeHubId(hubId);
  await parseResponse(await fetch(`/api/community/hubs/${id}/posts/${postId}/comments`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  }), "Could not add this comment");
}

export async function toggleHubCommunityReaction(hubId: number | string, postId: number): Promise<void> {
  const id = normalizeHubId(hubId);
  await parseResponse(await fetch(`/api/community/hubs/${id}/posts/${postId}/reactions`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ reaction: "heart" }),
  }), "Could not update this reaction");
}
