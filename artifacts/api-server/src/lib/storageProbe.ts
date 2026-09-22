/**
 * Server-side object-storage I/O certification.
 *
 * This is intentionally an operational primitive, not an HTTP route. Use it
 * from a Railway one-off shell or another trusted internal process. It never
 * returns credentials and keeps the probe object in a dedicated namespace.
 */

import { randomUUID } from "node:crypto";
import {
  getStorageDescription,
  isCloudStorageConfigured,
} from "./storage";

export type StorageProbeInput = {
  bucket: string;
  key: string;
  body: Buffer;
};

export type StorageProbeTransport = {
  put(input: StorageProbeInput): Promise<void>;
  head(input: Pick<StorageProbeInput, "bucket" | "key">): Promise<{
    contentLength: number | null;
  }>;
  delete(input: Pick<StorageProbeInput, "bucket" | "key">): Promise<void>;
};

export type StorageProbeResult =
  | {
      ok: true;
      backend: "s3-compatible" | "aws-s3";
      bucket: string;
      region: string;
      endpoint: string | null;
      probe: "put-head-delete";
      key: string;
      bytes: number;
      deleted: boolean;
      cleanup_attempts: number;
      media_platform_should_still_be_off: true;
    }
  | {
      ok: false;
      error: string;
      error_code: "STORAGE_NOT_CONFIGURED" | "STORAGE_PROBE_FAILED";
      description: string;
      cleanup_attempted: boolean;
      cleanup_succeeded: boolean | null;
      cleanup_attempts: number;
    };

export type StorageProbeOptions = {
  transport?: StorageProbeTransport;
  now?: () => Date;
  id?: () => string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    Code?: unknown;
    statusCode?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const statusCodes = [
    candidate.statusCode,
    candidate.$metadata?.httpStatusCode,
  ];
  if (statusCodes.some((statusCode) => Number(statusCode) === 404)) return true;
  return [candidate.name, candidate.code, candidate.Code].some((value) => (
    value === "NotFound" || value === "NoSuchKey" || value === "NoSuchObject"
  ));
}

async function createS3Transport(
  region: string,
  endpoint: string | undefined,
  accessKey: string,
  secretKey: string,
): Promise<StorageProbeTransport> {
  const {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
  });

  return {
    async put(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: "text/plain",
        }),
      );
    },
    async head(input) {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        }),
      );
      return { contentLength: result.ContentLength ?? null };
    },
    async delete(input) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        }),
      );
    },
  };
}

/**
 * Run PUT → HEAD → byte-count verification → DELETE → HEAD absence check.
 *
 * Cleanup is attempted even if PUT reports an error because an S3-compatible
 * provider may have accepted the object before the client observed a failure.
 * A failed cleanup is retried up to three total attempts and is reported
 * separately from the primary probe failure.
 */
export async function runStorageIoProbe(
  env: NodeJS.ProcessEnv = process.env,
  options: StorageProbeOptions = {},
): Promise<StorageProbeResult> {
  const bucket = (env.STORAGE_BUCKET ?? "").trim();
  const endpoint = (env.STORAGE_ENDPOINT ?? "").trim() || undefined;
  const region =
    (env.STORAGE_REGION ?? "").trim() || (endpoint ? "auto" : "us-east-1");
  const accessKey = (env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretKey = (env.AWS_SECRET_ACCESS_KEY ?? "").trim();
  const description = getStorageDescription(env);

  if (!isCloudStorageConfigured(env) || !bucket || !accessKey || !secretKey) {
    return {
      ok: false,
      error: "Cloud object storage and credentials are not fully configured.",
      error_code: "STORAGE_NOT_CONFIGURED",
      description,
      cleanup_attempted: false,
      cleanup_succeeded: null,
      cleanup_attempts: 0,
    };
  }

  const now = options.now ?? (() => new Date());
  const id = options.id ?? randomUUID;
  const key = `media-assets/_probe/${now().toISOString().slice(0, 10)}/${id()}.txt`;
  const body = Buffer.from(
    `niakofa-storage-probe ${now().toISOString()} ${id()}\n`,
    "utf8",
  );

  let cleanupAttempted = false;
  let cleanupSucceeded: boolean | null = null;
  let cleanupAttempts = 0;
  let cleanupError: string | null = null;

  try {
    const transport =
      options.transport ??
      (await createS3Transport(region, endpoint, accessKey, secretKey));
    const object = { bucket, key };

    const cleanup = async (): Promise<void> => {
      if (cleanupSucceeded === true || cleanupAttempts >= 3) return;
      cleanupAttempted = true;
      while (cleanupAttempts < 3 && cleanupSucceeded !== true) {
        cleanupAttempts += 1;
        try {
          await transport.delete(object);
          cleanupSucceeded = true;
          cleanupError = null;
        } catch (error) {
          cleanupError = errorMessage(error);
          cleanupSucceeded = false;
        }
      }
    };

    const verifyDeleted = async (): Promise<void> => {
      try {
        await transport.head(object);
      } catch (error) {
        if (isMissingObjectError(error)) {
          return;
        }
        throw new Error(
          `DELETE verification could not be confirmed: ${errorMessage(error)}`,
        );
      }
      throw new Error("DELETE verification failed: object is still readable");
    };

    try {
      await transport.put({ ...object, body });
      const head = await transport.head(object);
      const contentLength = Number(head.contentLength ?? -1);
      if (contentLength !== body.length) {
        throw new Error(
          `HEAD size mismatch: expected ${body.length}, got ${head.contentLength ?? "unknown"}`,
        );
      }
      await cleanup();
      if (cleanupSucceeded !== true) {
        throw new Error(`Probe cleanup failed: ${cleanupError ?? "unknown error"}`);
      }
      await verifyDeleted();

      return {
        ok: true,
        backend: endpoint ? "s3-compatible" : "aws-s3",
        bucket,
        region,
        endpoint: endpoint ?? null,
        probe: "put-head-delete",
        key,
        bytes: body.length,
        deleted: true,
        cleanup_attempts: cleanupAttempts,
        media_platform_should_still_be_off: true,
      };
    } catch (error) {
      await cleanup();
      const primaryError = errorMessage(error);
      const combinedError =
        cleanupSucceeded === false
          ? `${primaryError}; cleanup failed after ${cleanupAttempts} attempts: ${cleanupError ?? "unknown error"}`
          : primaryError;
      return {
        ok: false,
        error: combinedError,
        error_code: "STORAGE_PROBE_FAILED",
        description,
        cleanup_attempted: cleanupAttempted,
        cleanup_succeeded: cleanupSucceeded,
        cleanup_attempts: cleanupAttempts,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error),
      error_code: "STORAGE_PROBE_FAILED",
      description,
      cleanup_attempted: cleanupAttempted,
      cleanup_succeeded: cleanupSucceeded,
      cleanup_attempts: cleanupAttempts,
    };
  }
}