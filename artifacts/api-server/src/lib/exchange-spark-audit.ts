export type ExchangeSparkAuditStatus =
  | "draft"
  | "pending"
  | "published"
  | "deletion_pending";

export type ExchangeSparkAuditReason =
  | "not_found_or_not_owned"
  | "media_processing"
  | "storage_cleanup_failed"
  | "row_cleanup_failed"
  | "row_missing_after_cleanup"
  | "unknown";

export type ExchangeSparkAuditInput =
  | {
      action: "created" | "publish_result" | "publish_replayed" | "delete_requested";
      actorUserId: number;
      sparkId: number;
      status: ExchangeSparkAuditStatus;
    }
  | {
      action: "delete_result";
      actorUserId: number;
      sparkId: number;
      deleted: false;
      reason: ExchangeSparkAuditReason;
    }
  | {
      action: "cleanup_result";
      actorUserId: number;
      sparkId: number;
      deleted: true;
    }
  | {
      action: "cleanup_result";
      actorUserId: number;
      sparkId: number;
      deleted: false;
      reason: ExchangeSparkAuditReason;
    };

export type ExchangeSparkAuditEvent =
  | {
      event: "exchange_spark.audit";
      action: "created" | "publish_result" | "publish_replayed" | "delete_requested";
      actor_user_id: number;
      spark_id: number;
      status: ExchangeSparkAuditStatus;
    }
  | {
      event: "exchange_spark.audit";
      action: "delete_result";
      actor_user_id: number;
      spark_id: number;
      deleted: false;
      reason: ExchangeSparkAuditReason;
    }
  | {
      event: "exchange_spark.audit";
      action: "cleanup_result";
      actor_type: "system";
      actor_user_id: number;
      spark_id: number;
      deleted: true;
    }
  | {
      event: "exchange_spark.audit";
      action: "cleanup_result";
      actor_type: "system";
      actor_user_id: number;
      spark_id: number;
      deleted: false;
      reason: ExchangeSparkAuditReason;
    };

const SAFE_REASONS = new Set<ExchangeSparkAuditReason>([
  "not_found_or_not_owned",
  "media_processing",
  "storage_cleanup_failed",
  "row_cleanup_failed",
  "row_missing_after_cleanup",
  "unknown",
]);

function safeReason(reason: unknown): ExchangeSparkAuditReason {
  return typeof reason === "string" && SAFE_REASONS.has(reason as ExchangeSparkAuditReason)
    ? reason as ExchangeSparkAuditReason
    : "unknown";
}

/**
 * Build lifecycle log fields from an explicit allowlist. Captions, media URLs,
 * storage keys, and request data must never enter this event.
 */
export function buildExchangeSparkAuditEvent(input: ExchangeSparkAuditInput): ExchangeSparkAuditEvent {
  if (input.action === "cleanup_result") {
    const cleanup = {
      event: "exchange_spark.audit" as const,
      action: "cleanup_result" as const,
      actor_type: "system" as const,
      actor_user_id: input.actorUserId,
      spark_id: input.sparkId,
    };
    if (input.deleted) return { ...cleanup, deleted: true };
    return { ...cleanup, deleted: false, reason: safeReason(input.reason) };
  }

  if (input.action === "delete_result") {
    return {
      event: "exchange_spark.audit",
      action: "delete_result",
      actor_user_id: input.actorUserId,
      spark_id: input.sparkId,
      deleted: false,
      reason: safeReason(input.reason),
    };
  }

  return {
    event: "exchange_spark.audit",
    action: input.action,
    actor_user_id: input.actorUserId,
    spark_id: input.sparkId,
    status: input.status,
  };
}