#!/usr/bin/env node
/**
 * Provision and verify one S3-compatible production bucket.
 *
 * Railway Buckets should normally be created with the Railway bucket tool or
 * dashboard. This script is provider-neutral: with a provider that supports
 * CreateBucket it can create the bucket, and with
 * STORAGE_PROVISION_VERIFY_ONLY=1 it only verifies an existing bucket.
 *
 * This script never enables MEDIA_PLATFORM_V21 and never prints credentials.
 */

import { randomUUID } from "node:crypto";

const value = (name) => (process.env[name] ?? "").trim();
const bucket = value("STORAGE_BUCKET");
const endpoint = value("STORAGE_ENDPOINT") || undefined;
const region = value("STORAGE_REGION") || (endpoint ? "auto" : "us-east-1");
const accessKey = value("AWS_ACCESS_KEY_ID");
const secretKey = value("AWS_SECRET_ACCESS_KEY");
const verifyOnly = value("STORAGE_PROVISION_VERIFY_ONLY") === "1";

const fail = (message) => {
  console.error(`provision-object-storage: FAIL — ${message}`);
  process.exit(1);
};

if (!bucket) fail("STORAGE_BUCKET is required.");
if (!accessKey || !secretKey) {
  fail("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.");
}

const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = await import("@aws-sdk/client-s3");

const client = new S3Client({
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
});

async function bucketExists() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

let existed = await bucketExists();

if (!existed && !verifyOnly) {
  try {
    const input = { Bucket: bucket };
    if (!endpoint && region !== "us-east-1") {
      input.CreateBucketConfiguration = { LocationConstraint: region };
    }
    await client.send(new CreateBucketCommand(input));
    existed = await bucketExists();
  } catch (error) {
    fail(
      `bucket was not accessible and CreateBucket failed: ${
        error instanceof Error ? error.message : String(error)
      }. For Railway Buckets, create the resource in Railway and rerun with STORAGE_PROVISION_VERIFY_ONLY=1.`,
    );
  }
}

if (!existed) {
  fail(
    "bucket is not accessible; check the exact bucket reference, endpoint, region, and credentials.",
  );
}

const key = `media-assets/_probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
const body = Buffer.from(
  `niakofa production storage probe ${new Date().toISOString()} ${randomUUID()}\n`,
  "utf8",
);

try {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain",
    }),
  );
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (Number(head.ContentLength ?? -1) !== body.length) {
    throw new Error(
      `probe HEAD mismatch: expected ${body.length}, got ${head.ContentLength ?? "unknown"}`,
    );
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        action: existed ? "verified-existing-bucket" : "created-and-verified",
        backend: endpoint ? "s3-compatible" : "aws-s3",
        bucket,
        region,
        endpoint: endpoint ?? null,
        probe: "put-head-delete",
        media_platform_v21: "UNCHANGED/OFF",
      },
      null,
      2,
    ) + "\\n",
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}