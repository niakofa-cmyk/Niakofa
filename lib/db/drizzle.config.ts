import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Suppress the PostGIS spatial_ref_sys rename-conflict prompt that drizzle-kit
  // push/push-force emits when it encounters the PostGIS system tables. Without
  // this filter drizzle-kit tries to manage PostGIS's internal tables and
  // immediately hits an interactive "rename?" prompt that hangs in CI/Railway.
  extensionsFilters: ["postgis"],
});
