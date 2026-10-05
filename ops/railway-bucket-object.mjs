#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [operation, objectKey, filePath] = process.argv.slice(2);
const objectPermissions = new Map([
  ["test-auth/user-a/niakofa-state.json", new Set(["get", "put"])],
  ["certification/user-a-state.json", new Set(["get"])],
]);
const maxStateBytes = 2 * 1024 * 1024;

function fail(message) {
  console.error(`Railway certification state ${operation || "operation"} failed: ${message}`);
  process.exit(1);
}

if (!["get", "put"].includes(operation) || !objectKey || !filePath) {
  fail("usage: node ops/railway-bucket-object.mjs <get|put> <approved-object-key> <file-path>");
}

if (!objectPermissions.get(objectKey)?.has(operation)) {
  fail("the requested operation is not allowed for this fixed User A certification-state object.");
}

if (process.env.STORAGE_CDN_URL?.trim()) {
  fail("refusing state I/O while STORAGE_CDN_URL is configured.");
}

const certificationS3 = {
  endpoint: process.env.CERTIFICATION_S3_ENDPOINT?.trim(),
  accessKeyId: process.env.CERTIFICATION_S3_ACCESS_KEY_ID?.trim(),
  secretAccessKey: process.env.CERTIFICATION_S3_SECRET_ACCESS_KEY?.trim(),
  bucket: process.env.CERTIFICATION_S3_BUCKET?.trim(),
  region: process.env.CERTIFICATION_S3_REGION?.trim() || "auto",
};
const certificationS3Configured = [
  certificationS3.endpoint,
  certificationS3.accessKeyId,
  certificationS3.secretAccessKey,
  certificationS3.bucket,
].some(Boolean);
const storageS3 = {
  endpoint: process.env.STORAGE_ENDPOINT?.trim(),
  accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  bucket: process.env.STORAGE_BUCKET?.trim(),
  region: process.env.STORAGE_REGION?.trim() || "auto",
};

if (certificationS3Configured && (storageS3.endpoint || storageS3.bucket)) {
  if (!certificationS3.endpoint || !certificationS3.bucket || !storageS3.endpoint || !storageS3.bucket) {
    fail("both S3 configurations must identify the same existing bucket.");
  }
  let certificationEndpointOrigin;
  let storageEndpointOrigin;
  try {
    certificationEndpointOrigin = new URL(certificationS3.endpoint).origin;
    storageEndpointOrigin = new URL(storageS3.endpoint).origin;
  } catch {
    fail("both S3 configurations must identify the same valid endpoint and bucket.");
  }
  if (certificationS3.bucket !== storageS3.bucket || certificationEndpointOrigin !== storageEndpointOrigin) {
    fail("CERTIFICATION_S3_* must reference the same existing API bucket and endpoint.");
  }
}

const s3 = certificationS3Configured ? certificationS3 : storageS3;
const sourceName = certificationS3Configured ? "CERTIFICATION_S3" : "STORAGE";
if (!s3.endpoint || !s3.accessKeyId || !s3.secretAccessKey || !s3.bucket) {
  fail(`${sourceName} endpoint, access key, secret key, and bucket are required.`);
}

const urlStyle = process.env.CERTIFICATION_S3_URL_STYLE?.trim() || "virtual";
if (!["virtual", "path"].includes(urlStyle)) {
  fail("CERTIFICATION_S3_URL_STYLE must be virtual or path.");
}
if (s3.bucket.length < 3 || s3.bucket.length > 63
  || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(s3.bucket)
  || s3.bucket.includes("..") || s3.bucket.includes(".-") || s3.bucket.includes("-.")) {
  fail(`${sourceName}_BUCKET must contain the Railway bucket's actual S3-compatible name.`);
}
if (!/^[A-Za-z0-9-]+$/.test(s3.region)) {
  fail(`${sourceName}_REGION has an invalid format.`);
}

let endpointUrl;
try {
  endpointUrl = new URL(s3.endpoint);
} catch {
  fail(`${sourceName}_ENDPOINT must be a valid S3 endpoint.`);
}
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const isLoopbackHttp = endpointUrl.protocol === "http:" && loopbackHosts.has(endpointUrl.hostname);
if (endpointUrl.protocol !== "https:" && !isLoopbackHttp) {
  fail(`${sourceName}_ENDPOINT must use HTTPS.`);
}
if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash
  || endpointUrl.pathname !== "/") {
  fail(`${sourceName}_ENDPOINT must be a credential-free origin without a path, query, or fragment.`);
}

const encodedKey = objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
const requestUrl = new URL(endpointUrl.toString());
requestUrl.pathname = urlStyle === "virtual"
  ? `/${encodedKey}`
  : `/${encodeURIComponent(s3.bucket)}/${encodedKey}`;
if (urlStyle === "virtual") {
  requestUrl.hostname = `${s3.bucket}.${endpointUrl.hostname}`;
}

function readPrivateUploadFile() {
  const resolved = path.resolve(filePath);
  let info;
  try {
    info = fs.lstatSync(resolved);
  } catch {
    fail("upload file is missing.");
  }
  if (info.isSymbolicLink() || !info.isFile() || fs.realpathSync(resolved) !== resolved) {
    fail("upload file must be a regular file without symlinks.");
  }
  if ((info.mode & 0o077) !== 0) {
    fail("upload file must have private 0600 permissions.");
  }
  if (info.size < 1 || info.size > maxStateBytes) {
    fail("upload file size is outside the allowed state-file limit.");
  }
  return fs.readFileSync(resolved);
}

function validatePrivateDownloadDirectory() {
  const directory = path.dirname(path.resolve(filePath));
  let info;
  try {
    info = fs.lstatSync(directory);
  } catch {
    fail("download directory is missing.");
  }
  if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o077) !== 0
    || fs.realpathSync(directory) !== directory) {
    fail("download directory must be a private, non-symlink directory.");
  }
  if (fs.existsSync(path.resolve(filePath))) {
    fail("download destination already exists.");
  }
}

async function readLimitedResponseBody(response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maxStateBytes) {
      fail("downloaded state exceeds the allowed size limit.");
    }
  }
  if (!response.body) fail("downloaded state body is empty.");
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxStateBytes) {
      await reader.cancel();
      fail("downloaded state exceeds the allowed size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  if (totalBytes < 1) fail("downloaded state body is empty.");
  return Buffer.concat(chunks, totalBytes);
}

const payload = operation === "put" ? readPrivateUploadFile() : undefined;
if (operation === "get") validatePrivateDownloadDirectory();
const payloadHash = crypto.createHash("sha256").update(payload ?? "").digest("hex");

const now = new Date();
const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
const dateStamp = amzDate.slice(0, 8);
const service = "s3";
const canonicalUri = requestUrl.pathname.split("/").map((part, index) => index === 0 ? "" : encodeURIComponent(decodeURIComponent(part))).join("/");
const canonicalHeaders = `host:${requestUrl.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
const canonicalRequest = [
  operation === "get" ? "GET" : "PUT",
  canonicalUri,
  "",
  canonicalHeaders,
  signedHeaders,
  payloadHash,
].join("\n");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest();
const hmacHex = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");

const credentialScope = `${dateStamp}/${s3.region}/${service}/aws4_request`;
const stringToSign = [
  "AWS4-HMAC-SHA256",
  amzDate,
  credentialScope,
  hash(canonicalRequest),
].join("\n");

let signingKey = hmac(`AWS4${s3.secretAccessKey}`, dateStamp);
signingKey = hmac(signingKey, s3.region);
signingKey = hmac(signingKey, service);
signingKey = hmac(signingKey, "aws4_request");
const signature = hmacHex(signingKey, stringToSign);

const headers = {
  "x-amz-content-sha256": payloadHash,
  "x-amz-date": amzDate,
  authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
};
if (operation === "put") headers["content-type"] = "application/json";

const response = await fetch(requestUrl, {
  method: operation === "get" ? "GET" : "PUT",
  headers,
  body: payload,
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  fail(`HTTP ${response.status}.`);
}

if (operation === "get") {
  const bytes = await readLimitedResponseBody(response);
  const resolved = path.resolve(filePath);
  const temporary = `${resolved}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, resolved);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  console.log("PASS: downloaded private User A certification state.");
} else {
  console.log("PASS: uploaded private User A certification state.");
}
