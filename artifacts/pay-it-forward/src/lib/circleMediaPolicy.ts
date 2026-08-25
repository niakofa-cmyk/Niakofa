export type CircleParticipantRole = "host" | "co_host" | "speaker" | "listener";
export type CircleMediaPublishPolicy = "open" | "moderated";

/**
 * Publishing media is separate from being on stage. The host still controls
 * moderation, but an active participant in an open room can intentionally
 * publish a microphone or camera without approval.
 */
export function canPublishCircleMedia(
  role: CircleParticipantRole | null | undefined,
  policy: CircleMediaPublishPolicy = "open",
): boolean {
  if (!role) return false;
  return policy === "open" || role === "host" || role === "co_host" || role === "speaker";
}