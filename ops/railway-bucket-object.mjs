#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [operation, objectKey, filePath] = process.argv.slice(2);

function fail(message) {
  console.error(\`Railway bucket object \${operation || "operation"} failed: \${message}\`);
  process.exit(1);
}

if (!["get", "put"].includes(operation) || !objectKey || !filePath) {
  fail("usage: node ops/railway-bucket-object.mjs <get|put> <object-key> <file-path>");
}

const endpoint = process.env.CERTIFICATION_S3_ENDPOINT;
const accessKeyId = process.env.CERTIFICATION_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.CERTIFICATION_S3_SECRET_ACCESS_KEY;
const bucket = process.env.CERTIFICATION_S3_BUCKET;
const region = process.env.CERTIFICATION_S3_REGION || "auto";
const urlStyle = process.env.CERTIFICATION_S3_URL_STYLE || "virtual";

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  fail("CERTIFICATION_S3_ENDPOINT, CERTIFICATION_S3_ACCESS_KEY_ID, CERTIFICATION_S3_SECRET_ACCESS_KEY, and CERTIFICATION_S3_BUCKET are required.");
}
if (!["virtual", "path"].includes(urlStyle)) {
  fail("CERTIFICATION_S3_URL_STYLE must be virtual or path.");
}
if (objectKey.startsWith("/") || objectKey.includes("\\0")) {
  fail("object key must be a relative S3 key.");
}

const endpointUrl = new URL(endpoint);
const encodedKey = objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
const requestUrl = new URL(endpointUrl.toString());
requestUrl.pathname = urlStyle === "virtual"
  ? \`/\${encodedKey}\`
  : \`/\${encodeURIComponent(bucket)}/\${encodedKey}\`;
if (urlStyle === "virtual") {
  requestUrl.hostname = \`\${bucket}.\${endpointUrl.hostname}\`;
}

const payloadHash = operation === "put"
  ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
  : crypto.createHash("sha256").update("").digest("hex");

const now = new Date();
const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, "").replace(/Z$/, "Z");
const dateStamp = amzDate.slice(0, 8);
const service = "s3";
const canonicalUri = requestUrl.pathname.split("/").map((part, index) => index === 0 ? "" : encodeURIComponent(decodeURIComponent(part))).join("/");
const canonicalHeaders = \`host:\${requestUrl.host}\\nx-amz-content-sha256:\${payloadHash}\\nx-amz-date:\${amzDate}\\n\`;
const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
const canonicalRequest = [
  operation === "get" ? "GET" : "PUT",
  canonicalUri,
  "",
  canonicalHeaders,
  signedHeaders,
  payloadHash,
].join("\\n");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest();
const hmacHex = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");

const credentialScope = \`\${dateStamp}/\${region}/\${service}/aws4_request\`;
const stringToSign = [
  "AWS4-HMAC-SHA256",
  amzDate,
  credentialScope,
  hash(canonicalRequest),
].join("\\n");

let signingKey = hmac(\`AWS4\${secretAccessKey}\`, dateStamp);
signingKey = hmac(signingKey, region);
signingKey = hmac(signingKey, service);
signingKey = hmac(signingKey, "aws4_request");
const signature = hmacHex(signingKey, stringToSign);

const headers = {
  host: requestUrl.host,
  "x-amz-content-sha256": payloadHash,
  "x-amz-date": amzDate,
  authorization: \`AWS4-HMAC-SHA256 Credential=\${accessKeyId}/\${credentialScope},SignedHeaders=\${signedHeaders},Signature=\${signature}\`,
};
if (operation === "put") headers["content-type"] = "application/json";

const response = await fetch(requestUrl, {
  method: operation === "get" ? "GET" : "PUT",
  headers,
  body: operation === "put" ? fs.readFileSync(filePath) : undefined,
});

if (!response.ok) {
  const detail = await response.text().catch(() => "");
  fail(\`HTTP \${response.status}\${detail ? \` (\${detail.slice(0, 300)})\` : ""}\`);
}

if (operation === "get") {
  const bytes = Buffer.from(await response.arrayBuffer());
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = \`\${resolved}.tmp-\${process.pid}\`;
  fs.writeFileSync(temporary, bytes, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, resolved);
  console.log(\`PASS: downloaded certification state object to \${filePath}\`);
} else {
  console.log(\`PASS: uploaded certification state object \${objectKey}\`);
}
