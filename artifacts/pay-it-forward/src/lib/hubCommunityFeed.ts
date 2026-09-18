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
  counts: { members: number; open_requests: number; gratitude: number };
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
  actions: { community: string; messages: string; spirals: string };
  context: { membership_is_not_inferred_from_location: true; spirals_are_curated: true };
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
