import {
  getStorageBackend,
  getStorageDescription,
  isCloudStorageConfigured,
} from "./storage";

export type StorageReadiness = {
  backend: "s3" | "local";
  description: string;
  cloud_configured: boolean;
  credentials_present: boolean;
  media_platform_flag: boolean;
  production_media_safe: boolean;
  missing: string[];
};

/**
 * Describe storage without revealing bucket credentials.
 *
 * `STORAGE_BUCKET` selects the cloud backend, but a production media
 * deployment also needs credentials and (for custom endpoints) a region.
 * The explicit env argument keeps this helper deterministic in tests and
 * prevents a health contract from accidentally reading a different process
 * environment than the caller supplied.
 */
export function getStorageReadiness(
  env: NodeJS.ProcessEnv = process.env,
): StorageReadiness {
  const bucket = Boolean(env["STORAGE_BUCKET"]?.trim());
  const endpoint = Boolean(env["STORAGE_ENDPOINT"]?.trim());
  const region = Boolean(env["STORAGE_REGION"]?.trim());
  const accessKey = Boolean(env["AWS_ACCESS_KEY_ID"]?.trim());
  const secretKey = Boolean(env["AWS_SECRET_ACCESS_KEY"]?.trim());
  const mediaPlatformFlag = env["MEDIA_PLATFORM_V21"] === "1";
  const production = env["NODE_ENV"] === "production";
  const missing: string[] = [];

  if (bucket) {
    if (endpoint && !region) missing.push("STORAGE_REGION");
    if (!accessKey) missing.push("AWS_ACCESS_KEY_ID");
    if (!secretKey) missing.push("AWS_SECRET_ACCESS_KEY");
  } else if (mediaPlatformFlag && production) {
    missing.push("STORAGE_BUCKET");
  }

  const credentialsPresent = !bucket || (accessKey && secretKey);
  const configurationComplete =
    bucket && credentialsPresent && (!endpoint || region);

  return {
    backend: getStorageBackend(env),
    description: getStorageDescription(env),
    cloud_configured: isCloudStorageConfigured(env),
    credentials_present: credentialsPresent,
    media_platform_flag: mediaPlatformFlag,
    production_media_safe:
      !production || !mediaPlatformFlag || configurationComplete,
    missing,
  };
}