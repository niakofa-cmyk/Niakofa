import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import {
  exchangeSparkFeatureUnavailableCode,
  safeExchangeSparkFailureCode,
  singlePublishableExchangeSparkAsset,
} from "../lib/community-exchange-spark-drafts";

const routePath = new URL("../routes/community-exchange-spark-drafts.ts", import.meta.url);
const indexPath = new URL("../routes/index.ts", import.meta.url);

const readyAsset = {
  owner_user_id: 7,
  context_kind: "story",
  context_id: 51,
  media_type: "video",
  mime_type: "video/mp4",
  byte_size: 8_000_000,
  duration_ms: 59_999,
  status: "ready",
  variant_key: "media-assets/51/variant.mp4",
  metadata: { signature_validated: true },
};

describe("direct-binary Exchange Spark draft contract", () => {
  it("requires V21, cloud storage, and queue readiness without enabling the feature", () => {
    expect(exchangeSparkFeatureUnavailableCode({
      v21Enabled: false,
      cloudStorageReady: true,
      queueReady: true,
    })).toBe("MEDIA_PLATFORM_DISABLED");
    expect(exchangeSparkFeatureUnavailableCode({
      v21Enabled: true,
      cloudStorageReady: false,
      queueReady: true,
    })).toBe("MEDIA_STORAGE_UNAVAILABLE");
    expect(exchangeSparkFeatureUnavailableCode({
      v21Enabled: true,
      cloudStorageReady: true,
      queueReady: false,
    })).toBe("MEDIA_PROCESSING_UNAVAILABLE");
    expect(exchangeSparkFeatureUnavailableCode({
      v21Enabled: true,
      cloudStorageReady: true,
      queueReady: true,
    })).toBeNull();
  });

  it("allows only one owned, validated, ready video variant no longer than 60 seconds", () => {
    expect(singlePublishableExchangeSparkAsset([readyAsset], 7, 51)).toEqual(readyAsset);
    expect(singlePublishableExchangeSparkAsset([readyAsset], 8, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([readyAsset], 7, 52)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([{ ...readyAsset, status: "processing" }], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([{ ...readyAsset, status: "failed" }], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([{ ...readyAsset, duration_ms: 60_001 }], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([{ ...readyAsset, duration_ms: null }], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([{ ...readyAsset, variant_key: null }], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([
      readyAsset,
      { ...readyAsset, id: 52 },
    ], 7, 51)).toBeNull();
    expect(singlePublishableExchangeSparkAsset([], 7, 51)).toBeNull();
  });

  it("returns only safe media failure codes", () => {
    expect(safeExchangeSparkFailureCode("MEDIA_TRANSCODE_FAILED: secret path")).toBe("MEDIA_TRANSCODE_FAILED");
    expect(safeExchangeSparkFailureCode("unstructured worker failure")).toBe("MEDIA_PROCESSING_FAILED");
    expect(safeExchangeSparkFailureCode(null)).toBeNull();
  });

  it("registers owner draft, status, and transactional idempotent publish endpoints", async () => {
    const [route, index] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(indexPath, "utf8"),
    ]);

    expect(index).toMatch(/communityExchangeSparkDraftsRouter/);
    expect(route).toMatch(/\/community\/exchange\/listings\/:listingId\/sparks\/drafts/);
    expect(route).toMatch(/\/community\/exchange\/sparks\/drafts\/:sparkId/);
    expect(route).toMatch(/\/community\/exchange\/sparks\/drafts\/:sparkId\/publish/);
    expect(route).toMatch(/isMediaPlatformV21Enabled\(\)/);
    expect(route).toMatch(/getStorageReadiness\(\)/);
    expect(route).toMatch(/storage\.cloud_configured && storage\.credentials_present/);
    expect(route).toMatch(/mediaProcessingQueue/);
    expect(route).toMatch(/tx\.insert\(communityStoryMediaTable\)/);
    expect(route).toMatch(/singlePublishableExchangeSparkAsset\(assets, userId, sparkId\)/);
    expect(route).toMatch(/story\.status === "published" \|\| story\.status === "pending"/);
    expect(route).toMatch(/status: "draft"/);
  });
});