import { db, messageActivityEventsTable } from "@workspace/db";
import { logHandledFailure } from "./handled-failure";

export type MessageActivityEventType =
  | "direct_message_sent"
  | "direct_call_started"
  | "hub_message_sent"
  | "story_created"
  | "community_post_created"
  | "community_media_added"
  | "community_comment_created"
  | "community_reaction";

export async function recordMessageActivity(input: {
  userId: number;
  eventType: MessageActivityEventType;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(messageActivityEventsTable).values({
      user_id: input.userId,
      event_type: input.eventType,
      entity_type: input.entityType.slice(0, 80),
      entity_id: input.entityId ? input.entityId.slice(0, 120) : null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logHandledFailure("message-activity-audit.record", error);
  }
}
