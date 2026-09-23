import { authHeaders } from "@/lib/auth";

export type VisualDiscoveryKind = "all" | "photo" | "video" | "audio";

export type VisualDiscoveryItem = {
  id: number;
  post_id: number;
  mime_type: string;
  alt_text: string | null;
  media_asset_id: number | null;
  media_status: string | null;
  body: string;
  author_name: string | null;
  author_avatar: string | null;
  created_at: string;
  media_url: string;
  thumbnail_url: string | null;
  context: {
    label: string;
    href: string;
  };
};

export type VisualDiscoveryPage = {
  hub: {
    id: number;
    name: string;
    display_name: string;
    region: string | null;
  };
  items: VisualDiscoveryItem[];
  next_cursor: string | null;
  has_more: boolean;
  filters: {
    q: string;
    kind: VisualDiscoveryKind;
  };
};

export async function fetchCommunityVisualDiscovery(
  hubId: number | string,
  options: {
    cursor?: string | null;
    query?: string;
    kind?: VisualDiscoveryKind;
    limit?: number;
  } = {},
): Promise<VisualDiscoveryPage> {
  const id = String(hubId).trim();
  if (!/^\d+$/.test(id) || Number(id) <= 0) throw new Error("Invalid Hub id.");

  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.query?.trim()) params.set("q", options.query.trim());
  if (options.kind && options.kind !== "all") params.set("kind", options.kind);
  params.set("limit", String(options.limit ?? 18));

  const response = await fetch(`/api/community/hubs/${encodeURIComponent(id)}/media?${params.toString()}`, {
    headers: authHeaders(),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || `Could not load Community Media (HTTP ${response.status}).`);
  return data as VisualDiscoveryPage;
}