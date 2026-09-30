export type MediaChunkFailureStage =
  | "database_validate"
  | "database_ledger"
  | "database_lock"
  | "storage_put"
  | "database_commit";

export type MediaChunkFailureClass =
  | "database_connection"
  | "database_constraint"
  | "database_authentication"
  | "database_schema"
  | "database_transaction"
  | "database_operator"
  | "database_query"
  | "database_unknown"
  | "storage_authorization"
  | "storage_missing_object"
  | "storage_timeout"
  | "storage_throttled"
  | "storage_rejected"
  | "storage_upstream_failure"
  | "storage_network_failure"
  | "storage_provider_unknown";

type ErrorFields = {
  code?: unknown;
  name?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

function errorFields(error: unknown): ErrorFields {
  return typeof error === "object" && error !== null
    ? error as ErrorFields
    : {};
}

const NETWORK_FAILURE_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

function classifyDatabaseFailure(error: unknown): MediaChunkFailureClass {
  const { code } = errorFields(error);
  if (typeof code !== "string") return "database_unknown";
  if (NETWORK_FAILURE_CODES.has(code)) return "database_connection";
  if (!/^[0-9A-Z]{5}$/.test(code)) return "database_unknown";

  switch (code.slice(0, 2)) {
    case "08": return "database_connection";
    case "23": return "database_constraint";
    case "28": return "database_authentication";
    case "40": return "database_transaction";
    case "42": return "database_schema";
    case "57": return "database_operator";
    default: return "database_query";
  }
}

function classifyStorageFailure(error: unknown): MediaChunkFailureClass {
  const fields = errorFields(error);
  const metadata = fields.$metadata;
  const status = Number(metadata?.httpStatusCode);

  if (Number.isSafeInteger(status)) {
    if (status === 401 || status === 403) return "storage_authorization";
    if (status === 404) return "storage_missing_object";
    if (status === 408) return "storage_timeout";
    if (status === 429) return "storage_throttled";
    if (status >= 500) return "storage_upstream_failure";
    if (status >= 400) return "storage_rejected";
  }

  if (typeof fields.code === "string" && NETWORK_FAILURE_CODES.has(fields.code)) {
    return "storage_network_failure";
  }
  if (fields.name === "TimeoutError" || fields.name === "AbortError") {
    return "storage_timeout";
  }
  return "storage_provider_unknown";
}

/**
 * Returns only a fixed category. Never serialize provider/database messages,
 * account identifiers, object keys, request data, or arbitrary error fields.
 */
export function classifyMediaChunkFailure(
  stage: MediaChunkFailureStage,
  error: unknown,
): MediaChunkFailureClass {
  return stage === "storage_put"
    ? classifyStorageFailure(error)
    : classifyDatabaseFailure(error);
}