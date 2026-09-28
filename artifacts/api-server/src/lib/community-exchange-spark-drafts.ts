export type ExchangeSparkMediaAssetCandidate = {
  owner_user_id: number;
  context_kind: string;
  context_id: number;
  media_type: string;
  mime_type: string;
  byte_size: number;
  duration_ms: number | null;
  status: string;
  variant_key: string | null;
  metadata: Record<string, unknown>;
};

export function exchangeSparkFeatureUnavailableCode(readiness: {
  v21Enabled: boolean;
  cloudStorageReady: boolean;
  queueReady: boolean;
}): string | null {
  if (!readiness.v21Enabled) return "MEDIA_PLATFORM_DISABLED";
  if (!readiness.cloudStorageReady) return "MEDIA_STORAGE_UNAVAILABLE";
  if (!readiness.queueReady) return "MEDIA_PROCESSING_UNAVAILABLE";
  return null;
}

export function isPublishableExchangeSparkAsset(
  asset: ExchangeSparkMediaAssetCandidate,
  ownerUserId: number,
  sparkId: number,
): boolean {
  return asset.owner_user_id === ownerUserId
    && asset.context_kind === "exchange_spark"
    && asset.context_id === sparkId
    && asset.media_type === "video"
    && asset.mime_type.startsWith("video/")
    && Number.isSafeInteger(asset.byte_size)
    && asset.byte_size > 0
    && asset.status === "ready"
    && typeof asset.variant_key === "string"
    && asset.variant_key.length > 0
    && asset.duration_ms !== null
    && Number.isSafeInteger(asset.duration_ms)
    && asset.duration_ms > 0
    && asset.duration_ms <= 60_000
    && asset.metadata.signature_validated === true;
}

export function singlePublishableExchangeSparkAsset<T extends ExchangeSparkMediaAssetCandidate>(
  assets: T[],
  ownerUserId: number,
  sparkId: number,
): T | null {
  if (assets.length !== 1 || !isPublishableExchangeSparkAsset(assets[0]!, ownerUserId, sparkId)) return null;
  return assets[0]!;
}

export function safeExchangeSparkFailureCode(failureReason: string | null): string | null {
  if (!failureReason) return null;
  return failureReason.match(/^MEDIA_[A-Z0-9_]+/)?.[0] ?? "MEDIA_PROCESSING_FAILED";
}