// Keep URI/driver overrides from bypassing the operator-confirmed endpoint.
export function exchangeAuditTarget(env) {
  const value = env.EXCHANGE_AUDIT_DATABASE_URL ?? env.DATABASE_URL;
  if (!value) throw new Error("AUDIT_CONNECTION_REQUIRED");
  let url;
  try { url = new URL(value); } catch { throw new Error("INVALID_AUDIT_CONNECTION"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("INVALID_AUDIT_CONNECTION");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = url.port || "5432";
  for (const key of url.searchParams.keys()) {
    if (!["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "application_name", "connect_timeout"].includes(key)) {
      throw new Error("AUDIT_CONNECTION_OVERRIDE_REJECTED");
    }
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  // Explicit production mode also gates loopback URIs: a mistakenly supplied
  // development connection must never become production evidence.
  if (!local || env.EXCHANGE_PRODUCTION_SCHEMA_AUDIT === "1") {
    if (env.EXCHANGE_PRODUCTION_SCHEMA_AUDIT !== "1") throw new Error("PRODUCTION_AUDIT_APPROVAL_REQUIRED");
    if (!env.EXCHANGE_AUDIT_EXPECTED_HOST || !env.EXCHANGE_AUDIT_EXPECTED_PORT
      || host !== env.EXCHANGE_AUDIT_EXPECTED_HOST.toLowerCase()
      || port !== env.EXCHANGE_AUDIT_EXPECTED_PORT) throw new Error("UNCONFIRMED_DATABASE_TARGET");
    if (local) throw new Error("PRODUCTION_AUDIT_LOCAL_TARGET_REJECTED");
  }
  return {
    local,
    config: {
      host, port: Number(port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: local || /^(0|false|no|disable)$/i.test(env.DATABASE_SSL ?? "")
        ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
      query_timeout: 12_000,
      max: 1,
    },
  };
}
