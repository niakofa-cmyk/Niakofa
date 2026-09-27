#!/usr/bin/env node
/**
 * Niakofa Exchange spatial benchmark.
 * Uses DATABASE_URL, never embeds credentials, and never inserts benchmark
 * rows into production tables.
 */
import pg from "pg";

const { Pool } = pg;
const CENTER_LAT = Number(process.env.BENCHMARK_LAT ?? "32.7555");
const CENTER_LNG = Number(process.env.BENCHMARK_LNG ?? "-97.3308");
const RADIUS_MILES = Number(process.env.BENCHMARK_RADIUS_MILES ?? "5");
const ITERATIONS = Math.max(5, Math.min(200, Number(process.env.BENCHMARK_ITERATIONS ?? "25")));
const LAT_DELTA = RADIUS_MILES / 69;
const LNG_DELTA = RADIUS_MILES / (69 * Math.max(0.25, Math.cos((CENTER_LAT * Math.PI) / 180)));
const BOUNDS = [CENTER_LAT - LAT_DELTA, CENTER_LAT + LAT_DELTA, CENTER_LNG - LNG_DELTA, CENTER_LNG + LNG_DELTA];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}
if (![CENTER_LAT, CENTER_LNG, RADIUS_MILES].every(Number.isFinite) || RADIUS_MILES <= 0) {
  console.error("Invalid benchmark coordinates or radius.");
  process.exit(2);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10_000,
});

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function hasPostgis(client) {
  const result = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS enabled",
  );
  return Boolean(result.rows[0]?.enabled);
}

async function benchmark(client, query, params, label) {
  const timings = [];
  let lastCount = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    const result = await client.query(query, params);
    timings.push(performance.now() - start);
    lastCount = Number(result.rows[0]?.count ?? 0);
  }
  const avg = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  return {
    label,
    count: lastCount,
    avg,
    p50: percentile(timings, 50),
    p95: percentile(timings, 95),
    min: Math.min(...timings),
    max: Math.max(...timings),
  };
}

async function runFallbackBenchmark(client) {
  const latDelta = RADIUS_MILES / 69;
  const lngDelta = RADIUS_MILES / (69 * Math.max(0.25, Math.cos((CENTER_LAT * Math.PI) / 180)));
  const query = [
    "SELECT COUNT(*)::int AS count",
    "FROM exchange_listings",
    "WHERE status = 'active'",
    "AND moderation_status = 'approved'",
    "AND latitude IS NOT NULL AND longitude IS NOT NULL",
    "AND latitude BETWEEN $1 AND $2",
    "AND longitude BETWEEN $3 AND $4",
    "AND 3958.8 * 2 * ASIN(SQRT(",
    "POWER(SIN(RADIANS(latitude - $5) / 2), 2) +",
    "COS(RADIANS($5)) * COS(RADIANS(latitude)) *",
    "POWER(SIN(RADIANS(longitude - $6) / 2), 2)",
    ")) <= $7",
  ].join(" ");
  return benchmark(client, query, [
    CENTER_LAT - latDelta,
    CENTER_LAT + latDelta,
    CENTER_LNG - lngDelta,
    CENTER_LNG + lngDelta,
    CENTER_LAT,
    CENTER_LNG,
    RADIUS_MILES,
  ], "Production route: bounding box + Haversine");
}

async function main() {
  const client = await pool.connect();
  try {
    const postgis = await hasPostgis(client);
    console.log("Niakofa Exchange spatial benchmark");
    console.log("----------------------------------");
    console.log("Anchor:", CENTER_LAT, CENTER_LNG);
    console.log("Radius:", RADIUS_MILES, "miles");
    console.log("Iterations:", ITERATIONS);
    console.log("PostGIS enabled:", postgis ? "yes" : "no");
    console.log("Synthetic data: not seeded; benchmark measures existing canonical Exchange rows");
    console.log("");

    const results = [];
    // Benchmark the exact production route predicate. PostGIS parity is
    // covered separately by the disposable integration test; the route itself
    // currently uses bounding-box + Haversine, not ST_DWithin.
    results.push(await runFallbackBenchmark(client));

    for (const result of results) {
      console.log(
        result.label +
        ": count=" + result.count +
        " avg=" + result.avg.toFixed(2) + "ms" +
        " p50=" + result.p50.toFixed(2) + "ms" +
        " p95=" + result.p95.toFixed(2) + "ms" +
        " min=" + result.min.toFixed(2) + "ms" +
        " max=" + result.max.toFixed(2) + "ms",
      );
    }

    const indexResult = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'exchange_listings' AND indexname = 'exchange_listings_geo_idx'",
    );
    if (indexResult.rowCount !== 1) {
      console.error("FAIL: exchange_listings_geo_idx is missing.");
      process.exitCode = 1;
    } else {
      console.log("PASS: migration-defined exchange_listings_geo_idx is present.");
    }

    const explain = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT COUNT(*)::int FROM exchange_listings
       WHERE status = 'active' AND moderation_status = 'approved'
         AND latitude IS NOT NULL AND longitude IS NOT NULL
         AND latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
         AND 3958.8 * 2 * ASIN(SQRT(
           POWER(SIN(RADIANS(latitude - $5) / 2), 2) +
           COS(RADIANS($5)) * COS(RADIANS(latitude)) *
           POWER(SIN(RADIANS(longitude - $6) / 2), 2)
         )) <= $7`,
      [...BOUNDS, CENTER_LAT, CENTER_LNG, RADIUS_MILES],
    );
    console.log("");
    console.log("Fallback EXPLAIN ANALYZE:");
    console.log(explain.rows.map((row) => row["QUERY PLAN"]).join("\n"));

    // Latency is diagnostic, not a hard correctness gate. Production SLOs
    // should be set from measured percentiles under representative load.
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
