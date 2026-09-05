import { defineConfig } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const configuredHost = new URL(configuredBaseUrl).hostname;
const isDeployedTarget = !["127.0.0.1", "localhost", "::1"].includes(configuredHost);

if (isDeployedTarget && !process.env.USER_A_STATE) {
  throw new Error("Deployed Chromium runs require an authenticated USER_A_STATE; use ops/run-deployed-acceptance.sh.");
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? [["line"]] : "list",
  use: {
    baseURL: configuredBaseUrl,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ["--no-sandbox"] }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_VIDEO === "on" ? "retain-on-failure" : "off",
  },
});