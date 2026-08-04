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
