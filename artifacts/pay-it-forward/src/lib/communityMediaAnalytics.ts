import type { VisualDiscoveryKind } from "@/lib/communityVisualDiscovery";

const POSTHOG_KEY = import.meta.env?.VITE_POSTHOG_KEY ?? "";
const POSTHOG_HOST = (import.meta.env?.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");
const DISTINCT_ID_KEY = "niakofa_analytics_distinct_id";
const OPT_OUT_KEY = "niakofa_analytics_opt_out";

export type CommunityMediaAnalyticsEvent =
  | "community_media_gallery_viewed"
  | "community_media_filter_changed"
  | "community_media_pagination_loaded"
  | "community_media_context_opened"
  | "community_media_quick_view_opened"
  | "community_media_save_changed";

export type CommunityMediaAnalyticsProperties = {
  hub_id?: number;
  media_id?: number;
  requested_kind?: VisualDiscoveryKind;
  media_kind?: Exclude<VisualDiscoveryKind, "all">;
  media_ids?: number[];
  result_count?: number;
  result_kind_counts?: Partial<Record<Exclude<VisualDiscoveryKind, "all">, number>>;
  has_more?: boolean;
  has_query?: boolean;
  page_number?: number;
  context_type?: "hub_post";
  saved?: boolean;
};

type CommunityMediaEventPayload = {
  event: CommunityMediaAnalyticsEvent;
  properties: CommunityMediaAnalyticsProperties & { distinct_id: string };
};

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Analytics must never affect the Community experience when storage is blocked.
  }
}

function getDistinctId(): string {
  const existing = readStorage(DISTINCT_ID_KEY);
  if (existing && /^[a-zA-Z0-9._-]{1,100}$/.test(existing)) return existing;

  const generated = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `anonymous-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(DISTINCT_ID_KEY, generated);
  return generated;
}

export function buildCommunityMediaEventPayload(
  event: CommunityMediaAnalyticsEvent,
  properties: CommunityMediaAnalyticsProperties,
  distinctId: string,
): CommunityMediaEventPayload {
  return {
    event,
    properties: {
      ...properties,
      distinct_id: distinctId,
    },
  };
}

export function trackCommunityMedia(
  event: CommunityMediaAnalyticsEvent,
  properties: CommunityMediaAnalyticsProperties,
): void {
  if (typeof window === "undefined" || !POSTHOG_KEY || readStorage(OPT_OUT_KEY) === "true") return;

  const payload = buildCommunityMediaEventPayload(event, properties, getDistinctId());
  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: POSTHOG_KEY, ...payload }),
    keepalive: true,
  }).catch(() => {
    // Observability is fail-open: a blocked analytics request must not affect the app.
  });
}