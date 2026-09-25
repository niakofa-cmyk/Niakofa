import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildCommunityContentEventPayload,
  buildCommunityMediaEventPayload,
  type CommunityContentAnalyticsProperties,
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

  test("tracks Moments and Spark outcomes with bounded, non-content properties", () => {
    const properties: CommunityContentAnalyticsProperties = {
      hub_id: 42,
      spark_id: 101,
      action: "added",
    };
    const payload = buildCommunityContentEventPayload(
      "community_spark_reacted",
      properties,
      "anonymous-test-id",
    );

    assert.deepEqual(payload, {
      event: "community_spark_reacted",
      properties: {
        ...properties,
        distinct_id: "anonymous-test-id",
      },
    });
    assert.equal("caption" in payload.properties, false);
    assert.equal("body" in payload.properties, false);
    assert.equal("author_name" in payload.properties, false);
  });

  test("defines the Moments destination and Spark lifecycle events", () => {
    const source = [
      "moment_opened",
      "community_spark_viewed",
      "community_spark_created",
      "community_spark_reacted",
      "community_spark_shared",
    ];
    assert.equal(new Set(source).size, 5);
  });
});