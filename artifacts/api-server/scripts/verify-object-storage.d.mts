export interface ObjectStorageProbeResult {
  ok: true;
  probe: "put-head-get-delete";
  bytes: number;
  sha256: string;
  deleted: true;
  cleanup_attempts: number;
  media_platform_flag_unchanged: true;
  backend: "s3-compatible" | "aws-s3";
}

export function runConfiguredObjectStorageProbe(options?: {
  onBeforeWrite?: (key: string) => Promise<void> | void;
}): Promise<ObjectStorageProbeResult>;