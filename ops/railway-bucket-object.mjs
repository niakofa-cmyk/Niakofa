#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [operation, objectKey, filePath] = process.argv.slice(2);
const expectedObjectKey = "test-auth/user-a/niakofa-state.json";
const expectedBucket = "niakofa-production-media";
const maxStateBytes = 2 * 1024 * 1024;

function fail(message) {
  console.error(`Railway certification state ${operation || "operation"} failed: ${message}`);
  process.exit(1);
}

if (!["get", "put"].includes(operation) || !objectKey || !filePath) {
  fail("usage: node ops/railway-bucket-object.mjs <get|put> test-auth/user-a/niakofa-state.json <file-path>");
}

if (objectKey !== expectedObjectKey) {
  fail("only the fixed User A certification-state object is allowed.");
}

const endpoint = process.env.STORAGE_ENDPOINT?.trim();
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.STORAGE_BUCKET?.trim();
const region = process.env.STORAGE_REGION?.trim() || "auto";
const urlStyle = process.env.CERTIFICATION_S3_URL_STYLE || "virtual";

if (process.env.STORAGE_CDN_URL?.trim()) {
  fail("refusing state I/O while STORAGE_CDN_URL is configured.");
}
if (bucket !== expectedBucket) {
  fail("STORAGE_BUCKET must reference the existing niakofa-production-media bucket.");
}
if (!endpoint || !accessKeyId || !secretAccessKey) {
  fail("STORAGE_ENDPOINT, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are required.");
}
if (!["virtual", "path"].includes(urlStyle)) {
  fail("CERTIFICATION_S3_URL_STYLE must be virtual or path.");
}
if (!/^[A-Za-z0-9-]+$/.test(region)) {
  fail("STORAGE_REGION has an invalid format.");
}

let endpointUrl;
try {
  endpointUrl = new URL(endpoint);
} catch {
  fail("STORAGE_ENDPOINT must be a valid S3 endpoint.");
}
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const isLoopbackHttp = endpointUrl.protocol === "http:" && loopbackHosts.has(endpointUrl.hostname);
if (endpointUrl.protocol !== "https:" && !isLoopbackHttp) {
  fail("STORAGE_ENDPOINT must use HTTPS.");
}
if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash
  || endpointUrl.pathname !== "/") {
  fail("STORAGE_ENDPOINT must be a credential-free origin without a path, query, or fragment.");
}

const encodedKey = objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
const requestUrl = new URL(endpointUrl.toString());
requestUrl.pathname = urlStyle === "virtual"
  ? `/${encodedKey}`
  : `/${encodeURIComponent(bucket)}/${encodedKey}`;
if (urlStyle === "virtual") {
  requestUrl.hostname = `${bucket}.${endpointUrl.hostname}`;
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
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxStateBytes) {
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

const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
const stringToSign = [
  "AWS4-HMAC-SHA256",
  amzDate,
  credentialScope,
  hash(canonicalRequest),
].join("\n");

let signingKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
signingKey = hmac(signingKey, region);
signingKey = hmac(signingKey, service);
signingKey = hmac(signingKey, "aws4_request");
const signature = hmacHex(signingKey, stringToSign);

const headers = {
  "x-amz-content-sha256": payloadHash,
  "x-amz-date": amzDate,
  authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
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
