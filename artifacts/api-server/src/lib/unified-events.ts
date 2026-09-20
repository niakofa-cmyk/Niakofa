import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const UNIFIED_EVENT_TYPES = [
  "message.created",
  "message.updated",
  "message.read",
  "message.deleted",
  "conversation.created",
  "conversation.updated",
  "conversation.read",
  "typing.started",
  "typing.stopped",
  "presence.changed",
  "notification.created",
  "request.created",
  "request.updated",
  "request.status_changed",
  "hub.created",
  "hub.updated",
  "hub.membership_changed",
  "story.created",
  "story.updated",
  "story.viewed",
  "story.reaction",
  "story.reply",
  "story.shared",
  "story.expired",
  "call.invited",
  "call.accepted",
  "call.rejected",
  "call.ended",
  "nia.message",
  "nia.typing",
  "nia.status",
] as const;
export type UnifiedEventType = typeof UNIFIED_EVENT_TYPES[number];
export type UnifiedEventEnvelope<T = Record<string, unknown>> = {
  event_id: string;
  /** Stable producer key used to make retries converge on one durable event. */
  idempotency_key?: string;
  event_type: UnifiedEventType;
  occurred_at: string;
  actor_id: number | null;
  conversation_id: number | null;
  conversation_kind: string | null;
  entity_id: string | null;
  payload: T;
  audience_user_ids?: number[];
};
export function createUnifiedEvent<T extends Record<string, unknown>>(
  input: Omit<UnifiedEventEnvelope<T>, "event_id" | "occurred_at"> & {
    event_id?: string;
    occurred_at?: string;
  },
): UnifiedEventEnvelope<T> {
  return { ...input, event_id: input.event_id ?? randomUUID(), occurred_at: input.occurred_at ?? new Date().toISOString() };
}

type PersistedUnifiedEventRow = {
  event_id: string;
  event_type: UnifiedEventType;
  occurred_at: string;
  actor_id: number | null;
  conversation_kind: string | null;
  conversation_id: number | null;
  entity_id: string | null;
  audience_user_ids: number[] | null;
  idempotency_key: string | null;
  payload: Record<string, unknown>;
};

function rowToUnifiedEvent(row: PersistedUnifiedEventRow): UnifiedEventEnvelope {
  return {
    event_id: row.event_id,
    idempotency_key: row.idempotency_key ?? undefined,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    actor_id: row.actor_id,
    conversation_id: row.conversation_id,
    conversation_kind: row.conversation_kind,
    entity_id: row.entity_id,
    audience_user_ids: row.audience_user_ids ?? [],
    payload: row.payload ?? {},
  };
}

/**
 * Persist before delivery and return the row that actually owns the durable
 * identity. A retry may conflict on either event_id or idempotency_key; in
 * both cases live delivery must use the already-persisted envelope.
 */
export async function persistUnifiedEvent(event: UnifiedEventEnvelope): Promise<UnifiedEventEnvelope> {
  const idempotencyKey = event.idempotency_key ?? event.event_id;
  const inserted = await db.execute<PersistedUnifiedEventRow>(sql`
    INSERT INTO realtime_event_log
      (event_id,event_type,occurred_at,actor_id,conversation_kind,conversation_id,entity_id,audience_user_ids,idempotency_key,payload)
    VALUES
      (${event.event_id}::uuid,${event.event_type},${event.occurred_at}::timestamptz,${event.actor_id},
       ${event.conversation_kind},${event.conversation_id},${event.entity_id},
       ${JSON.stringify(event.audience_user_ids ?? [])}::integer[],${idempotencyKey},${JSON.stringify(event.payload)}::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING event_id::text,event_type,occurred_at::text,actor_id,conversation_kind,conversation_id,entity_id,
      audience_user_ids,idempotency_key,payload
  `);
  const insertedRow = inserted.rows[0];
  if (insertedRow) return rowToUnifiedEvent(insertedRow);

  const existing = await db.execute<PersistedUnifiedEventRow>(sql`
    SELECT event_id::text,event_type,occurred_at::text,actor_id,conversation_kind,conversation_id,entity_id,
      audience_user_ids,idempotency_key,payload
    FROM realtime_event_log
    WHERE event_id=${event.event_id}::uuid OR idempotency_key=${idempotencyKey}
    ORDER BY CASE WHEN idempotency_key=${idempotencyKey} THEN 0 ELSE 1 END
    LIMIT 1
  `);
  const existingRow = existing.rows[0];
  if (!existingRow) {
    throw new Error("Durable realtime event was not inserted or found after a conflict.");
  }
  return rowToUnifiedEvent(existingRow);
}
