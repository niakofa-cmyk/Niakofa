export type CommunityStoryAuditDeleteReason =
  | "not_found_or_not_owned"
  | "media_processing"
  | "storage_cleanup_failed"
  | "row_cleanup_failed"
  | "row_missing_after_cleanup"
  | "unknown";

export type CommunityStoryAuditInput =
  | {
      action: "created" | "publish_replayed";
      actorUserId: number;
      storyId: number;
      storyStatus: string;
    }
  | {
      action: "delete_result";
      actorUserId: number;
      storyId: number;
      deleted: true;
    }
  | {
      action: "delete_result";
      actorUserId: number;
      storyId: number;
      deleted: false;
      reason: CommunityStoryAuditDeleteReason;
    };

export interface CommunityStoryAuditEvent {
  event: "community_story.audit";
  action: CommunityStoryAuditInput["action"];
  actor_user_id: number;
  story_id: number;
  story_status?: string;
  deleted?: boolean;
  reason?: CommunityStoryAuditDeleteReason;
}

const SAFE_DELETE_REASONS = new Set<CommunityStoryAuditDeleteReason>([
  "not_found_or_not_owned",
  "media_processing",
  "storage_cleanup_failed",
  "row_cleanup_failed",
  "row_missing_after_cleanup",
  "unknown",
]);

function safeDeleteReason(reason: unknown): CommunityStoryAuditDeleteReason {
  return typeof reason === "string" && SAFE_DELETE_REASONS.has(reason as CommunityStoryAuditDeleteReason)
    ? reason as CommunityStoryAuditDeleteReason
    : "unknown";
}

/**
 * Build lifecycle log fields from an explicit allowlist. Story content,
 * media URLs, storage keys, and other request data must never enter this event.
 */
export function buildCommunityStoryAuditEvent(input: CommunityStoryAuditInput): CommunityStoryAuditEvent {
  const common = {
    event: "community_story.audit" as const,
    action: input.action,
    actor_user_id: input.actorUserId,
    story_id: input.storyId,
  };

  if (input.action !== "delete_result") {
    return { ...common, story_status: input.storyStatus };
  }

  if (input.deleted) return { ...common, deleted: true };
  return { ...common, deleted: false, reason: safeDeleteReason(input.reason) };
}