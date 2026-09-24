import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const entrypointPath = path.resolve(
  packageDirectory,
  "../api-zod/src/index.ts",
);

const entrypoint = await readFile(entrypointPath, "utf8");
const normalizedEntrypoint = entrypoint.replace(
  /^\s*export \* from ["']\.\/generated\/types["'];\s*\r?\n?/gm,
  "",
);

if (
  !normalizedEntrypoint.includes(
    'export * as generatedTypes from "./generated/types";',
  )
) {
  throw new Error(
    `Expected generatedTypes namespace export in ${entrypointPath}`,
  );
}

if (normalizedEntrypoint !== entrypoint) {
  await writeFile(entrypointPath, normalizedEntrypoint);
}
