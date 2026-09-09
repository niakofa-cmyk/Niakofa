import { spawn } from "node:child_process";

const sources = ["fort_worth", "kansas_city_missouri"] as const;

function runSource(source: (typeof sources)[number]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@workspace/scripts", "run", "ingest:neighborhood-boundaries", "--", source],
      { stdio: "inherit", env: process.env },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`Neighborhood ingest failed for ${source} (code=${code ?? "null"}, signal=${signal ?? "none"})`));
    });
  });
}

async function main() {
  console.log("Starting explicit authoritative neighborhood ingest for Fort Worth and Kansas City, MO.");
  console.log("This only stages authoritative GIS rows; it does not review, verify, or promote them.");
  for (const source of sources) await runSource(source);
  console.log("Authoritative neighborhood ingest completed for all configured cities.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
