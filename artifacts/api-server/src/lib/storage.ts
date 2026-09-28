/**
 * Family Asset Storage — dual-backend abstraction
 *
 * When STORAGE_BUCKET is set the module uses AWS S3 / Cloudflare R2 (S3-
 * compatible). When it is absent it falls back to local disk under
 * process.cwd()/uploads/ — the same path used by the original dev-mode code.
 *
 * Environment variables (cloud mode):
 *   STORAGE_BUCKET        — required to enable cloud mode (bucket name)
 *   STORAGE_ENDPOINT      — optional custom endpoint for R2 or MinIO
 *                           e.g. "https://<account-id>.r2.cloudflarestorage.com"
 *   STORAGE_REGION        — defaults to "auto" (correct for R2) or "us-east-1"
 *   STORAGE_CDN_URL       — optional public CDN prefix; when set, getAssetUrl()
 *                           returns a stable CDN URL instead of a presigned URL
 *   AWS_ACCESS_KEY_ID     — standard AWS SDK env var (also used by R2)
 *   AWS_SECRET_ACCESS_KEY — standard AWS SDK env var (also used by R2)
 *
 * Public API:
 *   getStorageBackend()          → "s3" | "local"
 *   isCloudStorageConfigured()   → boolean
 *   putAsset(key, buf, mime)     → Promise<void>
 *   getAssetUrl(key)             → Promise<string>  (presigned or CDN or local path)
 *   assetExists(key)             → Promise<boolean>
 *   streamOrRedirectAsset(key, res) → Promise<void>  (stream from S3 or sendFile locally)
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync, promises as fs } from "fs";
import path from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { logger } from "./logger";

// ─── Local-disk constants ─────────────────────────────────────────────────────

export const UPLOADS_BASE = path.resolve(process.cwd(), "uploads");

// ─── Cloud config helpers ─────────────────────────────────────────────────────

export function isCloudStorageConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env["STORAGE_BUCKET"]?.trim());
}

export function getStorageBackend(
  env: NodeJS.ProcessEnv = process.env,
): "s3" | "local" {
  return isCloudStorageConfigured(env) ? "s3" : "local";
}

/** Human-readable string for healthz / global-ops responses */
export function getStorageDescription(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isCloudStorageConfigured(env)) return "local-disk";
  const endpoint = env["STORAGE_ENDPOINT"]?.trim();
  const bucket = env["STORAGE_BUCKET"]!.trim();
  if (endpoint?.includes("r2.cloudflarestorage.com")) return `cloudflare-r2:${bucket}`;
  if (endpoint) return `s3-compatible:${bucket}`;
  return `aws-s3:${bucket}`;
}

// ─── Lazy S3 client ───────────────────────────────────────────────────────────
// We import dynamically so the package is only loaded when actually needed —
// this keeps the local-disk path free of any AWS SDK overhead at startup.

import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";

let _s3Client: S3ClientType | null = null;

async function getS3Client(): Promise<S3ClientType> {
  if (_s3Client) return _s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const endpoint = process.env["STORAGE_ENDPOINT"];
  const region   = process.env["STORAGE_REGION"] ?? (endpoint ? "auto" : "us-east-1");
  _s3Client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
  });
  return _s3Client;
}

// ─── putAsset ─────────────────────────────────────────────────────────────────

/**
 * Write a file to the active storage backend.
 * @param key       Storage key — e.g. "families/12/memories/88/1234_photo.jpg"
 * @param buffer    Raw file bytes
 * @param mimeType  MIME type string passed to S3 ContentType / local file as-is
 */
export async function putAsset(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (isCloudStorageConfigured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket:      process.env["STORAGE_BUCKET"]!,
        Key:         key,
        Body:        buffer,
        ContentType: mimeType,
      }),
    );
    logger.debug({ key, bytes: buffer.length }, "storage: putAsset → s3");
  } else {
    // Local disk
    const abs     = path.resolve(UPLOADS_BASE, key);
    const destDir = path.dirname(abs);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(abs, buffer);
    logger.debug({ key, bytes: buffer.length }, "storage: putAsset → local");
  }
}

export async function getAssetUploadUrl(key: string, mimeType: string, expiresInSeconds = 900): Promise<string | null> {
  if (!isCloudStorageConfigured()) return null;
  // Rollout gate: a presigned PutObject URL alone cannot enforce a storage-side
  // maximum Content-Length. API HEAD checks and bounded reads protect processing
  // memory, but oversized PUTs can still consume bucket capacity. Production
  // enablement requires a policy-based upload (for example POST with a
  // content-length-range condition) or an equivalent provider-enforced policy.
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getS3Client();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: process.env["STORAGE_BUCKET"]!,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function getAssetInfo(key: string): Promise<{ contentLength: number; contentType: string | null } | null> {
  if (isCloudStorageConfigured()) {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();
      const result = await client.send(new HeadObjectCommand({
        Bucket: process.env["STORAGE_BUCKET"]!,
        Key: key,
      }));
      return {
        contentLength: Number(result.ContentLength ?? 0),
        contentType: result.ContentType ?? null,
      };
    } catch {
      return null;
    }
  }
  try {
    const stat = await fs.stat(path.resolve(UPLOADS_BASE, key));
    return { contentLength: stat.size, contentType: null };
  } catch {
    return null;
  }
}

// ─── getAssetUrl ──────────────────────────────────────────────────────────────

/**
 * Return a URL the browser can use to download the asset.
 * - Cloud with CDN: stable public URL (no expiry)
 * - Cloud without CDN: presigned GetObject URL (5-minute expiry)
 * - Local: relative API path that the serve middleware handles
 */
export async function getAssetUrl(key: string): Promise<string> {
  if (isCloudStorageConfigured()) {
    const cdnBase = process.env["STORAGE_CDN_URL"];
    if (cdnBase) {
      return `${cdnBase.replace(/\/$/, "")}/${key}`;
    }
    // Presigned URL
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl }     = await import("@aws-sdk/s3-request-presigner");
    const client = await getS3Client();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env["STORAGE_BUCKET"]!,
        Key:    key,
      }),
      { expiresIn: 300 }, // 5 minutes
    );
  }
  // Local — return the path the serve middleware handles
  return `/api/family/assets/${key}`;
}

/**
 * Return a private playback URL. Unlike getAssetUrl(), this deliberately
 * bypasses STORAGE_CDN_URL so a recording can never become a permanent public
 * CDN link. Local development uses an authenticated API asset route.
 */
export async function getPrivateAssetUrl(key: string, expiresInSeconds = 300): Promise<string> {
  if (!isCloudStorageConfigured()) {
    return `/api/audio-circle-recording-assets?key=${encodeURIComponent(key)}`;
  }
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: process.env["STORAGE_BUCKET"]!,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

// ─── assetExists ─────────────────────────────────────────────────────────────

export async function assetExists(key: string): Promise<boolean> {
  if (isCloudStorageConfigured()) {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();
      await client.send(
        new HeadObjectCommand({
          Bucket: process.env["STORAGE_BUCKET"]!,
          Key:    key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
  return existsSync(path.resolve(UPLOADS_BASE, key));
}

export async function collectAssetBuffer(
  source: AsyncIterable<Uint8Array>,
  maxBytes?: number,
  cancel?: () => void,
): Promise<Buffer> {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new Error("STORAGE_INVALID_MAX_BYTES");
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of source) {
    totalBytes += chunk.byteLength;
    if (maxBytes !== undefined && totalBytes > maxBytes) {
      cancel?.();
      throw new Error("STORAGE_OBJECT_TOO_LARGE");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, totalBytes);
}

/** Read an asset for trusted server-side processing. Callers must already
 * have authorization for the database row that owns the key. When maxBytes is
 * supplied, byte accumulation is stopped and the source is closed immediately
 * as soon as the limit is exceeded (independent of any earlier HEAD request). */
export async function getAssetBuffer(key: string, maxBytes?: number): Promise<Buffer> {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new Error("STORAGE_INVALID_MAX_BYTES");
  }
  if (isCloudStorageConfigured()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    const result = await client.send(new GetObjectCommand({
      Bucket: process.env["STORAGE_BUCKET"]!,
      Key: key,
    }));
    if (!result.Body) throw new Error("STORAGE_OBJECT_EMPTY");
    const body = result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
    if (maxBytes !== undefined && result.ContentLength != null && result.ContentLength > maxBytes) {
      body.destroy?.();
      throw new Error("STORAGE_OBJECT_TOO_LARGE");
    }
    return collectAssetBuffer(body, maxBytes, () => body.destroy?.());
  }
  const stream = createReadStream(path.resolve(UPLOADS_BASE, key));
  return collectAssetBuffer(stream, maxBytes, () => stream.destroy());
}

// ─── streamOrRedirectAsset ────────────────────────────────────────────────────

/**
 * Serve an asset to an HTTP response.
 * - Cloud: 307 redirect to a presigned URL (lets S3/R2 handle bandwidth)
 * - Local: res.sendFile() for the on-disk file
 *
 * Callers must ensure the key has already been validated (no path traversal).
 */
export async function streamOrRedirectAsset(key: string, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  if (isCloudStorageConfigured()) {
    const url = await getAssetUrl(key);
    res.redirect(307, url);
    return;
  }
  // Local disk
  const abs = path.resolve(UPLOADS_BASE, key);
  if (!existsSync(abs)) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  // Verify path stays inside UPLOADS_BASE (belt-and-suspenders — callers also
  // sanitise the key, but we enforce here too for defence in depth)
  if (!abs.startsWith(UPLOADS_BASE + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.sendFile(abs);
}

/**
 * Stream private media from the API origin with single-range support. This
 * deliberately does not create or return a storage/CDN URL.
 */
export async function streamAssetRange(key: string, req: Request, res: Response, contentType?: string): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (contentType) res.setHeader("Content-Type", contentType);

  const abs = path.resolve(UPLOADS_BASE, key);
  if (!abs.startsWith(UPLOADS_BASE + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let size: number;
  let localFile = false;
  if (isCloudStorageConfigured()) {
    const info = await getAssetInfo(key);
    if (!info) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }
    size = info.contentLength;
    if (!contentType && info.contentType) res.setHeader("Content-Type", info.contentType);
  } else {
    try {
      size = (await fs.stat(abs)).size;
      localFile = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      throw error;
    }
  }

  let start = 0;
  let end = size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2]) || size === 0) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.setHeader("Content-Range", `bytes */${size}`);
        res.status(416).end();
        return;
      }
      start = Math.max(size - suffixLength, 0);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }
    end = Math.min(end, size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.setHeader("Content-Length", String(end - start + 1));

  if (req.method === "HEAD") {
    res.end();
    return;
  }
  if (size === 0) {
    res.end();
    return;
  }

  if (localFile) {
    try {
      await pipeline(createReadStream(abs, { start, end }), res);
    } catch (error) {
      if (req.aborted || res.destroyed) return;
      logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "storage: local media stream failed");
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    }
    return;
  }

  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const abortController = new AbortController();
  const abortForDisconnect = () => abortController.abort();
  const abortForResponseClose = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.once("aborted", abortForDisconnect);
  res.once("close", abortForResponseClose);
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: process.env["STORAGE_BUCKET"]!,
      Key: key,
      Range: range ? `bytes=${start}-${end}` : undefined,
    }), { abortSignal: abortController.signal });
    if (result.ContentType && !contentType) res.setHeader("Content-Type", result.ContentType);
    if (!result.Body) {
      res.removeHeader("Content-Length");
      res.status(404).end();
      return;
    }
    await pipeline(Readable.from(result.Body as AsyncIterable<Uint8Array>), res, {
      signal: abortController.signal,
    });
  } catch (error) {
    if (abortController.signal.aborted || req.aborted) return;
    logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "storage: cloud media stream failed");
    if (res.headersSent || res.destroyed) {
      if (!res.destroyed) res.destroy();
      return;
    }
    throw error;
  } finally {
    req.off("aborted", abortForDisconnect);
    res.off("close", abortForResponseClose);
  }
}

/**
 * Stream an authenticated asset through the API origin.
 *
 * Use this for bearer-protected media that the browser fetches before creating
 * an object URL. Redirecting those requests to storage would both expose the
 * signed location and require the private bucket host in the app's CSP.
 */
export async function streamAssetSameOrigin(key: string, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  if (isCloudStorageConfigured()) {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();
      const result = await client.send(new GetObjectCommand({
        Bucket: process.env["STORAGE_BUCKET"]!,
        Key: key,
      }));
      if (!result.Body) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      if (result.ContentType) res.setHeader("Content-Type", result.ContentType);
      if (result.ContentLength != null) res.setHeader("Content-Length", String(result.ContentLength));
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        res.write(Buffer.from(chunk));
      }
      res.end();
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      throw error;
    }
    return;
  }
  const abs = path.resolve(UPLOADS_BASE, key);
  if (!abs.startsWith(UPLOADS_BASE + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!existsSync(abs)) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.sendFile(abs);
}

/**
 * Serve an asset without ever routing through the optional public CDN.
 * Recording playback must use this path so a private recording cannot become
 * publicly reachable just because STORAGE_CDN_URL is configured.
 */
export async function streamOrRedirectPrivateAsset(key: string, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  if (isCloudStorageConfigured()) {
    res.redirect(307, await getPrivateAssetUrl(key));
    return;
  }
  const abs = path.resolve(UPLOADS_BASE, key);
  if (!abs.startsWith(UPLOADS_BASE + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!existsSync(abs)) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.sendFile(abs);
}

// ─── deleteAsset ──────────────────────────────────────────────────────────────

/**
 * Remove an asset from storage. Best-effort — does not throw on missing keys.
 */
export async function deleteAsset(key: string): Promise<void> {
  if (isCloudStorageConfigured()) {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getS3Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: process.env["STORAGE_BUCKET"]!,
          Key:    key,
        }),
      );
      logger.debug({ key }, "storage: deleteAsset → s3");
    } catch (err) {
      logger.warn({ err, key }, "storage: deleteAsset → s3 error (ignored)");
    }
    return;
  }
  // Local — silently ignore missing files
  try {
    const { unlinkSync } = await import("fs");
    unlinkSync(path.resolve(UPLOADS_BASE, key));
  } catch { /* ignore */ }
}

/**
 * Delete an asset and surface provider failures to retention cleanup.
 * The regular deleteAsset API remains best-effort for non-retention assets.
 */
export async function deleteAssetStrict(key: string): Promise<void> {
  if (isCloudStorageConfigured()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env["STORAGE_BUCKET"]!,
        Key: key,
      }),
    );
    logger.debug({ key }, "storage: deleteAssetStrict → s3");
    return;
  }
  try {
    const { unlinkSync } = await import("fs");
    unlinkSync(path.resolve(UPLOADS_BASE, key));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}
