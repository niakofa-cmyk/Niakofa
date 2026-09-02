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

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { Response } from "express";
import { logger } from "./logger";

// ─── Local-disk constants ─────────────────────────────────────────────────────

export const UPLOADS_BASE = path.resolve(process.cwd(), "uploads");

// ─── Cloud config helpers ─────────────────────────────────────────────────────

export function isCloudStorageConfigured(): boolean {
  return !!(process.env["STORAGE_BUCKET"]);
}

export function getStorageBackend(): "s3" | "local" {
  return isCloudStorageConfigured() ? "s3" : "local";
}

/** Human-readable string for healthz / global-ops responses */
export function getStorageDescription(): string {
  if (!isCloudStorageConfigured()) return "local-disk";
  const endpoint = process.env["STORAGE_ENDPOINT"];
  const bucket   = process.env["STORAGE_BUCKET"]!;
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

// ─── streamOrRedirectAsset ────────────────────────────────────────────────────

/**
 * Serve an asset to an HTTP response.
 * - Cloud: 307 redirect to a presigned URL (lets S3/R2 handle bandwidth)
 * - Local: res.sendFile() for the on-disk file
 *
 * Callers must ensure the key has already been validated (no path traversal).
 */
export async function streamOrRedirectAsset(key: string, res: Response): Promise<void> {
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
