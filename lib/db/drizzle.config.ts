import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Paths are relative to this config file. drizzle-kit resolves them from the
// config's own directory, so no __dirname is needed — which also avoids the
// "__dirname is not defined" ReferenceError this package would hit as an ESM
// module ("type": "module") if the path were built with __dirname.
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
