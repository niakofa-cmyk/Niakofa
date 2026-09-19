import { db, messageNotificationsTable } from "@workspace/db";
import { sendToUser } from "./ws-hub";

export type MessageNotificationType =
  | "chat"
  | "call"
  | "hub_message"
  | "story"
  | "community"
  | "system";

export async function createMessageNotification(input: {
  userId: number;
  actorUserId?: number | null;
  type: MessageNotificationType;
  title: string;
  body: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (input.userId === input.actorUserId) return;
  const [row] = await db.insert(messageNotificationsTable).values({
    user_id: input.userId,
    actor_user_id: input.actorUserId ?? null,
    type: input.type,
    title: input.title.slice(0, 160),
    body: input.body.slice(0, 500),
    action_url: input.actionUrl ?? null,
    metadata: input.metadata ?? {},
  }).returning({
    id: messageNotificationsTable.id,
    type: messageNotificationsTable.type,
    title: messageNotificationsTable.title,
    body: messageNotificationsTable.body,
    action_url: messageNotificationsTable.action_url,
    actor_user_id: messageNotificationsTable.actor_user_id,
    metadata: messageNotificationsTable.metadata,
    created_at: messageNotificationsTable.created_at,
  });

  if (!row) return;
  sendToUser(input.userId, {
    type: "message_notification",
    payload: {
      id: String(row.id),
      type: row.type,
      title: row.title,
      body: row.body,
      actionUrl: row.action_url,
      actor_user_id: row.actor_user_id,
      metadata: row.metadata,
      time: row.created_at.toISOString(),
      read_at: null,
    },
  });
}
