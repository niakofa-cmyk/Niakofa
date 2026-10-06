import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { certifyObjectStorage } from "./verify-object-storage.mjs";

const PROBE_KEY_PATTERN =
  /^media-assets\/_probe\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/i;

function configurationError(probeCode, message) {
  const error = new Error(message);
  error.probeCode = probeCode;
  error.safeForLogging = true;
  return error;
}

export function resolveRailwayProbeConfiguration(env) {
  const bucket = (env.STORAGE_BUCKET ?? "").trim();
  const expectedBucket = (env.EXPECTED_STORAGE_BUCKET ?? "").trim();
  const endpoint = (env.STORAGE_ENDPOINT ?? "").trim();
  const region = (env.STORAGE_REGION ?? "").trim() || "auto";
  const accessKey = (env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretKey = (env.AWS_SECRET_ACCESS_KEY ?? "").trim();
  const key = (env.PROBE_KEY ?? "").trim();

  if (!bucket) {
    throw configurationError(
      "bucket_missing",
      "STORAGE_BUCKET is missing; no object written",
    );
  }
  if (!expectedBucket || bucket !== expectedBucket) {
    throw configurationError(
      "bucket_mismatch",
      "configured storage bucket does not match the independently verified target; no object written",
    );
  }
  if (!endpoint) {
    throw configurationError(
      "endpoint_missing",
      "STORAGE_ENDPOINT is missing; no object written",
    );
  }
  if (!PROBE_KEY_PATTERN.test(key)) {
    throw configurationError(
      "probe_key_invalid",
      "PROBE_KEY is not a dated UUID text key in media-assets/_probe/; no object written",
    );
  }
  if (!accessKey || !secretKey) {
    throw configurationError(
      "credentials_missing",
      "storage credentials are missing; no object written",
    );
  }

  return { bucket, endpoint, region, accessKey, secretKey, key };
}

export async function runRailwayStorageProbe(
  env,
  { createClient = (config) => new S3Client(config) } = {},
) {
  const config = resolveRailwayProbeConfiguration(env);
  const client = createClient({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    maxAttempts: 1,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  try {
    const result = await certifyObjectStorage({
      client,
      commands: {
        PutObjectCommand,
        HeadObjectCommand,
        GetObjectCommand,
        DeleteObjectCommand,
      },
      bucket: config.bucket,
      key: config.key,
      body: Buffer.from(`storage probe ${randomUUID()}\n`, "utf8"),
    });
    return { ...result, backend: "s3-compatible" };
  } finally {
    client?.destroy?.();
  }
}
