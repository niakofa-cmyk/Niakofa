import { spawn } from "node:child_process";

const steps = [
  ["Exchange privacy validation", ["node", "--test", "scripts/exchange-privacy.test.mjs"]],
  ["Exchange API privacy contracts", ["node", "--test", "scripts/exchange-api-security-contract.test.mjs"]],
  ["Exchange readiness contracts", ["node", "--test", "scripts/exchange-production-readiness-contract.test.mjs"]],
  ["Exchange spatial benchmark sanity", ["node", "--test", "scripts/exchange-spatial-benchmark.test.mjs"]],
];

if (process.env.DATABASE_URL) {
  steps.push(["Exchange spatial, lifecycle, and push integration", ["node", "scripts/exchange-spatial.integration.test.mjs"]]);
} else {
  console.error("Exchange release gate requires DATABASE_URL for migration-backed spatial and handoff integration; refusing to certify without it.");
  process.exit(1);
}

const run = (label, command, args) => new Promise((resolve) => {
  console.log(`\n== ${label} ==`);
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

for (const [label, [command, ...args]] of steps) {
  const code = await run(label, command, args);
  if (code !== 0) {
    console.error(`Exchange release gate failed at: ${label}`);
    process.exit(code || 1);
  }
}

console.log("\nExchange release gate passed.");