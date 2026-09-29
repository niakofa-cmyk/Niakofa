type MediaCleanupAsset = {
  id?: number;
  original_key: string;
  thumbnail_key?: string | null;
  variant_key?: string | null;
  cleanup_keys?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Keep every provider key that may have been created for an asset durable
 * through deletion retries. The cleanup ledger is written before a worker
 * starts an external object write, so a later tombstone can still reconcile
 * deterministic variants after a worker restart.
 */
export function mediaStorageKeys(asset: MediaCleanupAsset): string[] {
  const ledger = [
    ...(Array.isArray(asset.cleanup_keys) ? asset.cleanup_keys : []),
    ...(Array.isArray(asset.metadata?.["storage_cleanup_keys"]) ? asset.metadata["storage_cleanup_keys"] : []),
    ...(Array.isArray(asset.metadata?.["temp_keys"]) ? asset.metadata["temp_keys"] : []),
  ].filter((key): key is string => typeof key === "string" && key.length > 0);
  const deterministicVariants = asset.id
    ? [`media-assets/${asset.id}/thumbnail.jpg`, `media-assets/${asset.id}/variant.mp4`, `media-assets/${asset.id}/variant-mixed.mp4`]
    : [];
  return [...new Set([
    ...deterministicVariants,
    asset.original_key,
    asset.thumbnail_key,
    asset.variant_key,
    ...ledger,
  ].filter((key): key is string => Boolean(key)))];
}