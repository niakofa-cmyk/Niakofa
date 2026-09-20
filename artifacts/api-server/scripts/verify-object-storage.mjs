#!/usr/bin/env node
/**
 * Verify the production S3-compatible bucket before enabling media.
 *
 * Required: STORAGE_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Optional: STORAGE_ENDPOINT, STORAGE_REGION
 *
 * Exit 2 means STORAGE_BUCKET is absent and local-disk mode is still the
 * expected safe state. The script never enables MEDIA_PLATFORM_V21.
 */

import { randomUUID } from "node:crypto";

const bucket = (process.env.STORAGE_BUCKET ?? "").trim();
const endpoint = (process.env.STORAGE_ENDPOINT ?? "").trim() || undefined;
const region =
  (process.env.STORAGE_REGION ?? "").trim() ||
  (endpoint ? "auto" : "us-east-1");
const accessKey = (process.env.AWS_ACCESS_KEY_ID ?? "").trim();
const secretKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim();

const fail = (message, code = 1) => {
  console.error(`verify-object-storage: FAIL — ${message}`);
  process.exit(code);
};

if (!bucket) {
  fail(
    "STORAGE_BUCKET is missing; production remains local-disk until a real bucket is provisioned.",
    2,
  );
}
if (!accessKey || !secretKey) {
  fail("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.");
}

const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } =
  await import("@aws-sdk/client-s3");

const client = new S3Client({
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  ...(endpoint ? { endpoint, forcePathStyle: false } : {}),
});

const key = `media-assets/_probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
const body = Buffer.from(
  `niakofa storage probe ${new Date().toISOString()} ${randomUUID()}\n`,
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
      `HEAD size mismatch: expected ${body.length}, got ${head.ContentLength ?? "unknown"}`,
    );
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        backend: endpoint ? "s3-compatible" : "aws-s3",
        bucket,
        region,
        endpoint: endpoint ?? null,
        probe: "put-head-delete",
        media_platform_should_still_be_off: true,
      },
      null,
      2,
    ) + "\\n",
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}