#!/usr/bin/env node
/**
 * One-off certification of production object storage. This never changes any
 * application flags. Provider operations and cleanup are deliberately bounded.
 */

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const OPERATION_TIMEOUT_MS = 6_000;
const CLEANUP_ATTEMPTS = 3;
const PROBE_BODY_MAX_BYTES = 256;

function statusOf(error) {
  return error?.$metadata?.httpStatusCode;
}

function isExplicitMissing(error) {
  return (
    statusOf(error) === 404 &&
    (error?.name === "NotFound" || error?.name === "NoSuchKey")
  );
}

async function withTimeout(operation, label, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedBody(body, byteLimit) {
  if (body == null) throw new Error("GET returned no body");
  if (body instanceof Uint8Array) {
    if (body.byteLength > byteLimit) throw new Error("GET body exceeded limit");
    return Buffer.from(body);
  }
  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let length = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > byteLimit) {
        body.destroy?.();
        throw new Error("GET body exceeded limit");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, length);
  }
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    if (bytes.byteLength > byteLimit) throw new Error("GET body exceeded limit");
    return Buffer.from(bytes);
  }
  throw new Error("GET returned an unsupported body");
}

function probeError(message, cleanupComplete, attempts, key) {
  const error = new Error(message);
  error.cleanupComplete = cleanupComplete;
  error.cleanupAttempts = attempts;
  error.safeForLogging = true;
  if (!cleanupComplete) error.manualCleanupKey = key;
  return error;
}

/**
 * Injected command constructors make this exact certification flow testable
 * without credentials, network access, or a real bucket.
 */
export async function certifyObjectStorage({
  client,
  commands,
  bucket,
  key = `media-assets/_probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`,
  body = Buffer.from(`storage probe ${randomUUID()}\n`, "utf8"),
  timeoutMs = OPERATION_TIMEOUT_MS,
}) {
  const expectedHash = createHash("sha256").update(body).digest("hex");
  let primaryFailure;
  let currentOperation = "storage";
  let putAttempted = false;
  let putAcknowledged = false;

  const send = (Command, input, operation) => {
    currentOperation = operation;
    return withTimeout(
      (abortSignal) => client.send(new Command(input), { abortSignal }),
      operation,
      timeoutMs,
    );
  };

  try {
    putAttempted = true;
    await send(
      commands.PutObjectCommand,
      { Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" },
      "PUT",
    );
    putAcknowledged = true;

    const head = await send(
      commands.HeadObjectCommand,
      { Bucket: bucket, Key: key },
      "HEAD",
    );
    if (Number(head.ContentLength ?? -1) !== body.length) {
      throw new Error(`HEAD size mismatch (expected ${body.length} bytes)`);
    }

    const response = await send(
      commands.GetObjectCommand,
      { Bucket: bucket, Key: key },
      "GET",
    );
    const received = await withTimeout(
      (abortSignal) => {
        abortSignal.addEventListener(
          "abort",
          () => response.Body?.destroy?.(),
          { once: true },
        );
        return readBoundedBody(response.Body, PROBE_BODY_MAX_BYTES);
      },
      "GET body",
      timeoutMs,
    );
    if (!received.equals(body)) throw new Error("GET body mismatch");
    const receivedHash = createHash("sha256").update(received).digest("hex");
    if (receivedHash !== expectedHash) throw new Error("GET SHA-256 mismatch");
  } catch (error) {
    if (putAttempted && !putAcknowledged && currentOperation === "PUT") {
      // A client-side failure cannot establish whether a remote PUT committed.
      primaryFailure = "PUT outcome ambiguous";
    } else {
      const message = error instanceof Error ? error.message : "";
      const status = statusOf(error);
      primaryFailure =
        /^(?:PUT|HEAD|GET|GET body) timed out$/.test(message) ||
        /^HEAD size mismatch \(expected \d+ bytes\)$/.test(message) ||
        /^GET (?:body|SHA-256) mismatch$/.test(message) ||
        /^GET body exceeded limit$/.test(message)
          ? message
          : `${currentOperation} failed (${status ? `provider returned HTTP ${status}` : "provider operation failed"})`;
    }
  }

  // Always attempt cleanup, including after an ambiguous PUT timeout/error:
  // the provider may have committed the object despite the client error.
  let deletionProven = false;
  let cleanupAttempts = 0;
  for (; cleanupAttempts < CLEANUP_ATTEMPTS && !deletionProven; cleanupAttempts += 1) {
    try {
      await send(
        commands.DeleteObjectCommand,
        { Bucket: bucket, Key: key },
        "DELETE",
      );
    } catch {
      // A failed DELETE response is ambiguous; the following HEAD decides.
    }
    try {
      await send(
        commands.HeadObjectCommand,
        { Bucket: bucket, Key: key },
        "DELETE verification HEAD",
      );
    } catch (error) {
      if (isExplicitMissing(error)) deletionProven = true;
    }
  }

  if (putAttempted && !putAcknowledged) {
    throw probeError(
      `CLEANUP INCOMPLETE: PUT outcome ambiguous; current absence cannot rule out a late commit after ${cleanupAttempts} cleanup attempts. Reconcile this key manually${primaryFailure ? ` (${primaryFailure})` : ""}`,
      false,
      cleanupAttempts,
      key,
    );
  }
  if (!deletionProven) {
    const cause = primaryFailure ? `; probe failed: ${primaryFailure}` : "";
    throw probeError(
      `CLEANUP INCOMPLETE after ${cleanupAttempts} bounded attempts${cause}`,
      false,
      cleanupAttempts,
      key,
    );
  }
  if (primaryFailure) {
    throw probeError(
      `${primaryFailure}; cleanup verified absent`,
      true,
      cleanupAttempts,
      key,
    );
  }

  return {
    ok: true,
    probe: "put-head-get-delete",
    bytes: body.length,
    sha256: expectedHash,
    deleted: true,
    cleanup_attempts: cleanupAttempts,
    media_platform_flag_unchanged: true,
  };
}

export async function runConfiguredObjectStorageProbe({ onBeforeWrite } = {}) {
  const bucket = (process.env.STORAGE_BUCKET ?? "").trim();
  const endpoint = (process.env.STORAGE_ENDPOINT ?? "").trim() || undefined;
  const region =
    (process.env.STORAGE_REGION ?? "").trim() ||
    (endpoint ? "auto" : "us-east-1");
  const accessKey = (process.env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim();

  if (!bucket) {
    const error = new Error("STORAGE_BUCKET is missing; local-disk mode remains the safe state");
    error.probeCode = "bucket_missing";
    throw error;
  }
  if (!accessKey || !secretKey) {
    const error = new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required");
    error.probeCode = "credentials_missing";
    throw error;
  }

  let client;
  try {
    const {
      S3Client,
      PutObjectCommand,
      HeadObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
    } = await import("@aws-sdk/client-s3");
    client = new S3Client({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      maxAttempts: 1,
      ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
    });

    const key = `media-assets/_probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
    // Persist the opaque key before sending a PUT. An aborted request/process
    // cannot otherwise prove that a late provider commit will be cleaned up.
    await onBeforeWrite?.(key);
    const result = await certifyObjectStorage({
      client,
      bucket,
      key,
      commands: {
        PutObjectCommand,
        HeadObjectCommand,
        GetObjectCommand,
        DeleteObjectCommand,
      },
    });
    return { ...result, backend: endpoint ? "s3-compatible" : "aws-s3" };
  } finally {
    client?.destroy();
  }
}

async function main() {
  try {
    const result = await runConfiguredObjectStorageProbe();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    const message = error?.safeForLogging
      ? error.message
      : "storage client initialization or certification failed";
    process.stderr.write(`verify-object-storage: FAIL — ${message}\n`);
    if (error?.manualCleanupKey) {
      process.stderr.write(
        `CLEANUP INCOMPLETE — manual cleanup may be required for opaque key: ${error.manualCleanupKey}\n`,
      );
    }
    process.exitCode = 1;
  }
}

// An API bundle may inline this file and rewrite import.meta.url to its own
// entry URL. Check the intended CLI basename too, or a server boot could run
// an unauthenticated PUT before the guarded admin route is ever requested.
if (
  process.argv[1] &&
  /(?:^|[/\\])verify-object-storage\.mjs$/.test(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}