import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const UNIFIED_EVENT_TYPES = ["message.created","message.updated","message.read","message.deleted","conversation.created","conversation.updated","conversation.read","typing.started","typing.stopped","presence.changed","request.created","request.updated","request.status_changed","hub.created","hub.updated","hub.membership_changed","story.created","story.reaction","story.reply","story.shared","call.invited","call.accepted","call.rejected","call.ended","nia.message","nia.typing","nia.status"] as const;
export type UnifiedEventType = typeof UNIFIED_EVENT_TYPES[number];
export type UnifiedEventEnvelope<T = Record<string, unknown>> = { event_id:string; event_type:UnifiedEventType; occurred_at:string; actor_id:number|null; conversation_id:number|null; conversation_kind:string|null; entity_id:string|null; payload:T; };
export function createUnifiedEvent<T extends Record<string, unknown>>(input: Omit<UnifiedEventEnvelope<T>,"event_id"|"occurred_at"> & {event_id?:string; occurred_at?:string;}): UnifiedEventEnvelope<T> {
  return { ...input, event_id: input.event_id ?? randomUUID(), occurred_at: input.occurred_at ?? new Date().toISOString() };
}
export async function persistUnifiedEvent(event: UnifiedEventEnvelope): Promise<void> {
  await db.execute(sql`INSERT INTO realtime_event_log (event_id,event_type,occurred_at,actor_id,conversation_kind,conversation_id,entity_id,idempotency_key,payload) VALUES (${event.event_id}::uuid,${event.event_type},${event.occurred_at}::timestamptz,${event.actor_id},${event.conversation_kind},${event.conversation_id},${event.entity_id},${event.event_id},${JSON.stringify(event.payload)}::jsonb) ON CONFLICT (event_id) DO NOTHING`);
}
/** Durable-first publication boundary. Socket delivery is best-effort; replay recovers disconnects. */
export async function publishUnifiedEvent(userIds:number[], event:UnifiedEventEnvelope):Promise<void> {
  await persistUnifiedEvent(event);
  for (const userId of [...new Set(userIds)].filter(id => Number.isInteger(id) && id > 0)) {
    sendToUser(userId,{ type:"unified_event" as WsEvent["type"], payload:event });
  }
}