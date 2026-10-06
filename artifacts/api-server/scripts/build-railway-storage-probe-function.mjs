import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";

export async function buildRailwayStorageProbeFunction() {
  const entryPoint = fileURLToPath(
    new URL("./railway-storage-probe-function.mjs", import.meta.url),
  );
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["@aws-sdk/client-s3"],
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  /(?:^|[/\\])build-railway-storage-probe-function\.mjs$/.test(invokedPath) &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  process.stdout.write(await buildRailwayStorageProbeFunction());
}
