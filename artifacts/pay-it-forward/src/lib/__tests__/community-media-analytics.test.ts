import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildCommunityMediaEventPayload,
  type CommunityMediaAnalyticsProperties,
} from "../communityMediaAnalytics";

describe("Community Media analytics", () => {
  test("keeps the event payload bounded and free of search or profile content", () => {
    const properties: CommunityMediaAnalyticsProperties = {
      hub_id: 42,
      media_id: 101,
      requested_kind: "photo",
      media_ids: [101, 102],
      result_count: 2,
      result_kind_counts: { photo: 2 },
      has_more: false,
      has_query: true,
      page_number: 1,
    };
    const payload = buildCommunityMediaEventPayload(
      "community_media_gallery_viewed",
      properties,
      "anonymous-test-id",
    );

    assert.deepEqual(payload, {
      event: "community_media_gallery_viewed",
      properties: {
        ...properties,
        distinct_id: "anonymous-test-id",
      },
    });
    assert.equal("query" in payload.properties, false);
    assert.equal("body" in payload.properties, false);
    assert.equal("author_name" in payload.properties, false);
  });

  test("uses only the approved bounded Community Media events", () => {
    const source = [
      "community_media_gallery_viewed",
      "community_media_filter_changed",
      "community_media_pagination_loaded",
      "community_media_context_opened",
      "community_media_quick_view_opened",
      "community_media_save_changed",
    ];
    assert.equal(new Set(source).size, 6);
  });
});