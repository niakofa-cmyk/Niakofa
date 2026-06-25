import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // In test environments the DATABASE_URL may be absent because the test
  // suite mocks out DB calls. Throwing here would crash every test file that
  // imports any route handler (which transitively imports this module).
  // In all other environments (dev, staging, production) a missing URL is a
  // hard misconfiguration and we still crash loudly.
  if (process.env.NODE_ENV === "test") {
    console.warn(
      "[db] DATABASE_URL is not set — database operations will fail immediately. " +
      "Ensure your test suite mocks @workspace/db or sets DATABASE_URL before running."
    );
    // Use a guaranteed-invalid connection string (port 1 is always refused) so
    // any attempted query throws immediately with a connection-refused error.
    // Without this, new Pool({ connectionString: undefined }) silently falls
    // back to PGHOST/PGUSER/default-localhost env vars, which can cause test
    // suites to hang on a real (but unintended) connection attempt instead of
    // failing fast and cleanly.
    process.env.DATABASE_URL = "postgresql://no-db:no-db@localhost:1/no-db-test";
  } else {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?"
    );
  }
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
