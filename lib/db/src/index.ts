import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Cap at 10 connections per process; Railway Postgres starter allows 20–25
  // total. If you run multiple replicas, set lower (e.g. max: 5).
  max: parseInt(process.env["DB_POOL_MAX"] ?? "10", 10),
  // Fail fast if no connection is available within 5s rather than hanging.
  connectionTimeoutMillis: 5_000,
  // Release idle connections after 30s to keep the pool lean.
  idleTimeoutMillis: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
// Explicitly re-export the canonical Community Story tables from the package root.
// This keeps ESM/Jest consumers stable even when schema barrel resolution is stale.
export {
  communityStoriesTable,
  communityStoryMediaTable,
  communityStoryElementsTable,
  communityStoryViewsTable,
  communityStoryReactionsTable,
  communityStorySharesTable,
} from "./schema/community-stories";

// V21 Media Platform — same Jest/ESM stability pattern.
// Without these, api-server tests fail at import of routes/requests with:
//   The requested module '@workspace/db' does not provide an export named 'mediaAssetsTable'
export {
  mediaAssetsTable,
  mediaProcessingJobsTable,
} from "./schema/media-assets";
export { requestMessageAttachmentsTable } from "./schema/request-message-attachments";
export {
  exchangeListingsTable,
  exchangePickupRequestsTable,
  exchangeDigestDeliveriesTable,
} from "./schema/exchange";
