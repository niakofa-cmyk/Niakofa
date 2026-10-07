#!/usr/bin/env node

import { open, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { serializeStorageStateJson } from "./user-state-serialization.mjs";

const MAX_JSON_INPUT_BYTES = 256 * 1024;

async function readJsonInput() {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.length;
    if (byteLength > MAX_JSON_INPUT_BYTES) {
      throw new Error(`storage state input exceeds ${MAX_JSON_INPUT_BYTES} bytes.`);
    }
    chunks.push(bytes);
  }

  return Buffer.concat(chunks, byteLength).toString("utf8");
}

function captureFailure(promise) {
  return promise.then(
    () => null,
    (error) => error,
  );
}

async function materialize() {
  const requestedPath = process.argv[2];
  if (!requestedPath || !path.isAbsolute(requestedPath)) {
    throw new Error("an absolute output path is required.");
  }

  const outputPath = path.resolve(requestedPath);
  const outputDirectory = path.dirname(outputPath);
  if ((await realpath(outputDirectory)) !== outputDirectory) {
    throw new Error("the output directory must not use a symlink.");
  }

  const directoryInfo = await stat(outputDirectory);
  if (!directoryInfo.isDirectory() || (directoryInfo.mode & 0o077) !== 0) {
    throw new Error("the output directory must be private (0700).");
  }

  const serialized = serializeStorageStateJson(await readJsonInput());
  const file = await open(outputPath, "wx", 0o600);
  const writeError = await captureFailure((async () => {
    await file.writeFile(serialized, "utf8");
    await file.chmod(0o600);
    await file.sync();
  })());
  const closeError = await captureFailure(file.close());

  if (writeError || closeError) {
    const cleanupError = await captureFailure(rm(outputPath, { force: true }));
    if (cleanupError && cleanupError.code !== "ENOENT") {
      throw new Error("storage state could not be safely written or cleaned up.");
    }
    throw writeError ?? closeError;
  }

  process.stdout.write(`${outputPath}\n`);
}

try {
  await materialize();
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`materialize-storage-state: ${reason}\n`);
  process.exitCode = 1;
}
